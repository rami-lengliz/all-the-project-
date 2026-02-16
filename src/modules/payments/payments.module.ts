import { Module, forwardRef } from '@nestjs/common';
import { PaymentsService } from './payments.service';
import { PaymentsController } from './payments.controller';
import { BookingsModule } from '../bookings/bookings.module';
import { CancellationPolicyService } from '../../common/policies/cancellation-policy.service';

@Module({
  imports: [forwardRef(() => BookingsModule)],
  controllers: [PaymentsController],
  providers: [PaymentsService, CancellationPolicyService],
  exports: [PaymentsService],
})
export class PaymentsModule {}
