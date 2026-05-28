import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { AppModule } from './../src/app.module';
import { PrismaService } from './../src/database/prisma.service';
import { TransformInterceptor } from './../src/common/interceptors/transform.interceptor';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const request = require('supertest');

describe('Admin Users Search & Listings (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  let adminToken: string;
  let renterToken: string;
  let hostUserId: string;
  let listingId: string;

  const SUFFIX = `admsrch-${Date.now()}`;
  const ADMIN_EMAIL = `admin-${SUFFIX}@example.com`;
  const HOST_EMAIL = `host-${SUFFIX}@rentai.tn`;
  const HOST_PHONE = `+216${Math.floor(10000000 + Math.random() * 89999999)}`;
  const RENTER_EMAIL = `renter-${SUFFIX}@example.com`;
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

    // Admin
    await prisma.user.create({
      data: {
        name: `Admin ${SUFFIX}`,
        email: ADMIN_EMAIL,
        passwordHash: hash,
        roles: ['ADMIN'],
        verifiedEmail: true,
      },
    });

    // Host with a listing
    const hostUser = await prisma.user.create({
      data: {
        name: `HostUser ${SUFFIX}`,
        email: HOST_EMAIL,
        phone: HOST_PHONE,
        passwordHash: hash,
        isHost: true,
        verifiedEmail: true,
      },
    });
    hostUserId = hostUser.id;

    // Renter
    await prisma.user.create({
      data: {
        name: `Renter ${SUFFIX}`,
        email: RENTER_EMAIL,
        passwordHash: hash,
        verifiedEmail: true,
      },
    });

    // Find or create a category
    let category = await prisma.category.findFirst();
    if (!category) {
      category = await prisma.category.create({
        data: { name: 'Test Category', slug: `test-cat-${SUFFIX}` },
      });
    }

    // Listing owned by host
    const listing = await prisma.listing.create({
      data: {
        title: `Listing ${SUFFIX}`,
        description: 'Test listing for admin search e2e',
        pricePerDay: 50,
        hostId: hostUserId,
        categoryId: category.id,
        bookingType: 'DAILY',
        address: 'Tunis, Tunisia',
        status: 'ACTIVE',
        isActive: true,
      },
    });
    listingId = listing.id;

    // Get tokens
    const adminLogin = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: ADMIN_EMAIL, password: PASSWORD });
    adminToken = adminLogin.body?.data?.accessToken ?? adminLogin.body?.accessToken;

    const renterLogin = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: RENTER_EMAIL, password: PASSWORD });
    renterToken = renterLogin.body?.data?.accessToken ?? renterLogin.body?.accessToken;
  });

  afterAll(async () => {
    await prisma.listing.deleteMany({ where: { hostId: hostUserId } });
    await prisma.user.deleteMany({ where: { email: { in: [ADMIN_EMAIL, HOST_EMAIL, RENTER_EMAIL] } } });
    await app.close();
  });

  describe('GET /api/admin/users — search', () => {
    it('admin can search users by name', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/admin/users?search=HostUser+${SUFFIX}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      const items = res.body?.data ?? res.body;
      const arr: any[] = Array.isArray(items) ? items : items?.items ?? [];
      expect(arr.some((u: any) => u.email === HOST_EMAIL)).toBe(true);
    });

    it('admin can search users by email', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/admin/users?search=${encodeURIComponent(RENTER_EMAIL)}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      const items = res.body?.data ?? res.body;
      const arr: any[] = Array.isArray(items) ? items : items?.items ?? [];
      expect(arr.some((u: any) => u.email === RENTER_EMAIL)).toBe(true);
    });

    it('admin can search users by phone', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/admin/users?search=${encodeURIComponent(HOST_PHONE)}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      const items = res.body?.data ?? res.body;
      const arr: any[] = Array.isArray(items) ? items : items?.items ?? [];
      expect(arr.some((u: any) => u.email === HOST_EMAIL)).toBe(true);
    });

    it('non-admin cannot access user search (403)', async () => {
      await request(app.getHttpServer())
        .get(`/api/admin/users?search=test`)
        .set('Authorization', `Bearer ${renterToken}`)
        .expect(403);
    });
  });

  describe('GET /api/admin/users/:id/listings', () => {
    it('admin can fetch listings for a user', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/admin/users/${hostUserId}/listings`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      const items = res.body?.data ?? res.body;
      const arr: any[] = Array.isArray(items) ? items : items?.items ?? [];
      expect(arr.length).toBeGreaterThan(0);
      expect(arr[0].id).toBe(listingId);
    });

    it('response includes safe listing fields', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/admin/users/${hostUserId}/listings`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      const items = res.body?.data ?? res.body;
      const arr: any[] = Array.isArray(items) ? items : items?.items ?? [];
      const l = arr[0];
      expect(l).toHaveProperty('id');
      expect(l).toHaveProperty('title');
      expect(l).toHaveProperty('status');
      expect(l).toHaveProperty('pricePerDay');
      expect(l).toHaveProperty('category');
    });

    it('user profile only shows listings owned by that user', async () => {
      // Use the renter's id — they have no listings
      const renter = await prisma.user.findUnique({ where: { email: RENTER_EMAIL }, select: { id: true } });
      const res = await request(app.getHttpServer())
        .get(`/api/admin/users/${renter!.id}/listings`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      const items = res.body?.data ?? res.body;
      const arr: any[] = Array.isArray(items) ? items : items?.items ?? [];
      expect(arr.length).toBe(0);
    });

    it('non-admin cannot fetch admin user listings (403)', async () => {
      await request(app.getHttpServer())
        .get(`/api/admin/users/${hostUserId}/listings`)
        .set('Authorization', `Bearer ${renterToken}`)
        .expect(403);
    });
  });
});
