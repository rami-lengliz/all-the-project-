import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BookingsService } from './bookings.service';
import { BookingsController } from './bookings.controller';
import { Booking } from '../../entities/booking.entity';
import { ListingsModule } from '../listings/listings.module';
import { AvailabilityUtil } from '../../common/utils/availability.util';
import { AvailabilityService } from '../../common/utils/availability.service';
import { PaymentsModule } from '../payments/payments.module';
import { CancellationPolicyService } from '../../common/policies/cancellation-policy.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([Booking]),
    ListingsModule,
    forwardRef(() => PaymentsModule),
  ],
  controllers: [BookingsController],
  providers: [
    BookingsService,
    AvailabilityUtil,
    AvailabilityService,
    CancellationPolicyService,
  ],
  exports: [BookingsService, AvailabilityUtil, AvailabilityService],
})
export class BookingsModule {}
