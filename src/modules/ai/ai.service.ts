import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import { AiProvider, OpenAiProvider, GeminiProvider, GroqProvider } from './providers';

// ─── Shared types (re-exported so existing consumers keep working) ────────────

export interface CompletionOptions {
  maxTokens?: number;
  temperature?: number;
  systemPrompt?: string;
}

export interface ModerationResult {
  flagged: boolean;
  categories: string[];
  scores: Record<string, number>;
}

// ─── Service ──────────────────────────────────────────────────────────────────

@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);

  /**
   * Raw OpenAI client — kept only for embeddings & moderation until those
   * are also extracted into dedicated providers.
   */
  private openai: OpenAI | null = null;

  /**
   * True when the selected provider has a valid API key and is ready.
   * Derived from activeProvider.info.isAvailable after selection.
   */
  private isEnabled: boolean = false;

  /**
   * The active provider selected at startup via the AI_PROVIDER env var.
   * Supports: 'openai' (default), 'gemini'. Unknown values fall back to openai.
   */
  private readonly activeProvider: AiProvider;

  constructor(
    private readonly configService: ConfigService,
    private readonly openAiProvider: OpenAiProvider,
    private readonly geminiProvider: GeminiProvider,
    private readonly groqProvider: GroqProvider,
  ) {
    // Keep the raw OpenAI client alive for embeddings + moderation (not yet extracted)
    const openAiKey = this.configService.get<string>('OPENAI_API_KEY');
    if (openAiKey && openAiKey.trim() !== '') {
      this.openai = new OpenAI({ apiKey: openAiKey });
      this.logger.log('OpenAI SDK client initialised (embeddings/moderation)');
    }

    // ── Provider selection ────────────────────────────────────────────────────
    const providerName = (
      this.configService.get<string>('AI_PROVIDER') ?? 'openai'
    ).toLowerCase().trim();

    switch (providerName) {
      case 'openai':
        this.activeProvider = this.openAiProvider;
        this.logger.log('AI provider selected: openai');
        break;

      case 'gemini':
        this.activeProvider = this.geminiProvider;
        this.logger.log(
          `AI provider selected: gemini (model: ${this.geminiProvider.info.model})`,
        );
        break;

      case 'groq':
        this.activeProvider = this.groqProvider;
        this.logger.log(
          `AI provider selected: groq (model: ${this.groqProvider.info.model})`,
        );
        break;

      default:
        this.logger.warn(
          `Unknown AI_PROVIDER "${providerName}". Falling back to openai.`,
        );
        this.activeProvider = this.openAiProvider;
    }

    // isEnabled reflects the SELECTED provider, not always OpenAI
    this.isEnabled = this.activeProvider.info.isAvailable;
    if (!this.isEnabled) {
      this.logger.warn(
        `Selected AI provider "${this.activeProvider.info.name}" is unavailable ` +
        `(missing API key). AI completions will be disabled.`,
      );
    }
  }

  // ── Availability ────────────────────────────────────────────────────────────

  /**
   * Check if AI features are enabled.
   */
  isAiEnabled(): boolean {
    return this.isEnabled;
  }

  /**
   * Provider-agnostic availability check.
   * Returns true if the active provider (Gemini or OpenAI) has a valid API key.
   * Use this instead of reading AI_PROVIDER or OPENAI_API_KEY directly.
   */
  isAvailable(): boolean {
    return this.isEnabled;
  }

  // ── Completion (delegated) ──────────────────────────────────────────────────

  /**
   * Generate a completion.
   * All OpenAI Chat Completions logic now lives in OpenAiProvider —
   * this method is a thin facade that delegates the call.
   */
  async generateCompletion(
    prompt: string,
    options: CompletionOptions = {},
  ): Promise<string> {
    if (!this.isEnabled) {
      throw new Error(
        'AI features are not enabled. Please configure OPENAI_API_KEY.',
      );
    }

    return this.activeProvider.generateCompletion(prompt, options);
  }

  // ── Embeddings ──────────────────────────────────────────────────────────────

  /**
   * Generate embeddings for semantic search (optional advanced feature).
   */
  async generateEmbedding(text: string): Promise<number[]> {
    if (!this.isEnabled || !this.openai) {
      throw new Error('AI features are not enabled');
    }

    try {
      const response = await this.openai.embeddings.create({
        model: 'text-embedding-3-small',
        input: text,
      });

      return response.data[0].embedding;
    } catch (error) {
      this.logger.error('Error generating embedding:', error);
      throw new Error('Failed to generate embedding');
    }
  }

  // ── Moderation ──────────────────────────────────────────────────────────────

  /**
   * Moderate content for inappropriate material.
   */
  async moderateContent(text: string): Promise<ModerationResult> {
    if (!this.isEnabled || !this.openai) {
      // Return safe result if AI is disabled
      return { flagged: false, categories: [], scores: {} };
    }

    try {
      const response = await this.openai.moderations.create({ input: text });

      const result = response.results[0];
      const flaggedCategories = Object.entries(result.categories)
        .filter(([_key, flagged]) => flagged)
        .map(([category]) => category);

      return {
        flagged: result.flagged,
        categories: flaggedCategories,
        scores: result.category_scores as unknown as Record<string, number>,
      };
    } catch (error) {
      this.logger.error('Error moderating content:', error);
      // Return safe result on error (fail open)
      return { flagged: false, categories: [], scores: {} };
    }
  }

  // ── Utilities ───────────────────────────────────────────────────────────────

  /**
   * Count tokens in a text (approximate).
   */
  estimateTokens(text: string): number {
    // Rough estimation: ~4 characters per token
    return Math.ceil(text.length / 4);
  }
}
