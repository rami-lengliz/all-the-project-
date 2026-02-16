import {
  IsUUID,
  IsDateString,
  IsOptional,
  IsString,
  Matches,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateBookingDto {
  @ApiProperty()
  @IsUUID()
  listingId: string;

  @ApiProperty({ example: '2024-06-01' })
  @IsDateString()
  startDate: string;

  @ApiProperty({ example: '2024-06-05' })
  @IsDateString()
  endDate: string;

  @ApiPropertyOptional({
    description: 'Start time for slot bookings (HH:mm format)',
    example: '14:00',
  })
  @IsOptional()
  @IsString()
  @Matches(/^([01]\d|2[0-3]):([0-5]\d)$/, {
    message: 'Start time must be in HH:mm format (e.g., 14:00)',
  })
  startTime?: string;

  @ApiPropertyOptional({
    description: 'End time for slot bookings (HH:mm format)',
    example: '16:00',
  })
  @IsOptional()
  @IsString()
  @Matches(/^([01]\d|2[0-3]):([0-5]\d)$/, {
    message: 'End time must be in HH:mm format (e.g., 16:00)',
  })
  endTime?: string;
}
