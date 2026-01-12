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
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';

export enum SortBy {
  DISTANCE = 'distance',
  PRICE_ASC = 'price_asc',
  PRICE_DESC = 'price_desc',
  DATE = 'date',
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
