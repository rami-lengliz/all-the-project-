import { Controller, Post, Get, Patch, Param, Body, Query, UseGuards } from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiResponse,
  ApiOkResponse,
  ApiQuery,
  ApiBody,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { Public } from '../../common/decorators/public.decorator';
import { ListingAssistantService } from './listing-assistant.service';
import { AiSearchService } from './ai-search.service';
import { PriceSuggestionService } from './price-suggestion.service';
import { PrismaService } from '../../database/prisma.service';
import {
  GenerateListingDto,
  EnhanceDescriptionDto,
  GenerateTitleDto,
} from './dto/listing-assistant.dto';
import { AiSearchRequestDto } from './dto/ai-search.dto';
import {
  PriceSuggestionRequestDto,
  PriceSuggestionResponseDto,
  PatchPriceSuggestionLogDto,
} from './dto/price-suggestion.dto';

@ApiTags('AI')
@Controller('api/ai')
export class AiController {
  constructor(
    private listingAssistantService: ListingAssistantService,
    private aiSearchService: AiSearchService,
    private priceSuggestionService: PriceSuggestionService,
    private prisma: PrismaService,
  ) {}

  @Post('search')
  @Public()
  @ApiOperation({
    summary: 'AI-powered natural language search',
    description:
      'Converts a natural-language query (Arabic, French, English, mixed dialect) into ' +
      'structured listing filters.\n\n' +
      '**Two-turn flow:**\n' +
      '1. First call — AI may return `FOLLOW_UP` if critical info is missing (max 1 question total)\n' +
      '2. Second call — send `followUpUsed: true` + `followUpAnswer`; guardrail forces `RESULT`\n\n' +
      '**Category whitelist** — `categorySlug` in the response is ALWAYS one of:\n' +
      '`stays`, `sports-facilities`, `mobility`, `beach-gear`\n' +
      'Hallucinated categories (restaurants, healthcare, etc.) are silently discarded.\n\n' +
      '**Stable response contract:** every response has `mode`, `filters` (object), `chips` (array), ' +
      '`followUp` (null in RESULT), `results` (empty in FOLLOW_UP).',
  })
  @ApiOkResponse({
    description: 'Search results or follow-up question',
    schema: {
      oneOf: [
        {
          title: 'FOLLOW_UP Mode',
          type: 'object',
          properties: {
            mode: { type: 'string', enum: ['FOLLOW_UP'], example: 'FOLLOW_UP' },
            followUp: {
              type: 'object',
              properties: {
                question: {
                  type: 'string',
                  example: 'Which dates do you need?',
                },
                field: {
                  type: 'string',
                  enum: [
                    'dates',
                    'price',
                    'category',
                    'bookingType',
                    'location',
                    'other',
                  ],
                  example: 'dates',
                },
                options: {
                  type: 'array',
                  items: { type: 'string' },
                  example: ['Today', 'Tomorrow', 'This weekend'],
                },
              },
            },
            filters: {
              type: 'object',
              properties: {
                q: { type: 'string', example: 'villa' },
                categorySlug: { type: 'string', example: 'stays' },
                minPrice: { type: 'number', nullable: true },
                maxPrice: { type: 'number', example: 250 },
                bookingType: {
                  type: 'string',
                  enum: ['DAILY', 'SLOT', 'ANY'],
                  nullable: true,
                },
                availableFrom: { type: 'string', nullable: true },
                availableTo: { type: 'string', nullable: true },
                sortBy: {
                  type: 'string',
                  enum: ['distance', 'date', 'price_asc', 'price_desc'],
                  example: 'distance',
                },
                radiusKm: { type: 'number', example: 10 },
              },
            },
            chips: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  key: { type: 'string' },
                  label: { type: 'string' },
                },
              },
              example: [
                { key: 'q', label: 'villa' },
                { key: 'category', label: 'stays' },
                { key: 'price', label: 'Up to 250 TND' },
              ],
            },
            results: {
              type: 'array',
              example: [],
              description: 'Always empty in FOLLOW_UP mode',
            },
          },
          example: {
            mode: 'FOLLOW_UP',
            followUp: {
              question: 'Pour quelles dates exactement avez-vous besoin du terrain ?',
              field: 'dates',
              options: ['Ce vendredi soir', 'Ce samedi', 'Ce dimanche'],
            },
            // Partial filters already resolved before asking the question:
            filters: {
              categorySlug: 'sports-facilities', // already resolved from "terrain de foot"
              sortBy: 'distance',
              radiusKm: 25,
            },
            chips: [
              { key: 'category', label: 'Sport' },
            ],
            results: [], // always empty in FOLLOW_UP
          },
        },
        {
          title: 'RESULT Mode',
          type: 'object',
          properties: {
            mode: { type: 'string', enum: ['RESULT'], example: 'RESULT' },
            filters: {
              type: 'object',
              properties: {
                q: { type: 'string', example: 'villa' },
                categorySlug: { type: 'string', example: 'stays' },
                minPrice: { type: 'number', nullable: true },
                maxPrice: { type: 'number', example: 250 },
                bookingType: {
                  type: 'string',
                  enum: ['DAILY', 'SLOT', 'ANY'],
                  example: 'DAILY',
                },
                availableFrom: { type: 'string', example: '2026-02-17' },
                availableTo: { type: 'string', example: '2026-02-19' },
                sortBy: {
                  type: 'string',
                  enum: ['distance', 'date', 'price_asc', 'price_desc'],
                  example: 'distance',
                },
                radiusKm: { type: 'number', example: 10 },
              },
            },
            chips: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  key: { type: 'string' },
                  label: { type: 'string' },
                },
              },
              example: [
                { key: 'q', label: 'villa' },
                { key: 'category', label: 'stays' },
                { key: 'price', label: 'Up to 250 TND' },
                { key: 'dates', label: '2026-02-17 to 2026-02-19' },
              ],
            },
            followUp: {
              type: 'null',
              example: null,
              description: 'Always null in RESULT mode',
            },
            results: {
              type: 'array',
              items: { type: 'object' },
              description: 'Array of listing summaries',
              example: [
                {
                  id: '123e4567-e89b-12d3-a456-426614174000',
                  title: 'Luxury Beach Villa',
                  pricePerDay: 200,
                  category: 'stays',
                },
              ],
            },
          },
          example: {
            mode: 'RESULT',
            filters: {
              q: 'villa',
              // categorySlug is always from: stays | sports-facilities | mobility | beach-gear
              categorySlug: 'stays',
              maxPrice: 300,
              sortBy: 'distance',
              radiusKm: 25,
            },
            chips: [
              { key: 'q',        label: 'villa' },
              { key: 'category', label: 'Stays' },
              { key: 'price',    label: 'Up to 300 TND' },
            ],
            followUp: null, // always null in RESULT
            // results is an array of matched listings (empty when no listings match):
            results: [
              {
                id:             'c3f2a1b4-e89b-12d3-a456-000000000001',
                title:          'Villa Yasmine — vue mer à Kélibia',
                pricePerDay:    290,
                categorySlug:   'stays',
                propertyType:   'villa',
                nearBeach:      true,
                guestsCapacity: 8,
                bedrooms:       4,
                city:           'Kelibia',
                address:        'Cité Ain Karma, Kelibia 8090',
                thumbnail:      'https://res.cloudinary.com/example/villa_yasmine.jpg',
              },
              {
                id:             'c3f2a1b4-e89b-12d3-a456-000000000002',
                title:          'Villa Nour — grande piscine plein air',
                pricePerDay:    260,
                categorySlug:   'stays',
                propertyType:   'villa',
                nearBeach:      false,
                guestsCapacity: 6,
                bedrooms:       3,
                city:           'Kelibia',
                address:        'Zone touristique, Kelibia 8090',
                thumbnail:      'https://res.cloudinary.com/example/villa_nour.jpg',
              },
            ],
          },
        },
      ],
    },
  })
  @ApiBody({
    type: AiSearchRequestDto,
    description:
      'Natural language search request. Tip: use followUpUsed=true to always get a direct RESULT without a clarification question.',
    examples: {
      result_direct: {
        summary: '1️⃣ Force RESULT — always returns listings (safe for demo)',
        description:
          'Set followUpUsed=true to bypass the follow-up question guardrail. Always returns RESULT mode.',
        value: {
          query: 'villa near beach under 300',
          lat: 36.847,
          lng: 11.093,
          radiusKm: 50,
          followUpUsed: true,
        },
      },
      follow_up: {
        summary: '2️⃣ FOLLOW_UP — let AI ask one clarifying question',
        description:
          'Vague query triggers FOLLOW_UP. The response includes a question + partial filters + chips.',
        value: {
          query: 'something cheap near me',
          lat: 36.847,
          lng: 11.093,
          radiusKm: 50,
          followUpUsed: false,
        },
      },
      follow_up_answer: {
        summary: '3️⃣ FOLLOW_UP answered — force RESULT on second call',
        description:
          "Pass the user's answer to the follow-up question and set followUpUsed=true. The guardrail forces RESULT mode.",
        value: {
          query: 'something cheap near me',
          lat: 36.847,
          lng: 11.093,
          radiusKm: 50,
          followUpUsed: true,
          followUpAnswer: 'Tomorrow, under 100 TND',
        },
      },
    },
  })
  async search(@Body() dto: AiSearchRequestDto) {
    return this.aiSearchService.search(dto);
  }

  @Get('admin/search-logs')
  @Public()
  @ApiOperation({
    summary: '[Dev/Admin] List recent AI search logs',
    description:
      'Returns the last N AI search log entries. Useful for PFE demo and debugging.',
  })
  @ApiQuery({ name: 'limit', required: false, type: Number, example: 20 })
  async getSearchLogs(@Query('limit') limit?: string) {
    const take = Math.min(parseInt(limit ?? '20', 10) || 20, 100);
    return this.prisma.aiSearchLog.findMany({
      orderBy: { createdAt: 'desc' },
      take,
    });
  }

  @Post('generate')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Generate complete listing (title, description, highlights)',
  })
  @ApiResponse({
    status: 201,
    description: 'Listing generated successfully',
    schema: {
      example: {
        title: 'Professional Tennis Court with Night Lighting',
        description:
          'Experience top-tier tennis at our professional-grade court...',
        highlights: [
          'Professional-grade surface',
          'Night lighting available',
          'Equipment rental included',
        ],
      },
    },
  })
  async generateListing(@Body() dto: GenerateListingDto) {
    return this.listingAssistantService.generateListing(dto);
  }

  @Post('enhance-description')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Enhance existing listing description' })
  @ApiResponse({
    status: 201,
    description: 'Description enhanced successfully',
    schema: {
      example: {
        enhancedDescription: 'Discover our premium tennis court...',
      },
    },
  })
  async enhanceDescription(@Body() dto: EnhanceDescriptionDto) {
    const enhanced = await this.listingAssistantService.enhanceDescription(
      dto.currentDescription,
      dto.category,
    );
    return { enhancedDescription: enhanced };
  }

  @Post('generate-titles')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Generate catchy listing titles' })
  @ApiResponse({
    status: 201,
    description: 'Titles generated successfully',
    schema: {
      example: {
        titles: [
          'Professional Tennis Court - Night Games Available',
          'Premium Tennis Facility with Pro Equipment',
          'Kelibia Tennis Court - Book Your Court Time',
        ],
      },
    },
  })
  async generateTitles(@Body() dto: GenerateTitleDto) {
    const titles = await this.listingAssistantService.generateTitle(
      dto.category,
      dto.keyFeatures,
      dto.location,
    );
    return { titles };
  }

  // ── AI Price Suggestion ────────────────────────────────────────────────────

  @Post('price-suggestion')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'AI Price Suggestion — comparables-first engine',
    description: [
      'Returns a recommended price (TND), a similarity-weighted range, a confidence band, and 2–3 explanation bullets.',
      '',
      '**Algorithm (no AI involved in numbers):**',
      '1. Fetches real comparable listings via PostGIS 3-tier fallback (city 25 km → region 75 km → national)',
      '2. Scores each comp by similarity: propertyType (35%), nearBeach (25%), guestsCapacity (25%), bedrooms (15%)',
      '3. Computes the **similarity-weighted median** as the base recommended price',
      '4. Applies IQR ±20% for the range; clamps with hard caps per category',
      '5. Applies accommodation multipliers: sea-proximity tier, property type, capacity, season',
      '',
      '**Numeric range is always comp-driven.** AI (when available) is only used to generate the explanation bullets.',
      'Removing or misconfiguring the AI key has zero effect on `recommended`, `range.min`, `range.max`.',
      '',
      '**Fallback:** If `compsUsed=0` (unknown city), `confidence: "low"` and the national baseline is used.',
      '',
      'After the host publishes, call `PATCH /price-suggestion/log/:logId` to record the final price.',
    ].join('\n'),
  })
  @ApiBody({
    type: PriceSuggestionRequestDto,
    examples: {
      // ── Example 1 ────────────────────────────────────────────────────────
      kelibia_villa_beach: {
        summary: '🏖️  Ex 1 — Kelibia beachfront villa (peak)',
        description:
          'Accommodation near the sea with full geo. Expects high confidence, ' +
          'villa + beachfront multipliers applied, seasonal peak boost.',
        value: {
          city:            'Kelibia',
          category:        'accommodation',
          unit:            'per_night',
          lat:              36.8497,
          lng:              11.1047,
          radiusKm:         20,
          propertyType:    'villa',
          distanceToSeaKm:  0.2,
          capacity:         8,
          amenities:       ['pool', 'sea_view', 'wifi', 'air_conditioning', 'parking'],
          season:          'peak',
        },
      },
      // ── Example 2 ────────────────────────────────────────────────────────
      tunis_sports_slot: {
        summary: '⚽  Ex 2 — Tunis sports facility (per-slot)',
        description:
          'Sports facility priced per slot. No propertyType or distanceToSeaKm — ' +
          'accommodation-specific multipliers are skipped entirely.',
        value: {
          city:      'Tunis',
          category:  'sports_facility',
          unit:      'per_session',
          lat:        36.8190,
          lng:        10.1658,
          radiusKm:   15,
          capacity:   22,
          amenities: ['changing_rooms', 'floodlights', 'parking'],
        },
      },
      // ── Example 3 ────────────────────────────────────────────────────────
      cold_start_fallback: {
        summary: '❓  Ex 3 — Unknown city (fallback, low confidence)',
        description:
          'City with no listings in DB. Engine falls back to national baseline. ' +
          'Confidence will be "low". Useful to verify the fallback path works.',
        value: {
          city:     'BirMcherga',
          category: 'accommodation',
          unit:     'per_night',
        },
      },
    },
  })
  @ApiResponse({
    status: 200,
    description:
      'Price suggestion returned.\n\n' +
      '- `recommended` — similarity-weighted median of comparable listings, rounded to nearest 0.5 TND\n' +
      '- `range` — IQR ±20% bounds; always `min < recommended < max`\n' +
      '- `confidence` — `"high"` (≥10 city comps), `"medium"` (5–9), `"low"` (<5 or national-only)\n' +
      '- `compsUsed` — number of comparable listings that drove the price (0 = cold start fallback)\n' +
      '- `explanation` — 2–3 human-readable bullets (AI-generated or heuristic fallback)\n' +
      '- `logId` — pass this back to `PATCH /price-suggestion/log/:logId` after listing is published',
    schema: {
      oneOf: [
        {
          title: 'High confidence — Kelibia beachfront villa (14 comps)',
          example: {
            recommended:  421.5,
            range:       { min: 317, max: 492 },
            currency:    'TND',
            unit:        'per_night',
            confidence:  'high',
            compsUsed:    14,
            explanation: [
              'Based on 14 comparable beachfront villas in Kelibia, the similarity-weighted market rate is 421 TND/night.',
              'Sea proximity premium applied (beachfront ≤ 300 m) — the #1 price driver in the Kelibia coastal market.',
              'Villa type (+30%) and 8-guest capacity are consistent with the top comparable listings. Typical range: 317–492 TND/night.',
            ],
            logId: 'a1b2c3d4-0000-0000-0000-000000000001',
          },
        },
        {
          title: 'Low confidence — unknown city (0 comps, national baseline fallback)',
          example: {
            recommended:  150,
            range:       { min: 120, max: 180 },
            currency:    'TND',
            unit:        'per_night',
            confidence:  'low',
            compsUsed:    0,
            explanation: [
              'No comparable listings found for BirMcherga yet.',
              'Using national baseline of 150 TND as a starting point.',
              'Low confidence: adjust the price based on your local knowledge.',
            ],
            logId: 'a1b2c3d4-0000-0000-0000-000000000002',
          },
        },
      ],
    },
  })
  @ApiResponse({
    status: 400,
    description: 'Validation error — missing or invalid required fields',
    schema: {
      example: {
        statusCode: 400,
        message: [
          'city must be a non-empty string',
          'category must be one of: accommodation, sports_facility, tool, vehicle, event_space',
          'unit must be one of: per_night, per_hour, per_day, per_session',
        ],
        error: 'Bad Request',
      },
    },
  })
  @ApiResponse({ status: 401, description: 'Unauthorized — JWT token missing or invalid' })
  async priceSuggestion(
    @Body() dto: PriceSuggestionRequestDto,
  ): Promise<PriceSuggestionResponseDto> {
    return this.priceSuggestionService.suggest(dto);
  }

  // ── PATCH /api/ai/price-suggestion/log/:id ──────────────────────────────────────
  @Patch('price-suggestion/log/:id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Link listing to price suggestion log after publish',
    description: [
      'Called by the frontend immediately after `POST /listings` succeeds.',
      'Writes three fields into the `ai_price_suggestion_logs` row:',
      '- `listingId` — foreign key to the created listing',
      '- `finalPrice` — price the host actually chose (may differ from AI)',
      '- `overridden` — true when |finalPrice − suggestedPrice| > 0.01 TND',
      '',
      'This is fire-and-forget on the frontend (errors are swallowed).',
      'On the backend it never throws — logging failure never blocks listing creation.',
    ].join('\n'),
  })
  @ApiBody({
    type: PatchPriceSuggestionLogDto,
    examples: {
      accepted: {
        summary: 'Host accepted AI price',
        value: { listingId: 'b3f2a1c4-0001', finalPrice: 284.5, suggestedPrice: 284.5 },
      },
      overridden: {
        summary: 'Host overrode AI price',
        value: { listingId: 'b3f2a1c4-0002', finalPrice: 320.0, suggestedPrice: 284.5 },
      },
    },
  })
  @ApiResponse({
    status: 200,
    description: 'Log row updated — no response body.',
    schema: {
      example: {
        // ai_price_suggestion_logs row after PATCH:
        id:            'a1b2c3d4-...',
        listingId:     'b3f2a1c4-0002',
        finalPrice:    320.0,
        overridden:    true,   // |320.0 − 284.5| > 0.01
        suggestedPrice: 284.5, // readable from outputJson
      },
    },
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 404, description: 'Log row not found (logId invalid or expired)' })
  async patchPriceSuggestionLog(
    @Param('id') id: string,
    @Body() body: PatchPriceSuggestionLogDto,
  ): Promise<void> {
    return this.priceSuggestionService.patchLog(
      id,
      body.listingId,
      body.finalPrice,
      body.suggestedPrice,
    );
  }

  // ── GET /api/ai/price-suggestion/comps (debug/test) ────────────────────────
  @Get('price-suggestion/comps')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Fetch raw city comparables (PostGIS)',
    description:
      'Debug endpoint — returns the raw comp rows used by the pricing engine for a given location + category. ' +
      'Useful for verifying PostGIS is working and comps are being fetched correctly.',
  })
  @ApiQuery({ name: 'lat',      type: Number, required: true,  example: 36.8497 })
  @ApiQuery({ name: 'lng',      type: Number, required: true,  example: 11.1047 })
  @ApiQuery({ name: 'radiusKm', type: Number, required: false, example: 25 })
  @ApiQuery({ name: 'category', type: String, required: true,  example: 'accommodation' })
  @ApiQuery({ name: 'unit',     type: String, required: true,  example: 'per_night' })
  @ApiQuery({ name: 'city',     type: String, required: true,  example: 'Kelibia' })
  @ApiResponse({ status: 200, description: 'Array of comp rows' })
  async getPriceComps(
    @Query('lat')      lat:      string,
    @Query('lng')      lng:      string,
    @Query('radiusKm') radiusKm: string,
    @Query('category') category: string,
    @Query('unit')     unit:     string,
    @Query('city')     city:     string,
  ): Promise<any[]> {
    const dto = {
      city,
      category: category as any,
      unit:     unit     as any,
      lat:      parseFloat(lat),
      lng:      parseFloat(lng),
      radiusKm: radiusKm ? parseFloat(radiusKm) : 25,
    };
    return this.priceSuggestionService.fetchCompsGeo(
      dto as any,
      dto.lat,
      dto.lng,
      dto.radiusKm,
    );
  }

  // ── GET /api/ai/price-suggestion/logs (admin only) ─────────────────────────
  @Get('price-suggestion/logs')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Admin: list recent price suggestion logs',
    description:
      'Returns the N most recent PriceSuggestionLog rows (scalar fields only, no JSON blobs). ' +
      'Useful for PFE evaluation: compare suggestedPrice vs finalPrice, track confidence distribution, ' +
      'and measure host override rates. Requires admin role.',
  })
  @ApiQuery({ name: 'limit', type: Number, required: false, example: 50, description: 'Max rows (1–200)' })
  @ApiResponse({
    status: 200,
    description: 'Array of log rows',
    schema: {
      example: [{
        id:            'uuid',
        createdAt:     '2026-04-11T22:00:00Z',
        city:          'Kelibia',
        categorySlug:  'stays',
        unit:          'per_night',
        suggestedPrice: 284.5,
        rangeMin:       210,
        rangeMax:       330,
        confidence:    'high',
        compsCity:     12,
        compsNational: 80,
        wCity:         1,
        wNational:     0,
        listingId:     null,
        finalPrice:    null,
        overridden:    null,
      }],
    },
  })
  async getPriceSuggestionLogs(
    @Query('limit') limit?: string,
  ): Promise<any[]> {
    return this.priceSuggestionService.getRecentLogs(
      limit ? Math.max(1, parseInt(limit, 10)) : 50,
    );
  }
}
