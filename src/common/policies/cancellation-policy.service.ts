import { Injectable } from '@nestjs/common';
import { BookingStatus, PaymentIntentStatus } from '@prisma/client';

export type CancellationActor = 'RENTER' | 'HOST';

export interface CancellationDecision {
  allowCancel: boolean;
  refundAmount: number;
  refundType: 'FULL' | 'PARTIAL' | 'NONE';
  penaltyApplied: boolean;
  reason: string;
}

export interface CancellationContext {
  actor: CancellationActor;
  bookingStatus: BookingStatus;
  paymentStatus: PaymentIntentStatus;
  startDate: Date;
  endDate: Date;
  totalPrice: number;
  now: Date;
}

@Injectable()
export class CancellationPolicyService {
  /**
   * Evaluate cancellation request and return policy decision
   * This is the single source of truth for cancellation rules
   */
  evaluateCancellation(context: CancellationContext): CancellationDecision {
    const {
      actor,
      bookingStatus,
      paymentStatus,
      startDate,
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      endDate, // Reserved for future policy rules (e.g., partial refunds based on days)
      totalPrice,
      now,
    } = context;

    // Rule 1: COMPLETED bookings cannot be cancelled
    if (bookingStatus === 'completed') {
      return {
        allowCancel: false,
        refundAmount: 0,
        refundType: 'NONE',
        penaltyApplied: false,
        reason: 'Cannot cancel a completed booking',
      };
    }

    // Rule 2: Already CANCELLED bookings (idempotent check)
    if (bookingStatus === 'cancelled') {
      // If payment is already refunded, mention that
      if (paymentStatus === 'refunded') {
        return {
          allowCancel: true,
          refundAmount: 0,
          refundType: 'NONE',
          penaltyApplied: false,
          reason: 'Payment already refunded',
        };
      }
      return {
        allowCancel: true,
        refundAmount: 0,
        refundType: 'NONE',
        penaltyApplied: false,
        reason: 'Booking is already cancelled',
      };
    }

    // Rule 3: Host cancels at any time → FULL refund (if payment captured)
    if (actor === 'HOST') {
      if (paymentStatus === 'captured') {
        return {
          allowCancel: true,
          refundAmount: totalPrice,
          refundType: 'FULL',
          penaltyApplied: false,
          reason: 'Host cancellation: Full refund required',
        };
      } else if (paymentStatus === 'refunded') {
        return {
          allowCancel: true,
          refundAmount: 0,
          refundType: 'NONE',
          penaltyApplied: false,
          reason: 'Payment already refunded',
        };
      } else {
        // Payment not captured yet, no refund needed
        return {
          allowCancel: true,
          refundAmount: 0,
          refundType: 'NONE',
          penaltyApplied: false,
          reason: 'Host cancellation: No payment captured to refund',
        };
      }
    }

    // Rule 4: Renter cancels before start date → FULL refund (if payment captured)
    if (actor === 'RENTER') {
      const isBeforeStart = now < startDate;

      if (isBeforeStart) {
        if (paymentStatus === 'captured') {
          return {
            allowCancel: true,
            refundAmount: totalPrice,
            refundType: 'FULL',
            penaltyApplied: false,
            reason: 'Renter cancellation before start date: Full refund',
          };
        } else if (paymentStatus === 'refunded') {
          return {
            allowCancel: true,
            refundAmount: 0,
            refundType: 'NONE',
            penaltyApplied: false,
            reason: 'Payment already refunded',
          };
        } else {
          // Payment not captured yet
          return {
            allowCancel: true,
            refundAmount: 0,
            refundType: 'NONE',
            penaltyApplied: false,
            reason:
              'Renter cancellation before start: No payment captured to refund',
          };
        }
      } else {
        // Rule 5: Renter cancels after start date → NO refund
        return {
          allowCancel: false,
          refundAmount: 0,
          refundType: 'NONE',
          penaltyApplied: true,
          reason: 'Renter cancellation after start date: No refund allowed',
        };
      }
    }

    // Fallback (should not reach here)
    return {
      allowCancel: false,
      refundAmount: 0,
      refundType: 'NONE',
      penaltyApplied: false,
      reason: 'Cancellation not allowed for this scenario',
    };
  }

  /**
   * Check if refund is allowed based on payment status
   * Refunds only allowed if payment is CAPTURED
   */
  canRefund(paymentStatus: PaymentIntentStatus): boolean {
    return paymentStatus === 'captured';
  }

  /**
   * Check if cancellation is allowed based on booking status
   */
  canCancel(bookingStatus: BookingStatus): boolean {
    return (
      bookingStatus === 'pending' ||
      bookingStatus === 'confirmed' ||
      bookingStatus === 'paid'
    );
  }
}
