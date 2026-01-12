import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { Booking, BookingStatus } from '../../entities/booking.entity';
import { CreateBookingDto } from './dto/create-booking.dto';
import { PayBookingDto } from './dto/pay-booking.dto';
import { ListingsService } from '../listings/listings.service';
import { ConfigService } from '@nestjs/config';
import { AvailabilityUtil } from '../../common/utils/availability.util';

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
  ) {
    this.commissionPercentage = this.configService.get<number>('commission.percentage') || 0.10;
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
      // Check for overlapping bookings with FOR UPDATE lock
      const overlappingBooking = await manager
        .createQueryBuilder(Booking, 'booking')
        .setLock('pessimistic_write')
        .where('booking.listingId = :listingId', {
          listingId: createBookingDto.listingId,
        })
        .andWhere('booking.status IN (:...statuses)', {
          statuses: [BookingStatus.CONFIRMED, BookingStatus.PENDING],
        })
        .andWhere(
          'NOT (booking.endDate <= :startDate OR booking.startDate >= :endDate)',
          {
            startDate,
            endDate,
          },
        )
        .getOne();

      if (overlappingBooking) {
        throw new BadRequestException(
          'This listing is already booked for the selected dates',
        );
      }

      // Double-check using availability utility
      const isAvailable = await this.availabilityUtil.isDateRangeAvailable(
        createBookingDto.listingId,
        startDate,
        endDate,
      );

      if (!isAvailable) {
        throw new BadRequestException(
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
      });

      return manager.save(booking);
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
    const booking = await this.findOne(id);
    if (booking.hostId !== userId) {
      throw new ForbiddenException(
        'Only the listing host can confirm bookings',
      );
    }
    if (booking.status !== BookingStatus.PENDING) {
      throw new BadRequestException('Only pending bookings can be confirmed');
    }

    // Double-check for overlaps in transaction
    return await this.dataSource.transaction(async (manager) => {
      const overlappingBooking = await manager
        .createQueryBuilder(Booking, 'b')
        .setLock('pessimistic_write')
        .where('b.listingId = :listingId', { listingId: booking.listingId })
        .andWhere('b.id != :bookingId', { bookingId: id })
        .andWhere('b.status = :status', { status: BookingStatus.CONFIRMED })
        .andWhere(
          'NOT (b.endDate <= :endDate OR b.startDate >= :startDate)',
          {
            startDate: booking.startDate,
            endDate: booking.endDate,
          },
        )
        .getOne();

      if (overlappingBooking) {
        throw new BadRequestException(
          'Cannot confirm: Another booking overlaps with these dates',
        );
      }

      booking.status = BookingStatus.CONFIRMED;
      return manager.save(booking);
    });
  }

  async pay(id: string, payBookingDto: PayBookingDto, userId: string): Promise<Booking> {
    const booking = await this.findOne(id);
    if (booking.renterId !== userId) {
      throw new ForbiddenException('Only the renter can pay for this booking');
    }
    if (booking.paid) {
      throw new BadRequestException('Booking is already paid');
    }

    // TODO: Integrate with payment gateway
    // For now, simulate payment
    booking.paid = true;
    booking.paymentInfo = {
      paymentToken: payBookingDto.paymentToken,
      receipt: payBookingDto.receipt,
      paidAt: new Date().toISOString(),
      method: 'simulated', // In production, use actual payment method
    };

    return this.bookingsRepository.save(booking);
  }

  async cancel(id: string, userId: string): Promise<Booking> {
    const booking = await this.findOne(id);
    if (
      booking.renterId !== userId &&
      booking.hostId !== userId
    ) {
      throw new ForbiddenException(
        'Only the renter or host can cancel this booking',
      );
    }
    if (booking.status === BookingStatus.CANCELLED) {
      throw new BadRequestException('Booking is already cancelled');
    }
    if (booking.status === BookingStatus.COMPLETED) {
      throw new BadRequestException('Cannot cancel a completed booking');
    }

    booking.status = BookingStatus.CANCELLED;
    return this.bookingsRepository.save(booking);
  }
}
