import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { CreateReviewDto } from './dto/create-review.dto';

@Injectable()
export class ReviewsService {
  constructor(private prisma: PrismaService) {}

  async create(dto: CreateReviewDto, authorId: string) {
    const booking = await this.prisma.booking.findUnique({
      where: { id: dto.bookingId },
      select: {
        id: true,
        renterId: true,
        hostId: true,
        listingId: true,
        status: true,
        endDate: true,
      },
    });
    if (!booking) throw new NotFoundException('Booking not found');

    const isRenter = booking.renterId === authorId;
    const isHost = booking.hostId === authorId;
    if (!isRenter && !isHost) {
      throw new ForbiddenException('Only booking participants can leave a review');
    }

    // Eligibility: completed, or paid with endDate in the past
    const now = new Date();
    const endDate = new Date(booking.endDate);
    const eligible =
      booking.status === 'completed' ||
      (booking.status === 'paid' && endDate < now);
    if (!eligible) {
      throw new BadRequestException(
        'Reviews are only allowed after the booking is completed or after the rental period has ended',
      );
    }

    // Duplicate check (enforced by DB unique too, but give a clear message)
    const existing = await this.prisma.review.findUnique({
      where: { bookingId_authorId: { bookingId: dto.bookingId, authorId } },
    });
    if (existing) {
      throw new BadRequestException('You have already reviewed this booking');
    }

    const type = isRenter ? 'RENTER_TO_HOST' : 'HOST_TO_RENTER';
    const targetUserId = isRenter ? booking.hostId : booking.renterId;

    const review = await this.prisma.review.create({
      data: {
        bookingId: dto.bookingId,
        authorId,
        targetUserId,
        listingId: booking.listingId,
        type: type as any,
        rating: dto.rating,
        comment: dto.comment,
      },
      include: {
        author: { select: { id: true, name: true, avatarUrl: true } },
      },
    });

    await this.recalcUserRating(targetUserId);

    if (isRenter) {
      await this.recalcListingRating(booking.listingId);
    }

    return review;
  }

  /**
   * Bookings the current user can still review.
   * Completed bookings (or paid bookings whose end date has passed) where the
   * user is either the renter or the host AND has not yet posted a review.
   */
  async findPendingForUser(userId: string) {
    const now = new Date();
    const eligible = await this.prisma.booking.findMany({
      where: {
        AND: [
          { OR: [{ renterId: userId }, { hostId: userId }] },
          {
            OR: [
              { status: 'completed' },
              { status: 'paid', endDate: { lt: now } },
            ],
          },
        ],
      },
      include: {
        listing: { select: { id: true, title: true, images: true } },
        renter: { select: { id: true, name: true } },
        host: { select: { id: true, name: true } },
      },
    });
    if (eligible.length === 0) return [];

    const existingReviews = await this.prisma.review.findMany({
      where: {
        bookingId: { in: eligible.map((b) => b.id) },
        authorId: userId,
      },
      select: { bookingId: true },
    });
    const reviewedIds = new Set(existingReviews.map((r) => r.bookingId));

    return eligible
      .filter((b) => !reviewedIds.has(b.id))
      .map((b: any) => {
      const isRenter = b.renterId === userId;
      return {
        bookingId: b.id,
        listing: {
          id: b.listing?.id,
          title: b.listing?.title,
          images: b.listing?.images ?? [],
        },
        counterparty: isRenter
          ? { id: b.host?.id, name: b.host?.name ?? 'Host' }
          : { id: b.renter?.id, name: b.renter?.name ?? 'Renter' },
        myRole: isRenter ? 'RENTER' : 'HOST',
      };
    });
  }

  async findByListing(listingId: string) {
    const listing = await this.prisma.listing.findUnique({ where: { id: listingId }, select: { id: true } });
    if (!listing) throw new NotFoundException('Listing not found');

    return this.prisma.review.findMany({
      where: { listingId, type: 'RENTER_TO_HOST' as any },
      include: {
        author: { select: { id: true, name: true, avatarUrl: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findByUser(userId: string) {
    return this.prisma.review.findMany({
      where: { targetUserId: userId },
      include: {
        author: { select: { id: true, name: true, avatarUrl: true } },
        listing: { select: { id: true, title: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findByBooking(bookingId: string) {
    return this.prisma.review.findMany({
      where: { bookingId },
      include: {
        author: { select: { id: true, name: true, avatarUrl: true } },
      },
    });
  }

  async findOne(id: string) {
    const review = await this.prisma.review.findUnique({
      where: { id },
      include: {
        author: { select: { id: true, name: true, avatarUrl: true } },
        targetUser: { select: { id: true, name: true, avatarUrl: true } },
        listing: { select: { id: true, title: true } },
        booking: { select: { id: true, status: true } },
      },
    });
    if (!review) throw new NotFoundException(`Review ${id} not found`);
    return review;
  }

  private async recalcUserRating(userId: string) {
    const result = await this.prisma.review.aggregate({
      where: { targetUserId: userId },
      _avg: { rating: true },
      _count: { id: true },
    });
    await this.prisma.user.update({
      where: { id: userId },
      data: {
        ratingAvg: +(result._avg.rating ?? 0).toFixed(2),
        ratingCount: result._count.id,
      },
    });
  }

  private async recalcListingRating(listingId: string) {
    const result = await this.prisma.review.aggregate({
      where: { listingId, type: 'RENTER_TO_HOST' as any },
      _avg: { rating: true },
    });
    await this.prisma.listing.update({
      where: { id: listingId },
      data: { ratingAvg: +(result._avg.rating ?? 0).toFixed(2) },
    });
  }
}
