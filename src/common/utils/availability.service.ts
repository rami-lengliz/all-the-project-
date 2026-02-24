import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { Booking, Prisma } from '@prisma/client';
import { BLOCKING_BOOKING_STATUSES } from '../constants/booking-status.constants';

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
  constructor(private prisma: PrismaService) {}

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

    // Build where condition
    const where: Prisma.BookingWhereInput = {
      listingId,
      status: {
        in: [...BLOCKING_BOOKING_STATUSES],
      },
      // Overlap condition: NOT (booking ends before request starts OR booking starts after request ends)
      NOT: {
        OR: [
          { endDate: { lte: normalizedStart } },
          { startDate: { gte: normalizedEnd } },
        ],
      },
    };

    if (excludeBookingId) {
      where.id = { not: excludeBookingId };
    }

    const conflictingBooking = await this.prisma.booking.findFirst({
      where,
    });

    return !conflictingBooking;
  }

  /**
   * Check availability within a transaction with row-level locking
   * Used during booking creation to prevent race conditions
   */
  async isListingAvailableWithLock(
    tx: Prisma.TransactionClient,
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

    // Use raw SQL with FOR UPDATE to lock rows.
    // Prisma binds all parameters as text — cast COLUMNS to text for comparison,
    // and use literal enum values in the IN clause.
    const excludeClause = excludeBookingId
      ? Prisma.sql`AND id::text != ${excludeBookingId}`
      : Prisma.empty;

    const query = Prisma.sql`
      SELECT * FROM bookings
      WHERE "listingId"::text = ${listingId}
        AND status IN ('confirmed'::"BookingStatus", 'paid'::"BookingStatus", 'completed'::"BookingStatus")
        AND NOT ("endDate" <= ${normalizedStart} OR "startDate" >= ${normalizedEnd})
        ${excludeClause}
      FOR UPDATE
    `;

    const conflictingBookings = await tx.$queryRaw<Booking[]>(query);

    return conflictingBookings.length === 0;
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

    const bookings = await this.prisma.booking.findMany({
      where: {
        listingId,
        status: {
          in: [...BLOCKING_BOOKING_STATUSES],
        },
        endDate: {
          gt: this.normalizeDate(from),
        },
        startDate: {
          lt: this.normalizeDate(to),
        },
      },
      orderBy: {
        startDate: 'asc',
      },
    });

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

  /**
   * Check if a time slot is available for booking.
   * Uses raw SQL OVERLAPS so Postgres handles time comparison natively,
   * avoiding the Prisma @db.Time → Date timezone-offset issue on non-UTC servers.
   */
  async checkSlotAvailability(
    listingId: string,
    date: Date,
    startTime: string,
    endTime: string,
    excludeBookingId?: string,
  ): Promise<boolean> {
    // Use ISO date string to avoid Date timezone-offset issues when Postgres
    // casts the parameter to ::date
    const dateStr = date.toISOString().substring(0, 10);

    const excludeClause = excludeBookingId
      ? Prisma.sql`AND id::text <> ${excludeBookingId}`
      : Prisma.empty;

    const conflicts = await this.prisma.$queryRaw<Array<{ id: string }>>`
      SELECT id FROM bookings
      WHERE "listingId"::text = ${listingId}
        AND "startDate" = ${dateStr}::date
        AND "startTime" IS NOT NULL
        AND "endTime" IS NOT NULL
        AND status IN (
          'confirmed'::"BookingStatus",
          'paid'::"BookingStatus",
          'completed'::"BookingStatus"
        )
        AND ("startTime"::time, "endTime"::time)
            OVERLAPS (${startTime}::time, ${endTime}::time)
        ${excludeClause}
    `;

    return conflicts.length === 0;
  }

  /**
   * Generate available time slots for a listing on a specific date
   */
  generateAvailableSlots(
    slotConfig: any,
    date: Date,
    existingBookings: Booking[],
  ): Array<{
    startTime: string;
    endTime: string;
    price: number;
    available: boolean;
  }> {
    const dayOfWeek = date
      .toLocaleDateString('en-US', { weekday: 'long' })
      .toLowerCase();
    const operatingHours = slotConfig.operatingHours[dayOfWeek];

    if (!operatingHours) {
      return [];
    }

    const slots: Array<{
      startTime: string;
      endTime: string;
      price: number;
      available: boolean;
    }> = [];
    const slotDuration = slotConfig.slotDurationMinutes;
    const bufferTime = slotConfig.bufferMinutes;

    const [startHour, startMinute] = operatingHours.start
      .split(':')
      .map(Number);
    const [endHour, endMinute] = operatingHours.end.split(':').map(Number);

    let currentMinutes = startHour * 60 + startMinute;
    const endMinutes = endHour * 60 + endMinute;

    while (currentMinutes + slotDuration <= endMinutes) {
      const slotStartTime = this.minutesToTimeString(currentMinutes);
      const slotEndTime = this.minutesToTimeString(
        currentMinutes + slotDuration,
      );

      const effectiveEndMinutes = currentMinutes + slotDuration + bufferTime;

      const isAvailable = !existingBookings.some((booking) => {
        if (!booking.startTime || !booking.endTime) return false;

        // @db.Time is returned as a Date object by Prisma;
        // extract HH:mm from UTC parts to avoid local-timezone string issues.
        const toHHmm = (t: any): string => {
          if (t instanceof Date) {
            return `${t.getUTCHours().toString().padStart(2, '0')}:${t.getUTCMinutes().toString().padStart(2, '0')}`;
          }
          return String(t).substring(0, 5);
        };
        const bookingStart = this.timeStringToMinutes(
          toHHmm(booking.startTime),
        );
        const bookingEnd = this.timeStringToMinutes(toHHmm(booking.endTime));

        return (
          currentMinutes < bookingEnd && effectiveEndMinutes > bookingStart
        );
      });

      slots.push({
        startTime: slotStartTime,
        endTime: slotEndTime,
        price: Number(slotConfig.pricePerSlot),
        available: isAvailable,
      });

      currentMinutes += slotDuration;
    }

    return slots;
  }

  private minutesToTimeString(minutes: number): string {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return `${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}`;
  }

  private timeStringToMinutes(timeStr: string): number {
    const [hours, minutes] = timeStr.split(':').map(Number);
    return hours * 60 + minutes;
  }
}
