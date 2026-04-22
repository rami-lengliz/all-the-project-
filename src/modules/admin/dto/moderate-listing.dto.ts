import { IsString, IsNotEmpty, IsOptional } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ModerateListingDto {
  @ApiPropertyOptional({ example: 'Listing meets all criteria.' })
  @IsString()
  @IsOptional()
  reason?: string;
}

export class SuspendListingDto {
  @ApiProperty({ example: 'Violates platform safety policies.' })
  @IsString()
  @IsNotEmpty()
  reason: string;
}
