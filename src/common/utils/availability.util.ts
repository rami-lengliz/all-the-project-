import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Booking, BookingStatus } from '../../entities/booking.entity';

@Injectable()
export class AvailabilityUtil {
  constructor(
    @InjectRepository(Booking)
    private bookingRepository: Repository<Booking>,
  ) {}

  /**
   * Check if a date range is available for a listing
   * Returns true if available, false if conflicting booking exists
   */
  async isDateRangeAvailable(
    listingId: string,
    startDate: Date,
    endDate: Date,
    excludeBookingId?: string,
  ): Promise<boolean> {
    const queryBuilder = this.bookingRepository
      .createQueryBuilder('booking')
      .where('booking.listingId = :listingId', { listingId })
      .andWhere('booking.status IN (:...statuses)', {
        statuses: [BookingStatus.CONFIRMED, BookingStatus.PENDING],
      })
      .andWhere(
        'NOT (booking.endDate <= :startDate OR booking.startDate >= :endDate)',
        {
          startDate,
          endDate,
        },
      );

    if (excludeBookingId) {
      queryBuilder.andWhere('booking.id != :excludeBookingId', {
        excludeBookingId,
      });
    }

    const conflictingBooking = await queryBuilder.getOne();
    return !conflictingBooking;
  }
}

