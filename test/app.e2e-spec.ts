import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { AppModule } from './../src/app.module';
import { PrismaService } from './../src/database/prisma.service';
import { TransformInterceptor } from './../src/common/interceptors/transform.interceptor';

// require() avoids "request is not a function" with some tsconfig/esModuleInterop combos
// eslint-disable-next-line @typescript-eslint/no-var-requires
const request = require('supertest');

/**
 * Smoke E2E tests: Health → Auth → Listings → Booking conflict.
 *
 * IMPORTANT — response shape:
 *   Because this test applies TransformInterceptor globally (matching main.ts),
 *   EVERY successful response is wrapped:  { success: true, data: <payload>, timestamp }
 *   All tokens/IDs must be read from  res.body.data.*
 *
 * Listing creation requires an image upload (API enforces it).
 * We create the listing directly via Prisma in beforeAll to avoid that constraint,
 * then test the booking/conflict flow against it via the API.
 *
 * HostGuard reads user.role from the JWT payload.  Role is derived from isHost at
 * login time → after become-host, the user must RE-LOGIN to get role=HOST in the JWT.
 */
describe('AppController (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  // Tokens
  let hostToken: string;
  let renterToken: string;

  // IDs
  let listingId: string;
  let bookingId: string;

  // Unique per run
  const SUFFIX = `smoke-${Date.now()}`;
  const HOST_EMAIL = `host-${SUFFIX}@example.com`;
  const RENTER_EMAIL = `renter-${SUFFIX}@example.com`;
  const PASSWORD = 'password123';

  // Dates well in the future
  const startDate = (() => {
    const d = new Date();
    d.setDate(d.getDate() + 60);
    return d.toISOString().split('T')[0];
  })();
  const endDate = (() => {
    const d = new Date();
    d.setDate(d.getDate() + 63);
    return d.toISOString().split('T')[0];
  })();

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();

    // Match main.ts global setup
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

    // ── Register host & renter via API ───────────────────────────────────────
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
        name: `Renter ${SUFFIX}`,
        email: RENTER_EMAIL,
        passwordHash: hash,
        roles: ['user'],
        isHost: false,
        verifiedEmail: true,
      },
    });

    // ── Get tokens by logging in ─────────────────────────────────────────────
    const hostLogin = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ emailOrPhone: HOST_EMAIL, password: PASSWORD });
    hostToken = hostLogin.body.data?.accessToken ?? hostLogin.body.accessToken;

    const renterLogin = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ emailOrPhone: RENTER_EMAIL, password: PASSWORD });
    renterToken =
      renterLogin.body.data?.accessToken ?? renterLogin.body.accessToken;

    // ── Create a category and listing directly via Prisma ─────────────────────
    // (Listing creation API requires an image upload — bypass via Prisma)
    const cat = await prisma.category.create({
      data: {
        name: `Accommodation ${SUFFIX}`,
        slug: `accommodation-${SUFFIX}`,
        icon: '🏠',
        allowedForPrivate: true,
      },
    });

    const result = await prisma.$queryRaw<Array<{ id: string }>>`
      INSERT INTO listings (
        id, title, description, "categoryId", "hostId",
        "pricePerDay", address, location, "bookingType", "isActive", status,
        "createdAt", "updatedAt"
      ) VALUES (
        gen_random_uuid(),
        ${`Smoke Villa ${SUFFIX}`}, 'Beautiful villa',
        ${cat.id}::uuid, ${host.id}::uuid,
        150, 'Kelibia',
        ST_SetSRID(ST_MakePoint(11.092, 36.8578), 4326),
        'DAILY'::"BookingType", true, 'ACTIVE'::"ListingStatus", NOW(), NOW()
      )
      RETURNING id
    `;
    listingId = (result as any[])[0].id;
  });

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

  // ─── Health ───────────────────────────────────────────────────────────────

  describe('Health Check', () => {
    it('GET /api/health returns { status, services }', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/health')
        .expect(200);

      // TransformInterceptor wraps → data holds the actual health object
      const health = res.body.data;
      expect(health).toHaveProperty('status');
      expect(health).toHaveProperty('services');
    });
  });

  // ─── Auth ─────────────────────────────────────────────────────────────────

  describe('Auth Flow', () => {
    it('POST /api/auth/login returns tokens for host', async () => {
      // Verify hostToken was obtained in beforeAll
      expect(hostToken).toBeTruthy();
    });

    it('POST /api/auth/login returns tokens for renter', async () => {
      expect(renterToken).toBeTruthy();
    });

    it('POST /api/auth/register creates a new user (201)', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/auth/register')
        .send({
          name: `Extra ${SUFFIX}`,
          email: `extra-${SUFFIX}@example.com`,
          password: PASSWORD,
        })
        .expect(201);

      // All responses wrapped: { success, data, timestamp }
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveProperty('user');
      expect(res.body.data).toHaveProperty('accessToken');
    });
  });

  // ─── Listings ─────────────────────────────────────────────────────────────

  describe('Listings Flow', () => {
    it('GET /api/categories returns wrapped list', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/categories')
        .expect(200);

      const categories = res.body.data ?? res.body;
      expect(Array.isArray(categories)).toBe(true);
      expect(categories.length).toBeGreaterThan(0);
    });

    it('GET /api/listings returns an array', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/listings')
        .expect(200);

      const listings = res.body.data ?? res.body;
      expect(Array.isArray(listings)).toBe(true);
    });

    it('GET /api/categories/nearby returns nearby categories and correct shape', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/categories/nearby')
        .query({ lat: 36.8578, lng: 11.092, radiusKm: 10 })
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.data.length).toBeGreaterThan(0);
      // Each item must have id, name, slug, count
      res.body.data.forEach((item: any) => {
        expect(typeof item.id).toBe('string');
        expect(typeof item.slug).toBe('string');
        expect(typeof item.count).toBe('number');
      });
    });
  });

  // ─── Booking ──────────────────────────────────────────────────────────────

  describe('Booking Flow', () => {
    it('POST /api/bookings — renter books host listing (201)', async () => {
      expect(listingId).toBeTruthy();

      const res = await request(app.getHttpServer())
        .post('/api/bookings')
        .set('Authorization', `Bearer ${renterToken}`)
        .send({ listingId, startDate, endDate })
        .expect(201);

      const booking = res.body.data ?? res.body;
      expect(booking).toHaveProperty('id');
      expect(booking).toHaveProperty('totalPrice');
      expect(booking).toHaveProperty('commission');
      expect(booking.status).toBe('pending');
      bookingId = booking.id;
    });

    it('POST /api/bookings — host cannot book own listing (400)', async () => {
      await request(app.getHttpServer())
        .post('/api/bookings')
        .set('Authorization', `Bearer ${hostToken}`)
        .send({ listingId, startDate, endDate })
        .expect(400);
    });

    it('PATCH /api/bookings/:id/confirm — host confirms booking (200)', async () => {
      expect(bookingId).toBeTruthy();

      const res = await request(app.getHttpServer())
        .patch(`/api/bookings/${bookingId}/confirm`)
        .set('Authorization', `Bearer ${hostToken}`)
        .expect(200);

      const booking = res.body.data ?? res.body;
      expect(booking.status).toBe('confirmed');
    });

    it('POST /api/bookings — overlap after confirm is rejected with 409', async () => {
      await request(app.getHttpServer())
        .post('/api/bookings')
        .set('Authorization', `Bearer ${renterToken}`)
        .send({ listingId, startDate, endDate })
        .expect(409);
    });
  });
});
