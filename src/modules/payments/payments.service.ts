import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  ConflictException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import {
  PaymentIntent,
  PaymentIntentStatus,
} from '../../entities/payment-intent.entity';
import { Booking, BookingStatus } from '../../entities/booking.entity';
import { PaymentStateMachine } from '../../common/utils/payment-state-machine';
import { BookingsService } from '../bookings/bookings.service';
import { CancellationPolicyService } from '../../common/policies/cancellation-policy.service';

@Injectable()
export class PaymentsService {
  constructor(
    @InjectRepository(PaymentIntent)
    private paymentIntentRepository: Repository<PaymentIntent>,
    @InjectRepository(Booking)
    private bookingRepository: Repository<Booking>,
    private bookingsService: BookingsService,
    private dataSource: DataSource,
    private cancellationPolicyService: CancellationPolicyService,
  ) {}

  /**
   * Create a payment intent for a booking
   * Called automatically when booking is created
   */
  async createForBooking(bookingId: string): Promise<PaymentIntent> {
    const booking = await this.bookingsService.findOne(bookingId);

    // Check if payment intent already exists
    const existing = await this.paymentIntentRepository.findOne({
      where: { bookingId },
    });

    if (existing) {
      return existing;
    }

    const paymentIntent = this.paymentIntentRepository.create({
      bookingId,
      renterId: booking.renterId,
      hostId: booking.hostId,
      amount: booking.totalPrice,
      currency: 'TND',
      status: PaymentIntentStatus.CREATED,
    });

    return this.paymentIntentRepository.save(paymentIntent);
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
    return await this.dataSource.transaction(async (manager) => {
      // Load payment intent with lock
      const paymentIntent = await manager
        .createQueryBuilder(PaymentIntent, 'pi')
        .setLock('pessimistic_write')
        .where('pi.bookingId = :bookingId', { bookingId })
        .getOne();

      if (!paymentIntent) {
        throw new NotFoundException(
          `Payment intent not found for booking ${bookingId}`,
        );
      }

      // Authorization check
      if (paymentIntent.renterId !== userId) {
        throw new ForbiddenException(
          'Only the renter can authorize this payment',
        );
      }

      // Idempotent check
      if (paymentIntent.status === PaymentIntentStatus.AUTHORIZED) {
        return paymentIntent;
      }

      // State machine validation
      PaymentStateMachine.validateTransition(
        paymentIntent.status,
        PaymentIntentStatus.AUTHORIZED,
        'authorize payment',
      );

      // Update status
      paymentIntent.status = PaymentIntentStatus.AUTHORIZED;
      if (metadata) {
        paymentIntent.metadata = {
          ...paymentIntent.metadata,
          ...metadata,
        };
      }

      return manager.save(paymentIntent);
    });
  }

  /**
   * Capture payment (system captures authorized payment)
   * Only system can capture (no userId required)
   * This is called when booking moves to PAID status
   */
  async capture(bookingId: string): Promise<PaymentIntent> {
    return await this.dataSource.transaction(async (manager) => {
      // Load payment intent with lock
      const paymentIntent = await manager
        .createQueryBuilder(PaymentIntent, 'pi')
        .setLock('pessimistic_write')
        .where('pi.bookingId = :bookingId', { bookingId })
        .getOne();

      if (!paymentIntent) {
        throw new NotFoundException(
          `Payment intent not found for booking ${bookingId}`,
        );
      }

      // Idempotent check
      if (paymentIntent.status === PaymentIntentStatus.CAPTURED) {
        return paymentIntent;
      }

      // State machine validation
      PaymentStateMachine.validateTransition(
        paymentIntent.status,
        PaymentIntentStatus.CAPTURED,
        'capture payment',
      );

      // Update status
      paymentIntent.status = PaymentIntentStatus.CAPTURED;

      return manager.save(paymentIntent);
    });
  }

  /**
   * Refund payment
   * Can only refund captured payments
   * Policy validation ensures refunds follow cancellation rules
   */
  async refund(bookingId: string): Promise<PaymentIntent> {
    return await this.dataSource.transaction(async (manager) => {
      // Load payment intent with lock
      const paymentIntent = await manager
        .createQueryBuilder(PaymentIntent, 'pi')
        .setLock('pessimistic_write')
        .where('pi.bookingId = :bookingId', { bookingId })
        .getOne();

      if (!paymentIntent) {
        throw new NotFoundException(
          `Payment intent not found for booking ${bookingId}`,
        );
      }

      // Idempotent check
      if (paymentIntent.status === PaymentIntentStatus.REFUNDED) {
        return paymentIntent;
      }

      // Policy validation: Refunds only allowed if payment is CAPTURED
      if (!this.cancellationPolicyService.canRefund(paymentIntent.status)) {
        throw new BadRequestException(
          `Cannot refund payment: Payment status is ${paymentIntent.status}. ` +
            `Only CAPTURED payments can be refunded.`,
        );
      }

      // State machine validation
      PaymentStateMachine.validateTransition(
        paymentIntent.status,
        PaymentIntentStatus.REFUNDED,
        'refund payment',
      );

      // Update status
      paymentIntent.status = PaymentIntentStatus.REFUNDED;

      return manager.save(paymentIntent);
    });
  }

  /**
   * Cancel payment intent
   * Can only cancel authorized payments (before capture)
   */
  async cancel(bookingId: string, userId: string): Promise<PaymentIntent> {
    return await this.dataSource.transaction(async (manager) => {
      // Load payment intent with lock
      const paymentIntent = await manager
        .createQueryBuilder(PaymentIntent, 'pi')
        .setLock('pessimistic_write')
        .where('pi.bookingId = :bookingId', { bookingId })
        .getOne();

      if (!paymentIntent) {
        throw new NotFoundException(
          `Payment intent not found for booking ${bookingId}`,
        );
      }

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
      if (paymentIntent.status === PaymentIntentStatus.CANCELLED) {
        return paymentIntent;
      }

      // State machine validation
      PaymentStateMachine.validateTransition(
        paymentIntent.status,
        PaymentIntentStatus.CANCELLED,
        'cancel payment intent',
      );

      // Update status
      paymentIntent.status = PaymentIntentStatus.CANCELLED;

      return manager.save(paymentIntent);
    });
  }

  /**
   * Get payment intent for a booking
   */
  async findByBooking(bookingId: string): Promise<PaymentIntent | null> {
    return this.paymentIntentRepository.findOne({
      where: { bookingId },
      relations: ['renter', 'host'],
    });
  }

  /**
   * Get payment intent by ID
   */
  async findOne(id: string): Promise<PaymentIntent> {
    const paymentIntent = await this.paymentIntentRepository.findOne({
      where: { id },
      relations: ['renter', 'host', 'booking'],
    });

    if (!paymentIntent) {
      throw new NotFoundException(`Payment intent with ID ${id} not found`);
    }

    return paymentIntent;
  }
}
