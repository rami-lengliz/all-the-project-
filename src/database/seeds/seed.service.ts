import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { User } from '../../entities/user.entity';
import { Category } from '../../entities/category.entity';
import { Listing } from '../../entities/listing.entity';
import { Booking, BookingStatus } from '../../entities/booking.entity';
import { Review } from '../../entities/review.entity';
import * as bcrypt from 'bcrypt';
import { Point } from 'geojson';

@Injectable()
export class SeedService {
  constructor(
    @InjectRepository(User)
    private userRepository: Repository<User>,
    @InjectRepository(Category)
    private categoryRepository: Repository<Category>,
    @InjectRepository(Listing)
    private listingRepository: Repository<Listing>,
    @InjectRepository(Booking)
    private bookingRepository: Repository<Booking>,
    @InjectRepository(Review)
    private reviewRepository: Repository<Review>,
    private dataSource: DataSource,
  ) {}

  async seed() {
    // Enable PostGIS
    await this.dataSource.query('CREATE EXTENSION IF NOT EXISTS postgis;');

    // Clear existing data
    console.log('Clearing existing data...');
    await this.reviewRepository.delete({});
    await this.bookingRepository.delete({});
    await this.listingRepository.delete({});
    await this.categoryRepository.delete({});
    await this.userRepository.delete({});

    // Create categories
    console.log('Creating categories...');
    const categories = [
      {
        name: 'Lodging',
        slug: 'lodging',
        icon: '🏠',
        allowed_for_private: true,
      },
      {
        name: 'Mobility',
        slug: 'mobility',
        icon: '🚗',
        allowed_for_private: true,
      },
      {
        name: 'Sports Equipment',
        slug: 'sports_equipment',
        icon: '⚽',
        allowed_for_private: true,
      },
      { name: 'Tools', slug: 'tools', icon: '🔧', allowed_for_private: true },
      { name: 'Other', slug: 'other', icon: '📦', allowed_for_private: true },
    ];

    const savedCategories = await this.categoryRepository.save(
      categories.map((cat) => this.categoryRepository.create(cat)),
    );
    console.log(`Created ${savedCategories.length} categories`);

    // Create users
    console.log('Creating users...');
    const hashedPassword = await bcrypt.hash('password123', 10);
    const users = [];

    for (let i = 1; i <= 10; i++) {
      const isHost = i <= 5;
      const userData: any = {
        name: `User ${i}`,
        email: `user${i}@example.com`,
        phone: `+216${String(90000000 + i).padStart(8, '0')}`,
        passwordHash: hashedPassword,
        isHost,
        verifiedEmail: true,
        verifiedPhone: i % 2 === 0,
        ratingAvg: isHost ? Math.random() * 2 + 3 : 0,
        ratingCount: isHost ? Math.floor(Math.random() * 10) : 0,
        roles: i === 1 ? ['user', 'admin'] : ['user'],
      };
      users.push(this.userRepository.create(userData));
    }

    const savedUsers = await this.userRepository.save(users);
    console.log(`Created ${savedUsers.length} users`);

    // Kelibia coordinates
    const KELIBIA_LAT = 36.8578;
    const KELIBIA_LNG = 11.092;

    // Create listings
    console.log('Creating listings...');
    const hosts = savedUsers.filter((u) => u.isHost);

    // Generate 20 listings
    const allListings = [];
    for (let i = 0; i < 20; i++) {
      const category = savedCategories[i % savedCategories.length];
      const host = hosts[i % hosts.length];
      const offset = (i * 0.015) % 0.1;

      const location: Point = {
        type: 'Point',
        coordinates: [KELIBIA_LNG + offset, KELIBIA_LAT + offset],
      };

      const listing = this.listingRepository.create({
        title: `Listing ${i + 1}`,
        description: `Description for listing ${i + 1}`,
        pricePerDay: 20 + i * 5,
        location,
        address: `${i + 1} Street, Kelibia`,
        categoryId: category.id,
        hostId: host.id,
        images: [`/uploads/placeholder-${i + 1}.jpg`],
        isActive: true,
      });

      allListings.push(listing);
    }

    const savedListings = await this.listingRepository.save(allListings);
    console.log(`Created ${savedListings.length} listings`);

    // Create bookings
    console.log('Creating bookings...');
    const renters = savedUsers.filter((u) => !u.isHost);
    const bookings = [];

    for (let i = 0; i < 10; i++) {
      const listing = savedListings[i % savedListings.length];
      const renter = renters[i % renters.length];

      if (listing.hostId === renter.id) continue;

      const startDate = new Date();
      startDate.setDate(startDate.getDate() + i * 7);
      const endDate = new Date(startDate);
      endDate.setDate(endDate.getDate() + 3);

      const days = Math.ceil(
        (endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24),
      );
      const totalPrice = listing.pricePerDay * days;
      const commission = totalPrice * 0.1;

      const booking = this.bookingRepository.create({
        startDate,
        endDate,
        status:
          i % 3 === 0
            ? BookingStatus.CONFIRMED
            : i % 3 === 1
              ? BookingStatus.PENDING
              : BookingStatus.COMPLETED,
        renterId: renter.id,
        hostId: listing.hostId,
        listingId: listing.id,
        totalPrice,
        commission,
        paid: i % 2 === 0,
      });

      bookings.push(await this.bookingRepository.save(booking));
    }
    console.log(`Created ${bookings.length} bookings`);

    // Create reviews
    console.log('Creating reviews...');
    const completedBookings = bookings.filter(
      (b) => b.status === BookingStatus.COMPLETED,
    );

    for (const booking of completedBookings.slice(0, 5)) {
      const review = this.reviewRepository.create({
        rating: Math.floor(Math.random() * 3) + 3,
        comment: `Great experience with ${booking.listing.title}!`,
        authorId: booking.renterId,
        targetUserId: booking.hostId,
        listingId: booking.listingId,
        bookingId: booking.id,
      });

      await this.reviewRepository.save(review);
    }
    console.log(`Created ${completedBookings.length} reviews`);

    console.log('Seed completed successfully!');
  }
}
