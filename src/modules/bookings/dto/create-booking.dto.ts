import { IsUUID, IsDateString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

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
}
