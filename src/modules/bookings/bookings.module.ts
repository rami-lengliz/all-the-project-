import { Module, forwardRef } from '@nestjs/common';
import { BookingsService } from './bookings.service';
import { BookingsController } from './bookings.controller';
import { PaymentsModule } from '../payments/payments.module';
import { ListingsModule } from '../listings/listings.module';
import { AvailabilityService } from '../../common/utils/availability.service';
import { CancellationPolicyService } from '../../common/policies/cancellation-policy.service';
import { ChatModule } from '../../chat/chat.module';

@Module({
  imports: [ListingsModule, forwardRef(() => PaymentsModule), ChatModule],
  controllers: [BookingsController],
  providers: [BookingsService, AvailabilityService, CancellationPolicyService],
  exports: [BookingsService, AvailabilityService],
})
export class BookingsModule {}
