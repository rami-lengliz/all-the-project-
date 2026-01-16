import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { Booking, BookingStatus } from '../../entities/booking.entity';

/**
 * Centralized Availability Service
 *
 * This service provides a single source of truth for listing availability.
 *
 * Availability Rules:
 * - Only CONFIRMED and PAID bookings block availability
 * - PENDING bookings do NOT block availability (they can be cancelled)
 * - Date ranges are inclusive of start date, exclusive of end date
 *   (e.g., booking from Jan 1 to Jan 5 means Jan 1-4 are unavailable, Jan 5 is available)
 */
@Injectable()
export class AvailabilityService {
  constructor(
    @InjectRepository(Booking)
    private bookingRepository: Repository<Booking>,
    private dataSource: DataSource,
  ) {}

  /**
   * Check if a listing is available for the given date range
   *
   * Date boundaries:
   * - startDate is inclusive (first unavailable day)
   * - endDate is exclusive (first available day after the range)
   *
   * Example:
   * - Request: Jan 1 to Jan 5
   * - Booking: Jan 1 to Jan 5 → OVERLAPS (same dates)
   * - Booking: Jan 1 to Jan 4 → OVERLAPS (ends before request ends)
   * - Booking: Jan 2 to Jan 6 → OVERLAPS (starts during request)
   * - Booking: Jan 5 to Jan 10 → NO OVERLAP (starts exactly when request ends)
   *
   * @param listingId Listing ID to check
   * @param startDate Start date (inclusive)
   * @param endDate End date (exclusive)
   * @param excludeBookingId Optional booking ID to exclude from check
   * @returns true if available, false if blocked by CONFIRMED or PAID booking
   */
  async isListingAvailable(
    listingId: string,
    startDate: Date,
    endDate: Date,
    excludeBookingId?: string,
  ): Promise<boolean> {
    // Normalize dates (ensure they're Date objects and start of day)
    const normalizedStart = this.normalizeDate(startDate);
    const normalizedEnd = this.normalizeDate(endDate);

    // Validate date range
    if (normalizedStart >= normalizedEnd) {
      throw new Error('Start date must be before end date');
    }

    // Check for overlapping CONFIRMED or PAID bookings
    // Only these statuses block availability
    const queryBuilder = this.bookingRepository
      .createQueryBuilder('booking')
      .where('booking.listingId = :listingId', { listingId })
      .andWhere('booking.status IN (:...statuses)', {
        statuses: [BookingStatus.CONFIRMED, BookingStatus.PAID],
      })
      .andWhere(
        // Overlap condition: NOT (booking ends before request starts OR booking starts after request ends)
        // Using exclusive end date logic: endDate is exclusive
        'NOT (booking.endDate <= :startDate OR booking.startDate >= :endDate)',
        {
          startDate: normalizedStart,
          endDate: normalizedEnd,
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

  /**
   * Check availability within a transaction with row-level locking
   * Used during booking creation to prevent race conditions
   */
  async isListingAvailableWithLock(
    manager: any,
    listingId: string,
    startDate: Date,
    endDate: Date,
    excludeBookingId?: string,
  ): Promise<boolean> {
    const normalizedStart = this.normalizeDate(startDate);
    const normalizedEnd = this.normalizeDate(endDate);

    if (normalizedStart >= normalizedEnd) {
      throw new Error('Start date must be before end date');
    }

    const queryBuilder = manager
      .createQueryBuilder(Booking, 'booking')
      .setLock('pessimistic_write')
      .where('booking.listingId = :listingId', { listingId })
      .andWhere('booking.status IN (:...statuses)', {
        statuses: [BookingStatus.CONFIRMED, BookingStatus.PAID],
      })
      .andWhere(
        'NOT (booking.endDate <= :startDate OR booking.startDate >= :endDate)',
        {
          startDate: normalizedStart,
          endDate: normalizedEnd,
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

  /**
   * Get unavailable date ranges for a listing
   * Returns an array of { startDate, endDate } ranges that are blocked
   *
   * @param listingId Listing ID
   * @param fromDate Start of period to check (optional, defaults to today)
   * @param toDate End of period to check (optional, defaults to 1 year from today)
   * @returns Array of unavailable date ranges
   */
  async getUnavailableRanges(
    listingId: string,
    fromDate?: Date,
    toDate?: Date,
  ): Promise<Array<{ startDate: Date; endDate: Date }>> {
    const from = fromDate || new Date();
    const to = toDate || new Date(Date.now() + 365 * 24 * 60 * 60 * 1000);

    const bookings = await this.bookingRepository
      .createQueryBuilder('booking')
      .where('booking.listingId = :listingId', { listingId })
      .andWhere('booking.status IN (:...statuses)', {
        statuses: [BookingStatus.CONFIRMED, BookingStatus.PAID],
      })
      .andWhere('booking.endDate > :fromDate', {
        fromDate: this.normalizeDate(from),
      })
      .andWhere('booking.startDate < :toDate', {
        toDate: this.normalizeDate(to),
      })
      .orderBy('booking.startDate', 'ASC')
      .getMany();

    return bookings.map((booking) => ({
      startDate: new Date(booking.startDate),
      endDate: new Date(booking.endDate),
    }));
  }

  /**
   * Normalize a date to start of day (00:00:00)
   * Ensures consistent date comparisons
   */
  private normalizeDate(date: Date | string): Date {
    const d = typeof date === 'string' ? new Date(date) : date;
    const normalized = new Date(d);
    normalized.setHours(0, 0, 0, 0);
    return normalized;
  }

  /**
   * Check if two date ranges overlap
   * Helper function for date range comparison
   *
   * @param range1 { startDate, endDate }
   * @param range2 { startDate, endDate }
   * @returns true if ranges overlap
   */
  static doRangesOverlap(
    range1: { startDate: Date; endDate: Date },
    range2: { startDate: Date; endDate: Date },
  ): boolean {
    // Ranges overlap if NOT (range1 ends before range2 starts OR range1 starts after range2 ends)
    // Using exclusive end date logic
    return !(
      range1.endDate <= range2.startDate || range1.startDate >= range2.endDate
    );
  }
}
