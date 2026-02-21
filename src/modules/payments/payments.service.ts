import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  ConflictException,
  Inject,
  forwardRef,
} from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import {
  PaymentIntent,
  PaymentIntentStatus,
  Booking,
  BookingStatus,
  Prisma,
} from '@prisma/client';
import { PaymentStateMachine } from '../../common/utils/payment-state-machine';
import { BookingsService } from '../bookings/bookings.service';
import { CancellationPolicyService } from '../../common/policies/cancellation-policy.service';

@Injectable()
export class PaymentsService {
  constructor(
    private prisma: PrismaService,
    @Inject(forwardRef(() => BookingsService))
    private bookingsService: BookingsService,
    private cancellationPolicyService: CancellationPolicyService,
  ) { }

  /**
   * Create a payment intent for a booking
   * Called automatically when booking is created
   */
  async createForBooking(bookingId: string): Promise<PaymentIntent> {
    const booking = await this.bookingsService.findOne(bookingId);

    // Check if payment intent already exists
    const existing = await this.prisma.paymentIntent.findUnique({
      where: { bookingId },
    });

    if (existing) {
      return existing;
    }

    const totalPrice =
      typeof booking.totalPrice === 'number'
        ? booking.totalPrice
        : Number(booking.totalPrice);

    return this.prisma.paymentIntent.create({
      data: {
        bookingId,
        renterId: booking.renterId,
        hostId: booking.hostId,
        amount: totalPrice,
        currency: 'TND',
        status: 'created',
      },
    });
  }

  /**
   * Authorize payment (renter authorizes payment)
   * Only renter can authorize
   */
  async authorize(
    bookingId: string,
    userId: string,
    metadata?: Record<string, any>,
  ): Promise<PaymentIntent> {
    return await this.prisma.$transaction(async (tx) => {
      // Load payment intent with lock
      const paymentIntents = await tx.$queryRaw<PaymentIntent[]>`
        SELECT * FROM payment_intents
        WHERE "bookingId"::text = ${bookingId}
        FOR UPDATE
      `;

      if (!paymentIntents || paymentIntents.length === 0) {
        throw new NotFoundException(
          `Payment intent not found for booking ${bookingId}`,
        );
      }

      const paymentIntent = paymentIntents[0];

      // Authorization check
      if (paymentIntent.renterId !== userId) {
        throw new ForbiddenException(
          'Only the renter can authorize this payment',
        );
      }

      // Idempotent check
      if (paymentIntent.status === 'authorized') {
        return paymentIntent;
      }

      // State machine validation
      PaymentStateMachine.validateTransition(
        paymentIntent.status as any,
        'AUTHORIZED' as any,
        'authorize payment',
      );

      // Update status
      return tx.paymentIntent.update({
        where: { id: paymentIntent.id },
        data: {
          status: 'authorized',
          metadata: metadata
            ? { ...(paymentIntent.metadata as any), ...metadata }
            : paymentIntent.metadata,
        },
      });
    });
  }

  /**
   * Capture payment (system captures authorized payment)
   * Only system can capture (no userId required)
   * This is called when booking moves to PAID status
   */
  async capture(bookingId: string): Promise<PaymentIntent> {
    return await this.prisma.$transaction(async (tx) => {
      // Load payment intent with lock
      const paymentIntents = await tx.$queryRaw<PaymentIntent[]>`
        SELECT * FROM payment_intents
        WHERE "bookingId"::text = ${bookingId}
        FOR UPDATE
      `;

      if (!paymentIntents || paymentIntents.length === 0) {
        throw new NotFoundException(
          `Payment intent not found for booking ${bookingId}`,
        );
      }

      const paymentIntent = paymentIntents[0];

      // Idempotent check
      if (paymentIntent.status === 'captured') {
        return paymentIntent;
      }

      // State machine validation
      PaymentStateMachine.validateTransition(
        paymentIntent.status as any,
        'CAPTURED' as any,
        'capture payment',
      );

      // Update status
      return tx.paymentIntent.update({
        where: { id: paymentIntent.id },
        data: { status: 'captured' },
      });
    });
  }

  /**
   * Refund payment
   * Can only refund captured payments
   * Policy validation ensures refunds follow cancellation rules
   */
  async refund(bookingId: string): Promise<PaymentIntent> {
    return await this.prisma.$transaction(async (tx) => {
      // Load payment intent with lock
      const paymentIntents = await tx.$queryRaw<PaymentIntent[]>`
        SELECT * FROM payment_intents
        WHERE "bookingId"::text = ${bookingId}
        FOR UPDATE
      `;

      if (!paymentIntents || paymentIntents.length === 0) {
        throw new NotFoundException(
          `Payment intent not found for booking ${bookingId}`,
        );
      }

      const paymentIntent = paymentIntents[0];

      // Idempotent check
      if (paymentIntent.status === 'refunded') {
        return paymentIntent;
      }

      // Policy validation: Refunds only allowed if payment is CAPTURED
      if (
        !this.cancellationPolicyService.canRefund(paymentIntent.status as any)
      ) {
        throw new BadRequestException(
          `Cannot refund payment: Payment status is ${paymentIntent.status}. ` +
          `Only CAPTURED payments can be refunded.`,
        );
      }

      // State machine validation
      PaymentStateMachine.validateTransition(
        paymentIntent.status as any,
        'REFUNDED' as any,
        'refund payment',
      );

      // Update status
      return tx.paymentIntent.update({
        where: { id: paymentIntent.id },
        data: { status: 'refunded' },
      });
    });
  }

  /**
   * Cancel payment intent
   * Can only cancel authorized payments (before capture)
   */
  async cancel(bookingId: string, userId: string): Promise<PaymentIntent> {
    return await this.prisma.$transaction(async (tx) => {
      // Load payment intent with lock
      const paymentIntents = await tx.$queryRaw<PaymentIntent[]>`
        SELECT * FROM payment_intents
        WHERE "bookingId"::text = ${bookingId}
        FOR UPDATE
      `;

      if (!paymentIntents || paymentIntents.length === 0) {
        throw new NotFoundException(
          `Payment intent not found for booking ${bookingId}`,
        );
      }

      const paymentIntent = paymentIntents[0];

      // Authorization check - renter or host can cancel
      if (
        paymentIntent.renterId !== userId &&
        paymentIntent.hostId !== userId
      ) {
        throw new ForbiddenException(
          'Only the renter or host can cancel this payment intent',
        );
      }

      // Idempotent check
      if (paymentIntent.status === 'cancelled') {
        return paymentIntent;
      }

      // State machine validation
      PaymentStateMachine.validateTransition(
        paymentIntent.status as any,
        'CANCELLED' as any,
        'cancel payment intent',
      );

      // Update status
      return tx.paymentIntent.update({
        where: { id: paymentIntent.id },
        data: { status: 'cancelled' },
      });
    });
  }

  /**
   * Get payment intent for a booking
   */
  async findByBooking(bookingId: string): Promise<PaymentIntent | null> {
    return this.prisma.paymentIntent.findUnique({
      where: { bookingId },
      include: {
        renter: true,
        host: true,
      },
    });
  }

  /**
   * Get payment intent by ID
   */
  async findOne(id: string): Promise<PaymentIntent> {
    const paymentIntent = await this.prisma.paymentIntent.findUnique({
      where: { id },
      include: {
        renter: true,
        host: true,
        booking: true,
      },
    });

    if (!paymentIntent) {
      throw new NotFoundException(`Payment intent with ID ${id} not found`);
    }

    return paymentIntent;
  }
}
