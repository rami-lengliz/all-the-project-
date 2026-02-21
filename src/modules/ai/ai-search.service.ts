import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AiService } from './ai.service';
import { ListingsService } from '../listings/listings.service';
import { CategoriesService } from '../categories/categories.service';
import { PrismaService } from '../../database/prisma.service';
import {
  AiSearchRequestDto,
  AiSearchResponseDto,
  SearchFiltersDto,
  SearchChipDto,
  FollowUpDto,
} from './dto/ai-search.dto';

@Injectable()
export class AiSearchService {
  private readonly logger = new Logger(AiSearchService.name);

  constructor(
    private readonly aiService: AiService,
    private readonly listingsService: ListingsService,
    private readonly categoriesService: CategoriesService,
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
  ) { }

  async search(dto: AiSearchRequestDto): Promise<AiSearchResponseDto> {
    const openaiKey = this.configService.get<string>('OPENAI_API_KEY');

    // Get available category slugs if location provided but not explicitly set
    let availableSlugs = dto.availableCategorySlugs || [];
    if (!availableSlugs.length && dto.lat && dto.lng) {
      const nearbyCategories =
        await this.categoriesService.findNearbyWithCounts(
          dto.lat,
          dto.lng,
          dto.radiusKm || 10,
          false, // only categories with listings
        );
      availableSlugs = nearbyCategories.map((c) => c.slug);
    }

    let result: AiSearchResponseDto;

    // Fallback mode if no OpenAI key
    if (!openaiKey || openaiKey.trim() === '') {
      this.logger.warn('No OPENAI_API_KEY found, using fallback search');
      result = await this.fallbackSearch(dto, availableSlugs);
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
        this.logger.error(
          'AI search failed, falling back to keyword search',
          error,
        );
        result = await this.fallbackSearch(dto, availableSlugs);
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
    const systemPrompt = this.buildSystemPrompt(
      availableSlugs,
      dto.followUpUsed,
    );
    const userPrompt = this.buildUserPrompt(dto);

    const aiResult = await this.aiService.generateCompletion(userPrompt, {
      systemPrompt,
      temperature: 0.3,
      maxTokens: 800,
    });

    // Parse JSON from AI response
    const parsed = this.safeJsonParse(aiResult);

    if (!parsed) {
      throw new Error('Failed to parse AI response');
    }

    // Validate and normalize the response
    return this.normalizeAiResponse(parsed, dto, availableSlugs);
  }

  private buildSystemPrompt(
    availableSlugs: string[],
    followUpUsed: boolean,
  ): string {
    const maxFollowUp = followUpUsed ? 0 : 1;

    return `You are a search query parser for a rental marketplace. Your job is to convert natural language queries into structured filters.

CRITICAL RULES:
1. Output ONLY valid JSON. No markdown, no explanations, no code blocks.
2. Maximum ${maxFollowUp} follow-up question${maxFollowUp === 1 ? '' : 's'}. If followUpUsed=true, you MUST return mode: "RESULT".
3. Available categories: ${availableSlugs.length > 0 ? availableSlugs.join(', ') : 'any'}
4. Only use categorySlug from the available list above.
5. Parse dates relative to today (${new Date().toISOString().split('T')[0]}).

OUTPUT SCHEMA:
For FOLLOW_UP mode (only if ${maxFollowUp} > 0 AND critical info missing):
{
  "mode": "FOLLOW_UP",
  "followUp": {
    "question": "Which dates do you need?",
    "field": "dates|price|category|bookingType|location|other",
    "options": ["Today", "Tomorrow", "Pick a date"] // optional
  },
  "filters": { /* best-effort partial filters */ },
  "chips": [ { "key": "...", "label": "..." } ]
}

For RESULT mode (normal case):
{
  "mode": "RESULT",
  "filters": {
    "q": "keyword",
    "categorySlug": "accommodation|mobility|sports-facilities|...",
    "minPrice": number or null,
    "maxPrice": number or null,
    "bookingType": "DAILY|SLOT|ANY",
    "availableFrom": "YYYY-MM-DD" or null,
    "availableTo": "YYYY-MM-DD" or null,
    "sortBy": "distance|date|price_asc|price_desc",
    "radiusKm": number
  },
  "chips": [
    { "key": "q", "label": "villa" },
    { "key": "category", "label": "Accommodation" },
    { "key": "price", "label": "Up to 250 TND" }
  ]
}

Remember: Output JSON only!`;
  }

  private buildUserPrompt(dto: AiSearchRequestDto): string {
    let prompt = `Query: "${dto.query}"`;

    if (dto.lat && dto.lng) {
      prompt += `\nLocation: lat=${dto.lat}, lng=${dto.lng}, radius=${dto.radiusKm || 10}km`;
    }

    if (dto.followUpUsed && dto.followUpAnswer) {
      prompt += `\nFollow-up answer: "${dto.followUpAnswer}"`;
    }

    prompt += `\nfollowUpUsed: ${dto.followUpUsed || false}`;

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
    } catch (e) {
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
    } catch (e) {
      this.logger.error('Failed to extract and parse JSON', e);
    }

    // Try 3: Legacy markdown code block extraction (fallback)
    try {
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        return this.validateAiResponse(parsed);
      }
    } catch (e) {
      this.logger.error('Failed to parse from markdown extraction', e);
    }

    return null;
  }

  /**
   * Validate AI response structure using Zod
   * Returns validated object or null if invalid
   */
  private validateAiResponse(parsed: any): any {
    try {
      // Import Zod schema dynamically to avoid circular deps
      const { AiResponseSchema } = require('./schemas/ai-response.schema');

      const result = AiResponseSchema.safeParse(parsed);

      if (result.success) {
        return result.data;
      } else {
        this.logger.warn('AI response validation failed', {
          errors: result.error.errors,
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
    // Force RESULT mode if followUpUsed
    const mode = dto.followUpUsed ? 'RESULT' : parsed.mode || 'RESULT';

    const filters = this.normalizeFilters(
      parsed.filters || {},
      dto,
      availableSlugs,
    );
    const chips = this.filtersToChips(filters);

    if (mode === 'FOLLOW_UP' && !dto.followUpUsed) {
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

    // Category - validate against available slugs
    if (filters.categorySlug) {
      if (availableSlugs.length > 0) {
        // If we have a restricted list, validate against it
        if (availableSlugs.includes(filters.categorySlug)) {
          normalized.categorySlug = filters.categorySlug;
        } else {
          this.logger.warn(
            `AI suggested category "${filters.categorySlug}" not in available slugs [${availableSlugs.join(', ')}], discarding`,
          );
          // Discard invalid category (do not hallucinate)
        }
      } else {
        // No restriction, accept any valid slug
        normalized.categorySlug = filters.categorySlug;
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

    return chips;
  }

  private categorySlugToName(slug: string): string {
    const names: Record<string, string> = {
      accommodation: 'Accommodation',
      mobility: 'Mobility',
      'water-beach-activities': 'Water & Beach',
      'sports-facilities': 'Sports Facilities',
      'sports-equipment': 'Sports Equipment',
      tools: 'Tools',
      other: 'Other',
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

      const results = await this.listingsService.findAll(query);
      return results;
    } catch (error) {
      this.logger.error('Failed to fetch listings', error);
      return [];
    }
  }

  private async fallbackSearch(
    dto: AiSearchRequestDto,
    availableSlugs: string[],
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
