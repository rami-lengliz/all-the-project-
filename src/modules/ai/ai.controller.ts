import { Controller, Post, Body, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiResponse } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { Public } from '../../common/decorators/public.decorator';
import { ListingAssistantService } from './listing-assistant.service';
import { AiSearchService } from './ai-search.service';
import {
    GenerateListingDto,
    EnhanceDescriptionDto,
    GenerateTitleDto,
} from './dto/listing-assistant.dto';
import { AiSearchRequestDto } from './dto/ai-search.dto';

@ApiTags('AI - Listing Assistant')
@Controller('ai/listing')
export class AiController {
    constructor(
        private listingAssistantService: ListingAssistantService,
        private aiSearchService: AiSearchService,
    ) { }

    @Post('search')
    @Public()
    @ApiOperation({
        summary: 'AI-powered search with single-shot + max 1 follow-up',
        description: 'Converts natural language query to structured filters. Returns either FOLLOW_UP (if clarification needed, max once) or RESULT with listings.'
    })
    @ApiResponse({
        status: 201,
        description: 'Search results or follow-up question',
        schema: {
            oneOf: [
                {
                    type: 'object',
                    properties: {
                        mode: { type: 'string', enum: ['FOLLOW_UP'] },
                        followUp: {
                            type: 'object',
                            properties: {
                                question: { type: 'string', example: 'Which dates do you need?' },
                                field: { type: 'string', enum: ['dates', 'price', 'category', 'bookingType', 'location', 'other'] },
                                options: { type: 'array', items: { type: 'string' }, example: ['Today', 'Tomorrow'] }
                            }
                        },
                        filters: { type: 'object' },
                        chips: { type: 'array', items: { type: 'object' } }
                    }
                },
                {
                    type: 'object',
                    properties: {
                        mode: { type: 'string', enum: ['RESULT'] },
                        filters: { type: 'object' },
                        chips: { type: 'array', items: { type: 'object' } },
                        results: { type: 'array' }
                    }
                }
            ]
        }
    })
    async search(@Body() dto: AiSearchRequestDto) {
        return this.aiSearchService.search(dto);
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
                description: 'Experience top-tier tennis at our professional-grade court...',
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
