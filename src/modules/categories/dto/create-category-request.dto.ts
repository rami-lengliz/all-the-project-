import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsNotEmpty, IsOptional, MaxLength } from 'class-validator';

export class CreateCategoryRequestDto {
  @ApiProperty({ example: 'Snowboards', description: 'Proposed name for the new category' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  proposedName: string;

  @ApiPropertyOptional({ example: 'I want to list snowboards but there is no winter sports category', description: 'Reason for requesting this category' })
  @IsString()
  @IsOptional()
  reason?: string;
}
