import {
  IsString,
  IsNumber,
  IsNotEmpty,
  Min,
  IsUUID,
  IsLatitude,
  IsLongitude,
  IsOptional,
  IsArray,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateListingDto {
  @ApiProperty({ example: 'Mountain Bike for Rent' })
  @IsString()
  @IsNotEmpty()
  title: string;

  @ApiProperty({ example: 'High-quality mountain bike...' })
  @IsString()
  @IsNotEmpty()
  description: string;

  @ApiProperty()
  @IsUUID()
  categoryId: string;

  @ApiProperty({ example: 25.0, description: 'Price per day in TND' })
  @IsNumber()
  @Min(0)
  pricePerDay: number;

  @ApiProperty({ example: 36.8475 })
  @IsLatitude()
  latitude: number;

  @ApiProperty({ example: 11.0939 })
  @IsLongitude()
  longitude: number;

  @ApiProperty({ example: '123 Main St, Kelibia, Tunisia' })
  @IsString()
  @IsNotEmpty()
  address: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  rules?: string;

  @ApiProperty({ required: false, type: [String] })
  @IsOptional()
  @IsArray()
  availability?: Array<{ startDate: string; endDate: string }>;
}
