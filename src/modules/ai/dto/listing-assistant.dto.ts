import { IsString, IsOptional, IsArray, MaxLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class GenerateListingDto {
  @ApiProperty({ example: 'Sports Facilities' })
  @IsString()
  category: string;

  @ApiProperty({
    example: 'Professional tennis court with night lighting',
  })
  @IsString()
  @MaxLength(500)
  basicInfo: string;

  @ApiPropertyOptional({
    example: [
      'Night lighting',
      'Professional surface',
      'Equipment rental available',
    ],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  features?: string[];

  @ApiPropertyOptional({ example: 'Kelibia Sports Complex' })
  @IsOptional()
  @IsString()
  location?: string;
}

export class EnhanceDescriptionDto {
  @ApiProperty({
    example: 'Nice tennis court for rent',
  })
  @IsString()
  @MaxLength(1000)
  currentDescription: string;

  @ApiProperty({ example: 'Sports Facilities' })
  @IsString()
  category: string;
}

export class GenerateTitleDto {
  @ApiProperty({ example: 'Sports Facilities' })
  @IsString()
  category: string;

  @ApiProperty({
    example: ['Tennis court', 'Night lighting', 'Professional'],
  })
  @IsArray()
  @IsString({ each: true })
  keyFeatures: string[];

  @ApiPropertyOptional({ example: 'Kelibia' })
  @IsOptional()
  @IsString()
  location?: string;
}
