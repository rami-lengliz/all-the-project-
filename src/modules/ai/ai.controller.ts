import { Controller, Post, Body, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiResponse } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { ListingAssistantService } from './listing-assistant.service';
import {
    GenerateListingDto,
    EnhanceDescriptionDto,
    GenerateTitleDto,
} from './dto/listing-assistant.dto';

@ApiTags('AI - Listing Assistant')
@Controller('ai/listing')
export class AiController {
    constructor(private listingAssistantService: ListingAssistantService) { }

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
