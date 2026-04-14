import { IsUUID, IsInt, Min, Max, IsOptional, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateReviewDto {
  @ApiProperty()
  @IsUUID()
  bookingId: string;

  @ApiProperty({ minimum: 1, maximum: 5 })
  @IsInt()
  @Min(1)
  @Max(5)
  rating: number;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  comment?: string;
}
