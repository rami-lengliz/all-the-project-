import { IsBoolean } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class BecomeHostDto {
  @ApiProperty({ example: true })
  @IsBoolean()
  acceptTerms: boolean;
}

