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
import { Booking, BookingStatus, Prisma } from '@prisma/client';
import { CreateBookingDto } from './dto/create-booking.dto';
import { PayBookingDto } from './dto/pay-booking.dto';
import { ListingsService } from '../listings/listings.service';
import { ConfigService } from '@nestjs/config';
import { AvailabilityService } from '../../common/utils/availability.service';
import { BookingStateMachine } from '../../common/utils/booking-state-machine';
import { PaymentsService } from '../payments/payments.service';
import { PaymentIntentStatus } from '@prisma/client';
import { CancellationPolicyService } from '../../common/policies/cancellation-policy.service';

@Injectable()
export class BookingsService {
  private readonly commissionPercentage: number;

  constructor(
    private prisma: PrismaService,
    private listingsService: ListingsService,
    private configService: ConfigService,
    private availabilityService: AvailabilityService,
    @Inject(forwardRef(() => PaymentsService))
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

    // Handle SLOT-based bookings
    if (listing.bookingType === 'SLOT') {
      return this.createSlotBooking(createBookingDto, renterId, listing, startDate);
    }

    // Handle DAILY bookings (existing logic)
    // Calculate total price and commission
    const days = Math.ceil(
      (endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24),
    );
    const pricePerDay = typeof listing.pricePerDay === 'number' ? listing.pricePerDay : Number(listing.pricePerDay);
    const totalPrice = pricePerDay * days;
    const commission = totalPrice * this.commissionPercentage;

    // Use transaction with row-level locking to prevent double booking
    return await this.prisma.$transaction(async (tx) => {
      // Check availability using centralized service with lock
      // Only CONFIRMED and PAID bookings block availability (PENDING does not)
      const isAvailable =
        await this.availabilityService.isListingAvailableWithLock(
          tx,
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
      const booking = await tx.booking.create({
        data: {
          ...createBookingDto,
          renterId,
          hostId: listing.hostId,
          totalPrice,
          commission,
          status: 'pending',
          paid: false,
        },
      });

      // Create payment intent for this booking
      // This is done outside the transaction to avoid circular dependency
      // Payment intent creation is idempotent
      await this.paymentsService.createForBooking(booking.id);

      return booking;
    });
  }

  async findAll(userId: string): Promise<Booking[]> {
    return this.prisma.booking.findMany({
      where: {
        OR: [
          { renterId: userId },
          { hostId: userId },
        ],
      },
      include: {
        listing: {
          include: {
            category: true,
          },
        },
        renter: true,
        host: true,
      },
      orderBy: {
        createdAt: 'desc',
      },
    });
  }

  async findOne(id: string): Promise<Booking> {
    const booking = await this.prisma.booking.findUnique({
      where: { id },
      include: {
        listing: {
          include: {
            category: true,
          },
        },
        renter: true,
        host: true,
      },
    });
    if (!booking) {
      throw new NotFoundException(`Booking with ID ${id} not found`);
    }
    return booking;
  }

  async confirm(id: string, userId: string): Promise<Booking> {
    // Use transaction with locking to prevent race conditions
    return await this.prisma.$transaction(async (tx) => {
      // Reload booking with lock to get latest state
      const bookings = await tx.$queryRaw<Booking[]>`
        SELECT * FROM bookings
        WHERE id = ${id}::uuid
        FOR UPDATE
      `;

      if (!bookings || bookings.length === 0) {
        throw new NotFoundException(`Booking with ID ${id} not found`);
      }

      const booking = bookings[0];

      // Authorization check
      if (booking.hostId !== userId) {
        throw new ForbiddenException(
          'Only the listing host can confirm bookings',
        );
      }

      // Idempotent check: if already confirmed, return as-is
      if (booking.status === 'confirmed') {
        return booking;
      }

      // State machine validation
      BookingStateMachine.validateTransition(
        booking.status as any,
        'CONFIRMED' as any,
        'confirm booking',
      );

      // Check availability using centralized service with lock
      // Exclude current booking from check
      const isAvailable =
        await this.availabilityService.isListingAvailableWithLock(
          tx,
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
      return tx.booking.update({
        where: { id },
        data: { status: 'confirmed' },
      });
    });
  }

  async pay(
    id: string,
    payBookingDto: PayBookingDto,
    userId: string,
  ): Promise<Booking> {
    // Use transaction with locking to prevent double payment
    return await this.prisma.$transaction(async (tx) => {
      // Reload booking with lock to get latest state
      const bookings = await tx.$queryRaw<Booking[]>`
        SELECT * FROM bookings
        WHERE id = ${id}::uuid
        FOR UPDATE
      `;

      if (!bookings || bookings.length === 0) {
        throw new NotFoundException(`Booking with ID ${id} not found`);
      }

      const booking = bookings[0];

      // Authorization check
      if (booking.renterId !== userId) {
        throw new ForbiddenException(
          'Only the renter can pay for this booking',
        );
      }

      // Idempotent check: if already paid, return as-is
      if (booking.status === 'paid' && booking.paid) {
        return booking;
      }

      // State machine validation
      if (!BookingStateMachine.canPay(booking.status as any, booking.paid)) {
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

      if (paymentIntent.status === 'created') {
        throw new BadRequestException(
          'Payment must be authorized before booking can be paid.',
        );
      }

      if (paymentIntent.status === 'cancelled') {
        throw new BadRequestException(
          'Cannot pay booking: Payment intent has been cancelled.',
        );
      }

      // Capture payment if not already captured
      if (paymentIntent.status === 'authorized') {
        await this.paymentsService.capture(id);
      }

      // Verify payment is captured
      const updatedPaymentIntent = await this.paymentsService.findByBooking(id);
      if (updatedPaymentIntent?.status !== 'captured') {
        throw new ConflictException(
          'Payment must be captured before booking can be marked as paid.',
        );
      }

      // Update to PAID status and set paid flag
      return tx.booking.update({
        where: { id },
        data: {
          status: 'paid',
          paid: true,
          paymentInfo: {
            paymentIntentId: paymentIntent.id,
            paymentToken: payBookingDto.paymentToken,
            receipt: payBookingDto.receipt,
            paidAt: new Date().toISOString(),
            method: 'simulated', // In production, use actual payment method
          } as any,
        },
      });
    });
  }

  async cancel(id: string, userId: string): Promise<Booking> {
    // Use transaction with locking to prevent race conditions
    return await this.prisma.$transaction(async (tx) => {
      // Reload booking with lock to get latest state
      const bookings = await tx.$queryRaw<Booking[]>`
        SELECT * FROM bookings
        WHERE id = ${id}::uuid
        FOR UPDATE
      `;

      if (!bookings || bookings.length === 0) {
        throw new NotFoundException(`Booking with ID ${id} not found`);
      }

      const booking = bookings[0];

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
        bookingStatus: booking.status as any,
        paymentStatus: (paymentIntent?.status || 'created') as any,
        startDate: new Date(booking.startDate),
        endDate: new Date(booking.endDate),
        totalPrice: Number(booking.totalPrice),
        now: new Date(),
      });

      // Idempotent check: if already cancelled, return as-is
      if (booking.status === 'cancelled') {
        return booking;
      }

      // Policy validation - check if cancellation is allowed
      if (!decision.allowCancel) {
        throw new BadRequestException(decision.reason);
      }

      // State machine validation
      BookingStateMachine.validateTransition(
        booking.status as any,
        'CANCELLED' as any,
        'cancel booking',
      );

      // Process refund if required by policy
      if (
        decision.refundType !== 'NONE' &&
        decision.refundAmount > 0 &&
        paymentIntent &&
        paymentIntent.status === 'captured'
      ) {
        // Refund will be processed by PaymentsService
        // This ensures payment state machine is respected
        await this.paymentsService.refund(id);
      }


      // Update booking status
      return tx.booking.update({
        where: { id },
        data: { status: 'cancelled' },
      });
    });
  }

  private async createSlotBooking(
    createBookingDto: CreateBookingDto,
    renterId: string,
    listing: any,
    startDate: Date,
  ): Promise<Booking> {
    if (!createBookingDto.startTime || !createBookingDto.endTime) {
      throw new BadRequestException(
        'Start time and end time are required for slot bookings',
      );
    }

    const slotConfig = await this.prisma.slotConfiguration.findUnique({
      where: { listingId: listing.id },
    });

    if (!slotConfig) {
      throw new BadRequestException(
        'Slot configuration not found for this listing',
      );
    }

    const dayOfWeek = startDate.toLocaleDateString('en-US', { weekday: 'long' }).toLowerCase();
    const operatingHours = slotConfig.operatingHours[dayOfWeek];

    if (!operatingHours) {
      throw new BadRequestException(`Facility is closed on ${dayOfWeek}s`);
    }

    if (
      createBookingDto.startTime < operatingHours.start ||
      createBookingDto.endTime > operatingHours.end
    ) {
      throw new BadRequestException(
        `Booking time must be within operating hours (${operatingHours.start} - ${operatingHours.end})`,
      );
    }

    const totalPrice = this.calculateSlotPrice(
      slotConfig,
      createBookingDto.startTime,
      createBookingDto.endTime,
    );
    const commission = totalPrice * this.commissionPercentage;

    return await this.prisma.$transaction(async (tx) => {
      const isAvailable = await this.availabilityService.checkSlotAvailability(
        listing.id,
        startDate,
        createBookingDto.startTime,
        createBookingDto.endTime,
      );

      if (!isAvailable) {
        throw new ConflictException('This time slot is not available');
      }

      const booking = await tx.booking.create({
        data: {
          listingId: createBookingDto.listingId,
          renterId,
          hostId: listing.hostId,
          startDate,
          endDate: startDate,
          startTime: createBookingDto.startTime,
          endTime: createBookingDto.endTime,
          totalPrice,
          commission,
          status: 'pending',
          paid: false,
        },
      });

      await this.paymentsService.createForBooking(booking.id);

      return booking;
    });
  }

  private calculateSlotPrice(
    slotConfig: any,
    startTime: string,
    endTime: string,
  ): number {
    const startMinutes = this.timeStringToMinutes(startTime);
    const endMinutes = this.timeStringToMinutes(endTime);
    const durationMinutes = endMinutes - startMinutes;

    if (durationMinutes <= 0) {
      throw new BadRequestException('End time must be after start time');
    }

    const slots = Math.ceil(durationMinutes / slotConfig.slotDurationMinutes);

    if (slots < slotConfig.minBookingSlots) {
      throw new BadRequestException(
        `Minimum booking duration is ${slotConfig.minBookingSlots} slot(s)`,
      );
    }

    if (slotConfig.maxBookingSlots && slots > slotConfig.maxBookingSlots) {
      throw new BadRequestException(
        `Maximum booking duration is ${slotConfig.maxBookingSlots} slot(s)`,
      );
    }

    return slots * Number(slotConfig.pricePerSlot);
  }

  private timeStringToMinutes(timeStr: string): number {
    const [hours, minutes] = timeStr.split(':').map(Number);
    return hours * 60 + minutes;
  }
}
