import {
  IsOptional,
  IsUUID,
  IsNumber,
  Min,
  IsLatitude,
  IsLongitude,
  IsDateString,
  IsString,
  IsEnum,
  IsBoolean,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';

export enum SortBy {
  DISTANCE = 'distance',
  PRICE_ASC = 'price_asc',
  PRICE_DESC = 'price_desc',
  DATE = 'date',
}

export enum BookingTypeFilter {
  DAILY = 'DAILY',
  SLOT = 'SLOT',
  ANY = 'ANY',
}

export class FilterListingsDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  q?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsUUID()
  category?: string;

  @ApiProperty({ required: false, example: 'stays' })
  @IsOptional()
  @IsString()
  categorySlug?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  minPrice?: number;

  @ApiProperty({ required: false })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  maxPrice?: number;

  @ApiProperty({ required: false })
  @IsOptional()
  @Type(() => Number)
  @IsLatitude()
  lat?: number;

  @ApiProperty({ required: false })
  @IsOptional()
  @Type(() => Number)
  @IsLongitude()
  lng?: number;

  @ApiProperty({ required: false, default: 10 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  radiusKm?: number;

  @ApiProperty({ required: false, enum: BookingTypeFilter })
  @IsOptional()
  @IsEnum(BookingTypeFilter)
  bookingType?: BookingTypeFilter;

  @ApiProperty({ required: false })
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  nearBeach?: boolean;

  @ApiProperty({ required: false, example: 'Kelibia' })
  @IsOptional()
  @IsString()
  city?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsDateString()
  availableFrom?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsDateString()
  availableTo?: string;

  @ApiProperty({ required: false, default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  page?: number;

  @ApiProperty({ required: false, default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  limit?: number;

  @ApiProperty({ required: false, enum: SortBy })
  @IsOptional()
  @IsEnum(SortBy)
  sortBy?: SortBy;
}
