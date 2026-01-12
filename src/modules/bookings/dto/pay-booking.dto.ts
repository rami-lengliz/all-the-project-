import { IsString, IsOptional } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class PayBookingDto {
  @ApiProperty({ required: false, description: 'Payment token from payment gateway' })
  @IsOptional()
  @IsString()
  paymentToken?: string;

  @ApiProperty({ required: false, description: 'Payment receipt URL or base64' })
  @IsOptional()
  @IsString()
  receipt?: string;
}

