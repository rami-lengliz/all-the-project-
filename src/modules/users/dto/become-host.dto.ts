import { IsBoolean } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class BecomeHostDto {
  @ApiProperty({ example: true, required: true })
  @IsBoolean()
  acceptTerms: boolean;
}
