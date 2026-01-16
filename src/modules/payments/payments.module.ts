import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PaymentIntent } from '../../entities/payment-intent.entity';
import { Booking } from '../../entities/booking.entity';
import { PaymentsService } from './payments.service';
import { PaymentsController } from './payments.controller';
import { BookingsModule } from '../bookings/bookings.module';
import { CancellationPolicyService } from '../../common/policies/cancellation-policy.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([PaymentIntent, Booking]),
    forwardRef(() => BookingsModule),
  ],
  controllers: [PaymentsController],
  providers: [PaymentsService, CancellationPolicyService],
  exports: [PaymentsService],
})
export class PaymentsModule {}
