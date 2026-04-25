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
  IsEnum,
  IsBoolean,
  IsInt,
} from 'class-validator';
import { Type, Transform } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';

export enum PropertyType {
  villa = 'villa',
  house = 'house',
  apartment = 'apartment',
}

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
  @Type(() => Number)
  pricePerDay: number;

  @ApiProperty({ example: 36.8475 })
  @IsLatitude()
  @Type(() => Number)
  latitude: number;

  @ApiProperty({ example: 11.0939 })
  @IsLongitude()
  @Type(() => Number)
  longitude: number;

  @ApiProperty({ example: '123 Main St, Kelibia, Tunisia' })
  @IsString()
  @IsNotEmpty()
  address: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  rules?: string;

  @ApiProperty({
    required: false,
    enum: ['DAILY', 'SLOT'],
    default: 'DAILY',
    description:
      'Booking type: DAILY for day-based rentals, SLOT for hourly/time-slot bookings',
  })
  @IsOptional()
  @IsString()
  bookingType?: 'DAILY' | 'SLOT';

  @ApiProperty({ required: false, type: [String] })
  @IsOptional()
  @IsArray()
  availability?: Array<{ startDate: string; endDate: string }>;

  // ── Stay / accommodation pricing fields ─────────────────────────────────────
  // All fields are optional — non-stay categories (mobility, beach-gear, etc.)
  // can create listings without them and will never fail validation here.

  @ApiProperty({
    required: false,
    enum: PropertyType,
    description: 'Property type — only relevant for stays/accommodation category',
    example: 'villa',
  })
  @IsOptional()
  @IsEnum(PropertyType, {
    message: `propertyType must be one of: ${Object.values(PropertyType).join(', ')}`,
  })
  propertyType?: PropertyType;

  @ApiProperty({
    required: false,
    minimum: 1,
    description: 'Maximum number of guests the property can accommodate (min 1)',
    example: 6,
  })
  @IsOptional()
  @IsInt({ message: 'guestsCapacity must be an integer' })
  @Min(1, { message: 'guestsCapacity must be at least 1' })
  @Type(() => Number)
  guestsCapacity?: number;

  @ApiProperty({
    required: false,
    minimum: 0,
    description: 'Number of bedrooms (0 = studio). Stays only.',
    example: 3,
  })
  @IsOptional()
  @IsInt({ message: 'bedrooms must be an integer' })
  @Min(0, { message: 'bedrooms must be 0 or more (use 0 for a studio)' })
  @Type(() => Number)
  bedrooms?: number;

  @ApiProperty({
    required: false,
    default: false,
    description:
      'true if the property is near the beach (< 500 m). Defaults to false if omitted.',
  })
  @IsOptional()
  @IsBoolean({ message: 'nearBeach must be a boolean (true or false)' })
  @Transform(({ value }) => {
    // Accept string representations sent via multipart/form-data
    if (value === 'true' || value === 1 || value === '1') return true;
    if (value === 'false' || value === 0 || value === '0') return false;
    return value;
  })
  nearBeach?: boolean;
}
