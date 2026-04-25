import { Injectable } from '@nestjs/common';
import { ChatbotMemoryService } from './chatbot-memory.service';
import { ChatbotOrchestratorService } from './chatbot-orchestrator.service';
import { CreateMessageDto } from './dto/create-message.dto';
import { ChatbotActionConfirmationService } from './actions/chatbot-action-confirmation.service';
import { ToolGovernanceService } from './tools/tool-governance.service';
import { BadRequestException, HttpException, HttpStatus } from '@nestjs/common';
import { ChatbotRateLimitService } from './trust/chatbot-rate-limit.service';
import { ChatbotTrustPolicyService } from './trust/chatbot-trust-policy.service';
import { ChatbotAbuseDetectionService } from './trust/chatbot-abuse-detection.service';

@Injectable()
export class ChatbotService {
  constructor(
    private memoryService: ChatbotMemoryService,
    private orchestratorService: ChatbotOrchestratorService,
    private confirmationService: ChatbotActionConfirmationService,
    private governanceService: ToolGovernanceService,
    private rateLimitService: ChatbotRateLimitService,
    private trustPolicyService: ChatbotTrustPolicyService,
    private abuseDetectionService: ChatbotAbuseDetectionService
  ) {}

  public async processMessage(userId: string, dto: CreateMessageDto) {
    let conversationId = dto.conversationId;

    if (!conversationId) {
      const newConv = await this.memoryService.createConversation(userId);
      conversationId = newConv.id;
    } else {
      // Validate ownership
      await this.memoryService.getConversation(conversationId, userId);
    }

    // 1. Evaluate Trust & Policy
    const policyResult = await this.trustPolicyService.evaluateAction(userId, 'message_request');
    if (!policyResult.allowed) {
       throw new HttpException({ success: false, status: 'RESTRICTED', error: policyResult.blockReason }, HttpStatus.FORBIDDEN);
    }

    // 2. Evaluate Rate Limiting
    const rlMap = await this.rateLimitService.evaluateLimit(userId, 'chatbot_message_requests');
    if (!rlMap.allowed) {
       await this.abuseDetectionService.recordIncident({
         userId, conversationId, eventType: 'rate_limit_exceeded', severity: 'low',
         reasonCode: 'excessive_message_requests'
       });
       const failureStatus = rlMap.cooldownActive ? 'COOLDOWN_ACTIVE' : 'RATE_LIMITED';
       throw new HttpException({ success: false, status: failureStatus, error: 'Too many messages. Please slow down.' }, HttpStatus.TOO_MANY_REQUESTS);
    }
    await this.rateLimitService.recordUsage(userId, 'chatbot_message_requests');

    const { response, results } = await this.orchestratorService.handleMessage(
      conversationId, 
      dto.message,
      { userId }
    );

    return {
      conversationId,
      response,
      results
    };
  }

  public async getConversations(userId: string) {
    return this.memoryService.getUserConversations(userId);
  }

  public async getConversationMessages(userId: string, conversationId: string) {
    return this.memoryService.getConversationMessages(conversationId, userId);
  }

  public async confirmAction(userId: string, dto: any) {
    const { conversationId, confirmationToken } = dto;
    if (!conversationId || !confirmationToken) {
       throw new BadRequestException('conversationId and confirmationToken are required.');
    }

    // 1. Validate ownership
    await this.memoryService.getConversation(conversationId, userId);

    // 2. Consume Token safely fetching original mapping
    const tokenCheck = await this.confirmationService.consumeConfirmation(
      confirmationToken, userId, conversationId
    );

    if (!tokenCheck.valid) {
       const failType = tokenCheck.reason === 'INVALID_STATUS_consumed' ? 'confirmation_replay' : 'excessive_failed_confirmations';
       // Check if failed confirms rate limit is exceeded
       const failRL = await this.rateLimitService.evaluateLimit(userId, 'chatbot_failed_confirmations');
       if (!failRL.allowed && !failRL.cooldownActive) {
          this.rateLimitService.applyCooldown(userId, 'chatbot_action_confirmations'); 
          this.rateLimitService.applyCooldown(userId, 'chatbot_mutation_proposals'); 
       }
       await this.rateLimitService.recordUsage(userId, 'chatbot_failed_confirmations');

       // Record incident if it's a replay or expired token dynamically
       await this.abuseDetectionService.recordIncident({
           userId, conversationId, 
           eventType: failType as any, 
           severity: failType === 'confirmation_replay' ? 'high' : 'medium',
           reasonCode: tokenCheck.reason
       });
       throw new BadRequestException(`Confirmation failed: ${tokenCheck.reason}`);
    }

    // Rate Limit Confirmations
    const rlMap = await this.rateLimitService.evaluateLimit(userId, 'chatbot_action_confirmations');
    if (!rlMap.allowed) {
       const failureStatus = rlMap.cooldownActive ? 'COOLDOWN_ACTIVE' : 'RATE_LIMITED';
       throw new HttpException({ success: false, status: failureStatus, error: 'Too many confirmations. Please slow down.' }, HttpStatus.TOO_MANY_REQUESTS);
    }
    await this.rateLimitService.recordUsage(userId, 'chatbot_action_confirmations');

    // 3. Re-execute through ToolGovernanceService explicitly setting executionConfirmed: true
    // the system natively dynamically re-evaluates all backend bounds (ownership, bounds, constraints, etc.)
    const requestArgs = {
       id: `mut_${Math.random().toString(36).substring(7)}`,
       name: tokenCheck.actionName,
       arguments: tokenCheck.payload
    };

    const governedResult = await this.governanceService.executeTool(
       requestArgs,
       { userId, conversationId, executionConfirmed: true }
    );

    // 4. Inject execution securely back to memory so subsequent LLM calls are aware natively implicitly
    await this.memoryService.saveMessage(
       conversationId,
       'tool',
       JSON.stringify(governedResult),
       requestArgs.id,
       { _callId: requestArgs.id }
    );

    // 5. Optionally invoke Orchestrator manually once to generate a text summary response safely mapping outputs gracefully.
    // For this scope we just return the JSON outputs back to UI.
    return {
       success: true,
       conversationId,
       actionName: tokenCheck.actionName,
       result: governedResult
    };
  }
}
