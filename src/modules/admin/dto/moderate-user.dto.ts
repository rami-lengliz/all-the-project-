import { IsString, IsNotEmpty, IsOptional } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class SuspendUserDto {
  @ApiProperty({ example: 'Multiple policy violations reported by other users.' })
  @IsString()
  @IsNotEmpty()
  reason: string;
}

export class UnsuspendUserDto {
  @ApiPropertyOptional({ example: 'User completed appeal process successfully.' })
  @IsString()
  @IsOptional()
  reason?: string;
}
