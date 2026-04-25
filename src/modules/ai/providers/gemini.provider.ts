import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GoogleGenAI } from '@google/genai';
import {
  AiProvider,
  AiProviderInfo,
  CompletionOptions,
} from './ai-provider.interface';

/**
 * ─── Model selection ──────────────────────────────────────────────────────────
 *
 * The model is read from the GEMINI_MODEL env var at startup.
 * If not set, defaults to DEFAULT_GEMINI_MODEL below.
 *
 * To switch model, change the env var (preferred) or update DEFAULT_GEMINI_MODEL.
 * Available models: https://ai.google.dev/gemini-api/docs/models
 */
const DEFAULT_GEMINI_MODEL = 'gemini-2.5-flash';

/**
 * Gemini provider — implements the `AiProvider` contract using Google's
 * Gen AI SDK (`@google/genai`). Returns a raw text completion; all JSON
 * parsing and Zod validation happen upstream in `AiSearchService` as usual.
 */
@Injectable()
export class GeminiProvider implements AiProvider {
  private readonly logger = new Logger(GeminiProvider.name);
  private readonly client: GoogleGenAI | null = null;
  private readonly model: string;

  readonly info: AiProviderInfo;

  /** Request timeout in ms — covers up to 3 retries with backoff (1+2+4 s). */
  private static readonly TIMEOUT_MS = 30_000;

  constructor(private readonly configService: ConfigService) {
    const apiKey = this.configService.get<string>('GEMINI_API_KEY');
    this.model = this.configService.get<string>(
      'GEMINI_MODEL',
      DEFAULT_GEMINI_MODEL,
    );

    if (!apiKey || apiKey.trim() === '') {
      this.logger.warn(
        'GEMINI_API_KEY not configured. GeminiProvider will be unavailable.',
      );
      this.info = { name: 'google', model: this.model, isAvailable: false };
    } else {
      this.client = new GoogleGenAI({ apiKey });
      this.info = { name: 'google', model: this.model, isAvailable: true };
      this.logger.log(`GeminiProvider initialised (model: ${this.model})`);
    }
  }

  /**
   * Generate a single-turn text completion via the Gemini API.
   *
   * The systemPrompt (if any) is prepended as a dedicated `system` instruction
   * so Gemini treats it the same way OpenAI does — keeping the search pipeline
   * prompts compatible across providers.
   *
   * Temperature is clamped to [0, 2]; Gemini accepts the same range.
   * maxTokens maps to `maxOutputTokens`.
   */
  async generateCompletion(
    prompt: string,
    options: CompletionOptions = {},
  ): Promise<string> {
    if (!this.client) {
      throw new Error(
        'GeminiProvider is not available. Please configure GEMINI_API_KEY.',
      );
    }

    const {
      maxTokens = 800,
      temperature = 0.3,
      systemPrompt,
    } = options;

    // Race the API call against a hard timeout so a slow Gemini response
    // never hangs the search pipeline indefinitely.
    const completion = Promise.race<string>([
      this.callGemini(prompt, systemPrompt, temperature, maxTokens),
      this.timeout(GeminiProvider.TIMEOUT_MS),
    ]);

    return completion;
  }

  /** Maximum number of retries on transient Gemini errors (503 / 429). */
  private static readonly MAX_RETRIES = 3;
  /** Base delay in ms — doubled after each retry (1 s, 2 s, 4 s). */
  private static readonly RETRY_BASE_MS = 1_000;

  private async callGemini(
    prompt: string,
    systemPrompt: string | undefined,
    temperature: number,
    maxTokens: number,
  ): Promise<string> {
    let lastError: Error = new Error('Unknown error');

    for (let attempt = 0; attempt <= GeminiProvider.MAX_RETRIES; attempt++) {
      try {
        const response = await this.client!.models.generateContent({
          model: this.model,
          contents: prompt,
          ...(systemPrompt && {
            config: {
              systemInstruction: systemPrompt,
              temperature: Math.max(0, Math.min(2, temperature)),
              maxOutputTokens: maxTokens,
            },
          }),
          ...(!systemPrompt && {
            config: {
              temperature: Math.max(0, Math.min(2, temperature)),
              maxOutputTokens: maxTokens,
            },
          }),
        });

        const text = response.text;
        if (!text || text.trim() === '') {
          throw new Error('Gemini returned an empty response');
        }

        return text.trim();

      } catch (error) {
        lastError = error as Error;
        const msg = lastError.message ?? '';

        // Retryable: 503 overload or 429 rate-limit
        const isTransient =
          msg.includes('"code":503') ||
          msg.includes('"code":429') ||
          msg.includes('UNAVAILABLE') ||
          msg.includes('Too Many Requests');

        if (isTransient && attempt < GeminiProvider.MAX_RETRIES) {
          const delayMs = GeminiProvider.RETRY_BASE_MS * Math.pow(2, attempt);
          this.logger.warn(
            `Gemini transient error (attempt ${attempt + 1}/${GeminiProvider.MAX_RETRIES + 1}) — ` +
            `retrying in ${delayMs}ms… [${msg.slice(0, 80)}]`,
          );
          await new Promise((r) => setTimeout(r, delayMs));
          continue;
        }

        // Non-retryable or out of retries — log and rethrow
        this.logger.error('Gemini API call failed:', error);
        throw new Error(
          `GeminiProvider: failed to generate completion — ${msg}`,
        );
      }
    }

    // Should never reach here, but satisfies TypeScript
    throw new Error(`GeminiProvider: all retries exhausted — ${lastError.message}`);
  }


  /** Rejects after `ms` milliseconds with a descriptive timeout error. */
  private timeout(ms: number): Promise<never> {
    return new Promise((_, reject) =>
      setTimeout(
        () => reject(new Error(`GeminiProvider: request timed out after ${ms}ms`)),
        ms,
      ),
    );
  }
}
