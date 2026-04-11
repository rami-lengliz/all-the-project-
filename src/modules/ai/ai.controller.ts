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
    summary: 'AI-powered search with natural language',
    description:
      'Converts natural language queries into structured filters. ' +
      'Supports max 1 follow-up question for clarification. ' +
      'Returns either FOLLOW_UP mode (if clarification needed) or RESULT mode with listings. ' +
      'All responses have stable keys: mode, filters, chips, followUp, results.',
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
              question: 'Which dates do you need?',
              field: 'dates',
              options: ['Today', 'Tomorrow', 'This weekend'],
            },
            filters: {
              q: 'villa',
              categorySlug: 'stays',
              maxPrice: 250,
              sortBy: 'distance',
              radiusKm: 10,
            },
            chips: [
              { key: 'q', label: 'villa' },
              { key: 'category', label: 'stays' },
              { key: 'price', label: 'Up to 250 TND' },
            ],
            results: [],
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
              categorySlug: 'stays',
              maxPrice: 250,
              bookingType: 'DAILY',
              availableFrom: '2026-02-17',
              availableTo: '2026-02-19',
              sortBy: 'distance',
              radiusKm: 10,
            },
            chips: [
              { key: 'q', label: 'villa' },
              { key: 'category', label: 'stays' },
              { key: 'price', label: 'Up to 250 TND' },
              { key: 'dates', label: '2026-02-17 to 2026-02-19' },
            ],
            followUp: null,
            results: [
              {
                id: '123e4567-e89b-12d3-a456-426614174000',
                title: 'Luxury Beach Villa',
                pricePerDay: 200,
                category: 'stays',
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
    summary: 'AI Price Suggestion for new listing',
    description:
      'Returns a recommended price, range, confidence score, and 3-bullet explanation. ' +
      'The user never inputs a price before calling this endpoint. ' +
      'An override is allowed only on the final listing confirmation step.',
  })
  @ApiBody({
    type: PriceSuggestionRequestDto,
    examples: {
      kelibia_accommodation: {
        summary: '🏖️ Example 1 — Kelibia beachfront villa (near sea, peak)',
        value: {
          city: 'Kelibia',
          category: 'accommodation',
          unit: 'per_night',
          lat: 36.8497,
          lng: 11.1047,
          area_sqm: 120,
          capacity: 8,
          propertyType: 'villa',
          distanceToSeaKm: 0.2,
          amenities: ['sea_view', 'pool', 'wifi', 'parking', 'air_conditioning'],
          condition: 'excellent',
          season: 'peak',
        },
      },
      kelibia_inland_house: {
        summary: '🏠 Example 2 — Kelibia inland house (far from sea, off-peak)',
        value: {
          city: 'Kelibia',
          category: 'accommodation',
          unit: 'per_night',
          lat: 36.8301,
          lng: 11.0801,
          area_sqm: 70,
          capacity: 4,
          propertyType: 'house',
          distanceToSeaKm: 5.0,
          amenities: ['wifi', 'parking'],
          condition: 'good',
          season: 'off_peak',
        },
      },
      tunis_sports: {
        summary: '⚽ Tunis sports facility (hourly)',
        value: {
          city: 'Tunis',
          category: 'sports_facility',
          unit: 'per_hour',
          lat: 36.819,
          lng: 10.1658,
          capacity: 22,
          amenities: ['changing_rooms', 'floodlights', 'parking'],
          condition: 'good',
        },
      },
    },
  })
  @ApiResponse({
    status: 200,
    description: 'Price suggestion returned successfully',
    type: PriceSuggestionResponseDto,
  })
  @ApiResponse({ status: 400, description: 'Invalid request body' })
  @ApiResponse({ status: 422, description: 'City not supported' })
  @ApiResponse({ status: 503, description: 'AI service unavailable' })
  async priceSuggestion(
    @Body() dto: PriceSuggestionRequestDto,
  ): Promise<PriceSuggestionResponseDto> {
    return this.priceSuggestionService.suggest(dto);
  }

  // ── PATCH /api/ai/price-suggestion/log/:id ─────────────────────────────────
  @Patch('price-suggestion/log/:id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Patch price suggestion log after publish',
    description: 'Links the final chosen price and listingId to the suggestion log row. Called by the frontend after a listing is successfully created.',
  })
  @ApiResponse({ status: 200, description: 'Log updated' })
  async patchPriceSuggestionLog(
    @Param('id') id: string,
    @Body() body: { listingId: string; finalPrice: number; suggestedPrice: number },
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
}
