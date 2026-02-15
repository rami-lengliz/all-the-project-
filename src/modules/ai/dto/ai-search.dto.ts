import { ApiProperty } from '@nestjs/swagger';
import {
    IsString,
    IsNumber,
    IsLatitude,
    IsLongitude,
    IsOptional,
    IsBoolean,
    IsArray,
    Min,
    Max,
} from 'class-validator';
import { Type } from 'class-transformer';

export class AiSearchRequestDto {
    @ApiProperty({
        description: 'User search query in natural language',
        example: 'villa near beach under 250',
        required: true,
    })
    @IsString()
    query: string;

    @ApiProperty({
        description: 'User latitude',
        example: 36.8578,
        required: false,
    })
    @IsOptional()
    @IsNumber()
    @IsLatitude()
    @Type(() => Number)
    lat?: number;

    @ApiProperty({
        description: 'User longitude',
        example: 11.092,
        required: false,
    })
    @IsOptional()
    @IsNumber()
    @IsLongitude()
    @Type(() => Number)
    lng?: number;

    @ApiProperty({
        description: 'Search radius in kilometers',
        example: 10,
        required: false,
        default: 10,
    })
    @IsOptional()
    @IsNumber()
    @Min(0)
    @Max(50)
    @Type(() => Number)
    radiusKm?: number = 10;

    @ApiProperty({
        description: 'Available category slugs within radius (optional)',
        example: ['accommodation', 'sports-facilities'],
        required: false,
        type: [String],
    })
    @IsOptional()
    @IsArray()
    @IsString({ each: true })
    availableCategorySlugs?: string[];

    @ApiProperty({
        description: 'Whether a follow-up question has already been used',
        example: false,
        required: false,
        default: false,
    })
    @IsOptional()
    @IsBoolean()
    @Type(() => Boolean)
    followUpUsed?: boolean = false;

    @ApiProperty({
        description: 'Answer to previous follow-up question',
        example: 'tomorrow',
        required: false,
    })
    @IsOptional()
    @IsString()
    followUpAnswer?: string;
}

export class SearchFiltersDto {
    @ApiProperty({ required: false })
    q?: string;

    @ApiProperty({ required: false })
    categorySlug?: string;

    @ApiProperty({ required: false })
    minPrice?: number;

    @ApiProperty({ required: false })
    maxPrice?: number;

    @ApiProperty({ required: false, enum: ['DAILY', 'SLOT', 'ANY'] })
    bookingType?: 'DAILY' | 'SLOT' | 'ANY';

    @ApiProperty({ required: false })
    availableFrom?: string;

    @ApiProperty({ required: false })
    availableTo?: string;

    @ApiProperty({
        required: false,
        enum: ['distance', 'date', 'price_asc', 'price_desc']
    })
    sortBy?: 'distance' | 'date' | 'price_asc' | 'price_desc';

    @ApiProperty({ required: false })
    radiusKm?: number;
}

export class SearchChipDto {
    @ApiProperty()
    key: string;

    @ApiProperty()
    label: string;
}

export class FollowUpDto {
    @ApiProperty()
    question: string;

    @ApiProperty({
        enum: ['dates', 'price', 'category', 'bookingType', 'location', 'other']
    })
    field: 'dates' | 'price' | 'category' | 'bookingType' | 'location' | 'other';

    @ApiProperty({ type: [String], required: false })
    options?: string[];
}

export class AiSearchResponseFollowUpDto {
    @ApiProperty({ enum: ['FOLLOW_UP'] })
    mode: 'FOLLOW_UP';

    @ApiProperty({ type: FollowUpDto })
    followUp: FollowUpDto;

    @ApiProperty({ type: SearchFiltersDto })
    filters: SearchFiltersDto;

    @ApiProperty({ type: [SearchChipDto] })
    chips: SearchChipDto[];
}

export class AiSearchResponseResultDto {
    @ApiProperty({ enum: ['RESULT'] })
    mode: 'RESULT';

    @ApiProperty({ type: SearchFiltersDto })
    filters: SearchFiltersDto;

    @ApiProperty({ type: [SearchChipDto] })
    chips: SearchChipDto[];

    @ApiProperty({ type: Object, isArray: true })
    results: any[];
}

export type AiSearchResponseDto =
    | AiSearchResponseFollowUpDto
    | AiSearchResponseResultDto;
