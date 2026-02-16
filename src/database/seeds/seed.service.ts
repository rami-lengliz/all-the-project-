import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';

@Injectable()
export class SeedService {
  constructor(private prisma: PrismaService) {}

  async seed() {
    console.log('Starting seed proces...');

    // Clear existing data (in correct order due to foreign key constraints)
    console.log('Clearing existing data...');
    await this.prisma.message.deleteMany({});
    await this.prisma.conversation.deleteMany({});
    await this.prisma.review.deleteMany({});
    await this.prisma.paymentIntent.deleteMany({});
    await this.prisma.booking.deleteMany({});
    await this.prisma.adminLog.deleteMany({});
    await this.prisma.slotConfiguration.deleteMany({});
    await this.prisma.listing.deleteMany({});
    await this.prisma.category.deleteMany({});
    await this.prisma.user.deleteMany({});

    // Create categories
    console.log('Creating categories...');
    const categories = [
      {
        name: 'Accommodation',
        slug: 'accommodation',
        icon: '🏠',
        allowedForPrivate: true,
      },
      {
        name: 'Mobility',
        slug: 'mobility',
        icon: '🚗',
        allowedForPrivate: true,
      },
      {
        name: 'Water & Beach Activities',
        slug: 'water-beach-activities',
        icon: '🏖️',
        allowedForPrivate: true,
      },
      {
        name: 'Sports Facilities',
        slug: 'sports-facilities',
        icon: '🏟️',
        allowedForPrivate: true,
      },
      {
        name: 'Sports Equipment',
        slug: 'sports-equipment',
        icon: '⚽',
        allowedForPrivate: true,
      },
      { name: 'Tools', slug: 'tools', icon: '🔧', allowedForPrivate: true },
      { name: 'Other', slug: 'other', icon: '📦', allowedForPrivate: true },
    ];

    const savedCategories = await Promise.all(
      categories.map((cat) => this.prisma.category.create({ data: cat })),
    );
    console.log(`Created ${savedCategories.length} categories`);

    // Create users
    console.log('Creating users...');
    const hashedPassword = await bcrypt.hash('password123', 10);
    const savedUsers = [];

    for (let i = 1; i <= 10; i++) {
      const isHost = i <= 5;
      const user = await this.prisma.user.create({
        data: {
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
        },
      });
      savedUsers.push(user);
    }
    console.log(`Created ${savedUsers.length} users`);

    // Kelibia coordinates
    const KELIBIA_LAT = 36.8578;
    const KELIBIA_LNG = 11.092;

    // Create listings
    console.log('Creating listings...');
    const hosts = savedUsers.filter((u) => u.isHost);
    const savedListings = [];

    // Generate 20 listings
    for (let i = 0; i < 20; i++) {
      const category = savedCategories[i % savedCategories.length];
      const host = hosts[i % hosts.length];
      const offset = (i * 0.015) % 0.1;

      const lat = KELIBIA_LAT + offset;
      const lng = KELIBIA_LNG + offset;
      const locationWKT = `POINT(${lng} ${lat})`;

      // Generate UUID in Node.js for portability (no pgcrypto extension needed)
      const newListingId = crypto.randomUUID();

      // Use $executeRaw to insert with PostGIS geometry
      await this.prisma.$executeRaw`
        INSERT INTO listings (
          id, title, description, "pricePerDay", location, address,
          "categoryId", "hostId", images, "isActive", "createdAt", "updatedAt"
        )
        VALUES (
          ${newListingId}::uuid,
          ${`Listing ${i + 1}`},
          ${`Description for listing ${i + 1}`},
          ${20 + i * 5},
          ST_SetSRID(ST_GeomFromText(${locationWKT}), 4326),
          ${`${i + 1} Street, Kelibia`},
          ${category.id}::uuid,
          ${host.id}::uuid,
          ARRAY['/uploads/placeholder-${i + 1}.jpg']::TEXT[],
          true,
          NOW(),
          NOW()
        )
      `;

      // Fetch the created listing
      const listing = await this.prisma.listing.findUnique({
        where: { id: newListingId },
      });

      savedListings.push(listing);
    }
    console.log(`Created ${savedListings.length} listings`);

    // Create slot-based sports facility listings
    console.log('Creating slot-based sports facility listings...');
    const sportsFacilityCategory = savedCategories.find(
      (c) => c.slug === 'sports-facilities',
    );

    if (sportsFacilityCategory) {
      const sportsFacilities = [
        { name: 'Tennis Court', price: 25 },
        { name: 'Football Field', price: 50 },
        { name: 'Basketball Court', price: 30 },
      ];

      for (let i = 0; i < sportsFacilities.length; i++) {
        const facility = sportsFacilities[i];
        const host = hosts[i % hosts.length];
        const offset = (i * 0.02) % 0.1;
        const lat = KELIBIA_LAT + offset;
        const lng = KELIBIA_LNG + offset;
        const locationWKT = `POINT(${lng} ${lat})`;

        // Generate UUID in Node.js for portability (no pgcrypto extension needed)
        const listingId = crypto.randomUUID();

        // Create listing with SLOT booking type
        await this.prisma.$executeRaw`
          INSERT INTO listings (
            id, title, description, "pricePerDay", location, address,
            "categoryId", "hostId", images, "isActive", "bookingType", "createdAt", "updatedAt"
          )
          VALUES (
            ${listingId}::uuid,
            ${facility.name},
            ${`Professional ${facility.name} available for hourly booking`},
            ${facility.price},
            ST_SetSRID(ST_GeomFromText(${locationWKT}), 4326),
            ${`Sports Complex, Kelibia`},
            ${sportsFacilityCategory.id}::uuid,
            ${host.id}::uuid,
            ARRAY['/uploads/sports-facility-${i + 1}.jpg']::TEXT[],
            true,
            'SLOT'::"BookingType",
            NOW(),
            NOW()
          )
        `;

        // Fetch the created listing
        const slotListing = await this.prisma.listing.findUnique({
          where: { id: listingId },
        });

        // Create slot configuration
        await this.prisma.slotConfiguration.create({
          data: {
            listingId,
            slotDurationMinutes: 60,
            operatingHours: {
              monday: { start: '08:00', end: '22:00' },
              tuesday: { start: '08:00', end: '22:00' },
              wednesday: { start: '08:00', end: '22:00' },
              thursday: { start: '08:00', end: '22:00' },
              friday: { start: '08:00', end: '22:00' },
              saturday: { start: '09:00', end: '23:00' },
              sunday: { start: '09:00', end: '21:00' },
            },
            minBookingSlots: 1,
            maxBookingSlots: 4,
            bufferMinutes: 15,
            pricePerSlot: facility.price,
          },
        });

        savedListings.push(slotListing[0]);
      }
      console.log(
        `Created ${sportsFacilities.length} slot-based sports facilities`,
      );
    }

    // Fetch created listings
    const allListings = await this.prisma.listing.findMany();

    // Create bookings
    console.log('Creating bookings...');
    const renters = savedUsers.filter((u) => !u.isHost);
    let bookingCount = 0;

    for (let i = 0; i < 10; i++) {
      const listing = allListings[i % allListings.length];
      const renter = renters[i % renters.length];

      if (listing.hostId === renter.id) continue;

      const startDate = new Date();
      startDate.setDate(startDate.getDate() + i * 7);
      const endDate = new Date(startDate);
      endDate.setDate(endDate.getDate() + 3);

      const days = Math.ceil(
        (endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24),
      );
      const pricePerDay =
        typeof listing.pricePerDay === 'number'
          ? listing.pricePerDay
          : Number(listing.pricePerDay);
      const totalPrice = pricePerDay * days;
      const commission = totalPrice * 0.1;

      const statusOptions = ['confirmed', 'pending', 'completed'] as const;
      const status = statusOptions[i % 3];

      await this.prisma.booking.create({
        data: {
          startDate,
          endDate,
          status: status as any,
          renterId: renter.id,
          hostId: listing.hostId,
          listingId: listing.id,
          totalPrice,
          commission,
          paid: i % 2 === 0,
        },
      });

      bookingCount++;
    }
    console.log(`Created ${bookingCount} bookings`);

    // Create reviews
    console.log('Creating reviews...');
    const completedBookings = await this.prisma.booking.findMany({
      where: { status: 'completed' },
    });

    for (const booking of completedBookings.slice(0, 5)) {
      await this.prisma.review.create({
        data: {
          rating: Math.floor(Math.random() * 3) + 3,
          comment: `Great experience with the listing!`,
          authorId: booking.renterId,
          targetUserId: booking.hostId,
          listingId: booking.listingId,
          bookingId: booking.id,
        },
      });
    }
    console.log(`Created ${completedBookings.length} reviews`);

    console.log('Seed completed successfully!');
  }
}
