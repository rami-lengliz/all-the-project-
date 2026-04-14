/**
 * Single source of truth for booking statuses that block availability.
 *
 * Only bookings with these statuses prevent new bookings for the same
 * dates/slots.  Pending bookings deliberately do NOT block — they can
 * still be cancelled.
 *
 * Used by:
 *  - AvailabilityService.isListingAvailableWithLock  (DAILY conflict check)
 *  - AvailabilityService.checkSlotAvailability       (SLOT conflict check)
 *  - AvailabilityService.getUnavailableRanges        (calendar view)
 *  - ListingsService.getAvailableSlots               (SLOT display)
 */
export const BLOCKING_BOOKING_STATUSES = [
  'confirmed',
  'paid',
  'completed',
] as const;

export type BlockingBookingStatus = (typeof BLOCKING_BOOKING_STATUSES)[number];
