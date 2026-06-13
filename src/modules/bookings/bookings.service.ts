import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  ConflictException,
  Inject,
  forwardRef,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { Booking } from '@prisma/client';
import { CreateBookingDto } from './dto/create-booking.dto';
import { PayBookingDto } from './dto/pay-booking.dto';
import { ListingsService } from '../listings/listings.service';
import { ConfigService } from '@nestjs/config';
import { AvailabilityService } from '../../common/utils/availability.service';
import { BookingStateMachine } from '../../common/utils/booking-state-machine';
import { PaymentsService } from '../payments/payments.service';
import { CancellationPolicyService } from '../../common/policies/cancellation-policy.service';
import { ChatService } from '../../chat/chat.service';
import { WalletService } from '../wallet/wallet.service';
import { QualityScoreService } from '../quality/quality-score.service';
import { NotificationsService } from '../notifications/notifications.service';
import { PersonalizationService } from '../personalization/personalization.service';

/**
 * Maps internal DB booking statuses to stable MVP-facing vocabulary.
 *
 * Internal  → displayStatus
 * ---------   -------------
 * pending   → pending
 * confirmed → accepted
 * paid      → accepted   (payment is an internal milestone, renter sees "accepted")
 * completed → completed
 * cancelled → canceled   (American English used in MVP spec)
 * rejected  → rejected
 */
export type DisplayStatus =
  | 'pending'
  | 'accepted'
  | 'completed'
  | 'canceled'
  | 'rejected';

export function toDisplayStatus(internal: string): DisplayStatus {
  switch (internal) {
    case 'confirmed':
    case 'paid':
      return 'accepted';
    case 'cancelled':
      return 'canceled';
    case 'rejected':
      return 'rejected';
    case 'completed':
      return 'completed';
    default:
      return 'pending';
  }
}

/** Attaches displayStatus to any booking object. */
export function withDisplay<T extends { status: string }>(
  booking: T,
): T & { displayStatus: DisplayStatus } {
  return { ...booking, displayStatus: toDisplayStatus(booking.status) };
}

/**
 * Mobile action flags — tell the mobile app which operations are currently
 * available for this booking from the caller's perspective.
 *
 * All flags are computed from in-memory state (no extra DB round-trip).
 * The server will still enforce the same rules on the actual mutation endpoint,
 * so these are hints for UI rendering, not authoritative guards.
 */
export interface MobileBookingActions {
  /** Renter can pay: booking is host-confirmed but not yet paid. */
  canPay: boolean;
  /** Renter or host can cancel (pending or confirmed/paid, not terminal). */
  canCancel: boolean;
  /** Renter can leave a review: rental completed and review not yet submitted. */
  canReview: boolean;
  /** Host can accept the booking request (still pending). */
  canConfirm: boolean;
  /** Host can decline the booking request (still pending). */
  canReject: boolean;
  /** Either party can open a chat thread for this booking. */
  canMessageHost: boolean;
}

export function withMobileActions<
  T extends { status: string; renterId: string; hostId: string; paid?: boolean },
>(
  booking: T,
  viewerId: string,
): T & { displayStatus: DisplayStatus; actions: MobileBookingActions } {
  const s = booking.status;
  const isRenter = booking.renterId === viewerId;
  const isHost = booking.hostId === viewerId;
  const isActive = !['completed', 'cancelled', 'rejected'].includes(s);

  return {
    ...withDisplay(booking),
    actions: {
      canPay: isRenter && s === 'confirmed' && !booking.paid,
      canCancel: (isRenter || isHost) && ['pending', 'confirmed', 'paid'].includes(s),
      canReview: isRenter && s === 'completed',
      canConfirm: isHost && s === 'pending',
      canReject: isHost && s === 'pending',
      canMessageHost: isActive,
    },
  };
}

@Injectable()
export class BookingsService {
  private readonly commissionPercentage: number;
  private readonly logger = new Logger(BookingsService.name);

  constructor(
    private prisma: PrismaService,
    private listingsService: ListingsService,
    private configService: ConfigService,
    private availabilityService: AvailabilityService,
    @Inject(forwardRef(() => PaymentsService))
    private paymentsService: PaymentsService,
    private cancellationPolicyService: CancellationPolicyService,
    private chatService: ChatService,
    private walletService: WalletService,
    private qualityScore: QualityScoreService,
    private notifications: NotificationsService,
    private personalization: PersonalizationService,
  ) {
    this.commissionPercentage =
      this.configService.get<number>('commission.percentage') || 0.1;
  }

  async create(
    createBookingDto: CreateBookingDto,
    renterId: string,
  ): Promise<any> {
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

    // Handle SLOT-based bookings BEFORE date-range validation:
    // SLOT bookings legally use the same day for startDate and endDate
    // (the time window is expressed via startTime/endTime, not date span).
    if (listing.bookingType === 'SLOT') {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      if (startDate < today) {
        throw new BadRequestException('Start date cannot be in the past');
      }
      return this.createSlotBooking(
        createBookingDto,
        renterId,
        listing,
        startDate,
      );
    }

    // DAILY bookings: end date must be strictly after start date
    if (startDate >= endDate) {
      throw new BadRequestException('End date must be after start date');
    }

    const todayMidnight = new Date();
    todayMidnight.setHours(0, 0, 0, 0);
    if (startDate < todayMidnight) {
      throw new BadRequestException('Start date cannot be in the past');
    }

    // Handle DAILY bookings (existing logic)
    // Calculate total price and commission
    const days = Math.ceil(
      (endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24),
    );

    // Minimum-nights rule (Airbnb-style)
    const minNights = (listing as any).minNights ?? 1;
    if (days < minNights) {
      throw new BadRequestException(
        `This listing requires a minimum stay of ${minNights} night${minNights > 1 ? 's' : ''}.`,
      );
    }

    const pricePerDay =
      typeof listing.pricePerDay === 'number'
        ? listing.pricePerDay
        : Number(listing.pricePerDay);
    // Sum each night's effective price (per-date override ?? base) so the total
    // always matches what the renter saw on the calendar.
    const totalPrice = await this.listingsService.computeDailyTotal(
      createBookingDto.listingId,
      pricePerDay,
      startDate,
      endDate,
    );
    const commission = totalPrice * this.commissionPercentage;

    // Use transaction with row-level locking to prevent double booking
    const booking = await this.prisma.$transaction(async (tx) => {
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

      // Create booking — explicit field mapping to ensure correct types
      return tx.booking.create({
        data: {
          listingId: createBookingDto.listingId,
          renterId,
          hostId: listing.hostId,
          startDate,
          endDate,
          totalPrice,
          commission,
          status: 'pending',
          paid: false,
          // Immutable snapshot — never updated after creation
          snapshotTitle: listing.title,
          snapshotPricePerDay: pricePerDay,
          snapshotCommissionRate: this.commissionPercentage,
          snapshotCurrency: 'TND',
        },
      });
    });

    // Create payment intent AFTER transaction commits so the row is visible
    try {
      await this.paymentsService.createForBooking(booking.id);
    } catch (_e) {
      // Non-fatal — payment intent can be created lazily
    }

    // Auto-create chat conversation for this booking (idempotent via unique constraint)
    let conversationId: string | null = null;
    try {
      const conversation = await this.chatService.getOrCreateConversation(
        renterId,
        listing.hostId,
        booking.id,
        listing.id,
      );
      conversationId = conversation.id;

      // Always send an auto-generated booking summary (Airbnb-style rich card)
      const autoMsg = this.buildBookingAutoMessage({
        listingId: listing.id,
        listingTitle: listing.title,
        listingImage: (listing.images ?? [])[0] ?? null,
        categoryName: (listing as any).category?.name ?? null,
        bookingId: booking.id,
        startDate,
        endDate,
        totalPrice: Number(booking.totalPrice),
        isSlot: false,
      });
      await this.chatService.sendMessage(conversation.id, renterId, autoMsg);

      // Then the renter's optional personal note
      if (createBookingDto.message) {
        await this.chatService.sendMessage(
          conversation.id,
          renterId,
          createBookingDto.message,
        );
      }
    } catch (_e: any) {
      this.logger.error('[CHAT-AUTO] Failed to create conversation/messages after booking', _e?.message, _e?.stack);
      // Non-fatal — conversation can be created on demand from the UI
    }

    // Notify the host that a new booking request came in.
    this.notifications.create({
      userId: booking.hostId,
      kind: 'BOOKING_REQUESTED',
      title: 'New booking request',
      body: `${(listing as any).title} · ${startDate}${endDate !== startDate ? ` → ${endDate}` : ''}`,
      link: '/host/bookings',
      payload: { bookingId: booking.id },
    });

    // Strongest personalization signal — renter took action and committed money.
    void this.personalization.recordInteraction(renterId, listing.id, 'BOOKING');

    return { ...withDisplay(booking), conversationId };
  }

  async findAll(userId: string) {
    const bookings = await this.prisma.booking.findMany({
      where: {
        OR: [{ renterId: userId }, { hostId: userId }],
      },
      include: {
        listing: {
          include: {
            category: true,
          },
        },
        // Only safe user fields. `renter: true` previously returned the full
        // row, including passwordHash — never expose that over HTTP.
        renter: {
          select: {
            id: true,
            name: true,
            avatarUrl: true,
            verifiedEmail: true,
            verifiedPhone: true,
            idVerifiedAt: true,
            renterTrustScore: true,
          },
        },
        host: {
          select: {
            id: true,
            name: true,
            avatarUrl: true,
            verifiedEmail: true,
            verifiedPhone: true,
            idVerifiedAt: true,
            qualityScore: true,
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    // One batched query for all conversations (was: per-row include with take:1,
    // which Prisma can fan out to N subqueries).
    const bookingIds = bookings.map((b) => b.id);
    const conversations = bookingIds.length
      ? await this.prisma.conversation.findMany({
          where: { bookingId: { in: bookingIds } },
          select: { id: true, bookingId: true },
        })
      : [];
    const convByBooking = new Map<string, string>();
    for (const c of conversations) {
      if (c.bookingId && !convByBooking.has(c.bookingId)) {
        convByBooking.set(c.bookingId, c.id);
      }
    }

    return bookings.map((b) => ({
      ...withMobileActions(b, userId),
      conversationId: convByBooking.get(b.id) ?? null,
    }));
  }

  async findOne(id: string, viewerId?: string) {
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
        Conversation: {
          select: { id: true },
          take: 1,
        },
      },
    });
    if (!booking) {
      throw new NotFoundException(`Booking with ID ${id} not found`);
    }
    const conversationId = booking.Conversation?.[0]?.id ?? null;
    if (viewerId) {
      return { ...withMobileActions(booking, viewerId), conversationId };
    }
    return { ...withDisplay(booking), conversationId };
  }

  async getHostDetails(bookingId: string, callerId: string, callerRole: string) {
    const booking = await this.prisma.booking.findUnique({
      where: { id: bookingId },
      include: {
        listing: { include: { category: true } },
        renter: {
          select: {
            id: true,
            name: true,
            avatarUrl: true,
            verifiedEmail: true,
            verifiedPhone: true,
            ratingAvg: true,
            ratingCount: true,
            createdAt: true,
          },
        },
      },
    });

    if (!booking) throw new NotFoundException(`Booking ${bookingId} not found`);

    const isAdmin = callerRole === 'ADMIN';
    if (booking.hostId !== callerId && !isAdmin) {
      throw new ForbiddenException('Only the listing host can view booking details');
    }

    const [renterBookingCount] = await Promise.all([
      this.prisma.booking.count({
        where: { renterId: booking.renterId, status: { in: ['paid', 'completed'] } },
      }),
    ]);

    const publicTotal = Number(booking.totalPrice);
    const commission = Number(booking.commission);
    const hostAmount = +(publicTotal - commission).toFixed(2);

    const formatTime = (t: Date | null) =>
      t ? t.toISOString().substring(11, 16) : null;

    return {
      bookingId: booking.id,
      status: booking.status,
      displayStatus: toDisplayStatus(booking.status),
      startDate: booking.startDate,
      endDate: booking.endDate,
      startTime: formatTime(booking.startTime as Date | null),
      endTime: formatTime(booking.endTime as Date | null),
      publicTotal,
      hostAmount,
      listing: {
        id: booking.listingId,
        title: booking.snapshotTitle,
        category: booking.listing?.category?.name ?? null,
        bookingType: booking.listing?.bookingType ?? null,
      },
      renter: {
        ...booking.renter,
        ratingAvg: Number(booking.renter.ratingAvg),
        completedBookings: renterBookingCount,
      },
    };
  }

  async confirm(id: string, userId: string): Promise<Booking> {
    // Use transaction with locking to prevent race conditions
    const result = await this.prisma.$transaction(async (tx) => {
      // Reload booking with lock to get latest state
      const bookings = await tx.$queryRaw<Booking[]>`
        SELECT * FROM bookings
        WHERE id::text = ${id}
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
        'confirmed' as any,
        'confirm booking',
      );

      // Lock the listing to serialize concurrent confirms for the same listing
      await tx.$queryRaw`
        SELECT id FROM listings
        WHERE id::text = ${booking.listingId}
        FOR UPDATE
      `;

      // Check availability — SLOT bookings use time-based check,
      // DAILY bookings use date-range lock. Both execute WITHIN the transaction context (tx).
      let isAvailable: boolean;
      if (booking.startTime && booking.endTime) {
        // SLOT booking
        isAvailable = await this.availabilityService.checkSlotAvailabilityWithLock(
          tx,
          booking.listingId,
          booking.startDate,
          // startTime returned from raw SQL may be a Date; extract HH:mm
          booking.startTime instanceof Date
            ? `${(booking.startTime as Date).getUTCHours().toString().padStart(2, '0')}:${(booking.startTime as Date).getUTCMinutes().toString().padStart(2, '0')}`
            : String(booking.startTime).substring(0, 5),
          booking.endTime instanceof Date
            ? `${(booking.endTime as Date).getUTCHours().toString().padStart(2, '0')}:${(booking.endTime as Date).getUTCMinutes().toString().padStart(2, '0')}`
            : String(booking.endTime).substring(0, 5),
          id,
        );
      } else {
        // DAILY booking
        isAvailable = await this.availabilityService.isListingAvailableWithLock(
          tx,
          booking.listingId,
          booking.startDate,
          booking.endDate,
          id,
        );
      }

      if (!isAvailable) {
        throw new ConflictException(
          'Cannot confirm: Another booking overlaps with this slot',
        );
      }

      // Update status
      const updated = await tx.booking.update({
        where: { id },
        data: { status: 'confirmed' },
      });
      return withDisplay(updated);
    }).then((result) => {
      this.notifications.create({
        userId: (result as any).renterId,
        kind: 'BOOKING_ACCEPTED',
        title: 'Your booking was accepted',
        body: 'You can pay now to lock in the dates.',
        link: `/booking/${(result as any).id}/pay`,
        payload: { bookingId: (result as any).id },
      });
      return result;
    });

    // Post-transaction: notify via chat (non-fatal)
    try {
      const conv = await this.prisma.conversation.findFirst({ where: { bookingId: id } });
      if (conv) {
        await this.chatService.sendMessage(
          conv.id,
          userId,
          '✅ Booking accepted. You can now pay to complete your reservation.',
        );
      }
    } catch { /* non-fatal */ }

    return result as unknown as Booking;
  }

  /** Host rejects a pending booking (sets status = rejected). */
  async reject(
    id: string,
    userId: string,
  ): Promise<Booking & { displayStatus: DisplayStatus }> {
    const result = await this.prisma.$transaction(async (tx) => {
      const bookings = await tx.$queryRaw<Booking[]>`
        SELECT * FROM bookings
        WHERE id::text = ${id}
        FOR UPDATE
      `;

      if (!bookings || bookings.length === 0) {
        throw new NotFoundException(`Booking with ID ${id} not found`);
      }

      const booking = bookings[0];

      if (booking.hostId !== userId) {
        throw new ForbiddenException(
          'Only the listing host can reject bookings',
        );
      }

      if (booking.status === 'rejected') {
        return withDisplay(booking); // idempotent
      }

      // Only pending bookings can be rejected
      if (booking.status !== 'pending') {
        throw new BadRequestException(
          `Cannot reject a booking with status "${booking.status}". Only pending bookings can be rejected.`,
        );
      }

      const updated = await tx.booking.update({
        where: { id },
        data: { status: 'rejected' as any },
      });

      return withDisplay(updated);
    }).then((result) => {
      this.notifications.create({
        userId: (result as any).renterId,
        kind: 'BOOKING_REJECTED',
        title: 'Your booking request was declined',
        body: 'The host wasn\'t able to accept these dates. Try another listing.',
        link: '/rentals',
        payload: { bookingId: (result as any).id },
      });
      return result;
    });

    // Post-transaction: notify via chat (non-fatal)
    try {
      const conv = await this.prisma.conversation.findFirst({ where: { bookingId: id } });
      if (conv) {
        await this.chatService.sendMessage(conv.id, userId, '❌ Booking request declined.');
      }
    } catch { /* non-fatal */ }

    return result;
  }

  private computeWalletPricing(publicTotal: number, commissionRate: number) {
    const platformMargin = +(publicTotal * commissionRate).toFixed(2);
    const walletDiscount = +(platformMargin * 0.5).toFixed(2);
    const walletTotal = +(publicTotal - walletDiscount).toFixed(2);
    return { walletDiscount, walletTotal };
  }

  async pay(
    id: string,
    payBookingDto: PayBookingDto,
    userId: string,
  ): Promise<Booking> {

    // First, do authorization sanity checks outside transaction to fail fast
    const bookingCheck = await this.prisma.booking.findUnique({ where: { id } });
    if (!bookingCheck) throw new NotFoundException(`Booking with ID ${id} not found`);
    if (bookingCheck.renterId !== userId) {
      throw new ForbiddenException('Only the renter can pay for this booking');
    }

    // Capture payment OUTSIDE the booking transaction to prevent deadlock
    // since paymentsService.capture opens its own transaction that reads the booking
    let paymentIntent = await this.paymentsService.findByBooking(id);
    if (!paymentIntent) {
      throw new BadRequestException('Payment intent not found. Please authorize payment first.');
    }
    if (paymentIntent.status === 'cancelled') {
      throw new BadRequestException('Cannot pay booking: Payment intent has been cancelled.');
    }

    if (payBookingDto.useWallet) {
      if (paymentIntent.status === 'created') {
        // Automatically authorize for wallet (stamps metadata.method = 'wallet')
        paymentIntent = await this.paymentsService.authorize(id, userId, { method: 'wallet' });
      }

      if (paymentIntent.status === 'authorized') {
        const commissionRate = bookingCheck.snapshotCommissionRate
          ? Number(bookingCheck.snapshotCommissionRate)
          : this.commissionPercentage;
        const { walletTotal } = this.computeWalletPricing(Number(paymentIntent.amount), commissionRate);

        await this.prisma.$transaction(async (tx) => {
          await this.walletService.payForBooking(userId, id, walletTotal, tx);
        });

        try {
          await this.paymentsService.captureWalletPayment(id, walletTotal, commissionRate);
        } catch (captureErr) {
          this.logger.error(
            `[WALLET PAY] Capture failed after wallet debit for booking ${id}. ` +
            `Manual wallet reconciliation may be required.`,
            captureErr,
          );
          throw captureErr;
        }

        paymentIntent = await this.paymentsService.findByBooking(id);
      }
    } else {
      if (paymentIntent.status === 'created') {
        throw new BadRequestException('Payment must be authorized before booking can be paid.');
      }

      if (paymentIntent.status === 'authorized') {
        await this.paymentsService.capture(id);
        paymentIntent = await this.paymentsService.findByBooking(id);
      }
    }

    if (paymentIntent?.status !== 'captured') {
      throw new ConflictException('Payment must be captured before booking can be marked as paid.');
    }

    // Now safely update the booking inside its own transaction
    return await this.prisma.$transaction(async (tx) => {
      // Reload booking with lock to get latest state
      const bookings = await tx.$queryRaw<Booking[]>`
        SELECT * FROM bookings
        WHERE id::text = ${id}
        FOR UPDATE
      `;

      if (!bookings || bookings.length === 0) {
        throw new NotFoundException(`Booking with ID ${id} not found`);
      }

      const booking = bookings[0];

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

      // Update to PAID status and set paid flag
      // Stamp method='wallet' when useWallet=true for full audit trail
      const updated = await tx.booking.update({
        where: { id },
        data: {
          status: 'paid',
          paid: true,
          paymentInfo: {
            paymentIntentId: paymentIntent.id,
            paymentToken: payBookingDto.paymentToken,
            receipt: payBookingDto.receipt,
            paidAt: new Date().toISOString(),
            method: payBookingDto.useWallet ? 'wallet' : 'simulated',
          } as any,
        },
      });
      return withDisplay(updated);
    }).then((result) => {
      this.notifications.create({
        userId: (result as any).hostId,
        kind: 'BOOKING_PAID',
        title: 'Booking confirmed — payment received',
        body: 'Get ready for your renter.',
        link: '/host/bookings',
        payload: { bookingId: (result as any).id },
      });
      return result;
    });
  }

  /**
   * Marks a booking as paid after a provider webhook confirms payment server-side.
   * No renter auth check — only called from trusted internal webhook handlers.
   * Idempotent: if already paid, returns silently.
   */
  async markPaidByProvider(
    bookingId: string,
    provider: string,
    paymentIntentId: string,
  ): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const bookings = await tx.$queryRaw<Booking[]>`
        SELECT * FROM bookings WHERE id::text = ${bookingId} FOR UPDATE
      `;
      if (!bookings.length) {
        throw new NotFoundException(`Booking ${bookingId} not found`);
      }
      const booking = bookings[0];

      if (booking.status === 'paid' && booking.paid) return; // already done — idempotent

      if (!BookingStateMachine.canPay(booking.status as any, booking.paid)) {
        throw new BadRequestException(
          `Cannot mark booking ${bookingId} as paid via provider: ` +
          `status is ${booking.status}. Booking must be confirmed.`,
        );
      }

      await tx.booking.update({
        where: { id: bookingId },
        data: {
          status: 'paid',
          paid: true,
          paymentInfo: {
            paymentIntentId,
            paidAt: new Date().toISOString(),
            method: provider,
          } as any,
        },
      });
    });
  }

  async cancel(id: string, userId: string): Promise<Booking> {
    // ── Phase 1: Load booking outside any transaction (read-only) ────────────
    const booking = await this.prisma.booking.findUnique({
      where: { id },
      include: { listing: { select: { cancellationPolicy: true } } },
    });
    if (!booking) {
      throw new NotFoundException(`Booking with ID ${id} not found`);
    }

    // Authorization check
    if (booking.renterId !== userId && booking.hostId !== userId) {
      throw new ForbiddenException('Only the renter or host can cancel this booking');
    }

    // Idempotent check: if already cancelled, return early
    if (booking.status === 'cancelled') {
      return withDisplay(booking);
    }

    // Determine actor
    const actor = booking.renterId === userId ? 'RENTER' : 'HOST';

    // Get payment intent to check payment status
    const paymentIntent = await this.paymentsService.findByBooking(id);

    // Evaluate cancellation policy — pulls the listing's host-chosen
    // FLEXIBLE/MODERATE/STRICT policy through to the refund math.
    const decision = this.cancellationPolicyService.evaluateCancellation({
      actor,
      bookingStatus: booking.status as any,
      paymentStatus: (paymentIntent?.status || 'created') as any,
      startDate: new Date(booking.startDate),
      endDate: new Date(booking.endDate),
      totalPrice: Number(booking.totalPrice),
      now: new Date(),
      policy: (booking as any).listing?.cancellationPolicy ?? 'MODERATE',
    });

    // Policy validation
    if (!decision.allowCancel) {
      throw new BadRequestException(decision.reason);
    }

    // State machine validation
    BookingStateMachine.validateTransition(
      booking.status as any,
      'cancelled' as any,
      'cancel booking',
    );

    // ── Phase 2: Process refund OUTSIDE the main transaction ─────────────────
    // paymentsService.refund() opens its own $transaction with FOR UPDATE on
    // payment_intents. Calling it inside the booking transaction would cause
    // a Postgres deadlock (nested transaction row-lock contention).
    if (
      decision.refundType !== 'NONE' &&
      decision.refundAmount > 0 &&
      paymentIntent &&
      paymentIntent.status === 'captured'
    ) {
      await this.paymentsService.refund(id);
    }

    // ── Phase 3: Wallet refund + booking status update in one transaction ────
    return await this.prisma.$transaction(async (tx) => {
      // Re-read booking with lock to get fresh state
      const bookings = await tx.$queryRaw<Booking[]>`
        SELECT * FROM bookings
        WHERE id::text = ${id}
        FOR UPDATE
      `;

      if (!bookings || bookings.length === 0) {
        throw new NotFoundException(`Booking with ID ${id} not found`);
      }

      const freshBooking = bookings[0];

      // Idempotent: could have been cancelled concurrently
      if (freshBooking.status === 'cancelled') {
        return withDisplay(freshBooking);
      }

      // If funded by wallet and refund was processed, return funds to wallet balance
      if (
        decision.refundType !== 'NONE' &&
        decision.refundAmount > 0 &&
        paymentIntent?.status === 'captured' &&
        (paymentIntent.metadata as any)?.method === 'wallet'
      ) {
        await this.walletService.refundToWallet(
          booking.renterId,
          id,
          decision.refundAmount,
          tx,
        );
      }

      // Update booking status
      const updated = await tx.booking.update({
        where: { id },
        data: { status: 'cancelled' },
      });
      return withDisplay(updated);
    }).then((result) => {
      // Cancellation rate / late-cancel count are renter-trust inputs.
      // Best-effort; never block the cancel response on a scoring miss.
      this.qualityScore.recomputeRenter(booking.renterId).catch(() => undefined);

      // Notify the counter-party who didn't trigger this cancel.
      const cancelledBy = userId;
      const otherUserId =
        cancelledBy === booking.renterId ? booking.hostId : booking.renterId;
      this.notifications.create({
        userId: otherUserId,
        kind: 'BOOKING_CANCELLED',
        title: 'Booking cancelled',
        body:
          cancelledBy === booking.renterId
            ? 'The renter cancelled this booking.'
            : 'The host cancelled this booking. Any refund will be processed automatically.',
        link: cancelledBy === booking.renterId ? '/host/bookings' : '/rentals',
        payload: { bookingId: (result as any).id },
      });
      return result;
    });
  }

  async complete(id: string, userId: string): Promise<Booking> {
    return await this.prisma.$transaction(async (tx) => {
      const bookings = await tx.$queryRaw<Booking[]>`
        SELECT * FROM bookings
        WHERE id::text = ${id}
        FOR UPDATE
      `;

      if (!bookings || bookings.length === 0) {
        throw new NotFoundException(`Booking with ID ${id} not found`);
      }

      const booking = bookings[0];

      // Allow either host or renter to complete
      if (booking.renterId !== userId && booking.hostId !== userId) {
        throw new ForbiddenException('Not authorized to complete this booking');
      }

      if (booking.status === 'completed') {
        return withDisplay(booking);
      }

      if (booking.status !== 'paid') {
        throw new BadRequestException('Booking must be paid before it can be completed');
      }

      // Transition to completed
      const updated = await tx.booking.update({
        where: { id },
        data: { status: 'completed' },
      });

      return withDisplay(updated);
    }).then((result) => {
      // Completed-bookings count is a positive signal on renter trust + host quality.
      this.qualityScore.recomputeRenter((result as any).renterId).catch(() => undefined);
      this.qualityScore.recomputeHost((result as any).hostId).catch(() => undefined);

      // Both sides get a "please leave a review" nudge.
      const r = result as any;
      this.notifications.create({
        userId: r.renterId,
        kind: 'BOOKING_COMPLETED',
        title: 'Trip complete — leave a review',
        body: 'A 30-second review helps the next renter pick the right listing.',
        link: '/profile',
        payload: { bookingId: r.id },
      });
      this.notifications.create({
        userId: r.hostId,
        kind: 'BOOKING_COMPLETED',
        title: 'Booking complete — review your renter',
        body: 'Help other hosts know what to expect.',
        link: '/profile',
        payload: { bookingId: r.id },
      });
      return result;
    });
  }

  private async createSlotBooking(
    createBookingDto: CreateBookingDto,
    renterId: string,
    listing: any,
    startDate: Date,
  ): Promise<any> {
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

    const dayOfWeek = startDate
      .toLocaleDateString('en-US', { weekday: 'long' })
      .toLowerCase();
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

    // Check availability BEFORE opening the transaction
    // (checkSlotAvailability uses this.prisma which would deadlock inside $transaction)
    const isAvailable = await this.availabilityService.checkSlotAvailability(
      listing.id,
      startDate,
      createBookingDto.startTime,
      createBookingDto.endTime,
    );

    if (!isAvailable) {
      throw new ConflictException('This time slot is not available');
    }

    // Prisma @db.Time fields require Date objects (not HH:mm strings)
    const toTimeDate = (t: string): Date => {
      const [h, m] = t.split(':').map(Number);
      const d = new Date(0); // epoch date
      d.setUTCHours(h, m, 0, 0);
      return d;
    };
    const startTimeDate = toTimeDate(createBookingDto.startTime);
    const endTimeDate = toTimeDate(createBookingDto.endTime);

    const booking = await this.prisma.$transaction(async (tx) => {
      const newBooking = await tx.booking.create({
        data: {
          listingId: createBookingDto.listingId,
          renterId,
          hostId: listing.hostId,
          startDate,
          endDate: startDate,
          startTime: startTimeDate,
          endTime: endTimeDate,
          totalPrice,
          commission,
          status: 'pending',
          paid: false,
          // Immutable snapshot — never updated after creation
          snapshotTitle: listing.title,
          snapshotPricePerDay: Number(listing.pricePerDay),
          snapshotCommissionRate: this.commissionPercentage,
          snapshotCurrency: 'TND',
        },
      });

      return newBooking;
    });

    // Create payment intent AFTER transaction commits so the booking row is visible
    try {
      await this.paymentsService.createForBooking(booking.id);
    } catch (_e) {
      // Non-fatal — payment intent can be created lazily
    }

    // Auto-create chat conversation for this slot booking
    let conversationId: string | null = null;
    try {
      const conversation = await this.chatService.getOrCreateConversation(
        renterId,
        listing.hostId,
        booking.id,
        listing.id,
      );
      conversationId = conversation.id;

      // Always send an auto-generated booking summary (Airbnb-style rich card)
      const autoMsg = this.buildBookingAutoMessage({
        listingId: listing.id,
        listingTitle: listing.title,
        listingImage: (listing.images ?? [])[0] ?? null,
        categoryName: (listing as any).category?.name ?? null,
        bookingId: booking.id,
        startDate,
        endDate: startDate,
        totalPrice: Number(booking.totalPrice),
        isSlot: true,
        startTime: createBookingDto.startTime,
        endTime: createBookingDto.endTime,
      });
      await this.chatService.sendMessage(conversation.id, renterId, autoMsg);

      // Then the renter's optional personal note
      if (createBookingDto.message) {
        await this.chatService.sendMessage(
          conversation.id,
          renterId,
          createBookingDto.message,
        );
      }
    } catch (_e) {
      // Non-fatal
    }

    // Strongest personalization signal — renter took action and committed money.
    void this.personalization.recordInteraction(renterId, listing.id, 'BOOKING');

    return { ...withDisplay(booking), conversationId };
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



  private buildBookingAutoMessage(params: {
    listingId: string;
    listingTitle: string;
    listingImage: string | null;
    categoryName: string | null;
    bookingId: string;
    startDate: Date;
    endDate: Date;
    totalPrice: number;
    isSlot: boolean;
    startTime?: string;
    endTime?: string;
  }): string {
    const fmt = (d: Date) =>
      d.toLocaleDateString('en-GB', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      });

    if (params.isSlot) {
      return JSON.stringify({
        type: 'BOOKING_CARD',
        listingId: params.listingId,
        listingTitle: params.listingTitle,
        listingImage: params.listingImage,
        categoryName: params.categoryName,
        bookingId: params.bookingId,
        dateLabel: `${fmt(params.startDate)} · ${params.startTime ?? ''} — ${params.endTime ?? ''}`,
        nightsLabel: null,
        totalPrice: params.totalPrice,
        currency: 'TND',
      });
    }

    const nights = Math.round(
      (params.endDate.getTime() - params.startDate.getTime()) /
        (1000 * 60 * 60 * 24),
    );

    return JSON.stringify({
      type: 'BOOKING_CARD',
      listingId: params.listingId,
      listingTitle: params.listingTitle,
      listingImage: params.listingImage,
      categoryName: params.categoryName,
      bookingId: params.bookingId,
      dateLabel: `${fmt(params.startDate)} → ${fmt(params.endDate)}`,
      nightsLabel: `${nights} night${nights !== 1 ? 's' : ''}`,
      totalPrice: params.totalPrice,
      currency: 'TND',
    });
  }
}
