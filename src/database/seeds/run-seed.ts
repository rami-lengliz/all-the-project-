import { DataSource } from 'typeorm';
import { config } from 'dotenv';
import { User } from '../../entities/user.entity';
import { Category } from '../../entities/category.entity';
import { Listing, BookingType } from '../../entities/listing.entity';
import { Booking, BookingStatus } from '../../entities/booking.entity';
import { Review } from '../../entities/review.entity';
import { AdminLog } from '../../entities/admin-log.entity';
import * as bcrypt from 'bcrypt';
import { Point } from 'geojson';

config();

const AppDataSource = new DataSource({
  type: 'postgres',
  host: process.env.DATABASE_HOST || 'localhost',
  port: parseInt(process.env.DATABASE_PORT || '5432'),
  username: process.env.DATABASE_USER || 'postgres',
  password: process.env.DATABASE_PASSWORD || 'postgres',
  database: process.env.DATABASE_NAME || 'rental_platform',
  entities: [User, Category, Listing, Booking, Review, AdminLog],
  synchronize: false,
  logging: true,
});

// Kelibia coordinates (Tunisia) - center point
const KELIBIA_LAT = 36.8578;
const KELIBIA_LNG = 11.0920;

// Sample listings data with realistic names and descriptions
const sampleListings = [
  // Accommodation
  {
    title: 'Beachfront Villa in Kelibia',
    description: 'Beautiful 3-bedroom villa with stunning sea views. Perfect for families. Fully equipped kitchen, private terrace, and direct beach access.',
    pricePerDay: 180,
    lat: KELIBIA_LAT + 0.002,
    lng: KELIBIA_LNG + 0.001,
    categorySlug: 'accommodation',
    address: 'Avenue de la Plage, Kelibia 8090, Tunisia',
    images: ['beachfront-villa-kelibia.jpg'],
  },
  {
    title: 'Cozy Apartment Near Kelibia Port',
    description: 'Modern 2-bedroom apartment in the heart of Kelibia. Walking distance to restaurants and shops.',
    pricePerDay: 120,
    lat: KELIBIA_LAT - 0.001,
    lng: KELIBIA_LNG + 0.002,
    categorySlug: 'accommodation',
    address: 'Rue du Port, Kelibia 8090, Tunisia',
    images: ['apartment-port-kelibia.jpg'],
  },
  {
    title: 'Luxury Sea View Apartment',
    description: 'Spacious apartment with panoramic Mediterranean views. Air conditioning, WiFi, and parking included.',
    pricePerDay: 200,
    lat: KELIBIA_LAT + 0.003,
    lng: KELIBIA_LNG - 0.001,
    categorySlug: 'accommodation',
    address: 'Corniche de Kelibia, Kelibia 8090, Tunisia',
    images: ['luxury-apartment-kelibia.jpg'],
  },
  {
    title: 'Traditional Tunisian House',
    description: 'Authentic Tunisian house with courtyard. Experience local culture in comfort.',
    pricePerDay: 100,
    lat: KELIBIA_LAT - 0.002,
    lng: KELIBIA_LNG - 0.002,
    categorySlug: 'accommodation',
    address: 'Medina Quarter, Kelibia 8090, Tunisia',
    images: ['traditional-house-kelibia.jpg'],
  },
  {
    title: 'Beachside Studio Apartment',
    description: 'Compact studio perfect for couples. Steps away from the beach.',
    pricePerDay: 80,
    lat: KELIBIA_LAT + 0.001,
    lng: KELIBIA_LNG + 0.003,
    categorySlug: 'accommodation',
    address: 'Plage de Kelibia, Kelibia 8090, Tunisia',
    images: ['studio-beach-kelibia.jpg'],
  },
  // Mobility
  {
    title: 'Scooter Rental - Perfect for Exploring',
    description: 'Reliable 125cc scooter. Ideal for exploring Kelibia and surrounding areas. Helmet and lock included.',
    pricePerDay: 45,
    lat: KELIBIA_LAT + 0.004,
    lng: KELIBIA_LNG + 0.002,
    categorySlug: 'mobility',
    address: 'Rue Principale, Kelibia 8090, Tunisia',
    images: ['scooter-kelibia.jpg'],
  },
  {
    title: 'Car Rental - Compact Vehicle',
    description: 'Economical compact car for day trips. Air conditioning, GPS navigation included.',
    pricePerDay: 75,
    lat: KELIBIA_LAT - 0.003,
    lng: KELIBIA_LNG + 0.001,
    categorySlug: 'mobility',
    address: 'Zone Industrielle, Kelibia 8090, Tunisia',
    images: ['car-rental-kelibia.jpg'],
  },
  {
    title: 'Mountain Bike Rental',
    description: 'High-quality mountain bike perfect for exploring coastal paths and countryside.',
    pricePerDay: 25,
    lat: KELIBIA_LAT + 0.002,
    lng: KELIBIA_LNG - 0.003,
    categorySlug: 'mobility',
    address: 'Avenue Habib Bourguiba, Kelibia 8090, Tunisia',
    images: ['mountain-bike-kelibia.jpg'],
  },
  {
    title: 'Electric Scooter - Eco-Friendly',
    description: 'Modern electric scooter. Silent, eco-friendly, and fun way to explore Kelibia.',
    pricePerDay: 30,
    lat: KELIBIA_LAT - 0.001,
    lng: KELIBIA_LNG - 0.001,
    categorySlug: 'mobility',
    address: 'Centre Ville, Kelibia 8090, Tunisia',
    images: ['electric-scooter-kelibia.jpg'],
  },
  {
    title: 'Motorcycle Rental - 250cc',
    description: 'Powerful motorcycle for longer trips. Perfect for exploring the Cap Bon peninsula.',
    pricePerDay: 90,
    lat: KELIBIA_LAT + 0.005,
    lng: KELIBIA_LNG + 0.004,
    categorySlug: 'mobility',
    address: 'Route de Nabeul, Kelibia 8090, Tunisia',
    images: ['motorcycle-kelibia.jpg'],
  },
  // Water & Beach Activities
  {
    title: 'Kayak Rental - Single Person',
    description: 'Stable single-person kayak. Paddles and life jackets included. Perfect for exploring the coast.',
    pricePerDay: 40,
    lat: KELIBIA_LAT + 0.001,
    lng: KELIBIA_LNG + 0.005,
    categorySlug: 'water-beach-activities',
    address: 'Port de Kelibia, Kelibia 8090, Tunisia',
    images: ['kayak-single-kelibia.jpg'],
  },
  {
    title: 'Stand-Up Paddle Board Rental',
    description: 'SUP board with paddle. Great for calm waters and beach activities.',
    pricePerDay: 35,
    lat: KELIBIA_LAT - 0.004,
    lng: KELIBIA_LNG + 0.003,
    categorySlug: 'water-beach-activities',
    address: 'Plage de Kelibia, Kelibia 8090, Tunisia',
    images: ['paddle-board-kelibia.jpg'],
  },
  {
    title: 'Snorkeling Equipment Set',
    description: 'Complete snorkeling set: mask, fins, snorkel. Explore the beautiful underwater world.',
    pricePerDay: 20,
    lat: KELIBIA_LAT + 0.003,
    lng: KELIBIA_LNG + 0.006,
    categorySlug: 'water-beach-activities',
    address: 'Marina de Kelibia, Kelibia 8090, Tunisia',
    images: ['snorkel-equipment-kelibia.jpg'],
  },
  {
    title: 'Beach Umbrella and Chairs Set',
    description: 'Comfortable beach setup: large umbrella, 2 chairs, and cooler bag. Perfect for a day at the beach.',
    pricePerDay: 15,
    lat: KELIBIA_LAT - 0.002,
    lng: KELIBIA_LNG + 0.004,
    categorySlug: 'water-beach-activities',
    address: 'Plage Publique, Kelibia 8090, Tunisia',
    images: ['beach-umbrella-kelibia.jpg'],
  },
  {
    title: 'Tandem Kayak Rental',
    description: 'Two-person kayak. Great for couples or friends. All safety equipment included.',
    pricePerDay: 60,
    lat: KELIBIA_LAT + 0.006,
    lng: KELIBIA_LNG + 0.001,
    categorySlug: 'water-beach-activities',
    address: 'Port de Pêche, Kelibia 8090, Tunisia',
    images: ['kayak-tandem-kelibia.jpg'],
  },
  // More listings to reach 20
  {
    title: 'Family Villa with Pool',
    description: 'Spacious 4-bedroom villa with private pool. Perfect for large families or groups.',
    pricePerDay: 250,
    lat: KELIBIA_LAT + 0.007,
    lng: KELIBIA_LNG - 0.004,
    categorySlug: 'accommodation',
    address: 'Route de la Corniche, Kelibia 8090, Tunisia',
    images: ['villa-pool-kelibia.jpg'],
  },
  {
    title: 'Budget-Friendly Room',
    description: 'Simple, clean room with shared facilities. Great for budget travelers.',
    pricePerDay: 50,
    lat: KELIBIA_LAT - 0.005,
    lng: KELIBIA_LNG - 0.003,
    categorySlug: 'accommodation',
    address: 'Rue de la République, Kelibia 8090, Tunisia',
    images: ['budget-room-kelibia.jpg'],
  },
  {
    title: 'Bicycle Rental - City Bike',
    description: 'Comfortable city bike for short trips around town.',
    pricePerDay: 18,
    lat: KELIBIA_LAT + 0.001,
    lng: KELIBIA_LNG - 0.005,
    categorySlug: 'mobility',
    address: 'Place de l\'Indépendance, Kelibia 8090, Tunisia',
    images: ['city-bike-kelibia.jpg'],
  },
  {
    title: 'Fishing Equipment Rental',
    description: 'Complete fishing gear: rods, reels, tackle box. Perfect for fishing enthusiasts.',
    pricePerDay: 25,
    lat: KELIBIA_LAT - 0.006,
    lng: KELIBIA_LNG + 0.002,
    categorySlug: 'water-beach-activities',
    address: 'Port de Kelibia, Kelibia 8090, Tunisia',
    images: ['fishing-gear-kelibia.jpg'],
  },
  {
    title: 'Beach Volleyball Set',
    description: 'Complete beach volleyball set with net, ball, and boundary markers.',
    pricePerDay: 12,
    lat: KELIBIA_LAT + 0.004,
    lng: KELIBIA_LNG - 0.002,
    categorySlug: 'water-beach-activities',
    address: 'Plage de Kelibia, Kelibia 8090, Tunisia',
    images: ['volleyball-set-kelibia.jpg'],
  },
];

async function seed() {
  try {
    await AppDataSource.initialize();
    console.log('Database connection established');

    // Enable PostGIS
    await AppDataSource.query('CREATE EXTENSION IF NOT EXISTS postgis;');
    console.log('PostGIS extension enabled');

    const userRepository = AppDataSource.getRepository(User);
    const categoryRepository = AppDataSource.getRepository(Category);
    const listingRepository = AppDataSource.getRepository(Listing);
    const bookingRepository = AppDataSource.getRepository(Booking);
    const reviewRepository = AppDataSource.getRepository(Review);

    // Clear existing data
    console.log('Clearing existing data...');
    await reviewRepository.delete({});
    await bookingRepository.delete({});
    await listingRepository.delete({});
    await categoryRepository.delete({});
    await userRepository.delete({});

    // Create categories - only travel/vacation categories allowed
    console.log('Creating categories...');
    const categories = [
      { name: 'Accommodation', slug: 'accommodation', icon: '🏠', allowed_for_private: true },
      { name: 'Mobility', slug: 'mobility', icon: '🚗', allowed_for_private: true },
      { name: 'Water & Beach Activities', slug: 'water-beach-activities', icon: '🏖️', allowed_for_private: true },
      // Placeholder categories (not allowed for private)
      { name: 'Public Facilities', slug: 'public-facilities', icon: '🏛️', allowed_for_private: false },
      { name: 'Stadiums & Courts', slug: 'stadiums-courts', icon: '⚽', allowed_for_private: false },
    ];

    const savedCategories = await categoryRepository.save(
      categories.map((cat) => categoryRepository.create(cat)),
    );
    console.log(`Created ${savedCategories.length} categories`);

    // Create users
    console.log('Creating users...');
    const hashedPassword = await bcrypt.hash('password123', 10);
    const users = [];

    for (let i = 1; i <= 10; i++) {
      const isHost = i <= 5; // First 5 users are hosts
      users.push({
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
      });
    }

    const savedUsers = await userRepository.save(
      users.map((user) => userRepository.create(user)),
    );
    console.log(`Created ${savedUsers.length} users`);

    // Create listings
    console.log('Creating listings...');
    const hosts = savedUsers.filter((u) => u.isHost);
    const categoryMap = new Map(savedCategories.map((cat) => [cat.slug, cat]));
    const savedListings = [];

    for (let i = 0; i < sampleListings.length; i++) {
      const listingData = sampleListings[i];
      const category = categoryMap.get(listingData.categorySlug);
      const host = hosts[i % hosts.length];

      if (category && (category as Category).allowed_for_private) {
        const location: Point = {
          type: 'Point',
          coordinates: [listingData.lng, listingData.lat],
        };

        const listing = listingRepository.create({
          title: listingData.title,
          description: listingData.description,
          pricePerDay: listingData.pricePerDay,
          location,
          address: listingData.address,
          categoryId: (category as Category).id,
          hostId: (host as User).id,
          images: listingData.images,
          isActive: true,
          bookingType: BookingType.DAILY,
          availability: null, // Can be set later
        });

        savedListings.push(await listingRepository.save(listing));
      }
    }
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

      const days = Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
      const totalPrice = listing.pricePerDay * days;
      const commission = totalPrice * 0.10;

      const booking = bookingRepository.create({
        startDate,
        endDate,
        status: i % 3 === 0 ? BookingStatus.CONFIRMED : i % 3 === 1 ? BookingStatus.PENDING : BookingStatus.COMPLETED,
        renterId: renter.id,
        hostId: listing.hostId,
        listingId: listing.id,
        totalPrice,
        commission,
        paid: i % 2 === 0,
      });

      bookings.push(await bookingRepository.save(booking));
    }
    console.log(`Created ${bookings.length} bookings`);

    // Create reviews
    console.log('Creating reviews...');
    const completedBookings = bookings.filter((b) => b.status === BookingStatus.COMPLETED);

    for (const booking of completedBookings.slice(0, 8)) {
      const review = reviewRepository.create({
        rating: Math.floor(Math.random() * 3) + 3, // 3-5 stars
        comment: `Great experience! ${booking.listing.title} was exactly as described. Highly recommend!`,
        authorId: booking.renterId,
        targetUserId: booking.hostId,
        listingId: booking.listingId,
        bookingId: booking.id,
      });

      await reviewRepository.save(review);
    }
    console.log(`Created ${completedBookings.length} reviews`);

    console.log('✅ Seed completed successfully!');
    console.log(`   - ${savedCategories.length} categories`);
    console.log(`   - ${savedUsers.length} users (${hosts.length} hosts)`);
    console.log(`   - ${savedListings.length} listings`);
    console.log(`   - ${bookings.length} bookings`);
    console.log(`   - ${completedBookings.length} reviews`);
  } catch (error) {
    console.error('❌ Error seeding database:', error);
    throw error;
  } finally {
    await AppDataSource.destroy();
  }
}

seed();
