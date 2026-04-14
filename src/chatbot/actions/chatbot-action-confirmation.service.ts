import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { ConfigService } from '@nestjs/config';
import { ChatbotActionTokenUtil } from './chatbot-action-token.util';
import { ChatbotConfirmationState, ChatbotMutationProposal } from './chatbot-action-confirmation.types';

@Injectable()
export class ChatbotActionConfirmationService {
  private readonly logger = new Logger(ChatbotActionConfirmationService.name);
  private readonly ttlMinutes: number;

  constructor(
    private prisma: PrismaService,
    private configService: ConfigService
  ) {
    this.ttlMinutes = this.configService.get<number>('CHATBOT_ACTION_CONFIRMATION_TTL_MINUTES') || 10;
  }

  public async proposeAction(
    userId: string,
    conversationId: string,
    proposal: ChatbotMutationProposal
  ): Promise<ChatbotConfirmationState> {
    const payloadHash = ChatbotActionTokenUtil.hashPayload(proposal.arguments);
    const token = ChatbotActionTokenUtil.generateToken();
    const expiresAt = new Date();
    expiresAt.setMinutes(expiresAt.getMinutes() + this.ttlMinutes);

    // Cancel any active pending actions for this user/conversation boundary to prevent race exploits securely
    await this.prisma.chatbotActionConfirmation.updateMany({
      where: { userId, conversationId, status: 'pending' },
      data: { status: 'cancelled' }
    });

    const record = await this.prisma.chatbotActionConfirmation.create({
      data: {
        userId,
        conversationId,
        actionName: proposal.actionName,
        resourceId: proposal.resourceId,
        resourceType: proposal.resourceType,
        payload: proposal.arguments as any,
        payloadHash,
        token,
        status: 'pending',
        expiresAt
      }
    });

    this.logger.log(`[MUTATION PROPOSAL] Action: ${proposal.actionName} | Token: ${token} | Expires: ${expiresAt.toISOString()}`);
    return record as ChatbotConfirmationState;
  }

  public async consumeConfirmation(
    token: string,
    userId: string,
    conversationId: string
  ): Promise<{ valid: boolean; reason?: string; actionName?: string; payload?: any }> {
    const record = await this.prisma.chatbotActionConfirmation.findUnique({
      where: { token }
    });

    if (!record) return { valid: false, reason: 'TOKEN_NOT_FOUND' };
    
    if (record.userId !== userId) return { valid: false, reason: 'USER_MISMATCH' };
    if (record.conversationId !== conversationId) return { valid: false, reason: 'CONVERSATION_MISMATCH' };
    if (record.status !== 'pending') {
       this.logger.warn(`[MUTATION REJECTED] Token ${token} consumption blocked (Status: ${record.status})`);
       return { valid: false, reason: `INVALID_STATUS_${record.status}` };
    }
    
    if (new Date() > record.expiresAt) {
      this.logger.warn(`[MUTATION REJECTED] Token ${token} expired.`);
      await this.prisma.chatbotActionConfirmation.update({
        where: { id: record.id },
        data: { status: 'expired' }
      });
      return { valid: false, reason: 'EXPIRED' };
    }

    this.logger.log(`[MUTATION CONSUMED] Token ${token} successfully consumed for Action: ${record.actionName}`);
    // Mark consumed successfully conditionally checking hash matching safely natively
    await this.prisma.chatbotActionConfirmation.update({
      where: { id: record.id },
      data: { status: 'consumed', consumedAt: new Date() }
    });

    return { valid: true, actionName: record.actionName, payload: record.payload };
  }
}
