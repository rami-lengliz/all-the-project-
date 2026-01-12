import { IsString, IsOptional, IsBoolean } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateCategoryDto {
  @ApiProperty({ example: 'Bicycles' })
  @IsString()
  name: string;

  @ApiProperty({ required: false, example: 'bicycles' })
  @IsOptional()
  @IsString()
  slug?: string;

  @ApiProperty({ required: false, example: '🚲' })
  @IsOptional()
  @IsString()
  icon?: string;

  @ApiProperty({ default: true })
  @IsOptional()
  @IsBoolean()
  allowed_for_private?: boolean;
}
