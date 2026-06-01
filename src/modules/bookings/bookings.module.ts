import { Module, forwardRef } from '@nestjs/common';
import { BookingsService } from './bookings.service';
import { BookingsController } from './bookings.controller';
import { BookingReminderService } from './booking-reminder.service';
import { PaymentsModule } from '../payments/payments.module';
import { ListingsModule } from '../listings/listings.module';
import { AvailabilityService } from '../../common/utils/availability.service';
import { CancellationPolicyService } from '../../common/policies/cancellation-policy.service';
import { ChatModule } from '../../chat/chat.module';
import { WalletModule } from '../wallet/wallet.module';
import { AuthModule } from '../auth/auth.module';
import { WhatsappModule } from '../whatsapp/whatsapp.module';
import { QualityModule } from '../quality/quality.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { PersonalizationModule } from '../personalization/personalization.module';

@Module({
  imports: [
    ListingsModule,
    forwardRef(() => PaymentsModule),
    ChatModule,
    WalletModule,
    AuthModule,
    WhatsappModule,
    QualityModule,
    NotificationsModule,
    PersonalizationModule,
  ],
  controllers: [BookingsController],
  providers: [
    BookingsService,
    AvailabilityService,
    CancellationPolicyService,
    BookingReminderService,
  ],
  exports: [BookingsService, AvailabilityService],
})
export class BookingsModule {}
