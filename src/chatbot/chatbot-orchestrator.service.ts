import { Injectable, Logger, Inject } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ChatbotMemoryService } from './chatbot-memory.service';
import { ToolGovernanceService } from './tools/tool-governance.service';
import { LlmGenerationOptions } from './llm/llm.types';
import { CHATBOT_SYSTEM_PROMPT } from './prompts/system.prompt';
import { ALLOWED_CHATBOT_CATEGORIES } from './constants/chatbot-category-map';
import { LlmResilienceService } from './llm/llm-resilience.service';
import { ChatbotTraceService } from './observability/chatbot-trace.service';
import { ChatbotContextService } from './context/chatbot-context.service';

@Injectable()
export class ChatbotOrchestratorService {
  private readonly logger = new Logger(ChatbotOrchestratorService.name);
  private readonly maxToolRoundsPerRequest: number;
  private readonly maxToolCallsPerTurn: number;

  constructor(
    private memoryService: ChatbotMemoryService,
    private governanceService: ToolGovernanceService,
    private configService: ConfigService,
    private resilienceService: LlmResilienceService,
    private traceService: ChatbotTraceService,
    private contextService: ChatbotContextService,
  ) {
    this.maxToolRoundsPerRequest =
      this.configService.get<number>('CHATBOT_MAX_TOOL_ROUNDS') || 3;
    this.maxToolCallsPerTurn =
      this.configService.get<number>('CHATBOT_MAX_TOOL_CALLS_PER_TURN') || 5;
  }

  public async handleMessage(
    conversationId: string,
    userMessage: string,
    context?: any,
  ) {
    const trace = this.traceService.startTrace(
      context?.userId, 
      conversationId
    );

    try {
      // 1. Save user message
      await this.memoryService.saveMessage(conversationId, 'user', userMessage);
      this.traceService.addEvent(trace, 'request_received');

      // 2. Execution Loop Setup
      let currentRound = 0;
      let finalResponseText = '';
      let allToolResults = []; // Store outputs to send back to client

      while (currentRound < this.maxToolRoundsPerRequest) {
        currentRound++;

        // 3. Centralized Context Builder
        const rawMessages = await this.memoryService.getRecentContext(conversationId, 50); // Get enough to summarize
        const contextResult = await this.contextService.buildContext(conversationId, rawMessages);
        
        this.traceService.addEvent(trace, 'context_loaded');
        if (contextResult.hasSummary && currentRound === 1) { // Log summarization mostly on round 1
           this.traceService.addEvent(trace, 'summarization_completed');
        }

        let dynamicSystemPrompt = CHATBOT_SYSTEM_PROMPT.replace(
          '{{ALLOWED_CATEGORIES}}',
          ALLOWED_CHATBOT_CATEGORIES.join(', ')
        );

        if (contextResult.followUpAlreadyAsked) {
          dynamicSystemPrompt +=
            '\nCRITICAL INSTRUCTION: You have already asked a follow-up question. You MUST NOT ask any more questions. You MUST use the search_listings tool now based on the latest input.';
        }

        // 4. Determine allowed tools via governance layer
        const tools = this.governanceService.getAvailableToolsForContext(context);

        const options: LlmGenerationOptions = {
          systemPrompt: dynamicSystemPrompt,
          tools,
          forceToolName: contextResult.followUpAlreadyAsked ? 'search_listings' : undefined,
        };

        // 5. Call LLM Layer utilizing absolute Resilience controls
        this.traceService.addEvent(trace, 'llm_started');
        
        const executionResult = await this.resilienceService.executeWithResilience(
          contextResult.history, 
          options
        );

        this.traceService.addEvent(trace, 'llm_completed', {
          status: executionResult.status,
          fallbackUsed: executionResult.fallbackUsed,
          ...executionResult.usage,
        });

        // Abort securely on failure
        if (executionResult.status !== 'success' || !executionResult.output) {
          this.logger.error(`Adapter failed: ${executionResult.errorDetail}`);
          finalResponseText = "I'm sorry, my AI backend is currently unreachable or timed out.";
          await this.memoryService.saveMessage(conversationId, 'assistant', finalResponseText);
          break;
        }

        const assistantOutput = executionResult.output;

        // 6. Handle plain text return
        if (
          assistantOutput.finishReason !== 'tool_calls' &&
          (!assistantOutput.toolRequests || assistantOutput.toolRequests.length === 0)
        ) {
          finalResponseText = assistantOutput.text || '';
          await this.memoryService.saveMessage(conversationId, 'assistant', finalResponseText);
          break; // Stop loop!
        }

        // 7. Handle Tool Requests securely
        if (assistantOutput.toolRequests && assistantOutput.toolRequests.length > 0) {
          // Guardrail: explicitly bound the max tools per turn avoiding rogue loop cascades
          const safeToolRequests = assistantOutput.toolRequests.slice(0, this.maxToolCallsPerTurn);

          if (assistantOutput.toolRequests.length > this.maxToolCallsPerTurn) {
            this.logger.warn(`Truncated tool calls from ${assistantOutput.toolRequests.length} to ${this.maxToolCallsPerTurn}`);
          }

          // Save the tool requests invocation intent into memory as 'assistant'
          for (const req of safeToolRequests) {
            await this.memoryService.saveMessage(
              conversationId,
              'assistant',
              '', // No content, just a call
              req.name,
              { ...req.arguments, _callId: req.id }
            );

            this.traceService.addEvent(trace, 'tool_started', { toolName: req.name });

            // Execute securely through governance layer
            const governedResult = await this.governanceService.executeTool(req, context);

            this.traceService.addEvent(trace, 'tool_completed', { 
               toolName: req.name, 
               status: governedResult.status,
               durationMs: governedResult.metadata?.durationMs 
            });

            // Store response securely mapping back to `req.id` natively
            await this.memoryService.saveMessage(
              conversationId,
              'tool',
              JSON.stringify(governedResult),
              req.id,
              { _callId: req.id }
            );

            // Halt immediately explicitly triggering confirmation required UI organically
            if (governedResult.status === 'confirmation_required') {
              this.traceService.addEvent(trace, 'confirmation_issued', { toolName: req.name });
              finalResponseText = governedResult.output?.summary || "Confirmation required.";
              
              allToolResults.push(governedResult.output); // Send the confirmation prompt object directly
              
              this.traceService.finalizeTrace(trace);
              return {
                 response: finalResponseText,
                 results: allToolResults
              };
            }

            // Extract useful business items if present (like listings results to return explicitly)
            if (governedResult.status === 'success' && governedResult.output?.results) {
              allToolResults = allToolResults.concat(governedResult.output.results);
            }
          }
          // Tools finished execution natively; loop continues naturally for the second summary pass
        }
      }

      if (currentRound >= this.maxToolRoundsPerRequest && !finalResponseText) {
        this.logger.warn(`Orchestrator hit MAX_TOOL_ROUNDS_PER_REQUEST bound (${this.maxToolRoundsPerRequest})`);
        finalResponseText = "I've searched extensively but reached my processing limit. Please try a simpler request.";
        await this.memoryService.saveMessage(conversationId, 'assistant', finalResponseText);
      }

      this.traceService.finalizeTrace(trace);
      
      return {
        response: finalResponseText,
        results: allToolResults,
      };

    } catch (error) {
      this.traceService.finalizeTrace(trace, error);
      throw error;
    }
  }
}
