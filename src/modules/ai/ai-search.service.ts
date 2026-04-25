import { Injectable, Logger } from '@nestjs/common';
import { AiService } from './ai.service';
import { ListingsService } from '../listings/listings.service';
import { CategoriesService } from '../categories/categories.service';
import { PrismaService } from '../../database/prisma.service';
import { AiResponseSchema } from './schemas/ai-response.schema';
import {
  AiSearchRequestDto,
  AiSearchResponseDto,
  SearchFiltersDto,
  SearchChipDto,
  FollowUpDto,
} from './dto/ai-search.dto';

/**
 * Canonical category slugs for the RentAI MVP.
 *
 * Exported so tests can import the same list to assert against —
 * there is a single source of truth.
 *
 * Rules:
 *   - AI may only emit slugs from this list.
 *   - If geo context provides a narrower subset, the intersection is used.
 *   - Any slug not in this list is silently discarded (no hallucination).
 */
export const ALLOWED_CATEGORY_SLUGS: ReadonlyArray<string> = [
  'stays',
  'sports-facilities',
  'mobility',
  'beach-gear',
];

@Injectable()
export class AiSearchService {
  private readonly logger = new Logger(AiSearchService.name);

  constructor(
    private readonly aiService: AiService,
    private readonly listingsService: ListingsService,
    private readonly categoriesService: CategoriesService,
    private readonly prisma: PrismaService,
  ) { }

  async search(dto: AiSearchRequestDto): Promise<AiSearchResponseDto> {
    // Get available category slugs if location provided but not explicitly set
    let availableSlugs = dto.availableCategorySlugs || [];
    if (!availableSlugs.length && dto.lat && dto.lng) {
      const nearbyCategories = await this.categoriesService.findNearbyWithCounts(
        dto.lat,
        dto.lng,
        dto.radiusKm || 10,
        false, // only categories with listings
      );
      availableSlugs = nearbyCategories.map((c) => c.slug);
    }

    let result: AiSearchResponseDto;

    // When no valid API key is configured, return an empty response.
    // This makes it easy to distinguish:
    //   AI working  → AI-parsed chips + real results
    //   AI blocked  → zero results + 'ai_unavailable' chip (this branch)
    if (!this.aiService.isAvailable()) {
      this.logger.warn('[AiSearch] AI provider not configured — returning empty results');
      result = {
        mode: 'RESULT',
        filters: { radiusKm: dto.radiusKm || 10 },
        chips: [
          {
            key: 'ai_unavailable',
            label: '⚠ AI unavailable — set GEMINI_API_KEY or OPENAI_API_KEY',
          },
        ],
        followUp: null,
        results: [],
      } as AiSearchResponseDto;
    } else {
      try {
        // Call AI to parse query
        const aiResponse = await this.callAiSearch(dto, availableSlugs);

        if (aiResponse.mode === 'FOLLOW_UP') {
          result = {
            mode: 'FOLLOW_UP',
            followUp: aiResponse.followUp!,
            filters: aiResponse.filters,
            chips: aiResponse.chips,
            results: [],
          } as AiSearchResponseDto;
        } else {
          // Fetch results based on AI-parsed filters
          const results = await this.fetchListings(
            aiResponse.filters,
            dto.lat,
            dto.lng,
          );

          result = {
            mode: 'RESULT',
            filters: aiResponse.filters,
            chips: aiResponse.chips,
            followUp: null,
            results,
          } as AiSearchResponseDto;
        }
      } catch (error) {
        this.logger.error('[AiSearch] AI call failed — returning empty results', error);
        result = {
          mode: 'RESULT',
          filters: { radiusKm: dto.radiusKm || 10 },
          chips: [
            {
              key: 'ai_error',
              label: '⚠ AI search failed — check server logs',
            },
          ],
          followUp: null,
          results: [],
        } as AiSearchResponseDto;
      }
    }


    // Fire-and-forget: log the search (never blocks the response)
    this.prisma.aiSearchLog
      .create({
        data: {
          query: dto.query,
          lat: dto.lat ?? null,
          lng: dto.lng ?? null,
          radiusKm: dto.radiusKm ?? null,
          followUpAsked: result.mode === 'FOLLOW_UP',
          mode: result.mode,
          filters: (result.filters as any) ?? {},
          resultsCount: result.results?.length ?? 0,
        },
      })
      .catch((err) =>
        this.logger.warn(`AiSearchLog write failed: ${err.message}`),
      );

    return result;
  }

  private async callAiSearch(
    dto: AiSearchRequestDto,
    availableSlugs: string[],
  ): Promise<{
    mode: 'FOLLOW_UP' | 'RESULT';
    followUp?: FollowUpDto;
    filters: SearchFiltersDto;
    chips: SearchChipDto[];
  }> {
    const systemPrompt = this.buildSystemPrompt(availableSlugs, dto.conversationHistory ?? []);
    const userPrompt   = this.buildUserPrompt(dto);

    const MAX_PARSE_RETRIES = 2;

    for (let attempt = 0; attempt <= MAX_PARSE_RETRIES; attempt++) {
      const aiResult = await this.aiService.generateCompletion(userPrompt, {
        systemPrompt,
        temperature: 0.3,
        maxTokens: 800,
      });

      const parsed = this.safeJsonParse(aiResult);

      if (parsed) {
        return this.normalizeAiResponse(parsed, dto, availableSlugs);
      }

      // Log the raw response so the root cause is visible in server logs
      this.logger.warn(
        `AI response parse failed (attempt ${attempt + 1}/${MAX_PARSE_RETRIES + 1}) ` +
        `— raw: ${aiResult.slice(0, 300)}`,
      );

      if (attempt < MAX_PARSE_RETRIES) {
        await new Promise((r) => setTimeout(r, 1_000));
      }
    }

    throw new Error('Failed to parse AI response after retries');
  }


  private buildSystemPrompt(
    availableSlugs: string[],
    conversationHistory: { role: 'user' | 'assistant'; content: string }[],
  ): string {
    // Allow up to 3 follow-ups total; count existing assistant turns in history
    const assistantTurns = conversationHistory.filter((m) => m.role === 'assistant').length;
    const followUpsLeft  = Math.max(0, 3 - assistantTurns);

    const historyNote = conversationHistory.length > 0
      ? `You already know the following from the conversation (DO NOT ask about these again):\n` +
        conversationHistory
          .map((m) => `  ${m.role === 'assistant' ? 'You asked' : 'User said'}: ${m.content}`)
          .join('\n')
      : 'This is the first message in the conversation.';

    return `You are a search query parser for a Tunisian rental marketplace. Convert natural language queries into structured JSON filters.

CRITICAL RULES:
1. Output ONLY valid JSON. No markdown, no explanations, no code blocks.
2. Follow-ups remaining: ${followUpsLeft}. If 0, you MUST return mode: "RESULT".
3. Available categories: ${availableSlugs.length > 0 ? availableSlugs.join(', ') : 'any'}
4. Only use categorySlug from the available list above.
5. Parse dates relative to today (${new Date().toISOString().split('T')[0]}).
6. ${historyNote}
7. NEVER ask again about info already established in conversation history.
8. Detect "9riba men el b7ar", "ba7dha el b7ar", "près de la mer", "near the beach" → nearBeach: true.
9. Detect vibe from context: romantic getaway → "romantic", kids/family → "family", sports/hiking → "adventure", cheap/budget → "budget", luxury/premium → "luxury".

OUTPUT SCHEMA:
For FOLLOW_UP mode (only if ${followUpsLeft} > 0 AND critical info is genuinely missing):
{
  "mode": "FOLLOW_UP",
  "followUp": {
    "question": "Which dates do you need?",
    "field": "dates|price|category|bookingType|location|vibe|other",
    "options": ["Today", "Tomorrow", "Pick a date"] // optional
  },
  "filters": { /* best-effort partial filters extracted so far */ },
  "chips": [ { "key": "...", "label": "..." } ]
}

For RESULT mode (normal case):
{
  "mode": "RESULT",
  "filters": {
    "q": "keyword or null",
    "categorySlug": "stays|sports-facilities|mobility|beach-gear or null",
    "minPrice": number or null,
    "maxPrice": number or null,
    "bookingType": "DAILY|SLOT|ANY",
    "availableFrom": "YYYY-MM-DD" or null,
    "availableTo": "YYYY-MM-DD" or null,
    "sortBy": "distance|date|price_asc|price_desc",
    "radiusKm": number,
    "nearBeach": true | false | null,
    "city": "city name" or null,
    "vibe": "romantic|family|adventure|budget|luxury" or null
  },
  "chips": [
    { "key": "q", "label": "villa" },
    { "key": "category", "label": "Stays" },
    { "key": "price", "label": "Up to 250 TND" },
    { "key": "vibe", "label": "💑 Romantic" }
  ]
}

Remember: Output JSON only!`;
  }

  private buildUserPrompt(dto: AiSearchRequestDto): string {
    const history = dto.conversationHistory ?? [];
    let prompt = '';

    // Inject full conversation history so the model has multi-turn context
    if (history.length > 0) {
      prompt += 'CONVERSATION SO FAR:\n';
      for (const msg of history) {
        prompt += `${msg.role === 'user' ? 'User' : 'Assistant'}: ${msg.content}\n`;
      }
      prompt += '---\n';
    }

    prompt += `Current query: "${dto.query}"`;

    if (dto.lat && dto.lng) {
      prompt += `\nLocation: lat=${dto.lat}, lng=${dto.lng}, radius=${dto.radiusKm || 10}km`;
    }

    if (dto.followUpAnswer) {
      prompt += `\nFollow-up answer: "${dto.followUpAnswer}"`;
    }

    // Tell the model how many assistant turns have already happened
    const assistantTurns = history.filter((m) => m.role === 'assistant').length;
    prompt += `\nFollow-ups used so far: ${assistantTurns}/3`;

    return prompt;
  }

  /**
   * Safe JSON extraction and parsing
   * 1. Try direct JSON parse
   * 2. Extract JSON between first '{' and last '}'
   * 3. Validate with Zod schema
   * 4. Return null if all fail
   */
  private safeJsonParse(text: string): any {
    // Try 1: Direct parse
    try {
      const parsed = JSON.parse(text);
      return this.validateAiResponse(parsed);
    } catch (_e) {
      // Continue to extraction
    }

    // Try 2: Extract JSON from text (between first '{' and last '}')
    try {
      const firstBrace = text.indexOf('{');
      const lastBrace = text.lastIndexOf('}');

      if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
        const extracted = text.substring(firstBrace, lastBrace + 1);
        const parsed = JSON.parse(extracted);
        return this.validateAiResponse(parsed);
      }
    } catch (_e) {
      this.logger.error('Failed to extract and parse JSON', _e);
    }

    // Try 3: Legacy markdown code block extraction (fallback)
    try {
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        return this.validateAiResponse(parsed);
      }
    } catch (_e) {
      this.logger.error('Failed to parse from markdown extraction', _e);
    }

    return null;
  }

  /**
   * Validate AI response structure using Zod
   * Returns validated object or null if invalid
   */
  private validateAiResponse(parsed: any): any {
    try {
      const result = AiResponseSchema.safeParse(parsed);

      if (result.success) {
        return result.data;
      } else {
        this.logger.warn('AI response validation failed', {
          errors: result.error.issues,
          parsed,
        });

        // Check if it's at least a valid object with mode
        if (parsed && typeof parsed === 'object' && parsed.mode) {
          // Allow partial validation for backward compatibility
          return parsed;
        }

        return null;
      }
    } catch (error) {
      this.logger.error('Zod validation error', error);
      // Fallback: if Zod fails, do basic validation
      return this.basicValidation(parsed);
    }
  }

  /**
   * Basic validation fallback (if Zod fails)
   */
  private basicValidation(parsed: any): any {
    if (!parsed || typeof parsed !== 'object') {
      return null;
    }

    const mode = parsed.mode;

    // Validate FOLLOW_UP mode
    if (mode === 'FOLLOW_UP') {
      if (!parsed.followUp || typeof parsed.followUp.question !== 'string') {
        this.logger.warn('Invalid FOLLOW_UP: missing followUp.question');
        return null;
      }
      return parsed;
    }

    // Validate RESULT mode
    if (mode === 'RESULT') {
      if (!parsed.filters || typeof parsed.filters !== 'object') {
        this.logger.warn('Invalid RESULT: missing filters object');
        return null;
      }
      if (!Array.isArray(parsed.chips)) {
        // Chips is optional but should be array if present
        parsed.chips = [];
      }
      return parsed;
    }

    // Invalid mode
    this.logger.warn(`Invalid mode: ${mode}`);
    return null;
  }

  private normalizeAiResponse(
    parsed: any,
    dto: AiSearchRequestDto,
    availableSlugs: string[],
  ): {
    mode: 'FOLLOW_UP' | 'RESULT';
    followUp?: FollowUpDto;
    filters: SearchFiltersDto;
    chips: SearchChipDto[];
    results: any[];
  } {
    // Count how many follow-ups have already been used from conversation history
    const history = dto.conversationHistory ?? [];
    const assistantTurns = history.filter((m) => m.role === 'assistant').length;
    const followUpsExhausted = assistantTurns >= 3;

    // Force RESULT if follow-ups exhausted (legacy flag still supported)
    const mode = (dto.followUpUsed || followUpsExhausted)
      ? 'RESULT'
      : parsed.mode || 'RESULT';

    const filters = this.normalizeFilters(
      parsed.filters || {},
      dto,
      availableSlugs,
    );
    const chips = this.filtersToChips(filters);

    if (mode === 'FOLLOW_UP' && !dto.followUpUsed && !followUpsExhausted) {
      return {
        mode: 'FOLLOW_UP',
        followUp: parsed.followUp || {
          question: 'Can you provide more details?',
          field: 'other',
        },
        filters,
        chips,
        results: [],
      };
    }

    return {
      mode: 'RESULT',
      filters,
      chips,
      followUp: null,
      results: [],
    };
  }

  private normalizeFilters(
    filters: any,
    dto: AiSearchRequestDto,
    availableSlugs: string[],
  ): SearchFiltersDto {
    const normalized: SearchFiltersDto = {};

    // Keyword
    if (filters.q) {
      normalized.q = filters.q.trim();
    }

    // Category — always validate against the platform whitelist,
    // then optionally narrow to the geo-derived subset.
    if (filters.categorySlug) {
      const slug = filters.categorySlug as string;

      // Guard 1: must be a known platform category (anti-hallucination)
      const isKnownSlug = ALLOWED_CATEGORY_SLUGS.includes(slug);

      // Guard 2: if geo resolved a narrower list, slug must be in that list too
      const isInGeoSubset =
        availableSlugs.length === 0 || availableSlugs.includes(slug);

      if (isKnownSlug && isInGeoSubset) {
        normalized.categorySlug = slug;
      } else {
        this.logger.warn(
          isKnownSlug
            ? `Category "${slug}" not available in this area [${availableSlugs.join(', ')}], discarding`
            : `AI hallucinated unknown category "${slug}" — discarding (whitelist: ${ALLOWED_CATEGORY_SLUGS.join(', ')})`,
        );
        // categorySlug intentionally omitted — no hallucination passes through
      }
    }

    // Price
    if (filters.minPrice != null && filters.minPrice >= 0) {
      normalized.minPrice = Math.max(0, filters.minPrice);
    }
    if (filters.maxPrice != null && filters.maxPrice >= 0) {
      normalized.maxPrice = Math.max(0, filters.maxPrice);
    }

    // Booking type
    if (['DAILY', 'SLOT', 'ANY'].includes(filters.bookingType)) {
      normalized.bookingType = filters.bookingType;
    }

    // Dates
    if (filters.availableFrom) {
      normalized.availableFrom = filters.availableFrom;
    }
    if (filters.availableTo) {
      normalized.availableTo = filters.availableTo;
    }

    // Sort
    normalized.sortBy =
      filters.sortBy || (dto.lat && dto.lng ? 'distance' : 'date');

    // Radius
    normalized.radiusKm = Math.min(
      50,
      Math.max(0, dto.radiusKm || filters.radiusKm || 10),
    );

    // Near beach
    if (filters.nearBeach != null) {
      normalized.nearBeach = filters.nearBeach as boolean;
    }

    // City
    if (filters.city && typeof filters.city === 'string') {
      normalized.city = filters.city.trim();
    }

    // Vibe
    const VALID_VIBES = ['romantic', 'family', 'adventure', 'budget', 'luxury'] as const;
    if (filters.vibe && VALID_VIBES.includes(filters.vibe)) {
      normalized.vibe = filters.vibe;
    }

    return normalized;
  }

  private filtersToChips(filters: SearchFiltersDto): SearchChipDto[] {
    const chips: SearchChipDto[] = [];

    if (filters.q) {
      chips.push({ key: 'q', label: filters.q });
    }

    if (filters.categorySlug) {
      const categoryName = this.categorySlugToName(filters.categorySlug);
      chips.push({ key: 'category', label: categoryName });
    }

    if (filters.minPrice != null && filters.maxPrice != null) {
      chips.push({
        key: 'price',
        label: `${filters.minPrice}-${filters.maxPrice} TND`,
      });
    } else if (filters.maxPrice != null) {
      chips.push({ key: 'price', label: `Up to ${filters.maxPrice} TND` });
    } else if (filters.minPrice != null) {
      chips.push({ key: 'price', label: `From ${filters.minPrice} TND` });
    }

    if (filters.bookingType && filters.bookingType !== 'ANY') {
      chips.push({ key: 'bookingType', label: filters.bookingType });
    }

    if (filters.availableFrom && filters.availableTo) {
      chips.push({
        key: 'dates',
        label: `${filters.availableFrom} to ${filters.availableTo}`,
      });
    } else if (filters.availableFrom) {
      chips.push({ key: 'dates', label: `From ${filters.availableFrom}` });
    }

    if (filters.radiusKm) {
      chips.push({ key: 'radius', label: `Within ${filters.radiusKm} km` });
    }

    if (filters.city) {
      chips.push({ key: 'city', label: filters.city });
    }

    if (filters.nearBeach) {
      chips.push({ key: 'nearBeach', label: 'Near beach' });
    }

    // Vibe labels with emoji
    const vibeLabels: Record<string, string> = {
      romantic:  '💑 Romantic',
      family:    '👨‍👩‍👧 Family',
      adventure: '🏄 Adventure',
      budget:    '💰 Budget',
      luxury:    '✨ Luxury',
    };
    if (filters.vibe && vibeLabels[filters.vibe]) {
      chips.push({ key: 'vibe', label: vibeLabels[filters.vibe] });
    }

    return chips;
  }

  private categorySlugToName(slug: string): string {
    const names: Record<string, string> = {
      stays: 'Stays',
      'sports-facilities': 'Sports Facilities',
      mobility: 'Mobility',
      'beach-gear': 'Beach Gear',
    };
    return names[slug] || slug;
  }

  private async fetchListings(
    filters: SearchFiltersDto,
    lat?: number,
    lng?: number,
  ): Promise<any[]> {
    try {
      // Build query params for listings service
      const query: any = {};

      if (filters.q) query.search = filters.q;
      if (filters.categorySlug) query.categorySlug = filters.categorySlug;
      if (filters.minPrice != null) query.minPrice = filters.minPrice;
      if (filters.maxPrice != null) query.maxPrice = filters.maxPrice;
      if (filters.bookingType && filters.bookingType !== 'ANY') {
        query.bookingType = filters.bookingType;
      }
      if (lat != null) query.latitude = lat;
      if (lng != null) query.longitude = lng;
      if (filters.radiusKm) query.radius = filters.radiusKm;
      if (filters.nearBeach != null) query.nearBeach = filters.nearBeach;
      if (filters.city) query.city = filters.city;

      const results = await this.listingsService.findAll(query);
      return results;
    } catch (error) {
      this.logger.error('Failed to fetch listings', error);
      return [];
    }
  }

  private async fallbackSearch(
    dto: AiSearchRequestDto,
    _availableSlugs: string[],
  ): Promise<AiSearchResponseDto> {
    const filters: SearchFiltersDto = {
      q: dto.query.trim(),
      radiusKm: dto.radiusKm || 10,
      sortBy: dto.lat && dto.lng ? 'distance' : 'date',
    };

    const chips = this.filtersToChips(filters);
    const results = await this.fetchListings(filters, dto.lat, dto.lng);

    return {
      mode: 'RESULT',
      filters,
      chips,
      followUp: null,
      results,
    };
  }
}
