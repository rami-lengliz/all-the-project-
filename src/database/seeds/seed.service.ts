import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';

@Injectable()
export class SeedService {
  constructor(private prisma: PrismaService) { }

  async seed() {
    console.log('Starting seed process...');

    // Clear existing data (foreign-key-safe order)
    console.log('Clearing existing data...');
    await this.prisma.aiSearchLog.deleteMany({});
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

    // ── Categories ────────────────────────────────────────────
    console.log('Creating categories...');
    const categories = [
      { name: 'Accommodation', slug: 'accommodation', icon: '🏠', allowedForPrivate: true },
      { name: 'Mobility', slug: 'mobility', icon: '🚗', allowedForPrivate: true },
      { name: 'Water & Beach Activities', slug: 'water-beach-activities', icon: '🏖️', allowedForPrivate: true },
      { name: 'Sports Facilities', slug: 'sports-facilities', icon: '🏟️', allowedForPrivate: true },
      { name: 'Sports Equipment', slug: 'sports-equipment', icon: '⚽', allowedForPrivate: true },
      { name: 'Tools', slug: 'tools', icon: '🔧', allowedForPrivate: true },
      { name: 'Other', slug: 'other', icon: '📦', allowedForPrivate: true },
    ];

    const savedCategories = await Promise.all(
      categories.map((cat) => this.prisma.category.create({ data: cat })),
    );
    console.log(`Created ${savedCategories.length} categories`);

    // ── Users ──────────────────────────────────────────────────
    console.log('Creating users...');
    const hashedPassword = await bcrypt.hash('password123', 10);
    const savedUsers: any[] = [];

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

    const KELIBIA_LAT = 36.8578;
    const KELIBIA_LNG = 11.092;
    const TUNIS_LAT = 36.8065;
    const TUNIS_LNG = 10.1815;
    const hosts = savedUsers.filter((u) => u.isHost);

    // ── General DAILY listings (35) ───────────────────────────
    console.log('Creating listings...');
    const savedListings: any[] = [];

    for (let i = 0; i < 35; i++) {
      const category = savedCategories[i % savedCategories.length];
      const host = hosts[i % hosts.length];
      const offset = (i * 0.015) % 0.1;

      const isKelibia = i < 20;
      const baseLat = isKelibia ? KELIBIA_LAT : TUNIS_LAT;
      const baseLng = isKelibia ? KELIBIA_LNG : TUNIS_LNG;
      const cityName = isKelibia ? 'Kelibia' : 'Tunis';

      const lat = baseLat + offset;
      const lng = baseLng + offset;
      const newListingId = crypto.randomUUID();

      await this.prisma.$executeRaw`
        INSERT INTO listings (
          id, title, description, "pricePerDay", location, address,
          "categoryId", "hostId", images, "isActive", "createdAt", "updatedAt"
        ) VALUES (
          ${newListingId}::uuid,
          ${`Listing ${i + 1} in ${cityName}`},
          ${`Description for listing ${i + 1} located in ${cityName}`},
          ${20 + i * 5},
          ST_SetSRID(ST_GeomFromText(${'POINT(' + lng + ' ' + lat + ')'}), 4326),
          ${`${i + 1} Street, ${cityName}`},
          ${category.id}::uuid,
          ${host.id}::uuid,
          ARRAY[${`/uploads/placeholder-${i + 1}.jpg`}]::TEXT[],
          true,
          NOW(), NOW()
        )
      `;
      savedListings.push(
        await this.prisma.listing.findUnique({ where: { id: newListingId } }),
      );
    }

    // ── SLOT sports facilities (3) ────────────────────────────
    console.log('Creating slot-based sports facility listings...');
    const sportsCat = savedCategories.find((c) => c.slug === 'sports-facilities')!;
    const sportsFacilities = [
      { name: 'Tennis Court', price: 25 },
      { name: 'Football Field', price: 50 },
      { name: 'Basketball Court', price: 30 },
    ];

    for (let i = 0; i < sportsFacilities.length; i++) {
      const fac = sportsFacilities[i];
      const host = hosts[i % hosts.length];
      const lat = KELIBIA_LAT + (i * 0.02) % 0.1;
      const lng = KELIBIA_LNG + (i * 0.02) % 0.1;
      const listingId = crypto.randomUUID();

      await this.prisma.$executeRaw`
        INSERT INTO listings (
          id, title, description, "pricePerDay", location, address,
          "categoryId", "hostId", images, "isActive", "bookingType", "createdAt", "updatedAt"
        ) VALUES (
          ${listingId}::uuid,
          ${fac.name},
          ${`Professional ${fac.name} available for hourly booking`},
          ${fac.price},
          ST_SetSRID(ST_GeomFromText(${'POINT(' + lng + ' ' + lat + ')'}), 4326),
          ${'Sports Complex, Kelibia'},
          ${sportsCat.id}::uuid,
          ${host.id}::uuid,
          ARRAY[${`/uploads/sports-facility-${i + 1}.jpg`}]::TEXT[],
          true,
          'SLOT'::"BookingType",
          NOW(), NOW()
        )
      `;

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
          pricePerSlot: fac.price,
        },
      });

      savedListings.push(
        await this.prisma.listing.findUnique({ where: { id: listingId } }),
      );
    }
    console.log(`Created ${savedListings.length} listings total`);

    // ── General bookings (10) ─────────────────────────────────
    console.log('Creating bookings...');
    const allListings = await this.prisma.listing.findMany();
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

      const days = 3;
      const pricePerDay = Number(listing.pricePerDay);
      const totalPrice = pricePerDay * days;
      const statusOptions = ['confirmed', 'pending', 'completed'] as const;

      await this.prisma.booking.create({
        data: {
          startDate,
          endDate,
          status: statusOptions[i % 3] as any,
          renterId: renter.id,
          hostId: listing.hostId,
          listingId: listing.id,
          totalPrice,
          commission: totalPrice * 0.1,
          paid: i % 2 === 0,
        },
      });
      bookingCount++;
    }
    console.log(`Created ${bookingCount} bookings`);

    // ── Reviews ───────────────────────────────────────────────
    console.log('Creating reviews...');
    const completedBookings = await this.prisma.booking.findMany({
      where: { status: 'completed' },
    });
    for (const booking of completedBookings.slice(0, 5)) {
      await this.prisma.review.create({
        data: {
          rating: Math.floor(Math.random() * 3) + 3,
          comment: 'Great experience with the listing!',
          authorId: booking.renterId,
          targetUserId: booking.hostId,
          listingId: booking.listingId,
          bookingId: booking.id,
        },
      });
    }
    console.log(`Created ${completedBookings.length} reviews`);

    // ─────────────────────────────────────────────────────────
    // DEMO SCENARIOS (guaranteed conflict cases for PFE demo)
    // ─────────────────────────────────────────────────────────
    await this.seedDemoScenarios(savedUsers, savedCategories);

    console.log('Seed completed successfully!');
  }

  // ─────────────────────────────────────────────────────────────
  // Guaranteed Demo Scenarios
  // ─────────────────────────────────────────────────────────────
  /**
   * Creates:
   * 1. DAILY listing — confirmed booking D+30..D+33 + overlapping pending
   * 2. SLOT  listing — confirmed 10:00–12:00 on D+7  + overlapping pending
   * 3. 49 realistic French messages across 5 conversations
   */
  private async seedDemoScenarios(users: any[], categories: any[]) {
    console.log('Creating demo scenarios...');

    const host = users[0]; // user1 (admin+host)
    const renterA = users[5]; // user6
    const renterB = users[6]; // user7

    const accommodationCat = categories.find((c) => c.slug === 'accommodation')!;
    const sportsCat = categories.find((c) => c.slug === 'sports-facilities')!;

    const KELIBIA_LAT = 36.8578;
    const KELIBIA_LNG = 11.092;

    // ── 1. DAILY demo listing ──────────────────────────────────
    const dailyListingId = crypto.randomUUID();
    await this.prisma.$executeRaw`
      INSERT INTO listings (
        id, title, description, "pricePerDay", location, address,
        "categoryId", "hostId", images, "isActive", "bookingType", "createdAt", "updatedAt"
      ) VALUES (
        ${dailyListingId}::uuid,
        ${'[DEMO] Villa Conflict Demo'},
        ${'Demonstrates DAILY booking conflict prevention. D+30–D+33 is confirmed after seed.'},
        ${150},
        ST_SetSRID(ST_GeomFromText(${'POINT(' + (KELIBIA_LNG + 0.05) + ' ' + (KELIBIA_LAT + 0.05) + ')'}), 4326),
        ${'Demo Street 1, Kelibia'},
        ${accommodationCat.id}::uuid,
        ${host.id}::uuid,
        ARRAY['/uploads/demo-villa.jpg']::TEXT[],
        true,
        'DAILY'::"BookingType",
        NOW(), NOW()
      )
    `;

    // Confirmed booking A: D+30 → D+33
    const dailyStart = new Date();
    dailyStart.setDate(dailyStart.getDate() + 30);
    dailyStart.setHours(0, 0, 0, 0);
    const dailyEnd = new Date(dailyStart);
    dailyEnd.setDate(dailyEnd.getDate() + 3);

    const dailyBookingA = await this.prisma.booking.create({
      data: {
        listingId: dailyListingId,
        renterId: renterA.id,
        hostId: host.id,
        startDate: dailyStart,
        endDate: dailyEnd,
        totalPrice: 450,
        commission: 45,
        status: 'confirmed',
        paid: true,
      },
    });

    // Overlapping pending booking B (demonstrates that it would be rejected at confirm)
    await this.prisma.booking.create({
      data: {
        listingId: dailyListingId,
        renterId: renterB.id,
        hostId: host.id,
        startDate: dailyStart,
        endDate: dailyEnd,
        totalPrice: 450,
        commission: 45,
        status: 'pending',
        paid: false,
      },
    });

    console.log(`  ✓ DAILY demo: ${dailyListingId} — confirmed ${dailyStart.toISOString().substring(0, 10)} → ${dailyEnd.toISOString().substring(0, 10)}`);

    // ── 2. SLOT demo listing ───────────────────────────────────
    const slotListingId = crypto.randomUUID();
    await this.prisma.$executeRaw`
      INSERT INTO listings (
        id, title, description, "pricePerDay", location, address,
        "categoryId", "hostId", images, "isActive", "bookingType", "createdAt", "updatedAt"
      ) VALUES (
        ${slotListingId}::uuid,
        ${'[DEMO] Sports Court — Slot Conflict Demo'},
        ${'Demonstrates SLOT booking conflict prevention. 10:00–12:00 on D+7 is confirmed after seed.'},
        ${30},
        ST_SetSRID(ST_GeomFromText(${'POINT(' + (KELIBIA_LNG + 0.06) + ' ' + (KELIBIA_LAT + 0.06) + ')'}), 4326),
        ${'Demo Street 2, Kelibia'},
        ${sportsCat.id}::uuid,
        ${host.id}::uuid,
        ARRAY['/uploads/demo-court.jpg']::TEXT[],
        true,
        'SLOT'::"BookingType",
        NOW(), NOW()
      )
    `;

    await this.prisma.slotConfiguration.create({
      data: {
        listingId: slotListingId,
        slotDurationMinutes: 60,
        operatingHours: {
          monday: { start: '08:00', end: '22:00' },
          tuesday: { start: '08:00', end: '22:00' },
          wednesday: { start: '08:00', end: '22:00' },
          thursday: { start: '08:00', end: '22:00' },
          friday: { start: '08:00', end: '22:00' },
          saturday: { start: '08:00', end: '22:00' },
          sunday: { start: '08:00', end: '22:00' },
        },
        minBookingSlots: 1,
        maxBookingSlots: 4,
        bufferMinutes: 0,
        pricePerSlot: 30,
      },
    });

    // Demo slot date: D+7
    const slotDate = new Date();
    slotDate.setDate(slotDate.getDate() + 7);
    slotDate.setHours(0, 0, 0, 0);

    // Time objects (epoch midnight + UTC offset for 10h and 12h)
    const t10h00 = new Date(0); t10h00.setUTCHours(10, 0, 0, 0);
    const t12h00 = new Date(0); t12h00.setUTCHours(12, 0, 0, 0);
    const t11h00 = new Date(0); t11h00.setUTCHours(11, 0, 0, 0);
    const t13h00 = new Date(0); t13h00.setUTCHours(13, 0, 0, 0);

    // Confirmed: 10:00–12:00
    const slotBookingA = await this.prisma.booking.create({
      data: {
        listingId: slotListingId,
        renterId: renterA.id,
        hostId: host.id,
        startDate: slotDate,
        endDate: slotDate,
        startTime: t10h00,
        endTime: t12h00,
        totalPrice: 60,
        commission: 6,
        status: 'confirmed',
        paid: true,
      },
    });

    // Overlapping pending: 11:00–13:00 (would be blocked at confirm)
    await this.prisma.booking.create({
      data: {
        listingId: slotListingId,
        renterId: renterB.id,
        hostId: host.id,
        startDate: slotDate,
        endDate: slotDate,
        startTime: t11h00,
        endTime: t13h00,
        totalPrice: 60,
        commission: 6,
        status: 'pending',
        paid: false,
      },
    });

    console.log(`  ✓ SLOT demo:  ${slotListingId} — confirmed 10:00–12:00 on ${slotDate.toISOString().substring(0, 10)}`);

    // ── 3. Chat messages (49 messages across 5 conversations) ──
    console.log('Creating demo chat messages...');

    /** Helper: bulk-insert timestamped messages for one conversation */
    const seedMessages = async (
      conversationId: string,
      renterId: string,
      hostId: string,
      messages: Array<{ sender: 'renter' | 'host'; text: string }>,
      minutesApart = 4,
    ) => {
      for (let i = 0; i < messages.length; i++) {
        const { sender, text } = messages[i];
        const senderId = sender === 'renter' ? renterId : hostId;
        const createdAt = new Date();
        createdAt.setMinutes(createdAt.getMinutes() - (messages.length - i) * minutesApart);
        await this.prisma.message.create({
          data: { conversationId, senderId, content: text, createdAt },
        });
      }
    };

    // Conv 1 — DAILY villa (renterA ↔ host) — 12 messages
    const conv1 = await this.prisma.conversation.create({
      data: { renterId: renterA.id, hostId: host.id, listingId: dailyListingId, bookingId: dailyBookingA.id },
    });
    await seedMessages(conv1.id, renterA.id, host.id, [
      { sender: 'renter', text: 'Bonjour ! Je suis intéressé par votre villa pour la période indiquée.' },
      { sender: 'host', text: 'Bonjour ! La villa est disponible. Des questions ?' },
      { sender: 'renter', text: 'Le parking est-il inclus ?' },
      { sender: 'host', text: 'Oui, parking privatif pour 2 voitures.' },
      { sender: 'renter', text: 'Y a-t-il une piscine ?' },
      { sender: 'host', text: 'Absolument, ouverte de 8h à 21h.' },
      { sender: 'renter', text: 'La climatisation est-elle dans toutes les pièces ?' },
      { sender: 'host', text: 'Oui, chaque chambre a sa propre climatisation.' },
      { sender: 'renter', text: 'Wi-Fi disponible ?' },
      { sender: 'host', text: 'Fibre 200 Mbps dans toute la villa.' },
      { sender: 'renter', text: 'Super, je confirme la réservation !' },
      { sender: 'host', text: 'Parfait, à bientôt !' },
    ]);

    // Conv 2 — SLOT sports court (renterA ↔ host) — 10 messages
    const conv2 = await this.prisma.conversation.create({
      data: { renterId: renterA.id, hostId: host.id, listingId: slotListingId, bookingId: slotBookingA.id },
    });
    await seedMessages(conv2.id, renterA.id, host.id, [
      { sender: 'renter', text: 'Bonjour, je voudrais réserver le terrain de 10h à 12h.' },
      { sender: 'host', text: 'Bonjour ! Le terrain est disponible.' },
      { sender: 'renter', text: 'Combien de joueurs simultanément ?' },
      { sender: 'host', text: "Jusqu'à 4 joueurs confortablement." },
      { sender: 'renter', text: 'Les raquettes sont-elles fournies ?' },
      { sender: 'host', text: 'Oui, raquettes et balles en prêt gratuit.' },
      { sender: 'renter', text: 'Y a-t-il des vestiaires ?' },
      { sender: 'host', text: 'Vestiaires avec douches disponibles.' },
      { sender: 'renter', text: 'Je confirme pour 10h–12h !' },
      { sender: 'host', text: 'Réservé ! Bonne partie !' },
    ]);

    // Conv 3 — General booking (renterB ↔ host) — 6 messages
    const renterBBooking = await this.prisma.booking.findFirst({ where: { renterId: renterB.id } });
    if (renterBBooking) {
      const conv3 = await this.prisma.conversation.create({
        data: { renterId: renterB.id, hostId: renterBBooking.hostId, listingId: renterBBooking.listingId, bookingId: renterBBooking.id },
      });
      await seedMessages(conv3.id, renterB.id, renterBBooking.hostId, [
        { sender: 'renter', text: 'Ma réservation est-elle bien confirmée ?' },
        { sender: 'host', text: 'Oui, tout est confirmé de notre côté !' },
        { sender: 'renter', text: "Quelle est l'heure d'arrivée minimale ?" },
        { sender: 'host', text: 'Vous pouvez arriver à partir de 14h.' },
        { sender: 'renter', text: 'Parfait, à bientôt !' },
        { sender: 'host', text: 'Au plaisir !' },
      ]);
    }

    // Conv 4 — Mobility listing enquiry — 10 messages
    const mobilityListing = await this.prisma.listing.findFirst({
      where: { category: { slug: 'mobility' } },
    });
    if (mobilityListing) {
      const conv4 = await this.prisma.conversation.create({
        data: { renterId: renterA.id, hostId: mobilityListing.hostId, listingId: mobilityListing.id },
      });
      await seedMessages(conv4.id, renterA.id, mobilityListing.hostId, [
        { sender: 'renter', text: 'Le véhicule est-il disponible ce week-end ?' },
        { sender: 'host', text: 'Oui, kilométrage illimité inclus.' },
        { sender: 'renter', text: 'Y a-t-il un dépôt de garantie ?' },
        { sender: 'host', text: '200 TND de caution, remboursée à la restitution.' },
        { sender: 'renter', text: 'Le GPS est-il inclus ?' },
        { sender: 'host', text: 'GPS intégré + support smartphone.' },
        { sender: 'renter', text: 'Très bien, je fais la réservation.' },
        { sender: 'host', text: "Excellent ! N'hésitez pas si questions." },
        { sender: 'renter', text: 'Réservation confirmée, merci !' },
        { sender: 'host', text: 'Bonne route !' },
      ]);
    }

    // Conv 5 — Beach activity enquiry — 11 messages
    const beachListing = await this.prisma.listing.findFirst({
      where: { category: { slug: 'water-beach-activities' } },
    });
    if (beachListing) {
      const conv5 = await this.prisma.conversation.create({
        data: { renterId: renterB.id, hostId: beachListing.hostId, listingId: beachListing.id },
      });
      await seedMessages(conv5.id, renterB.id, beachListing.hostId, [
        { sender: 'renter', text: "L'activité est-elle adaptée pour 2 adultes ?" },
        { sender: 'host', text: 'Oui, parfaitement adapté pour 2 personnes.' },
        { sender: 'renter', text: 'Faut-il savoir nager ?' },
        { sender: 'host', text: 'Niveau débutant suffisant, gilets de sécurité fournis.' },
        { sender: 'renter', text: "L'équipement complet est inclus ?" },
        { sender: 'host', text: 'Palmes, masques, combinaisons — tout est fourni.' },
        { sender: 'renter', text: "Durée de l'activité ?" },
        { sender: 'host', text: '2h en mer + 30 min de briefing sécurité.' },
        { sender: 'renter', text: 'On réserve pour samedi !' },
        { sender: 'host', text: 'Parfait, à samedi ! Pensez à la crème solaire 😊' },
        { sender: 'renter', text: 'Merci du conseil !' },
      ]);
    }

    console.log('  ✓ Chat: 49 messages across 5 conversations');
    console.log('');
    console.log('  ╔══════════════════════════════════════════════════════╗');
    console.log('  ║       DEMO SEED — Copy for curl / Swagger tests      ║');
    console.log('  ╠══════════════════════════════════════════════════════╣');
    console.log(`  ║  DAILY listing : ${dailyListingId} ║`);
    console.log(`  ║  Blocked dates : ${dailyStart.toISOString().substring(0, 10)} → ${dailyEnd.toISOString().substring(0, 10)} (confirmed)   ║`);
    console.log(`  ║  SLOT listing  : ${slotListingId} ║`);
    console.log(`  ║  Blocked slot  : 10:00–12:00 on ${slotDate.toISOString().substring(0, 10)}               ║`);
    console.log('  ║  RenterA login : user6@example.com / password123     ║');
    console.log('  ║  Host login    : user1@example.com / password123     ║');
    console.log('  ╚══════════════════════════════════════════════════════╝');
  }
}
