import { IsArray, IsUUID, ArrayMinSize, ArrayMaxSize } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';

export class CompareListingsDto {
  @ApiProperty({ example: 'uuid1,uuid2', description: 'Comma-separated UUIDs of listings' })
  @Transform(({ value }) => (typeof value === 'string' ? value.split(',') : value))
  @IsArray()
  @IsUUID('4', { each: true })
  @ArrayMinSize(1)
  @ArrayMaxSize(3)
  ids: string[];
}
