import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { AppModule } from './../src/app.module';
import { PrismaService } from './../src/database/prisma.service';
import { TransformInterceptor } from './../src/common/interceptors/transform.interceptor';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const request = require('supertest');

describe('Two-sided Reviews (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  let renterToken: string;
  let hostToken: string;
  let unrelatedToken: string;
  let renterId: string;
  let hostId: string;
  let listingId: string;
  let completedBookingId: string;
  let pendingBookingId: string;

  const SUFFIX = `rev-${Date.now()}`;
  const RENTER_EMAIL = `renter-${SUFFIX}@rentai.tn`;
  const HOST_EMAIL = `host-${SUFFIX}@rentai.tn`;
  const UNRELATED_EMAIL = `unrelated-${SUFFIX}@rentai.tn`;
  const PASSWORD = 'password123';

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalInterceptors(new TransformInterceptor());
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    );
    await app.init();
    prisma = moduleFixture.get<PrismaService>(PrismaService);

    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const bcrypt = require('bcrypt');
    const hash = await bcrypt.hash(PASSWORD, 10);

    // Create users
    const renter = await prisma.user.create({
      data: { name: `Renter ${SUFFIX}`, email: RENTER_EMAIL, passwordHash: hash, verifiedEmail: true },
    });
    renterId = renter.id;

    const host = await prisma.user.create({
      data: { name: `Host ${SUFFIX}`, email: HOST_EMAIL, passwordHash: hash, isHost: true, verifiedEmail: true },
    });
    hostId = host.id;

    await prisma.user.create({
      data: { name: `Unrelated ${SUFFIX}`, email: UNRELATED_EMAIL, passwordHash: hash, verifiedEmail: true },
    });

    // Category + listing
    let category = await prisma.category.findFirst();
    if (!category) {
      category = await prisma.category.create({ data: { name: 'Test', slug: `test-${SUFFIX}` } });
    }

    const listing = await prisma.listing.create({
      data: {
        title: `Listing ${SUFFIX}`,
        description: 'e2e test listing',
        pricePerDay: 100,
        hostId,
        categoryId: category.id,
        bookingType: 'DAILY',
        address: 'Tunis',
        status: 'ACTIVE',
        isActive: true,
      },
    });
    listingId = listing.id;

    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const twoDaysAgo = new Date();
    twoDaysAgo.setDate(twoDaysAgo.getDate() - 2);

    // Completed booking
    const completedBooking = await prisma.booking.create({
      data: {
        listingId,
        renterId,
        hostId,
        startDate: twoDaysAgo,
        endDate: yesterday,
        totalPrice: 100,
        commission: 10,
        status: 'completed',
        snapshotTitle: listing.title,
      },
    });
    completedBookingId = completedBooking.id;

    // Pending booking (not reviewable)
    const pendingBooking = await prisma.booking.create({
      data: {
        listingId,
        renterId,
        hostId,
        startDate: new Date(),
        endDate: new Date(),
        totalPrice: 100,
        commission: 10,
        status: 'pending',
        snapshotTitle: listing.title,
      },
    });
    pendingBookingId = pendingBooking.id;

    // Get tokens
    const renterLogin = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ emailOrPhone: RENTER_EMAIL, password: PASSWORD });
    renterToken = renterLogin.body?.data?.accessToken ?? renterLogin.body?.accessToken;

    const hostLogin = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ emailOrPhone: HOST_EMAIL, password: PASSWORD });
    hostToken = hostLogin.body?.data?.accessToken ?? hostLogin.body?.accessToken;

    const unrelatedLogin = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ emailOrPhone: UNRELATED_EMAIL, password: PASSWORD });
    unrelatedToken = unrelatedLogin.body?.data?.accessToken ?? unrelatedLogin.body?.accessToken;
  });

  afterAll(async () => {
    await prisma.review.deleteMany({ where: { listingId } });
    await prisma.booking.deleteMany({ where: { listingId } });
    await prisma.listing.deleteMany({ where: { id: listingId } });
    await prisma.user.deleteMany({ where: { email: { in: [RENTER_EMAIL, HOST_EMAIL, UNRELATED_EMAIL] } } });
    await app.close();
  });

  describe('POST /api/reviews — eligibility guards', () => {
    it('cannot review a pending booking (400)', async () => {
      await request(app.getHttpServer())
        .post('/api/reviews')
        .set('Authorization', `Bearer ${renterToken}`)
        .send({ bookingId: pendingBookingId, rating: 5, comment: 'Great!' })
        .expect(400);
    });

    it('unrelated user cannot review (403)', async () => {
      await request(app.getHttpServer())
        .post('/api/reviews')
        .set('Authorization', `Bearer ${unrelatedToken}`)
        .send({ bookingId: completedBookingId, rating: 5 })
        .expect(403);
    });

    it('invalid rating (< 1) rejected (400)', async () => {
      await request(app.getHttpServer())
        .post('/api/reviews')
        .set('Authorization', `Bearer ${renterToken}`)
        .send({ bookingId: completedBookingId, rating: 0 })
        .expect(400);
    });

    it('invalid rating (> 5) rejected (400)', async () => {
      await request(app.getHttpServer())
        .post('/api/reviews')
        .set('Authorization', `Bearer ${renterToken}`)
        .send({ bookingId: completedBookingId, rating: 6 })
        .expect(400);
    });
  });

  describe('POST /api/reviews — two-sided reviews on completed booking', () => {
    it('renter can review host after completed booking (201/200)', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/reviews')
        .set('Authorization', `Bearer ${renterToken}`)
        .send({ bookingId: completedBookingId, rating: 4, comment: 'Great host!' })
        .expect((r) => expect([200, 201]).toContain(r.status));

      const review = res.body?.data ?? res.body;
      expect(review.authorId).toBe(renterId);
      expect(review.targetUserId).toBe(hostId);
      expect(review.type).toBe('RENTER_TO_HOST');
      expect(review.rating).toBe(4);
    });

    it('host can review renter after completed booking (201/200)', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/reviews')
        .set('Authorization', `Bearer ${hostToken}`)
        .send({ bookingId: completedBookingId, rating: 5, comment: 'Excellent renter!' })
        .expect((r) => expect([200, 201]).toContain(r.status));

      const review = res.body?.data ?? res.body;
      expect(review.authorId).toBe(hostId);
      expect(review.targetUserId).toBe(renterId);
      expect(review.type).toBe('HOST_TO_RENTER');
      expect(review.rating).toBe(5);
    });

    it('renter cannot submit a duplicate review for same booking (400)', async () => {
      await request(app.getHttpServer())
        .post('/api/reviews')
        .set('Authorization', `Bearer ${renterToken}`)
        .send({ bookingId: completedBookingId, rating: 3 })
        .expect(400);
    });
  });

  describe('GET /api/reviews/listing/:listingId — listing rating', () => {
    it('listing reviews returns only RENTER_TO_HOST reviews', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/reviews/listing/${listingId}`)
        .expect(200);

      const items = res.body?.data ?? res.body;
      const arr: any[] = Array.isArray(items) ? items : [];
      expect(arr.length).toBeGreaterThan(0);
      arr.forEach((r) => expect(r.type).toBe('RENTER_TO_HOST'));
    });

    it('listing ratingAvg updated after renter review', async () => {
      const listing = await prisma.listing.findUnique({
        where: { id: listingId },
        select: { ratingAvg: true },
      });
      expect(Number(listing!.ratingAvg)).toBeCloseTo(4, 0);
    });
  });

  describe('GET /api/reviews/user/:userId — user rating', () => {
    it('host user ratingAvg updated after renter review', async () => {
      const host = await prisma.user.findUnique({
        where: { id: hostId },
        select: { ratingAvg: true, ratingCount: true },
      });
      expect(Number(host!.ratingAvg)).toBeCloseTo(4, 0);
      expect(host!.ratingCount).toBeGreaterThan(0);
    });

    it('renter user ratingAvg updated after host review', async () => {
      const renter = await prisma.user.findUnique({
        where: { id: renterId },
        select: { ratingAvg: true, ratingCount: true },
      });
      expect(Number(renter!.ratingAvg)).toBeCloseTo(5, 0);
      expect(renter!.ratingCount).toBeGreaterThan(0);
    });
  });

  describe('GET /api/reviews/booking/:bookingId — per-booking reviews', () => {
    it('returns both reviews for completed booking', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/reviews/booking/${completedBookingId}`)
        .set('Authorization', `Bearer ${renterToken}`)
        .expect(200);

      const items = res.body?.data ?? res.body;
      const arr: any[] = Array.isArray(items) ? items : [];
      expect(arr.length).toBe(2);
      const types = arr.map((r) => r.type);
      expect(types).toContain('RENTER_TO_HOST');
      expect(types).toContain('HOST_TO_RENTER');
    });
  });
});
