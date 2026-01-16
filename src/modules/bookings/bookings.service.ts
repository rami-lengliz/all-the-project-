import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  ConflictException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { Booking, BookingStatus } from '../../entities/booking.entity';
import { CreateBookingDto } from './dto/create-booking.dto';
import { PayBookingDto } from './dto/pay-booking.dto';
import { ListingsService } from '../listings/listings.service';
import { ConfigService } from '@nestjs/config';
import { AvailabilityUtil } from '../../common/utils/availability.util';
import { AvailabilityService } from '../../common/utils/availability.service';
import { BookingStateMachine } from '../../common/utils/booking-state-machine';
import { PaymentsService } from '../payments/payments.service';
import { PaymentIntentStatus } from '../../entities/payment-intent.entity';
import { CancellationPolicyService } from '../../common/policies/cancellation-policy.service';

@Injectable()
export class BookingsService {
  private readonly commissionPercentage: number;

  constructor(
    @InjectRepository(Booking)
    private bookingsRepository: Repository<Booking>,
    private listingsService: ListingsService,
    private configService: ConfigService,
    private dataSource: DataSource,
    private availabilityUtil: AvailabilityUtil,
    private availabilityService: AvailabilityService,
    private paymentsService: PaymentsService,
    private cancellationPolicyService: CancellationPolicyService,
  ) {
    this.commissionPercentage =
      this.configService.get<number>('commission.percentage') || 0.1;
  }

  async create(
    createBookingDto: CreateBookingDto,
    renterId: string,
  ): Promise<Booking> {
    const listing = await this.listingsService.findOne(
      createBookingDto.listingId,
    );

    if (listing.hostId === renterId) {
      throw new BadRequestException('You cannot book your own listing');
    }

    if (!listing.isActive) {
      throw new BadRequestException('This listing is not active');
    }

    const startDate = new Date(createBookingDto.startDate);
    const endDate = new Date(createBookingDto.endDate);

    if (startDate >= endDate) {
      throw new BadRequestException('End date must be after start date');
    }

    if (startDate < new Date()) {
      throw new BadRequestException('Start date cannot be in the past');
    }

    // Calculate total price and commission
    const days = Math.ceil(
      (endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24),
    );
    const totalPrice = listing.pricePerDay * days;
    const commission = totalPrice * this.commissionPercentage;

    // Use transaction with row-level locking to prevent double booking
    return await this.dataSource.transaction(async (manager) => {
      // Check availability using centralized service with lock
      // Only CONFIRMED and PAID bookings block availability (PENDING does not)
      const isAvailable =
        await this.availabilityService.isListingAvailableWithLock(
          manager,
          createBookingDto.listingId,
          startDate,
          endDate,
        );

      if (!isAvailable) {
        throw new ConflictException(
          'This listing is not available for the selected dates',
        );
      }

      // Create booking
      const booking = manager.create(Booking, {
        ...createBookingDto,
        renterId,
        hostId: listing.hostId,
        totalPrice,
        commission,
        status: BookingStatus.PENDING,
        paid: false,
      });

      const savedBooking = await manager.save(booking);

      // Create payment intent for this booking
      // This is done outside the transaction to avoid circular dependency
      // Payment intent creation is idempotent
      await this.paymentsService.createForBooking(savedBooking.id);

      return savedBooking;
    });
  }

  async findAll(userId: string): Promise<Booking[]> {
    return this.bookingsRepository
      .createQueryBuilder('booking')
      .leftJoinAndSelect('booking.listing', 'listing')
      .leftJoinAndSelect('listing.category', 'category')
      .leftJoinAndSelect('booking.renter', 'renter')
      .leftJoinAndSelect('booking.host', 'host')
      .where('booking.renterId = :userId', { userId })
      .orWhere('booking.hostId = :userId', { userId })
      .orderBy('booking.createdAt', 'DESC')
      .getMany();
  }

  async findOne(id: string): Promise<Booking> {
    const booking = await this.bookingsRepository.findOne({
      where: { id },
      relations: ['listing', 'listing.category', 'renter', 'host'],
    });
    if (!booking) {
      throw new NotFoundException(`Booking with ID ${id} not found`);
    }
    return booking;
  }

  async confirm(id: string, userId: string): Promise<Booking> {
    // Use transaction with locking to prevent race conditions
    return await this.dataSource.transaction(async (manager) => {
      // Reload booking with lock to get latest state
      const booking = await manager
        .createQueryBuilder(Booking, 'booking')
        .setLock('pessimistic_write')
        .where('booking.id = :id', { id })
        .leftJoinAndSelect('booking.listing', 'listing')
        .getOne();

      if (!booking) {
        throw new NotFoundException(`Booking with ID ${id} not found`);
      }

      // Authorization check
      if (booking.hostId !== userId) {
        throw new ForbiddenException(
          'Only the listing host can confirm bookings',
        );
      }

      // Idempotent check: if already confirmed, return as-is
      if (booking.status === BookingStatus.CONFIRMED) {
        return booking;
      }

      // State machine validation
      BookingStateMachine.validateTransition(
        booking.status,
        BookingStatus.CONFIRMED,
        'confirm booking',
      );

      // Check availability using centralized service with lock
      // Exclude current booking from check
      const isAvailable =
        await this.availabilityService.isListingAvailableWithLock(
          manager,
          booking.listingId,
          booking.startDate,
          booking.endDate,
          id,
        );

      if (!isAvailable) {
        throw new ConflictException(
          'Cannot confirm: Another booking overlaps with these dates',
        );
      }

      // Update status
      booking.status = BookingStatus.CONFIRMED;
      return manager.save(booking);
    });
  }

  async pay(
    id: string,
    payBookingDto: PayBookingDto,
    userId: string,
  ): Promise<Booking> {
    // Use transaction with locking to prevent double payment
    return await this.dataSource.transaction(async (manager) => {
      // Reload booking with lock to get latest state
      const booking = await manager
        .createQueryBuilder(Booking, 'booking')
        .setLock('pessimistic_write')
        .where('booking.id = :id', { id })
        .getOne();

      if (!booking) {
        throw new NotFoundException(`Booking with ID ${id} not found`);
      }

      // Authorization check
      if (booking.renterId !== userId) {
        throw new ForbiddenException(
          'Only the renter can pay for this booking',
        );
      }

      // Idempotent check: if already paid, return as-is
      if (booking.status === BookingStatus.PAID && booking.paid) {
        return booking;
      }

      // State machine validation
      if (!BookingStateMachine.canPay(booking.status, booking.paid)) {
        throw new BadRequestException(
          `Cannot pay booking: Current status is ${booking.status}. ` +
            `Booking must be CONFIRMED to be paid.`,
        );
      }

      // Check payment intent - must be AUTHORIZED or CAPTURED
      const paymentIntent = await this.paymentsService.findByBooking(id);
      if (!paymentIntent) {
        throw new BadRequestException(
          'Payment intent not found. Please authorize payment first.',
        );
      }

      if (paymentIntent.status === PaymentIntentStatus.CREATED) {
        throw new BadRequestException(
          'Payment must be authorized before booking can be paid.',
        );
      }

      if (paymentIntent.status === PaymentIntentStatus.CANCELLED) {
        throw new BadRequestException(
          'Cannot pay booking: Payment intent has been cancelled.',
        );
      }

      // Capture payment if not already captured
      if (paymentIntent.status === PaymentIntentStatus.AUTHORIZED) {
        await this.paymentsService.capture(id);
      }

      // Verify payment is captured
      const updatedPaymentIntent = await this.paymentsService.findByBooking(id);
      if (updatedPaymentIntent?.status !== PaymentIntentStatus.CAPTURED) {
        throw new ConflictException(
          'Payment must be captured before booking can be marked as paid.',
        );
      }

      // Update to PAID status and set paid flag
      booking.status = BookingStatus.PAID;
      booking.paid = true;
      booking.paymentInfo = {
        paymentIntentId: paymentIntent.id,
        paymentToken: payBookingDto.paymentToken,
        receipt: payBookingDto.receipt,
        paidAt: new Date().toISOString(),
        method: 'simulated', // In production, use actual payment method
      };

      return manager.save(booking);
    });
  }

  async cancel(id: string, userId: string): Promise<Booking> {
    // Use transaction with locking to prevent race conditions
    return await this.dataSource.transaction(async (manager) => {
      // Reload booking with lock to get latest state
      const booking = await manager
        .createQueryBuilder(Booking, 'booking')
        .setLock('pessimistic_write')
        .where('booking.id = :id', { id })
        .getOne();

      if (!booking) {
        throw new NotFoundException(`Booking with ID ${id} not found`);
      }

      // Authorization check
      if (booking.renterId !== userId && booking.hostId !== userId) {
        throw new ForbiddenException(
          'Only the renter or host can cancel this booking',
        );
      }

      // Determine actor
      const actor = booking.renterId === userId ? 'RENTER' : 'HOST';

      // Get payment intent to check payment status
      const paymentIntent = await this.paymentsService.findByBooking(id);

      // Evaluate cancellation policy
      const decision = this.cancellationPolicyService.evaluateCancellation({
        actor,
        bookingStatus: booking.status,
        paymentStatus: paymentIntent?.status || PaymentIntentStatus.CREATED,
        startDate: new Date(booking.startDate),
        endDate: new Date(booking.endDate),
        totalPrice: Number(booking.totalPrice),
        now: new Date(),
      });

      // Idempotent check: if already cancelled, return as-is
      if (booking.status === BookingStatus.CANCELLED) {
        return booking;
      }

      // Policy validation - check if cancellation is allowed
      if (!decision.allowCancel) {
        throw new BadRequestException(decision.reason);
      }

      // State machine validation
      BookingStateMachine.validateTransition(
        booking.status,
        BookingStatus.CANCELLED,
        'cancel booking',
      );

      // Process refund if required by policy
      if (
        decision.refundType !== 'NONE' &&
        decision.refundAmount > 0 &&
        paymentIntent &&
        paymentIntent.status === PaymentIntentStatus.CAPTURED
      ) {
        // Refund will be processed by PaymentsService
        // This ensures payment state machine is respected
        await this.paymentsService.refund(id);
      }

      // Update booking status
      booking.status = BookingStatus.CANCELLED;
      return manager.save(booking);
    });
  }
}
