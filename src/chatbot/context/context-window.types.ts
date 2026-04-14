import { LlmConversationTurn } from '../llm/llm.types';

export interface ContextWindowConfig {
  maxRecentMessages: number;
  summarizeAfterMessages: number;
  summaryMaxChars: number;
}

export interface ContextBuildResult {
  history: LlmConversationTurn[];
  hasSummary: boolean;
  followUpAlreadyAsked: boolean;
}
