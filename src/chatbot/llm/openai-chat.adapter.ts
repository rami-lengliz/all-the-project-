import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import { ILlmAdapter } from './llm-adapter.interface';
import {
  LlmConversationTurn,
  LlmAssistantOutput,
  LlmGenerationOptions,
} from './llm.types';

@Injectable()
export class OpenAiChatAdapter implements ILlmAdapter {
  private readonly logger = new Logger(OpenAiChatAdapter.name);
  private openai: OpenAI | null = null;
  private readonly defaultModel: string;

  constructor(private configService: ConfigService) {
    const apiKey = this.configService.get<string>('OPENAI_API_KEY');
    const baseURL = this.configService.get<string>('OPENAI_BASE_URL');
    this.defaultModel =
      this.configService.get<string>('OPENAI_MODEL') ||
      this.configService.get<string>('AI_MODEL') ||
      'gpt-4o-mini';

    if (apiKey) {
      const opts: ConstructorParameters<typeof OpenAI>[0] = { apiKey };
      if (baseURL) {
        opts.baseURL = baseURL;
        this.logger.log(`OpenAI adapter using custom base URL: ${baseURL}`);
      }
      this.openai = new OpenAI(opts);
      this.logger.log(`OpenAI adapter initialised (model: ${this.defaultModel})`);
    } else {
      this.logger.warn('OPENAI_API_KEY is not set. Chatbot LLM adapter cannot execute calls.');
    }
  }

  public async generateResponse(
    history: LlmConversationTurn[],
    options: LlmGenerationOptions,
  ): Promise<LlmAssistantOutput> {
    if (!this.openai) {
      throw new Error('LLM provider is unconfigured.');
    }

    const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [];

    // Inject system prompt if provided
    if (options.systemPrompt) {
      messages.push({ role: 'system', content: options.systemPrompt });
    }

    // Map internal agnostic history to OpenAI specific shapes
    for (const turn of history) {
      if (turn.role === 'user' || turn.role === 'system') {
        messages.push({ role: turn.role, content: turn.content });
      } else if (turn.role === 'assistant') {
        if (turn.toolRequests && turn.toolRequests.length > 0) {
          // Assistant called tools
          messages.push({
            role: 'assistant',
            content: turn.content || null,
            tool_calls: turn.toolRequests.map((req) => ({
              id: req.id,
              type: 'function',
              function: {
                name: req.name,
                arguments: JSON.stringify(req.arguments),
              },
            })),
          });
        } else {
          // Vanilla assistant message
          messages.push({ role: 'assistant', content: turn.content || '' });
        }
      } else if (turn.role === 'tool') {
        // Tool execution result
        messages.push({
          role: 'tool',
          tool_call_id: turn.toolCallId || 'MISSING_ID',
          content: turn.content,
        });
      }
    }

    // Map tools
    let formattedTools: OpenAI.Chat.ChatCompletionTool[] = [];
    if (options.tools && options.tools.length > 0) {
      formattedTools = options.tools.map((t) => ({
        type: 'function',
        function: {
          name: t.name,
          description: t.description,
          parameters: t.schema,
        },
      }));
    }

    // Prepare tool choice
    let toolChoice: any = 'auto';
    if (options.forceToolName) {
      toolChoice = { type: 'function', function: { name: options.forceToolName } };
    } else if (formattedTools.length === 0) {
      toolChoice = undefined;
    }

    try {
      const response = await this.openai.chat.completions.create({
        model: options.model || this.defaultModel,
        messages,
        tools: formattedTools.length > 0 ? formattedTools : undefined,
        tool_choice: toolChoice,
        temperature: options.temperature ?? 0.2,
      });

      const choice = response.choices[0];
      const message = choice.message;

      const finalUsage = response.usage || undefined;

      const output: LlmAssistantOutput = {
        text: message.content || '',
        finishReason: choice.finish_reason as any,
        toolRequests: [],
        metadata: {
          usage: finalUsage ? {
            promptTokens: finalUsage.prompt_tokens,
            completionTokens: finalUsage.completion_tokens,
            totalTokens: finalUsage.total_tokens
          } : undefined
        }
      };

      if (message.tool_calls && message.tool_calls.length > 0) {
        output.toolRequests = message.tool_calls.map((tc) => {
          if (tc.type !== 'function') {
            throw new Error(
              `Unsupported OpenAI tool call type returned by adapter: ${tc.type}`,
            );
          }

          return {
            id: tc.id,
            name: tc.function.name,
            arguments: tc.function.arguments
              ? JSON.parse(tc.function.arguments)
              : {},
          };
        });
      }

      return output;
    } catch (error) {
      this.logger.error(`OpenAI Chat API error: ${error.message}`, error.stack);
      throw error;
    }
  }
}
