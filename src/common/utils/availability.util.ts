import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Booking, BookingStatus } from '../../entities/booking.entity';

/**
 * @deprecated Use AvailabilityService instead
 * This class is kept for backward compatibility but delegates to AvailabilityService
 */
@Injectable()
export class AvailabilityUtil {
  constructor(
    @InjectRepository(Booking)
    private bookingRepository: Repository<Booking>,
  ) {}

  /**
   * @deprecated Use AvailabilityService.isListingAvailable() instead
   * Check if a date range is available for a listing
   * Returns true if available, false if conflicting booking exists
   *
   * NOTE: This method now only considers CONFIRMED and PAID bookings
   * PENDING bookings do NOT block availability
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
        statuses: [BookingStatus.CONFIRMED, BookingStatus.PAID],
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
