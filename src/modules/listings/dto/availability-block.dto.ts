import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsDateString,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class CreateAvailabilityBlockDto {
  @ApiProperty({
    example: '2026-07-01',
    description: 'First blocked day (inclusive), YYYY-MM-DD',
  })
  @IsDateString()
  startDate: string;

  @ApiProperty({
    example: '2026-07-08',
    description: 'Day after the last blocked day (exclusive), YYYY-MM-DD',
  })
  @IsDateString()
  endDate: string;

  @ApiPropertyOptional({
    example: 'Owner staying',
    maxLength: 255,
    description: 'Optional note shown only to the host',
  })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  note?: string;
}

export class SetDatePricesDto {
  @ApiProperty({ example: '2026-07-01', description: 'First day (inclusive)' })
  @IsDateString()
  startDate: string;

  @ApiProperty({ example: '2026-07-08', description: 'Day after last (exclusive)' })
  @IsDateString()
  endDate: string;

  @ApiProperty({ example: 180, description: 'Nightly price for each day in range (TND)' })
  @IsNumber()
  @Min(0.01)
  price: number;
}

export class SetMinNightsDto {
  @ApiProperty({ example: 2, minimum: 1, maximum: 365 })
  @IsInt()
  @Min(1)
  @Max(365)
  minNights: number;
}

export class ImportIcalDto {
  @ApiPropertyOptional({
    example: 'https://www.airbnb.com/calendar/ical/123.ics?s=abc',
    description: 'External iCal feed URL. Omit to re-sync the saved URL.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  url?: string;
}
