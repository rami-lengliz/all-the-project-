import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/database/prisma.service';
import { TransformInterceptor } from '../src/common/interceptors/transform.interceptor';

// Use require() style — avoids "request is not a function" with some tsconfig/esModuleInterop combos
// eslint-disable-next-line @typescript-eslint/no-var-requires
const request = require('supertest');

/**
 * E2E test for GET /api/categories/nearby
 *
 * Prerequisites:
 *   docker-compose up -d postgres
 *   npx prisma migrate deploy
 *
 * DB state strategy:
 *   - Creates minimal fixtures inside beforeAll (2 categories + 1 host + 3 listings)
 *   - All fixtures use a unique SUFFIX so they don't collide with seed data or other runs
 *   - afterAll cleans up only the fixtures created by this test
 *   - Works with or without seed data in the DB
 *
 * Response shape (TransformInterceptor wraps all responses):
 *   { success: true, data: [...], timestamp: "..." }
 *   data[] items: { id, name, slug, icon, count }
 */
describe('GET /api/categories/nearby (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService | undefined;

  // Unique suffix per test run to avoid collisions
  const SUFFIX = `nearby-${Date.now()}`;

  // Kelibia, Tunisia — same coords used in seed
  const LAT = 36.8578;
  const LNG = 11.092;
  const RADIUS_KM = 10;

  let catAId: string;
  let catBId: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();

    // Apply the same global setup as main.ts so responses are wrapped correctly
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

    // ── Create 2 test categories ─────────────────────────────────────────────
    const catA = await prisma.category.create({
      data: {
        name: `Accommodation ${SUFFIX}`,
        slug: `accommodation-${SUFFIX}`,
        icon: '🏠',
        allowedForPrivate: true,
      },
    });
    const catB = await prisma.category.create({
      data: {
        name: `Mobility ${SUFFIX}`,
        slug: `mobility-${SUFFIX}`,
        icon: '🚗',
        allowedForPrivate: true,
      },
    });
    catAId = catA.id;
    catBId = catB.id;

    // ── Create a host user ───────────────────────────────────────────────────
    // User schema: roles (String[]), isHost (Boolean), verifiedEmail (Boolean)
    const bcrypt = require('bcrypt');
    const hash = await bcrypt.hash('password123', 10);
    const host = await prisma.user.create({
      data: {
        name: `Host ${SUFFIX}`,
        email: `host-${SUFFIX}@test.com`,
        passwordHash: hash,
        roles: ['user', 'host'],
        isHost: true,
        verifiedEmail: true,
      },
    });

    // ── Create 3 listings near Kelibia via raw SQL (PostGIS geometry) ────────
    // catA gets 2 listings, catB gets 1 → catA must appear first in sorted results
    await prisma.$executeRaw`
      INSERT INTO listings (
        id, title, description, "categoryId", "hostId",
        "pricePerDay", address, location, "bookingType", "isActive",
        "createdAt", "updatedAt"
      ) VALUES
        (
          gen_random_uuid(),
          ${`Listing A1 ${SUFFIX}`}, 'desc',
          ${catAId}::uuid, ${host.id}::uuid,
          100, 'Kelibia',
          ST_SetSRID(ST_MakePoint(${LNG}, ${LAT}), 4326),
          'DAILY'::"BookingType", true, NOW(), NOW()
        ),
        (
          gen_random_uuid(),
          ${`Listing A2 ${SUFFIX}`}, 'desc',
          ${catAId}::uuid, ${host.id}::uuid,
          120, 'Kelibia',
          ST_SetSRID(ST_MakePoint(${LNG + 0.001}, ${LAT + 0.001}), 4326),
          'DAILY'::"BookingType", true, NOW(), NOW()
        ),
        (
          gen_random_uuid(),
          ${`Listing B1 ${SUFFIX}`}, 'desc',
          ${catBId}::uuid, ${host.id}::uuid,
          80, 'Kelibia',
          ST_SetSRID(ST_MakePoint(${LNG - 0.001}, ${LAT - 0.001}), 4326),
          'DAILY'::"BookingType", true, NOW(), NOW()
        )
    `;
  });

  afterAll(async () => {
    // Guard: if app.init() failed (e.g. DB not running), prisma may be undefined
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

  // ─── Test 1: response shape ───────────────────────────────────────────────

  it('should return 200 with { success, data, timestamp }', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/categories/nearby')
      .query({ lat: LAT, lng: LNG, radiusKm: RADIUS_KM })
      .expect(200);

    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(typeof res.body.timestamp).toBe('string');
  });

  // ─── Test 2: each item has id, name, slug, count ─────────────────────────

  it('each item in data[] has id, name, slug, and count', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/categories/nearby')
      .query({ lat: LAT, lng: LNG, radiusKm: RADIUS_KM })
      .expect(200);

    const data: any[] = res.body.data;
    expect(data.length).toBeGreaterThan(0);

    data.forEach((item: any) => {
      expect(typeof item.id).toBe('string');
      expect(item.id.length).toBeGreaterThan(0);

      expect(typeof item.name).toBe('string');
      expect(item.name.length).toBeGreaterThan(0);

      expect(typeof item.slug).toBe('string');
      expect(item.slug.length).toBeGreaterThan(0);

      // count must be a number, not a string
      expect(typeof item.count).toBe('number');
      expect(Number.isFinite(item.count)).toBe(true);
    });
  });

  // ─── Test 3: count is a number (not a string) ────────────────────────────

  it('count is a number (not a string)', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/categories/nearby')
      .query({ lat: LAT, lng: LNG, radiusKm: RADIUS_KM })
      .expect(200);

    const data: any[] = res.body.data;
    data.forEach((item: any) => {
      // Explicitly guard against Prisma returning BigInt as string
      expect(typeof item.count).toBe('number');
      expect(item.count).not.toBeNaN();
    });
  });

  // ─── Test 4: sorted by count descending ──────────────────────────────────

  it('array is ordered by count descending (first.count >= last.count)', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/categories/nearby')
      .query({ lat: LAT, lng: LNG, radiusKm: RADIUS_KM })
      .expect(200);

    const data: any[] = res.body.data;
    expect(data.length).toBeGreaterThan(1);

    // Check every adjacent pair
    for (let i = 0; i < data.length - 1; i++) {
      expect(data[i].count).toBeGreaterThanOrEqual(data[i + 1].count);
    }
  });

  // ─── Test 5: our fixtures appear and catA (2 listings) before catB (1) ───

  it('our test category with 2 listings appears before the one with 1 listing', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/categories/nearby')
      .query({ lat: LAT, lng: LNG, radiusKm: RADIUS_KM })
      .expect(200);

    const data: any[] = res.body.data;

    const idxA = data.findIndex(
      (d: any) => d.slug === `accommodation-${SUFFIX}`,
    );
    const idxB = data.findIndex((d: any) => d.slug === `mobility-${SUFFIX}`);

    expect(idxA).toBeGreaterThanOrEqual(0); // catA must be present
    expect(idxB).toBeGreaterThanOrEqual(0); // catB must be present
    expect(idxA).toBeLessThan(idxB); // catA (count=2) before catB (count=1)

    expect(data[idxA].count).toBe(2);
    expect(data[idxB].count).toBe(1);
  });

  // ─── Test 6: categories with 0 listings are excluded by default ──────────

  it('does not include categories with 0 listings (default includeEmpty=false)', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/categories/nearby')
      .query({ lat: LAT, lng: LNG, radiusKm: RADIUS_KM })
      .expect(200);

    const data: any[] = res.body.data;
    data.forEach((item: any) => {
      expect(item.count).toBeGreaterThan(0);
    });
  });

  // ─── Test 7: validation — missing lat/lng returns 400 ────────────────────

  it('returns 400 when lat is missing', async () => {
    await request(app.getHttpServer())
      .get('/api/categories/nearby')
      .query({ lng: LNG, radiusKm: RADIUS_KM })
      .expect(400);
  });

  it('returns 400 when lng is missing', async () => {
    await request(app.getHttpServer())
      .get('/api/categories/nearby')
      .query({ lat: LAT, radiusKm: RADIUS_KM })
      .expect(400);
  });
});
