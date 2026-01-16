import { PaymentIntentStatus } from '../../entities/payment-intent.entity';
import { BadRequestException } from '@nestjs/common';

/**
 * Payment Intent State Machine
 *
 * Defines valid state transitions for payment intents
 *
 * States:
 * - CREATED: Payment intent created, awaiting authorization
 * - AUTHORIZED: Payment authorized by renter, awaiting capture
 * - CAPTURED: Payment captured (money moved to host)
 * - REFUNDED: Payment refunded to renter
 * - CANCELLED: Payment intent cancelled before capture
 *
 * Valid Transitions:
 * - CREATED → AUTHORIZED (renter authorizes)
 * - AUTHORIZED → CAPTURED (system captures on booking confirmation)
 * - AUTHORIZED → CANCELLED (renter or system cancels before capture)
 * - CAPTURED → REFUNDED (system refunds)
 *
 * Terminal States: REFUNDED, CANCELLED
 */
export class PaymentStateMachine {
  /**
   * Valid state transitions map
   * Key: current state, Value: array of valid next states
   */
  private static readonly VALID_TRANSITIONS: Record<
    PaymentIntentStatus,
    PaymentIntentStatus[]
  > = {
    [PaymentIntentStatus.CREATED]: [PaymentIntentStatus.AUTHORIZED],
    [PaymentIntentStatus.AUTHORIZED]: [
      PaymentIntentStatus.CAPTURED,
      PaymentIntentStatus.CANCELLED,
    ],
    [PaymentIntentStatus.CAPTURED]: [PaymentIntentStatus.REFUNDED],
    [PaymentIntentStatus.REFUNDED]: [], // Terminal state
    [PaymentIntentStatus.CANCELLED]: [], // Terminal state
  };

  /**
   * Check if a state transition is valid
   */
  static isValidTransition(
    from: PaymentIntentStatus,
    to: PaymentIntentStatus,
  ): boolean {
    if (from === to) {
      return false; // No-op transitions are not considered valid
    }
    return this.VALID_TRANSITIONS[from]?.includes(to) ?? false;
  }

  /**
   * Validate and throw if transition is invalid
   */
  static validateTransition(
    from: PaymentIntentStatus,
    to: PaymentIntentStatus,
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
   * Check if payment can be authorized
   */
  static canAuthorize(status: PaymentIntentStatus): boolean {
    return status === PaymentIntentStatus.CREATED;
  }

  /**
   * Check if payment can be captured
   */
  static canCapture(status: PaymentIntentStatus): boolean {
    return status === PaymentIntentStatus.AUTHORIZED;
  }

  /**
   * Check if payment can be refunded
   */
  static canRefund(status: PaymentIntentStatus): boolean {
    return status === PaymentIntentStatus.CAPTURED;
  }

  /**
   * Check if payment can be cancelled
   */
  static canCancel(status: PaymentIntentStatus): boolean {
    return status === PaymentIntentStatus.AUTHORIZED;
  }

  /**
   * Check if state is terminal (no further transitions)
   */
  static isTerminal(status: PaymentIntentStatus): boolean {
    return [
      PaymentIntentStatus.REFUNDED,
      PaymentIntentStatus.CANCELLED,
    ].includes(status);
  }

  /**
   * Get all valid next states for a given state
   */
  static getValidNextStates(
    status: PaymentIntentStatus,
  ): PaymentIntentStatus[] {
    return this.VALID_TRANSITIONS[status] || [];
  }
}
