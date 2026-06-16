import { IsIn } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import type { ProviderKey } from '../providers/payment-provider.interface';

export class CreateCheckoutDto {
  @ApiProperty({ enum: ['flouci', 'konnect', 'd17', 'stripe'] })
  @IsIn(['flouci', 'konnect', 'd17', 'stripe'])
  provider: ProviderKey;
}
