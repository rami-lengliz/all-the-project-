import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';

export interface ClassifyImagesResult {
  categorySlug: 'stays' | 'mobility' | 'sports-facilities' | 'beach-gear';
  label: string;
  icon: string;
  confidence: number;
  source: 'vision' | 'fallback';
}

const CATEGORY_META: Record<string, { label: string; icon: string }> = {
  stays:               { label: 'Séjour / Villa',      icon: 'fa-house'  },
  mobility:            { label: 'Voiture / Mobilité',  icon: 'fa-car'    },
  'sports-facilities': { label: 'Terrain de sport',    icon: 'fa-futbol' },
  'beach-gear':        { label: 'Équipement de plage', icon: 'fa-water'  },
};

const VALID_SLUGS = Object.keys(CATEGORY_META) as ClassifyImagesResult['categorySlug'][];

@Injectable()
export class ImageClassifierService {
  private readonly logger = new Logger(ImageClassifierService.name);
  /** Ordered vision engines: [0] primary, the rest automatic fallbacks (used
   *  when the primary rate-limits / errors). Mirrors AiService's text chain. */
  private readonly visionEngines: { name: 'gemini' | 'groq' | 'openai'; client: OpenAI; model: string }[] = [];

  constructor(private readonly configService: ConfigService) {
    // All three providers accept base64 image_url via the OpenAI-compatible API.
    // Order honours AI_PROVIDER first, then any other configured key — so vision
    // auto-switches (e.g. Gemini→Groq) when the primary rate-limits or its key dies.
    const cfg = this.configService;
    const provider = (cfg.get<string>('AI_PROVIDER') || 'gemini').toLowerCase();
    const geminiKey = cfg.get<string>('GEMINI_API_KEY');
    const groqKey   = cfg.get<string>('GROQ_API_KEY');
    const openaiKey = cfg.get<string>('OPENAI_API_KEY');
    const openaiBaseUrl = cfg.get<string>('OPENAI_BASE_URL');

    type VisionEngine = { name: 'gemini' | 'groq' | 'openai'; client: OpenAI; model: string };
    const builders: Record<'gemini' | 'groq' | 'openai', () => VisionEngine | null> = {
      gemini: () => geminiKey?.trim()
        ? {
            name: 'gemini',
            // maxRetries: 0 so a 429 throws immediately and we fall back fast
            // instead of the SDK waiting on the Retry-After header.
            client: new OpenAI({ apiKey: geminiKey, baseURL: 'https://generativelanguage.googleapis.com/v1beta/openai/', maxRetries: 0 }),
            model: cfg.get<string>('GEMINI_MODEL', 'gemini-2.5-flash') ?? 'gemini-2.5-flash',
          }
        : null,
      // Groq's chat model (llama-3.3-70b) has no vision; use the vision-capable
      // llama-4-scout configured via GROQ_VISION_MODEL.
      groq: () => groqKey?.trim()
        ? {
            name: 'groq',
            client: new OpenAI({ apiKey: groqKey, baseURL: 'https://api.groq.com/openai/v1', maxRetries: 0 }),
            model: cfg.get<string>('GROQ_VISION_MODEL', 'meta-llama/llama-4-scout-17b-16e-instruct') ?? 'meta-llama/llama-4-scout-17b-16e-instruct',
          }
        : null,
      // Plain OpenAI — only if the base URL isn't pointed at another provider.
      openai: () => {
        const baseLooksLikeOpenAI = !openaiBaseUrl || openaiBaseUrl.includes('api.openai.com');
        return (openaiKey?.trim() && baseLooksLikeOpenAI)
          ? { name: 'openai', client: new OpenAI({ apiKey: openaiKey, maxRetries: 0 }), model: 'gpt-4o-mini' }
          : null;
      },
    };

    const order: ('gemini' | 'groq' | 'openai')[] =
      provider === 'groq'   ? ['groq', 'gemini', 'openai'] :
      provider === 'openai' ? ['openai', 'gemini', 'groq'] :
                              ['gemini', 'groq', 'openai'];

    for (const name of order) {
      const engine = builders[name]();
      if (engine) this.visionEngines.push(engine);
    }

    if (this.visionEngines.length) {
      this.logger.log(`Vision engines: ${this.visionEngines.map((e) => `${e.name}(${e.model})`).join(' → ')}`);
    } else {
      this.logger.warn(
        'No vision-capable key found (set GEMINI_API_KEY, GROQ_API_KEY + ' +
        'GROQ_VISION_MODEL, or a real OPENAI_API_KEY). Image classification will be skipped.',
      );
    }
  }

  async classify(files: Express.Multer.File[]): Promise<ClassifyImagesResult> {
    this.logger.log(
      `classify: files=${files?.length ?? 0}, visionEngines=${this.visionEngines.length}`,
    );

    if (files?.length && this.visionEngines.length) {
      try {
        return await this.classifyWithVision(files);
      } catch (err: any) {
        this.logger.error(
          `Vision classification failed: ${err?.message ?? err}`,
          err?.stack,
        );
      }
    }

    return this.noResult();
  }

  private async classifyWithVision(
    files: Express.Multer.File[],
  ): Promise<ClassifyImagesResult> {
    const imageContent = files
      .filter((f) => Buffer.isBuffer(f.buffer) && f.buffer.length > 0)
      .slice(0, 3)
      .map((f) => ({
        type: 'image_url' as const,
        image_url: {
          url: `data:${f.mimetype};base64,${f.buffer.toString('base64')}`,
        },
      }));

    if (!imageContent.length) {
      this.logger.warn('No valid buffers in uploaded files — falling back');
      return this.noResult();
    }

    const promptText =
      'You are classifying a rental listing photo for a marketplace.\n\n' +
      'Categories:\n' +
      '- "stays": house, villa, apartment, studio, chalet, room — any accommodation\n' +
      '- "mobility": car, scooter, motorbike, bicycle, van, boat — any vehicle\n' +
      '- "sports-facilities": padel, tennis, football pitch, basketball court — any sports venue\n' +
      '- "beach-gear": kayak, paddleboard, jet-ski, surfboard, snorkel — any beach/water equipment\n\n' +
      'Reply with ONLY a JSON object, nothing else:\n' +
      '{"categorySlug":"stays","confidence":0.95}';

    // Try each engine in order; on rate-limit / error / unparseable output, fall
    // back to the next (e.g. Gemini→Groq) so a quota wall never kills auto-detect.
    let lastError: unknown;
    for (let i = 0; i < this.visionEngines.length; i++) {
      const engine = this.visionEngines[i];
      const next = this.visionEngines[i + 1];
      try {
        this.logger.log(`Sending ${imageContent.length} image(s) to ${engine.name} (${engine.model})`);
        const response = await engine.client.chat.completions.create({
          model: engine.model,
          messages: [{ role: 'user', content: [...imageContent, { type: 'text', text: promptText }] }],
          max_tokens: 256,
          temperature: 0,
          // Gemini 2.5-flash otherwise spends the whole budget on hidden "thinking"
          // and returns empty content. (reasoning_effort is Gemini-only; would 400
          // on Groq/OpenAI.) No response_format — Gemini rejects json_object with images.
          ...(engine.name === 'gemini' ? { reasoning_effort: 'none' } : {}),
        } as any);

        const raw = response.choices[0]?.message?.content?.trim() ?? '';
        this.logger.log(`Vision raw (${engine.name}): ${raw.substring(0, 200)}`);

        const parsed = this.extractClassification(raw);
        if (!parsed) {
          this.logger.warn(`Unparseable vision response from ${engine.name}${next ? ` — trying ${next.name}` : ''}. Raw: ${raw}`);
          continue;
        }

        const slug: ClassifyImagesResult['categorySlug'] = VALID_SLUGS.includes(parsed.categorySlug as any)
          ? (parsed.categorySlug as ClassifyImagesResult['categorySlug'])
          : 'stays';
        const confidence =
          typeof parsed.confidence === 'number' ? Math.min(1, Math.max(0, parsed.confidence)) : 0.7;

        this.logger.log(`Classified as: ${slug} (confidence=${confidence}, via ${engine.name})`);
        return { categorySlug: slug, ...CATEGORY_META[slug], confidence, source: 'vision' };
      } catch (err: any) {
        lastError = err;
        this.logger.warn(
          `Vision ${engine.name} failed (${err?.status ?? String(err?.message ?? 'error').slice(0, 60)})` +
          (next ? ` — falling back to ${next.name}` : ' — no fallback left'),
        );
      }
    }

    if (lastError) this.logger.error(`All vision engines failed: ${(lastError as any)?.message ?? lastError}`);
    return this.noResult();
  }

  /**
   * Extract {categorySlug, confidence} from the model output. Tries strict
   * JSON.parse first (after stripping ``` fences), then falls back to regex
   * so a truncated or oddly-formatted response still gets us a category.
   */
  private extractClassification(
    raw: string,
  ): { categorySlug: string; confidence: number } | null {
    if (!raw) return null;

    const stripped = raw.replace(/```json?/gi, '').replace(/```/g, '').trim();

    // Try strict parse on the cleaned string
    try {
      const obj = JSON.parse(stripped);
      if (typeof obj?.categorySlug === 'string') {
        return {
          categorySlug: obj.categorySlug,
          confidence:
            typeof obj.confidence === 'number' ? obj.confidence : 0.7,
        };
      }
    } catch {
      /* fall through to regex */
    }

    // Try to parse just the first {...} block in case of trailing junk
    const firstBlock = stripped.match(/\{[\s\S]*?\}/);
    if (firstBlock) {
      try {
        const obj = JSON.parse(firstBlock[0]);
        if (typeof obj?.categorySlug === 'string') {
          return {
            categorySlug: obj.categorySlug,
            confidence:
              typeof obj.confidence === 'number' ? obj.confidence : 0.7,
          };
        }
      } catch {
        /* fall through */
      }
    }

    // Regex fallback for truncated responses (e.g. `{"categorySlug":"stays","confidence":0.9`)
    const slugMatch = stripped.match(/"categorySlug"\s*:\s*"([a-z-]+)"/i);
    const confMatch = stripped.match(/"confidence"\s*:\s*([0-9.]+)/);
    if (slugMatch) {
      return {
        categorySlug: slugMatch[1],
        confidence: confMatch ? parseFloat(confMatch[1]) : 0.7,
      };
    }

    return null;
  }

  private noResult(): ClassifyImagesResult {
    return {
      categorySlug: 'stays',
      label: 'Séjour / Villa',
      icon: 'fa-house',
      confidence: 0,
      source: 'fallback',
    };
  }
}
