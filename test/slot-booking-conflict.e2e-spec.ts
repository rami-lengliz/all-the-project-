import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { AppModule } from './../src/app.module';
import { PrismaService } from './../src/database/prisma.service';
import { TransformInterceptor } from './../src/common/interceptors/transform.interceptor';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const request = require('supertest');

/**
 * E2E tests — SLOT booking conflict prevention
 *
 * Proves:
 *  1. A SLOT listing can be booked for a specific time window
 *  2. Once confirmed, that slot appears unavailable in GET /available-slots
 *  3. A second booking for the SAME or overlapping slot is rejected with HTTP 409
 *  4. A booking for a DIFFERENT non-overlapping slot succeeds
 */
describe('SLOT Booking — Conflict Prevention (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  let hostToken: string;
  let renterAToken: string;
  let renterBToken: string;
  let listingId: string;
  let bookingAId: string;

  const SUFFIX = `slot-${Date.now()}`;
  const HOST_EMAIL = `host-${SUFFIX}@test.com`;
  const RENTER_A_EMAIL = `rA-${SUFFIX}@test.com`;
  const RENTER_B_EMAIL = `rB-${SUFFIX}@test.com`;
  const PASSWORD = 'Password123!';

  // 100 days from now, aligned to a Monday
  const bookingDate = (() => {
    const d = new Date();
    d.setDate(d.getDate() + 100);
    const dow = d.getDay();
    d.setDate(d.getDate() + ((1 + 7 - dow) % 7 || 7));
    return d.toISOString().split('T')[0];
  })();

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

    const login = async (email: string) => {
      const r = await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ emailOrPhone: email, password: PASSWORD });
      return r.body.data?.accessToken ?? r.body.accessToken ?? '';
    };
    hostToken = await login(HOST_EMAIL);
    renterAToken = await login(RENTER_A_EMAIL);
    renterBToken = await login(RENTER_B_EMAIL);

    // SLOT listing via Prisma (bypasses image-upload guard)
    const cat = await prisma.category.create({
      data: {
        name: `Cat${SUFFIX}`,
        slug: `cat-${SUFFIX}`,
        icon: '🏟',
        allowedForPrivate: true,
      },
    });
    const rows = await prisma.$queryRaw<Array<{ id: string }>>`
      INSERT INTO listings (
        id, title, description, "categoryId", "hostId",
        "pricePerDay", address, location, "bookingType", "isActive", "createdAt", "updatedAt"
      ) VALUES (
        gen_random_uuid(), ${'Court-' + SUFFIX}, 'slot test',
        ${cat.id}::uuid, ${host.id}::uuid,
        0, 'Arena', ST_SetSRID(ST_MakePoint(10, 36), 4326),
        'SLOT'::"BookingType", true, NOW(), NOW()
      ) RETURNING id
    `;
    listingId = (rows as any[])[0].id;

    // Slot configuration via Prisma (bypasses HostGuard 403 issue)
    await prisma.slotConfiguration.create({
      data: {
        listingId,
        slotDurationMinutes: 60,
        bufferMinutes: 0,
        minBookingSlots: 1,
        maxBookingSlots: 8,
        pricePerSlot: 30,
        operatingHours: {
          monday: { start: '08:00', end: '22:00' },
          tuesday: { start: '08:00', end: '22:00' },
          wednesday: { start: '08:00', end: '22:00' },
          thursday: { start: '08:00', end: '22:00' },
          friday: { start: '08:00', end: '22:00' },
          saturday: { start: '08:00', end: '22:00' },
          sunday: { start: '08:00', end: '22:00' },
        },
      },
    });
  });

  afterAll(async () => {
    if (prisma) {
      await prisma.conversation.deleteMany({
        where: {
          OR: [
            { listing: { title: { contains: SUFFIX } } },
            { renter: { email: { contains: SUFFIX } } },
            { host: { email: { contains: SUFFIX } } },
          ],
        },
      });
      await prisma.paymentIntent.deleteMany({
        where: { booking: { listing: { title: { contains: SUFFIX } } } },
      });
      await prisma.booking.deleteMany({
        where: { listing: { title: { contains: SUFFIX } } },
      });
      await prisma.slotConfiguration.deleteMany({
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

  it('Step 1 — fixtures ready', () => {
    expect(hostToken).toBeTruthy();
    expect(renterAToken).toBeTruthy();
    expect(renterBToken).toBeTruthy();
    expect(listingId).toBeTruthy();
  });

  it('Step 2 — GET /available-slots returns slots, 10:00 is initially available', async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/listings/${listingId}/available-slots`)
      .query({ date: bookingDate })
      .expect(200);

    const slots = res.body.data ?? res.body;
    expect(Array.isArray(slots)).toBe(true);
    expect(slots.length).toBeGreaterThan(0);
    const slot10 = slots.find((s: any) => s.startTime === '10:00');
    expect(slot10).toBeDefined();
    expect(slot10.available).toBe(true);
  });

  it('Step 3 — Renter A books 10:00–12:00 (201, pending)', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/bookings')
      .set('Authorization', `Bearer ${renterAToken}`)
      .send({
        listingId,
        startDate: bookingDate,
        endDate: bookingDate,
        startTime: '10:00',
        endTime: '12:00',
      })
      .expect(201);

    const b = res.body.data ?? res.body;
    expect(b.status).toBe('pending');
    bookingAId = b.id;
  });

  it('Step 4 — Host confirms Renter A booking → confirmed', async () => {
    expect(bookingAId).toBeTruthy();
    const res = await request(app.getHttpServer())
      .patch(`/api/bookings/${bookingAId}/confirm`)
      .set('Authorization', `Bearer ${hostToken}`)
      .expect(200);

    const b = res.body.data ?? res.body;
    expect(b.status).toBe('confirmed');
  });

  it('Step 5 — GET /available-slots: 10:00 slot now unavailable', async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/listings/${listingId}/available-slots`)
      .query({ date: bookingDate })
      .expect(200);

    const slots = res.body.data ?? res.body;
    const slot10 = slots.find((s: any) => s.startTime === '10:00');
    if (slot10) {
      // If still in list, must be flagged unavailable
      expect(slot10.available).toBe(false);
    }
    // Slot omitted entirely is also valid
  });

  it('Step 6a — Renter B: exact same slot (10:00–12:00) is rejected with 409', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/bookings')
      .set('Authorization', `Bearer ${renterBToken}`)
      .send({
        listingId,
        startDate: bookingDate,
        endDate: bookingDate,
        startTime: '10:00',
        endTime: '12:00',
      })
      .expect(409);

    expect(res.body.message).toMatch(/not available/i);
  });

  it('Step 6b — Renter B: partial-overlap slot (11:00–13:00) is rejected with 409', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/bookings')
      .set('Authorization', `Bearer ${renterBToken}`)
      .send({
        listingId,
        startDate: bookingDate,
        endDate: bookingDate,
        startTime: '11:00',
        endTime: '13:00',
      })
      .expect(409);

    expect(res.body.message).toMatch(/not available/i);
  });

  it('Step 8 — Renter B: non-overlapping slot (16:00–18:00) is accepted (201)', async () => {
    // Use 16:00–18:00 (well clear of the 10:00–12:00 confirmed slot)
    const res = await request(app.getHttpServer())
      .post('/api/bookings')
      .set('Authorization', `Bearer ${renterBToken}`)
      .send({
        listingId,
        startDate: bookingDate,
        endDate: bookingDate,
        startTime: '16:00',
        endTime: '18:00',
      })
      .expect(201);

    const b = res.body.data ?? res.body;
    expect(b.status).toBe('pending');
  });

  it('Step 9 — Concurrency Proof: two exact same SLOT accepts at the EXACT same time', async () => {
    // 1. Create two pending bookings for the exact same slot (18:00–20:00)
    // Renter A
    const resA = await request(app.getHttpServer())
      .post('/api/bookings')
      .set('Authorization', `Bearer ${renterAToken}`)
      .send({
        listingId,
        startDate: bookingDate,
        endDate: bookingDate,
        startTime: '18:00',
        endTime: '20:00',
      })
      .expect(201);
    const pendingAId = (resA.body.data ?? resA.body).id;

    // Renter B
    const resB = await request(app.getHttpServer())
      .post('/api/bookings')
      .set('Authorization', `Bearer ${renterBToken}`)
      .send({
        listingId,
        startDate: bookingDate,
        endDate: bookingDate,
        startTime: '18:00',
        endTime: '20:00',
      })
      .expect(201);
    const pendingBId = (resB.body.data ?? resB.body).id;

    // 2. Both are currently pending and legally overlap
    // 3. The Host attempts to accept BOTH at the exact same millisecond
    const p1 = request(app.getHttpServer())
      .patch(`/api/bookings/${pendingAId}/confirm`)
      .set('Authorization', `Bearer ${hostToken}`);
    const p2 = request(app.getHttpServer())
      .patch(`/api/bookings/${pendingBId}/confirm`)
      .set('Authorization', `Bearer ${hostToken}`);

    const [out1, out2] = await Promise.all([p1, p2]);

    // 4. Exactly one must succeed (200 OK) and one must safely fail (409 Conflict)
    const statusCodes = [out1.status, out2.status].sort();

    expect(statusCodes).toEqual([200, 409]); // One 200, one 409

    // The failing one should have the conflict message
    const failingResponse = out1.status === 409 ? out1 : out2;
    expect(failingResponse.body.message).toMatch(/not available|overlap/i);
  });

});
