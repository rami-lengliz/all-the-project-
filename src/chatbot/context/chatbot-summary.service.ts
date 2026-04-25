import { Injectable, Logger, Inject } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { LlmResilienceService } from '../llm/llm-resilience.service';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class ChatbotSummaryService {
  private readonly logger = new Logger(ChatbotSummaryService.name);
  
  constructor(
    private prisma: PrismaService,
    private resilienceService: LlmResilienceService,
    private configService: ConfigService,
  ) {}

  public async getPersistedSummary(conversationId: string) {
    return this.prisma.chatConversationSummary.findUnique({
      where: { conversationId },
    });
  }

  public async summarizeMessages(conversationId: string, messagesToCompress: any[], existingSummaryText: string | null) {
    if (messagesToCompress.length === 0) return null;

    try {
      const formattedToCompress = messagesToCompress.map(m => `[${m.role}] ${m.content} ${m.toolName ? '(Tool Call: ' + m.toolName + ')' : ''}`).join('\n');
      
      let systemPrompt = `You are a summarization engine for RentEverything chatbot. 
Your job is to compress older conversation history into a concise, factual summary.
Preserve the user's explicit intent, known constraints, important search outcomes, and check if the assistant has asked a follow-up question.
Do NOT lose critical business state. Be extremely brief but thorough.`;

      const promptHistory = [];
      if (existingSummaryText) {
        promptHistory.push({ role: 'user', content: `PREVIOUS SUMMARY: ${existingSummaryText}\n\nNEW MESSAGES TO ADD TO SUMMARY:\n${formattedToCompress}` });
      } else {
        promptHistory.push({ role: 'user', content: `Summarize the following chat history:\n${formattedToCompress}` });
      }

      // We explicitly override options to restrict the output size and bypass tools
      const executionResult = await this.resilienceService.executeWithResilience(promptHistory as any[], {
        systemPrompt,
        maxTokens: this.configService.get<number>('CHATBOT_SUMMARY_MAX_CHARS') || 500,
        temperature: 0.1,
      });

      if (executionResult.status !== 'success' || !executionResult.output?.text) {
        throw new Error(`LLM Failed to generate summary: ${executionResult.errorDetail}`);
      }

      const newSummaryText = executionResult.output.text;
      const lastMessageId = messagesToCompress[messagesToCompress.length - 1].id;

      // Persist to DB using upsert mapping
      const savedSummary = await this.prisma.chatConversationSummary.upsert({
        where: { conversationId },
        update: {
          summaryText: newSummaryText,
          lastMessageIdCovered: lastMessageId,
        },
        create: {
          conversationId,
          summaryText: newSummaryText,
          lastMessageIdCovered: lastMessageId,
        }
      });

      this.logger.log(`Generated and persisted summary for conversation ${conversationId}`);
      return savedSummary;

    } catch (error) {
      this.logger.error(`Failed to summarize conversation ${conversationId}: ${error.message}`);
      return null;
    }
  }
}
