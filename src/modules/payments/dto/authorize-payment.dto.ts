import { IsObject, IsOptional } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class AuthorizePaymentDto {
  @ApiProperty({
    required: false,
    description: 'Additional metadata for payment authorization',
  })
  @IsOptional()
  @IsObject()
  metadata?: Record<string, any>;
}
