import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Review } from '../../entities/review.entity';
import { CreateReviewDto } from './dto/create-review.dto';
import { BookingsService } from '../bookings/bookings.service';
import { BookingStatus } from '../../entities/booking.entity';
import { UsersService } from '../users/users.service';

@Injectable()
export class ReviewsService {
  constructor(
    @InjectRepository(Review)
    private reviewsRepository: Repository<Review>,
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

    if (booking.status !== BookingStatus.COMPLETED) {
      throw new BadRequestException('Can only review completed bookings');
    }

    // Check if review already exists
    const existingReview = await this.reviewsRepository.findOne({
      where: { bookingId: createReviewDto.bookingId },
    });
    if (existingReview) {
      throw new BadRequestException('Review already exists for this booking');
    }

    const review = this.reviewsRepository.create({
      ...createReviewDto,
      authorId,
      targetUserId: booking.hostId,
      listingId: booking.listingId,
    });

    const savedReview = await this.reviewsRepository.save(review);

    // Update target user rating
    await this.updateUserRating(booking.hostId);

    return savedReview;
  }

  async findByUser(userId: string): Promise<Review[]> {
    return this.reviewsRepository.find({
      where: { targetUserId: userId },
      relations: ['author', 'listing'],
      order: { createdAt: 'DESC' },
    });
  }

  async findOne(id: string): Promise<Review> {
    const review = await this.reviewsRepository.findOne({
      where: { id },
      relations: ['author', 'targetUser', 'listing', 'booking'],
    });
    if (!review) {
      throw new NotFoundException(`Review with ID ${id} not found`);
    }
    return review;
  }

  private async updateUserRating(userId: string): Promise<void> {
    const reviews = await this.reviewsRepository
      .createQueryBuilder('review')
      .where('review.targetUserId = :userId', { userId })
      .getMany();

    if (reviews.length > 0) {
      const totalRating = reviews.reduce(
        (sum, review) => sum + review.rating,
        0,
      );
      const averageRating = totalRating / reviews.length;
      const roundedRating = Math.round(averageRating * 100) / 100;

      const user = await this.usersService.findOne(userId);
      user.ratingAvg = roundedRating;
      user.ratingCount = reviews.length;
      await this.usersService.update(userId, {
        ratingAvg: roundedRating,
        ratingCount: reviews.length,
      } as any);
    }
  }
}
