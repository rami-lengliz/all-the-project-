import { Injectable, Logger, Inject } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { LLM_ADAPTER, ILlmAdapter } from './llm-adapter.interface';
import { LlmConversationTurn, LlmGenerationOptions } from './llm.types';
import { LlmExecutionResult, LlmExecutionStatus } from './llm-execution.types';

@Injectable()
export class LlmResilienceService {
  private readonly logger = new Logger(LlmResilienceService.name);
  
  private readonly timeoutMs: number;
  private readonly maxRetries: number;
  private readonly primaryModel: string;
  private readonly fallbackModel: string;

  constructor(
    @Inject(LLM_ADAPTER) private llmAdapter: ILlmAdapter,
    private configService: ConfigService,
  ) {
    this.timeoutMs = this.configService.get<number>('CHATBOT_LLM_TIMEOUT_MS') || 15000;
    this.maxRetries = this.configService.get<number>('CHATBOT_LLM_MAX_RETRIES') || 1;
    this.primaryModel = this.configService.get<string>('CHATBOT_PRIMARY_MODEL') || 'gpt-4o-mini';
    this.fallbackModel = this.configService.get<string>('CHATBOT_FALLBACK_MODEL') || '';
  }

  public async executeWithResilience(
    history: LlmConversationTurn[],
    options: LlmGenerationOptions,
  ): Promise<LlmExecutionResult> {
    const startOverallMs = Date.now();
    let currentAttempt = 0;
    let fallbackUsed = false;
    let targetModel = options.model || this.primaryModel;

    while (currentAttempt <= this.maxRetries) {
      currentAttempt++;
      const runOptions = { ...options, model: targetModel };
      
      try {
        const startAttemptMs = Date.now();
        
        // Execute with timeout
        const output: any = await Promise.race([
          this.llmAdapter.generateResponse(history, runOptions),
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error('LLM_TIMEOUT')), this.timeoutMs),
          ),
        ]);

        const durationMs = Date.now() - startAttemptMs;
        
        return {
          status: 'success',
          output,
          usage: {
            modelUsed: targetModel,
            durationMs,
            // Adapter could provide promptTokens / completionTokens etc inside output.metadata if supported
            promptTokens: output.metadata?.usage?.promptTokens,
            completionTokens: output.metadata?.usage?.completionTokens,
            totalTokens: output.metadata?.usage?.totalTokens,
          },
          fallbackUsed,
        };
      } catch (error) {
        this.logger.warn(
          `LLM Attempt ${currentAttempt} failed using model ${targetModel}: ${error.message}`
        );

        const status = this.mapErrorToStatus(error);

        // If it was a non-retryable error, stop here
        if (status === 'invalid_response') {
          return { status, errorDetail: error.message };
        }

        // Setup for retry
        if (currentAttempt > this.maxRetries) {
          // If we have a fallback and haven't tried it yet
          if (this.fallbackModel && !fallbackUsed && targetModel !== this.fallbackModel) {
            this.logger.log(`Switching to fallback model: ${this.fallbackModel}`);
            targetModel = this.fallbackModel;
            fallbackUsed = true;
            // reset attempts for fallback? Or just let it run one fallback attempt.
            currentAttempt = 0; // Gives fallback maxRetries tries
            continue;
          }
          
          return { status, errorDetail: `Exhausted retries. Last error: ${error.message}` };
        }
        
        // Exponential backoff before next standard retry
        await new Promise((res) => setTimeout(res, 500 * Math.pow(2, currentAttempt - 1)));
      }
    }

    return { status: 'provider_error', errorDetail: 'Critical resilience loop failure' };
  }

  private mapErrorToStatus(error: any): LlmExecutionStatus {
    if (error.message === 'LLM_TIMEOUT' || error.name === 'TimeoutError') {
      return 'timeout';
    }
    if (error.status === 429 || error.message.includes('rate limit')) {
      return 'rate_limited';
    }
    if (error.status >= 400 && error.status < 500 && error.status !== 429) {
      // 4xx errors usually mean bad prompt format, bad tools, etc.
      return 'invalid_response';
    }
    return 'provider_error';
  }
}
