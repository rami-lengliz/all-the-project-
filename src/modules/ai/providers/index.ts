/**
 * Public API for the AI providers layer.
 * Import everything through this barrel to keep paths stable across refactors.
 *
 * @example
 * import { AiProvider, CompletionOptions, AI_PROVIDER_TOKEN, OpenAiProvider } from './providers';
 */
export {
  AiProvider,
  AiProviderInfo,
  AiProviderName,
  CompletionOptions,
  AI_PROVIDER_TOKEN,
} from './ai-provider.interface';

export { OpenAiProvider } from './openai.provider';
export { GeminiProvider } from './gemini.provider';

