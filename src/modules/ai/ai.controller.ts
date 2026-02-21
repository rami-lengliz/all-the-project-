import { Controller, Post, Get, Body, Query, UseGuards } from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiResponse,
  ApiOkResponse,
  ApiQuery,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { Public } from '../../common/decorators/public.decorator';
import { ListingAssistantService } from './listing-assistant.service';
import { AiSearchService } from './ai-search.service';
import { PrismaService } from '../../database/prisma.service';
import {
  GenerateListingDto,
  EnhanceDescriptionDto,
  GenerateTitleDto,
} from './dto/listing-assistant.dto';
import { AiSearchRequestDto } from './dto/ai-search.dto';

@ApiTags('AI')
@Controller('api/ai')
export class AiController {
  constructor(
    private listingAssistantService: ListingAssistantService,
    private aiSearchService: AiSearchService,
    private prisma: PrismaService,
  ) { }

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
                categorySlug: { type: 'string', example: 'accommodation' },
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
                { key: 'category', label: 'Accommodation' },
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
              categorySlug: 'accommodation',
              maxPrice: 250,
              sortBy: 'distance',
              radiusKm: 10,
            },
            chips: [
              { key: 'q', label: 'villa' },
              { key: 'category', label: 'Accommodation' },
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
                categorySlug: { type: 'string', example: 'accommodation' },
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
                { key: 'category', label: 'Accommodation' },
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
                  category: 'accommodation',
                },
              ],
            },
          },
          example: {
            mode: 'RESULT',
            filters: {
              q: 'villa',
              categorySlug: 'accommodation',
              maxPrice: 250,
              bookingType: 'DAILY',
              availableFrom: '2026-02-17',
              availableTo: '2026-02-19',
              sortBy: 'distance',
              radiusKm: 10,
            },
            chips: [
              { key: 'q', label: 'villa' },
              { key: 'category', label: 'Accommodation' },
              { key: 'price', label: 'Up to 250 TND' },
              { key: 'dates', label: '2026-02-17 to 2026-02-19' },
            ],
            followUp: null,
            results: [
              {
                id: '123e4567-e89b-12d3-a456-426614174000',
                title: 'Luxury Beach Villa',
                pricePerDay: 200,
                category: 'accommodation',
              },
            ],
          },
        },
      ],
    },
  })
  async search(@Body() dto: AiSearchRequestDto) {
    return this.aiSearchService.search(dto);
  }

  @Get('admin/search-logs')
  @Public()
  @ApiOperation({
    summary: '[Dev/Admin] List recent AI search logs',
    description: 'Returns the last N AI search log entries. Useful for PFE demo and debugging.',
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
}
