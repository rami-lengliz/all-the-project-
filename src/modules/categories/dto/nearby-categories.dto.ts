import { ApiProperty } from '@nestjs/swagger';
import {
  IsNumber,
  IsLatitude,
  IsLongitude,
  IsOptional,
  IsBoolean,
  Min,
  Max,
} from 'class-validator';
import { Type } from 'class-transformer';

export class NearbyCategoriesDto {
  @ApiProperty({
    description: 'Latitude of the user location',
    example: 36.8578,
    required: true,
  })
  @IsNumber()
  @IsLatitude()
  @Type(() => Number)
  lat: number;

  @ApiProperty({
    description: 'Longitude of the user location',
    example: 11.092,
    required: true,
  })
  @IsNumber()
  @IsLongitude()
  @Type(() => Number)
  lng: number;

  @ApiProperty({
    description: 'Search radius in kilometers',
    example: 10,
    required: false,
    minimum: 0,
    maximum: 50,
    default: 10,
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(50)
  @Type(() => Number)
  radiusKm?: number = 10;

  @ApiProperty({
    description: 'Include categories with zero listings (default: false)',
    example: false,
    required: false,
    default: false,
  })
  @IsOptional()
  @IsBoolean()
  @Type(() => Boolean)
  includeEmpty?: boolean = false;
}

export class CategoryWithCountDto {
  @ApiProperty({ description: 'Category ID' })
  id: string;

  @ApiProperty({ description: 'Category name' })
  name: string;

  @ApiProperty({ description: 'Category slug (kebab-case)' })
  slug: string;

  @ApiProperty({ description: 'Category icon identifier', required: false })
  icon?: string;

  @ApiProperty({ description: 'Number of active listings within radius' })
  count: number;
}
