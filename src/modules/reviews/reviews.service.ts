import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { Review } from '@prisma/client';
import { CreateReviewDto } from './dto/create-review.dto';
import { BookingsService } from '../bookings/bookings.service';
import { UsersService } from '../users/users.service';

@Injectable()
export class ReviewsService {
  constructor(
    private prisma: PrismaService,
    private bookingsService: BookingsService,
    private usersService: UsersService,
  ) {}

  async create(
    createReviewDto: CreateReviewDto,
    authorId: string,
  ): Promise<Review> {
    const booking = await this.bookingsService.findOne(
      createReviewDto.bookingId,
    );

    if (booking.renterId !== authorId) {
      throw new ForbiddenException('Only the renter can review this booking');
    }

    if (booking.status !== 'completed') {
      throw new BadRequestException('Can only review completed bookings');
    }

    // Check if review already exists
    const existingReview = await this.prisma.review.findUnique({
      where: { bookingId: createReviewDto.bookingId },
    });
    if (existingReview) {
      throw new BadRequestException('Review already exists for this booking');
    }

    const review = await this.prisma.review.create({
      data: {
        ...createReviewDto,
        authorId,
        targetUserId: booking.hostId,
        listingId: booking.listingId,
      },
    });

    // Update target user rating
    await this.updateUserRating(booking.hostId);

    return review;
  }

  async findByUser(userId: string): Promise<Review[]> {
    return this.prisma.review.findMany({
      where: { targetUserId: userId },
      include: {
        author: true,
        listing: true,
      },
      orderBy: {
        createdAt: 'desc',
      },
    });
  }

  async findOne(id: string): Promise<Review> {
    const review = await this.prisma.review.findUnique({
      where: { id },
      include: {
        author: true,
        targetUser: true,
        listing: true,
        booking: true,
      },
    });
    if (!review) {
      throw new NotFoundException(`Review with ID ${id} not found`);
    }
    return review;
  }

  private async updateUserRating(userId: string): Promise<void> {
    const reviews = await this.prisma.review.findMany({
      where: { targetUserId: userId },
    });

    if (reviews.length > 0) {
      const totalRating = reviews.reduce(
        (sum, review) => sum + review.rating,
        0,
      );
      const averageRating = totalRating / reviews.length;
      const roundedRating = Math.round(averageRating * 100) / 100;

      await this.usersService.update(userId, {
        ratingAvg: roundedRating,
        ratingCount: reviews.length,
      } as any);
    }
  }
}
