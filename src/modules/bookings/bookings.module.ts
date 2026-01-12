import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BookingsService } from './bookings.service';
import { BookingsController } from './bookings.controller';
import { Booking } from '../../entities/booking.entity';
import { ListingsModule } from '../listings/listings.module';
import { AvailabilityUtil } from '../../common/utils/availability.util';

@Module({
  imports: [TypeOrmModule.forFeature([Booking]), ListingsModule],
  controllers: [BookingsController],
  providers: [BookingsService, AvailabilityUtil],
  exports: [BookingsService, AvailabilityUtil],
})
export class BookingsModule {}
