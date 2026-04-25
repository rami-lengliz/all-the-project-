import { LlmAssistantOutput } from './llm.types';

export type LlmExecutionStatus =
  | 'success'
  | 'timeout'
  | 'provider_error'
  | 'rate_limited'
  | 'invalid_response';

export interface LlmUsageMetadata {
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
  modelUsed?: string;
  durationMs?: number;
}

export interface LlmExecutionResult {
  status: LlmExecutionStatus;
  output?: LlmAssistantOutput;
  usage?: LlmUsageMetadata;
  errorDetail?: string;
  fallbackUsed?: boolean;
}
