import { Module, forwardRef } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PaymentsService } from './payments.service';
import { PaymentsController } from './payments.controller';
import { BookingsModule } from '../bookings/bookings.module';
import { CancellationPolicyService } from '../../common/policies/cancellation-policy.service';
import { LedgerModule } from '../ledger/ledger.module';
import { FlouciProvider } from './providers/flouci.provider';
import { KonnectProvider } from './providers/konnect.provider';
import { PaymentProviderRegistry } from './providers/payment-provider.registry';

@Module({
  imports: [forwardRef(() => BookingsModule), LedgerModule, ConfigModule],
  controllers: [PaymentsController],
  providers: [
    PaymentsService,
    CancellationPolicyService,
    FlouciProvider,
    KonnectProvider,
    PaymentProviderRegistry,
  ],
  exports: [PaymentsService],
})
export class PaymentsModule {}
