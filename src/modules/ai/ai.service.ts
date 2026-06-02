import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';

export interface CompletionOptions {
  maxTokens?: number;
  temperature?: number;
  systemPrompt?: string;
  /** Force the model to emit valid JSON (uses response_format json_object) */
  jsonMode?: boolean;
  /** Max retries on transient failure (default 2) */
  maxRetries?: number;
  /** Request timeout in ms (default 15000) */
  timeoutMs?: number;
  /**
   * Gemini 2.5 "thinking" budget control. These models spend hidden reasoning
   * tokens BEFORE the visible answer, and those tokens count against max_tokens —
   * so a small budget truncates the real output to nothing. For short structured
   * (JSON) replies, pass 'none' to skip thinking entirely: the answer fits in a
   * tiny budget and latency drops ~5x. Only applied when the provider is Gemini.
   */
  reasoningEffort?: 'none' | 'low' | 'medium' | 'high';
}

export interface ModerationResult {
  flagged: boolean;
  categories: string[];
  scores: Record<string, number>;
}

type EngineName = 'gemini' | 'groq' | 'openai';

/** One configured AI backend. The first is primary; the rest are automatic
 *  fallbacks tried in order when the primary rate-limits (429) or errors. */
interface AiEngine {
  name: EngineName;
  client: OpenAI;
  model: string;
}

@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);
  /** Ordered engines: [0] is primary, the rest are automatic fallbacks. */
  private readonly engines: AiEngine[] = [];
  // "Primary" accessors kept for embeddings / moderation / vision below.
  private readonly client: OpenAI | null;
  private readonly model: string;
  private readonly provider: string;
  private readonly isEnabled: boolean;

  constructor(private configService: ConfigService) {
    const cfg = this.configService;
    const primary = (cfg.get<string>('AI_PROVIDER', 'openai') || 'openai').toLowerCase();

    const builders: Record<EngineName, () => AiEngine | null> = {
      gemini: () => {
        const apiKey = cfg.get<string>('GEMINI_API_KEY');
        if (!apiKey?.trim()) return null;
        return {
          name: 'gemini',
          // maxRetries: 0 — the SDK otherwise waits on the 429 Retry-After header
          // before throwing, which delays our own fallback by many seconds.
          client: new OpenAI({ apiKey, baseURL: 'https://generativelanguage.googleapis.com/v1beta/openai/', maxRetries: 0 }),
          model: cfg.get<string>('GEMINI_MODEL', 'gemini-2.5-flash') ?? 'gemini-2.5-flash',
        };
      },
      groq: () => {
        const apiKey = cfg.get<string>('GROQ_API_KEY');
        if (!apiKey?.trim()) return null;
        return {
          name: 'groq',
          client: new OpenAI({ apiKey, baseURL: 'https://api.groq.com/openai/v1', maxRetries: 0 }),
          model: cfg.get<string>('GROQ_MODEL', 'llama-3.3-70b-versatile') ?? 'llama-3.3-70b-versatile',
        };
      },
      openai: () => {
        const apiKey = cfg.get<string>('OPENAI_API_KEY');
        if (!apiKey?.trim()) return null;
        return { name: 'openai', client: new OpenAI({ apiKey, maxRetries: 0 }), model: cfg.get<string>('AI_MODEL', 'gpt-4o-mini') ?? 'gpt-4o-mini' };
      },
    };

    // Primary provider first, then the remaining providers that have a key — so
    // when the primary rate-limits (429) or its key dies, the next one takes over
    // automatically (e.g. AI_PROVIDER=gemini + a valid GROQ_API_KEY → Gemini→Groq).
    const order = ([primary, 'gemini', 'groq', 'openai'])
      .filter((n, i, a) => a.indexOf(n) === i)
      .filter((n): n is EngineName => n === 'gemini' || n === 'groq' || n === 'openai');

    for (const name of order) {
      const engine = builders[name]();
      if (engine) this.engines.push(engine);
    }

    this.isEnabled = this.engines.length > 0;
    this.client    = this.engines[0]?.client ?? null;
    this.model     = this.engines[0]?.model ?? 'gpt-4o-mini';
    this.provider  = this.engines[0]?.name ?? primary;

    if (this.isEnabled) {
      this.logger.log(`AiService ready — fallback chain: ${this.engines.map((e) => `${e.name}(${e.model})`).join(' → ')}`);
    } else {
      this.logger.warn('No AI provider key configured (GEMINI/GROQ/OPENAI). AI features disabled.');
    }
  }

  isAiEnabled(): boolean {
    return this.isEnabled;
  }

  /**
   * Generate a completion, automatically falling back through the configured
   * engine chain (e.g. Gemini → Groq) when one rate-limits (429), errors, or
   * returns empty output. Callers don't need to know which engine answered.
   */
  async generateCompletion(
    prompt: string,
    options: CompletionOptions = {},
  ): Promise<string> {
    if (!this.isEnabled || this.engines.length === 0) {
      throw new Error('AI features are not enabled. Please configure an AI provider key.');
    }

    let lastError: unknown;
    for (let i = 0; i < this.engines.length; i++) {
      const engine = this.engines[i];
      try {
        return await this.completeWithEngine(engine, prompt, options);
      } catch (error: any) {
        lastError = error;
        const next = this.engines[i + 1];
        this.logger.warn(
          `[AI] ${engine.name} failed (${error?.status ?? String(error?.message ?? 'error').slice(0, 60)})` +
          (next ? ` — falling back to ${next.name}` : ' — no fallback left'),
        );
      }
    }

    this.logger.error('All AI engines failed', lastError);
    throw new Error('Failed to generate AI completion (all providers exhausted)');
  }

  /**
   * Single-engine attempt with in-provider retry on transient (5xx/network)
   * errors. Rate-limit / auth / timeout errors break immediately so the caller
   * can fall back to the next engine fast (those never recover on a quick retry).
   */
  private async completeWithEngine(
    engine: AiEngine,
    prompt: string,
    options: CompletionOptions,
  ): Promise<string> {
    const {
      maxTokens = 500,
      temperature = 0.7,
      systemPrompt = 'You are a helpful assistant for a rental platform.',
      jsonMode = false,
      maxRetries = 2,
      timeoutMs = 15_000,
      reasoningEffort,
    } = options;

    let lastError: unknown;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      if (attempt > 0) {
        const delay = Math.min(1000 * 2 ** (attempt - 1), 4000); // 1s, 2s, 4s
        this.logger.warn(`AI retry ${attempt}/${maxRetries} on ${engine.name} after ${delay}ms`);
        await new Promise((r) => setTimeout(r, delay));
      }

      try {
        const abortController = new AbortController();
        const timer = setTimeout(() => abortController.abort(), timeoutMs);

        const requestParams: any = {
          model: engine.model,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: prompt },
          ],
          max_tokens: maxTokens,
          temperature,
        };

        // Enable JSON mode — forces valid JSON output (supported by Groq, OpenAI, Gemini)
        if (jsonMode) {
          requestParams.response_format = { type: 'json_object' };
        }

        // `reasoning_effort` is a Gemini-only knob on the OpenAI-compatible endpoint
        // (would 400 on OpenAI/Groq). 'none' skips Gemini 2.5 "thinking" so short
        // JSON replies aren't eaten by hidden reasoning tokens.
        if (reasoningEffort && engine.name === 'gemini') {
          requestParams.reasoning_effort = reasoningEffort;
        }

        const response = await engine.client.chat.completions.create(requestParams, {
          signal: abortController.signal,
        });

        clearTimeout(timer);

        const content = response.choices[0]?.message?.content;
        if (!content) throw new Error('Empty response from AI provider');
        return content.trim();
      } catch (error: any) {
        lastError = error;
        const msg = String(error?.message ?? error).toLowerCase();
        // Rate-limit / auth / timeout won't recover on a quick same-provider retry —
        // break so generateCompletion() falls back to the next engine.
        if (
          error?.name === 'AbortError' ||
          msg.includes('abort') ||
          msg.includes('timed out') ||
          msg.includes('timeout') ||
          error?.status === 401 || error?.status === 403 || error?.status === 429
        ) {
          break;
        }
        this.logger.warn(`AI attempt ${attempt + 1} on ${engine.name} failed: ${String(error?.message ?? error)}`);
      }
    }

    throw lastError ?? new Error(`AI completion failed on ${engine.name}`);
  }

  async generateEmbedding(text: string): Promise<number[]> {
    if (!this.isEnabled || !this.client) throw new Error('AI features are not enabled');
    try {
      const response = await this.client.embeddings.create({
        model: 'text-embedding-3-small',
        input: text,
      });
      return response.data[0].embedding;
    } catch (error) {
      this.logger.error('Error generating embedding:', error);
      throw new Error('Failed to generate embedding');
    }
  }

  async moderateContent(text: string): Promise<ModerationResult> {
    if (!this.isEnabled || !this.client) {
      return { flagged: false, categories: [], scores: {} };
    }
    try {
      const response = await this.client.moderations.create({ input: text });
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
      return { flagged: false, categories: [], scores: {} };
    }
  }

  // True when the configured provider supports image inputs.
  // Groq's text models (llama-3.3-70b) don't support vision; OpenAI gpt-4o-mini and Gemini do.
  supportsVision(): boolean {
    const provider = this.configService.get<string>('AI_PROVIDER', 'openai').toLowerCase();
    return provider === 'openai' || provider === 'gemini';
  }

  // Vision completion: send images as base64 data URLs alongside a text prompt.
  // Only call this after checking supportsVision() === true.
  async generateVisionCompletion(
    prompt: string,
    images: { data: Buffer; mimeType: string }[],
    options: Pick<CompletionOptions, 'maxTokens' | 'temperature' | 'systemPrompt' | 'jsonMode'> = {},
  ): Promise<string> {
    if (!this.isEnabled || !this.client) throw new Error('AI not enabled');
    if (!this.supportsVision()) throw new Error('Vision not supported by current AI provider');

    const imageContent = images.slice(0, 3).map((img) => ({
      type: 'image_url' as const,
      image_url: {
        url: `data:${img.mimeType};base64,${img.data.toString('base64')}`,
      },
    }));

    const messages: any[] = [];
    // Only add system message when explicitly provided — some providers (Gemini)
    // reject a system role alongside multimodal user content.
    if (options.systemPrompt) {
      messages.push({ role: 'system', content: options.systemPrompt });
    }
    messages.push({
      role: 'user',
      content: [
        ...imageContent,
        { type: 'text', text: prompt },
      ],
    });

    const requestParams: any = {
      model: this.model,
      messages,
      max_tokens: options.maxTokens ?? 150,
      temperature: options.temperature ?? 0,
    };
    // Never set response_format for vision — Gemini returns 400 when json_object
    // is requested alongside image_url content. Parse JSON from text instead.

    const abortController = new AbortController();
    const timer = setTimeout(() => abortController.abort(), 12_000);
    try {
      const response = await this.client.chat.completions.create(requestParams, {
        signal: abortController.signal,
      });
      clearTimeout(timer);
      const content = response.choices[0]?.message?.content;
      if (!content) throw new Error('Empty vision response');
      return content.trim();
    } catch (err) {
      clearTimeout(timer);
      throw err;
    }
  }

  estimateTokens(text: string): number {
    return Math.ceil(text.length / 4);
  }
}
