import {
  LlmConversationTurn,
  LlmAssistantOutput,
  LlmGenerationOptions,
} from './llm.types';

export const LLM_ADAPTER = 'LLM_ADAPTER';

export interface ILlmAdapter {
  /**
   * Translates internal conversation history and generates the next output.
   */
  generateResponse(
    history: LlmConversationTurn[],
    options: LlmGenerationOptions,
  ): Promise<LlmAssistantOutput>;
}
