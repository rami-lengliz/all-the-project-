import {
  IsString,
  IsOptional,
  IsNumber,
  IsArray,
  IsEnum,
  Min,
  Max,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';

export enum PricingCategory {
  ACCOMMODATION = 'accommodation',
  SPORTS_FACILITY = 'sports_facility',
  TOOL = 'tool',
  VEHICLE = 'vehicle',
  EVENT_SPACE = 'event_space',
}

export enum PricingUnit {
  PER_NIGHT = 'per_night',
  PER_HOUR = 'per_hour',
  PER_DAY = 'per_day',
  PER_SESSION = 'per_session',
}

export enum AssetCondition {
  NEW = 'new',
  EXCELLENT = 'excellent',
  GOOD = 'good',
  FAIR = 'fair',
}

export enum PricingSeason {
  PEAK = 'peak',
  OFF_PEAK = 'off_peak',
  SHOULDER = 'shoulder',
}

export enum PropertyType {
  VILLA     = 'villa',
  HOUSE     = 'house',
  APARTMENT = 'apartment',
}

export class PriceSuggestionRequestDto {
  @ApiProperty({
    example: 'Kelibia',
    description: 'City name — primary matching signal (city-first approach)',
  })
  @IsString()
  city: string;

  @ApiProperty({
    enum: PricingCategory,
    example: PricingCategory.ACCOMMODATION,
    description: 'Listing category',
  })
  @IsEnum(PricingCategory)
  category: PricingCategory;

  @ApiProperty({
    enum: PricingUnit,
    example: PricingUnit.PER_NIGHT,
    description: 'Pricing unit',
  })
  @IsEnum(PricingUnit)
  unit: PricingUnit;

  @ApiPropertyOptional({
    example: 36.8497,
    description: 'Latitude (WGS84). Improves neighborhood-level accuracy.',
  })
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  lat?: number;

  @ApiPropertyOptional({
    example: 11.1047,
    description: 'Longitude (WGS84). Improves neighborhood-level accuracy.',
  })
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  lng?: number;

  @ApiPropertyOptional({
    example: 25,
    description:
      'Search radius in km for PostGIS city comparables. Defaults to 25 km when lat/lng are provided.',
  })
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(200)
  @Type(() => Number)
  radiusKm?: number;

  @ApiPropertyOptional({
    example: 85,
    description: 'Surface area in m². Used for accommodation and spaces.',
  })
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Type(() => Number)
  area_sqm?: number;

  @ApiPropertyOptional({
    example: 6,
    description: 'Max occupancy or participant count.',
  })
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Type(() => Number)
  capacity?: number;

  @ApiPropertyOptional({
    example: ['sea_view', 'wifi', 'parking', 'air_conditioning'],
    description: 'List of amenities/features.',
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  amenities?: string[];

  @ApiPropertyOptional({
    enum: AssetCondition,
    example: AssetCondition.EXCELLENT,
    description: 'Asset condition.',
  })
  @IsOptional()
  @IsEnum(AssetCondition)
  condition?: AssetCondition;

  @ApiPropertyOptional({
    enum: PricingSeason,
    example: PricingSeason.PEAK,
    description:
      'Pricing season hint. Defaults to current calendar season if omitted.',
  })
  @IsOptional()
  @IsEnum(PricingSeason)
  season?: PricingSeason;

  @ApiPropertyOptional({
    enum: PropertyType,
    example: PropertyType.VILLA,
    description:
      'Property type for accommodation. Drives a type multiplier on the suggested price.',
  })
  @IsOptional()
  @IsEnum(PropertyType)
  propertyType?: PropertyType;

  @ApiPropertyOptional({
    example: 0.3,
    description:
      'Distance to the nearest sea/beach in km. Used for sea-proximity tier adjustment (accommodation only).',
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  distanceToSeaKm?: number;
}

export class PriceSuggestionResponseDto {
  @ApiProperty({ example: 185.0, description: 'Suggested price in TND' })
  recommended: number;

  @ApiProperty({
    example: { min: 140.0, max: 230.0 },
    description: 'Safe pricing window',
  })
  range: { min: number; max: number };

  @ApiProperty({
    enum: ['high', 'medium', 'low'],
    example: 'high',
    description: 'Model confidence level',
  })
  confidence: 'high' | 'medium' | 'low';

  @ApiProperty({
    example: [
      'Kelibia coastal properties command a 38% premium during peak summer season.',
      'Sea-view listings in this area average 185 TND/night based on 22 comparable bookings.',
      'Your 85 m² capacity and AC amenity set places this property in the upper mid-market tier.',
    ],
    description: 'Exactly 3 explanation bullets',
  })
  explanation: [string, string, string];

  @ApiProperty({
    example: 22,
    description: 'Number of comparable listings used',
  })
  compsUsed: number;

  @ApiProperty({ example: 'TND' })
  currency: string;

  @ApiProperty({ example: 'per_night' })
  unit: string;

  @ApiPropertyOptional({
    example: 'a1b2c3d4-...',
    description:
      'ID of the PriceSuggestionLog row. Pass this back when publishing the listing so finalPrice can be linked.',
  })
  logId?: string;
}
