import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ChatbotSummaryService } from './chatbot-summary.service';
import { ChatMessage } from '@prisma/client';
import { ContextBuildResult, ContextWindowConfig } from './context-window.types';
import { LlmConversationTurn } from '../llm/llm.types';

@Injectable()
export class ChatbotContextService {
  private readonly config: ContextWindowConfig;
  private readonly logger = new Logger(ChatbotContextService.name);

  constructor(
    private configService: ConfigService,
    private summaryService: ChatbotSummaryService,
  ) {
    this.config = {
      maxRecentMessages: this.configService.get<number>('CHATBOT_CONTEXT_MAX_MESSAGES') || 10,
      summarizeAfterMessages: this.configService.get<number>('CHATBOT_SUMMARIZE_AFTER_MESSAGES') || 15,
      summaryMaxChars: this.configService.get<number>('CHATBOT_SUMMARY_MAX_CHARS') || 500,
    };
  }

  public async buildContext(conversationId: string, allDbMessagesRaw: ChatMessage[]): Promise<ContextBuildResult> {
    const totalCount = allDbMessagesRaw.length;
    // Messages must be ascending chronologically
    const allChronological = [...allDbMessagesRaw].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
    
    let summaryObj = await this.summaryService.getPersistedSummary(conversationId);
    let messagesToCompress = [];
    let recentMessagesToKeep = [];

    // Trigger condition for summarization
    if (totalCount > this.config.summarizeAfterMessages) {
      // We keep the last `maxRecentMessages` intact
      const cutoffIdx = totalCount - this.config.maxRecentMessages;
      
      // Determine what hasn't been summarized yet
      const pastMessages = allChronological.slice(0, cutoffIdx);
      recentMessagesToKeep = allChronological.slice(cutoffIdx);

      // Check which past messages are already covered by summary
      if (summaryObj?.lastMessageIdCovered) {
        const lastCoveredIdx = pastMessages.findIndex(m => m.id === summaryObj.lastMessageIdCovered);
        if (lastCoveredIdx !== -1 && lastCoveredIdx < pastMessages.length - 1) {
          messagesToCompress = pastMessages.slice(lastCoveredIdx + 1);
        } else if (lastCoveredIdx === -1) {
          // Fallback, re-compress all past if ID not found somehow
          messagesToCompress = pastMessages;
        }
      } else {
        messagesToCompress = pastMessages;
      }

      // Execute background summarization if needed (batching to save compute)
      if (messagesToCompress.length >= 5) {
        // Run synchronously to inject immediately into context
        const newSummary = await this.summaryService.summarizeMessages(
          conversationId, 
          messagesToCompress, 
          summaryObj?.summaryText || null
        );
        if (newSummary) {
          summaryObj = newSummary;
        }
      }
    } else {
      recentMessagesToKeep = allChronological;
    }

    // 1. Enforce business constraints (1-follow-up rule checking)
    // We check the entire recent context. 
    let followUpAlreadyAsked = false;
    for (const msg of recentMessagesToKeep) {
      if (msg.role === 'assistant' && msg.content && msg.content.includes('?') && !msg.toolName) {
        followUpAlreadyAsked = true;
        break;
      }
    }

    // Checking summary for followUp state isn't strictly necessary since we keep M recent messages natively,
    // but if the summary contains it dynamically, it could be used. M=10 is enough to catch last turn.

    // 2. Build final LLM Internal Format
    const history: LlmConversationTurn[] = [];

    // System injects trusted summary if exists
    if (summaryObj?.summaryText) {
      history.push({
        role: 'system',
        content: `BACKGROUND CONVERSATION SUMMARY:\n${summaryObj.summaryText}`
      });
    }

    // Transform recent verbatim
    let currentToolCallId = '';
    for (const msg of recentMessagesToKeep) {
      if (!['user', 'system', 'assistant', 'tool'].includes(msg.role)) {
         this.logger.warn(`Skipping malformed historical message: ${msg.id} (Invalid role: ${msg.role})`);
         continue;
      }

      // Trim noisy tool results if they are excessively large
      let trimmedContent = msg.content;
      if (msg.role === 'tool' && trimmedContent?.length > 1500) {
        trimmedContent = trimmedContent.substring(0, 1500) + '... [TRUNCATED]';
      }

      if (msg.role === 'user' || msg.role === 'system') {
        history.push({ role: msg.role, content: trimmedContent });
      } else if (msg.role === 'assistant') {
        if (msg.toolName) {
          const rawArgs = msg.toolPayload;
          currentToolCallId = (rawArgs as any)?._callId || `call_${msg.id}`;
          history.push({
            role: 'assistant',
            content: trimmedContent || null,
            toolRequests: [{
              id: currentToolCallId,
              name: msg.toolName,
              arguments: rawArgs,
            }]
          });
        } else {
          history.push({ role: 'assistant', content: trimmedContent });
        }
      } else if (msg.role === 'tool') {
        history.push({
          role: 'tool',
          content: trimmedContent,
          toolCallId: (msg.toolPayload as any)?._callId || currentToolCallId || msg.toolName,
        });
      }
    }

    return {
      history,
      hasSummary: !!summaryObj,
      followUpAlreadyAsked,
    };
  }
}
