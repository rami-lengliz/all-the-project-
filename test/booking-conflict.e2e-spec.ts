import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { AppModule } from './../src/app.module';
import { PrismaService } from './../src/database/prisma.service';
import { TransformInterceptor } from './../src/common/interceptors/transform.interceptor';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const request = require('supertest');

/**
 * E2E tests — DAILY booking conflict prevention
 *
 * Business rule:
 *   A DAILY listing cannot be double-booked.  Once a booking reaches
 *   'confirmed' status, any new booking that overlaps the same date range
 *   MUST be rejected with HTTP 409 at creation time.
 *
 *   Only `confirmed` and `paid` bookings block availability.
 *   A `pending` booking does NOT block the listing — so Renter B can create a
 *   pending booking, but the host's confirm call is where the race is decided.
 *
 * Fixture approach:
 *   • 3 users created directly via Prisma: host, renterA, renterB.
 *   • 1 DAILY listing created directly via Prisma (avoids image-upload constraint).
 *   • All booking/confirm calls go through the real HTTP stack via supertest.
 *
 * Cleanup:
 *   afterAll deletes paymentIntents → bookings → listing → category → users
 *   in FK-safe order.  A per-run SUFFIX keeps records isolated from other suites.
 */
describe('DAILY Booking — Conflict Prevention (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  /* ── tokens ──────────────────────────────────────────────────────── */
  let hostToken: string;
  let renterAToken: string;
  let renterBToken: string;

  /* ── shared IDs ──────────────────────────────────────────────────── */
  let listingId: string;
  let bookingAId: string; // Renter A's booking (will be confirmed)
  let bookingBId: string; // Renter B's pending booking (should fail on overlap)

  /* ── unique run suffix ───────────────────────────────────────────── */
  const SUFFIX = `conflict-${Date.now()}`;
  const HOST_EMAIL = `host-${SUFFIX}@example.com`;
  const RENTER_A_EMAIL = `renterA-${SUFFIX}@example.com`;
  const RENTER_B_EMAIL = `renterB-${SUFFIX}@example.com`;
  const PASSWORD = 'Password123!';

  /* ── date window: 90 days out, 2-night stay ──────────────────────── */
  const startDate = (() => {
    const d = new Date();
    d.setDate(d.getDate() + 90);
    return d.toISOString().split('T')[0];
  })();
  const endDate = (() => {
    const d = new Date();
    d.setDate(d.getDate() + 93); // 3-night stay
    return d.toISOString().split('T')[0];
  })();

  /**
   * Slightly-overlapping window used by Renter B:
   *  startDate + 1  →  endDate + 1
   * Enough intersection to trigger the conflict check.
   */
  const overlapStart = (() => {
    const d = new Date(startDate);
    d.setDate(d.getDate() + 1);
    return d.toISOString().split('T')[0];
  })();
  const overlapEnd = (() => {
    const d = new Date(endDate);
    d.setDate(d.getDate() + 1);
    return d.toISOString().split('T')[0];
  })();

  /* ═══════════════════════════════════════════════════════════════════
       beforeAll — fixtures
       ═══════════════════════════════════════════════════════════════════ */
  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalInterceptors(new TransformInterceptor());
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );

    await app.init();
    prisma = moduleFixture.get<PrismaService>(PrismaService);

    /* ── Create users directly via Prisma ────────────────────────── */
    const bcrypt = require('bcrypt');
    const hash = await bcrypt.hash(PASSWORD, 10);

    const host = await prisma.user.create({
      data: {
        name: `Host ${SUFFIX}`,
        email: HOST_EMAIL,
        passwordHash: hash,
        roles: ['user', 'host'],
        isHost: true,
        verifiedEmail: true,
      },
    });

    await prisma.user.create({
      data: {
        name: `RenterA ${SUFFIX}`,
        email: RENTER_A_EMAIL,
        passwordHash: hash,
        roles: ['user'],
        isHost: false,
        verifiedEmail: true,
      },
    });

    await prisma.user.create({
      data: {
        name: `RenterB ${SUFFIX}`,
        email: RENTER_B_EMAIL,
        passwordHash: hash,
        roles: ['user'],
        isHost: false,
        verifiedEmail: true,
      },
    });

    /* ── Login to obtain JWTs ────────────────────────────────────── */
    const login = async (email: string) => {
      const res = await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ emailOrPhone: email, password: PASSWORD });
      return res.body.data?.accessToken ?? res.body.accessToken ?? '';
    };

    hostToken = await login(HOST_EMAIL);
    renterAToken = await login(RENTER_A_EMAIL);
    renterBToken = await login(RENTER_B_EMAIL);

    /* ── Create DAILY listing directly via Prisma ────────────────── */
    const cat = await prisma.category.create({
      data: {
        name: `Category ${SUFFIX}`,
        slug: `cat-${SUFFIX}`,
        icon: '🏠',
        allowedForPrivate: true,
      },
    });

    const rows = await prisma.$queryRaw<Array<{ id: string }>>`
      INSERT INTO listings (
        id, title, description, "categoryId", "hostId",
        "pricePerDay", address, location, "bookingType", "isActive",
        "createdAt", "updatedAt"
      ) VALUES (
        gen_random_uuid(),
        ${'Conflict Test Villa ' + SUFFIX},
        'DAILY listing for conflict prevention test',
        ${cat.id}::uuid, ${host.id}::uuid,
        100, 'Somewhere',
        ST_SetSRID(ST_MakePoint(11.092, 36.8578), 4326),
        'DAILY'::"BookingType", true, NOW(), NOW()
      )
      RETURNING id
    `;
    listingId = (rows as any[])[0].id;
  });

  /* ═══════════════════════════════════════════════════════════════════
       afterAll — clean up in FK-safe order
       ═══════════════════════════════════════════════════════════════════ */
  afterAll(async () => {
    if (prisma) {
      await prisma.paymentIntent.deleteMany({
        where: { booking: { listing: { title: { contains: SUFFIX } } } },
      });
      await prisma.booking.deleteMany({
        where: { listing: { title: { contains: SUFFIX } } },
      });
      await prisma.listing.deleteMany({
        where: { title: { contains: SUFFIX } },
      });
      await prisma.category.deleteMany({
        where: { slug: { contains: SUFFIX } },
      });
      await prisma.user.deleteMany({ where: { email: { contains: SUFFIX } } });
    }
    if (app) await app.close();
  });

  /* ═══════════════════════════════════════════════════════════════════
       STEP 1 — Renter A books the listing
       ═══════════════════════════════════════════════════════════════════ */
  describe('Step 1 — Renter A creates a booking', () => {
    it('tokens and listingId are populated from beforeAll', () => {
      expect(hostToken).toBeTruthy();
      expect(renterAToken).toBeTruthy();
      expect(renterBToken).toBeTruthy();
      expect(listingId).toBeTruthy();
    });

    it('POST /api/bookings — RenterA books listing (201, status pending)', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/bookings')
        .set('Authorization', `Bearer ${renterAToken}`)
        .send({ listingId, startDate, endDate })
        .expect(201);

      const booking = res.body.data ?? res.body;
      expect(booking).toHaveProperty('id');
      expect(booking.status).toBe('pending');
      expect(booking.listingId ?? booking.listing?.id).toBeTruthy();
      bookingAId = booking.id;
    });
  });

  /* ═══════════════════════════════════════════════════════════════════
       STEP 2 — Renter B can still create a pending booking (pending
       does NOT block availability, only confirmed/paid bookings do).
       ═══════════════════════════════════════════════════════════════════ */
  describe('Step 2 — Renter B creates an overlapping pending booking', () => {
    it('POST /api/bookings — RenterB overlapping booking succeeds while A is still pending (201)', async () => {
      expect(bookingAId).toBeTruthy();

      const res = await request(app.getHttpServer())
        .post('/api/bookings')
        .set('Authorization', `Bearer ${renterBToken}`)
        .send({ listingId, startDate: overlapStart, endDate: overlapEnd })
        .expect(201);

      const booking = res.body.data ?? res.body;
      expect(booking.status).toBe('pending');
      bookingBId = booking.id;
    });
  });

  /* ═══════════════════════════════════════════════════════════════════
       STEP 3 — Host confirms Renter A's booking.
       This locks the window: only Renter A now owns those dates.
       ═══════════════════════════════════════════════════════════════════ */
  describe('Step 3 — Host confirms Renter A booking', () => {
    it('PATCH /api/bookings/:id/confirm — host confirms RenterA booking (200, status confirmed)', async () => {
      expect(bookingAId).toBeTruthy();

      const res = await request(app.getHttpServer())
        .patch(`/api/bookings/${bookingAId}/confirm`)
        .set('Authorization', `Bearer ${hostToken}`)
        .expect(200);

      const booking = res.body.data ?? res.body;
      expect(booking.status).toBe('confirmed');
    });
  });

  /* ═══════════════════════════════════════════════════════════════════
       STEP 4 — Conflict gate: a NEW overlapping booking POST must be
       rejected with 409 now that a confirmed booking blocks those dates.
       ═══════════════════════════════════════════════════════════════════ */
  describe('Step 4 — Conflict gate: new overlapping booking is rejected', () => {
    it('POST /api/bookings — fully overlapping booking is rejected with 409 after confirmation', async () => {
      // Exact same window as Renter A's confirmed booking — must fail
      await request(app.getHttpServer())
        .post('/api/bookings')
        .set('Authorization', `Bearer ${renterBToken}`)
        .send({ listingId, startDate, endDate })
        .expect(409);
    });

    it('POST /api/bookings — partially overlapping booking is also rejected with 409', async () => {
      // 1-day overlap into the confirmed window
      await request(app.getHttpServer())
        .post('/api/bookings')
        .set('Authorization', `Bearer ${renterBToken}`)
        .send({ listingId, startDate: overlapStart, endDate: overlapEnd })
        .expect(409);
    });

    it('POST /api/bookings — non-overlapping booking on same listing is still allowed (201)', async () => {
      // Book well after the confirmed window ends
      const freeStart = (() => {
        const d = new Date(endDate);
        d.setDate(d.getDate() + 10); // 10 days gap after confirmed block
        return d.toISOString().split('T')[0];
      })();
      const freeEnd = (() => {
        const d = new Date(endDate);
        d.setDate(d.getDate() + 12);
        return d.toISOString().split('T')[0];
      })();

      const res = await request(app.getHttpServer())
        .post('/api/bookings')
        .set('Authorization', `Bearer ${renterBToken}`)
        .send({ listingId, startDate: freeStart, endDate: freeEnd })
        .expect(201);

      const booking = res.body.data ?? res.body;
      expect(booking.status).toBe('pending');
    });
  });

  /* ═══════════════════════════════════════════════════════════════════
       STEP 5 — Attempting to confirm Renter B's *pre-existing* pending
       overlapping booking must also fail (double-confirmation guard).
       ═══════════════════════════════════════════════════════════════════ */
  describe('Step 5 — Host cannot confirm overlapping pending booking (conflict at confirm)', () => {
    it('PATCH /api/bookings/:id/confirm — confirming RenterB overlapping booking is rejected (409)', async () => {
      expect(bookingBId).toBeTruthy();

      // Host tries to confirm booking B which overlaps with confirmed booking A
      await request(app.getHttpServer())
        .patch(`/api/bookings/${bookingBId}/confirm`)
        .set('Authorization', `Bearer ${hostToken}`)
        .expect(409);
    });
  });
});
