import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { AppModule } from './../src/app.module';
import { PrismaService } from './../src/database/prisma.service';
import { TransformInterceptor } from './../src/common/interceptors/transform.interceptor';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const request = require('supertest');

/**
 * Listing Moderation E2E — proves:
 *  1. A PENDING_REVIEW listing is NOT returned in public search.
 *  2. After admin approves, the listing IS returned in public search.
 */
describe('Listing Moderation (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  let adminToken: string;
  let listingId: string;

  const SUFFIX = `mod-${Date.now()}`;
  const ADMIN_EMAIL = `admin-${SUFFIX}@example.com`;
  const PASSWORD = 'password123';

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

    // Create admin user
    const bcrypt = require('bcrypt');
    const hash = await bcrypt.hash(PASSWORD, 10);
    await prisma.user.create({
      data: {
        name: `Admin ${SUFFIX}`,
        email: ADMIN_EMAIL,
        passwordHash: hash,
        roles: ['user', 'host', 'ADMIN'],
        isHost: true,
        verifiedEmail: true,
      },
    });

    // Login admin
    const loginRes = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ emailOrPhone: ADMIN_EMAIL, password: PASSWORD });
    adminToken = loginRes.body.data?.accessToken ?? loginRes.body.accessToken;

    // Create a category
    const cat = await prisma.category.create({
      data: {
        name: `Test Cat ${SUFFIX}`,
        slug: `test-cat-${SUFFIX}`,
        icon: '🏠',
        allowedForPrivate: true,
      },
    });

    // Create listing with status PENDING_REVIEW (default)
    const result = await prisma.$queryRaw<Array<{ id: string }>>`
      INSERT INTO listings (
        id, title, description, "categoryId", "hostId",
        "pricePerDay", address, location, "bookingType", "isActive", status,
        "createdAt", "updatedAt"
      ) VALUES (
        gen_random_uuid(),
        ${`Mod Villa ${SUFFIX}`}, 'Pending listing',
        ${cat.id}::uuid, ${(await prisma.user.findUnique({ where: { email: ADMIN_EMAIL } }))!.id}::uuid,
        100, 'Tunis',
        ST_SetSRID(ST_MakePoint(10.1658, 36.8065), 4326),
        'DAILY'::"BookingType", true, 'PENDING_REVIEW'::"ListingStatus", NOW(), NOW()
      )
      RETURNING id
    `;
    listingId = (result as any[])[0].id;
  });

  afterAll(async () => {
    if (prisma) {
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

  it('PENDING_REVIEW listing is NOT in public search', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/listings')
      .expect(200);

    const listings = res.body.data ?? res.body;
    const arr = Array.isArray(listings) ? listings : (listings.items ?? []);
    const found = arr.find((l: any) => l.id === listingId);
    expect(found).toBeUndefined();
  });

  it('Admin approves listing → status becomes ACTIVE', async () => {
    const res = await request(app.getHttpServer())
      .patch(`/api/admin/listings/${listingId}/approve`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    const listing = res.body.data ?? res.body;
    expect(listing.status).toBe('ACTIVE');
  });

  it('ACTIVE listing IS in public search', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/listings')
      .query({ lat: 36.8065, lng: 10.1658, radiusKm: 10 })
      .expect(200);

    const listings = res.body.data ?? res.body;
    const arr = Array.isArray(listings) ? listings : (listings.items ?? []);
    const found = arr.find((l: any) => l.id === listingId);
    expect(found).toBeDefined();
    expect(found.title).toContain(SUFFIX);
  });

  it('Admin suspends listing → status becomes SUSPENDED', async () => {
    const res = await request(app.getHttpServer())
      .patch(`/api/admin/listings/${listingId}/suspend`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    const listing = res.body.data ?? res.body;
    expect(listing.status).toBe('SUSPENDED');
  });

  it('SUSPENDED listing is NOT in public search', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/listings')
      .expect(200);

    const listings = res.body.data ?? res.body;
    const arr = Array.isArray(listings) ? listings : (listings.items ?? []);
    const found = arr.find((l: any) => l.id === listingId);
    expect(found).toBeUndefined();
  });
});
