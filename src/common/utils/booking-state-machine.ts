import { BookingStatus } from '@prisma/client';
import { BadRequestException, ConflictException } from '@nestjs/common';

/**
 * Booking State Machine
 * Defines valid state transitions for bookings
 *
 * States:
 * - PENDING: Initial state after creation
 * - CONFIRMED: Host has confirmed the booking
 * - PAID: Renter has paid for the booking
 * - COMPLETED: Booking period has ended
 * - CANCELLED: Booking was cancelled (can happen from PENDING, CONFIRMED, or PAID)
 * - REJECTED: Host declined the booking (can only happen from PENDING)
 *
 * Valid Transitions:
 * - PENDING → CONFIRMED (host confirms)
 * - PENDING → REJECTED  (host rejects)
 * - CONFIRMED → PAID (renter pays)
 * - PAID → COMPLETED (automatic or manual after end date)
 * - PENDING → CANCELLED (renter or host cancels)
 * - CONFIRMED → CANCELLED (renter or host cancels)
 * - PAID → CANCELLED (renter or host cancels, subject to refund policy)
 */
export class BookingStateMachine {
  /**
   * Valid state transitions map
   * Key: current state, Value: array of valid next states
   */
  private static readonly VALID_TRANSITIONS: Record<
    BookingStatus,
    BookingStatus[]
  > = {
      ['pending']: ['confirmed', 'cancelled', 'rejected'],
      ['confirmed']: ['paid', 'cancelled'],
      ['paid']: ['completed', 'cancelled'],
      ['completed']: [], // Terminal state
      ['cancelled']: [], // Terminal state
      ['rejected']: [], // Terminal state
    };

  /**
   * Check if a state transition is valid
   * @param from Current state
   * @param to Target state
   * @returns true if transition is valid
   */
  static isValidTransition(from: BookingStatus, to: BookingStatus): boolean {
    if (from === to) {
      return false; // No-op transitions are not considered valid (use idempotent checks separately)
    }
    return this.VALID_TRANSITIONS[from]?.includes(to) ?? false;
  }

  /**
   * Validate and throw if transition is invalid
   * @param from Current state
   * @param to Target state
   * @param actionName Name of the action for error message
   * @throws BadRequestException if transition is invalid
   */
  static validateTransition(
    from: BookingStatus,
    to: BookingStatus,
    actionName: string,
  ): void {
    if (from === to) {
      // Idempotent case - handled separately in service methods
      return;
    }

    if (!this.isValidTransition(from, to)) {
      throw new BadRequestException(
        `Cannot ${actionName}: Invalid state transition from ${from} to ${to}. ` +
        `Valid transitions from ${from} are: ${this.VALID_TRANSITIONS[from]?.join(', ') || 'none'}`,
      );
    }
  }

  /**
   * Check if a booking can be cancelled
   * @param status Current booking status
   * @returns true if booking can be cancelled
   */
  static canCancel(status: BookingStatus): boolean {
    return ['pending', 'confirmed', 'paid'].includes(status);
  }

  /**
   * Check if a booking can be confirmed
   * @param status Current booking status
   * @returns true if booking can be confirmed
   */
  static canConfirm(status: BookingStatus): boolean {
    return status === 'pending';
  }

  /**
   * Check if a booking can be paid
   * @param status Current booking status
   * @param paid Current paid flag
   * @returns true if booking can be paid
   */
  static canPay(status: BookingStatus, paid: boolean): boolean {
    return status === 'confirmed' && !paid;
  }

  /**
   * Check if a booking can be completed
   * @param status Current booking status
   * @returns true if booking can be completed
   */
  static canComplete(status: BookingStatus): boolean {
    return status === 'paid';
  }

  /**
   * Get all valid next states for a given state
   * @param status Current state
   * @returns Array of valid next states
   */
  static getValidNextStates(status: BookingStatus): BookingStatus[] {
    return this.VALID_TRANSITIONS[status] || [];
  }

  /**
   * Check if a state is terminal (no further transitions allowed)
   * @param status Current state
   * @returns true if state is terminal
   */
  static isTerminal(status: BookingStatus): boolean {
    return ['completed', 'cancelled', 'rejected'].includes(status);
  }
}
