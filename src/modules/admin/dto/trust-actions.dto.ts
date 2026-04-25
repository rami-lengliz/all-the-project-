import { IsOptional, IsString, IsIn } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class UpdateTrustTierDto {
  @ApiProperty({ example: 'SUSPICIOUS', required: false })
  @IsOptional()
  @IsString()
  @IsIn(['NORMAL', 'LIMITED', 'SUSPICIOUS', 'RESTRICTED', null])
  tier?: string | null;

  @ApiProperty({ example: 'Confirmed repetitive probing behavior.' })
  @IsString()
  reason: string;
}

export class MarkTrustReviewedDto {
  @ApiProperty({ example: 'Reviewed logs, user behavior is acceptable.' })
  @IsString()
  @IsOptional()
  reason?: string;
}
