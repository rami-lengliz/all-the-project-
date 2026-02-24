import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/database/prisma.service';
import { TransformInterceptor } from '../src/common/interceptors/transform.interceptor';
import { HttpExceptionFilter } from '../src/common/filters/http-exception.filter';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const request = require('supertest');

/**
 * Ledger E2E tests — Wallet Ledger v1
 *
 * Self-contained: seeds its own data, cleans up after.
 * Requires a running Postgres on DATABASE_URL.
 *
 * Run:
 *   npx jest --config test/jest-e2e.json test/ledger.e2e-spec.ts --forceExit
 */
describe('Wallet Ledger v1 E2E', () => {
    let app: INestApplication;
    let prisma: PrismaService;

    let adminToken: string;
    let hostToken: string;
    let renterToken: string;

    let hostId: string;
    let bookingId: string;

    const COMMISSION_RATE = 0.1;
    const TOTAL = 300.0;
    const PW = 'password123';
    const SUFFIX = `ledger-${Date.now()}`;
    const ADMIN_EMAIL = `ladmin-${SUFFIX}@test.com`;
    const HOST_EMAIL = `lhost-${SUFFIX}@test.com`;
    const RENTER_EMAIL = `lrenter-${SUFFIX}@test.com`;

    beforeAll(async () => {
        const moduleFixture: TestingModule = await Test.createTestingModule({
            imports: [AppModule],
        }).compile();

        app = moduleFixture.createNestApplication();
        app.useGlobalInterceptors(new TransformInterceptor());
        app.useGlobalFilters(new HttpExceptionFilter());
        app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
        await app.init();

        prisma = moduleFixture.get<PrismaService>(PrismaService);
        await cleanup(prisma, SUFFIX);

        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const bcrypt = require('bcrypt');
        const hash = await bcrypt.hash(PW, 10);

        const host = await prisma.user.create({
            data: { name: `LHost-${SUFFIX}`, email: HOST_EMAIL, passwordHash: hash, roles: ['user', 'host'], isHost: true, verifiedEmail: true },
        });
        hostId = host.id;

        const renter = await prisma.user.create({
            data: { name: `LRenter-${SUFFIX}`, email: RENTER_EMAIL, passwordHash: hash, roles: ['user'], isHost: false, verifiedEmail: true },
        });

        await prisma.user.create({
            data: { name: `LAdmin-${SUFFIX}`, email: ADMIN_EMAIL, passwordHash: hash, roles: ['user', 'ADMIN'], isHost: false, verifiedEmail: true },
        });

        // Category + Listing
        const cat = await prisma.category.create({ data: { name: `LCat-${SUFFIX}`, slug: `lcat-${SUFFIX}` } });
        const listing = await prisma.listing.create({
            data: {
                hostId, title: `LListing-${SUFFIX}`, description: 'Ledger test listing', categoryId: cat.id,
                images: [], pricePerDay: TOTAL, address: '1 Ledger St', status: 'ACTIVE', isActive: true,
            },
        });

        // Booking (status: confirmed, ready for capture)
        const booking = await prisma.booking.create({
            data: {
                listingId: listing.id, renterId: renter.id, hostId,
                startDate: new Date('2028-01-10'), endDate: new Date('2028-01-11'),
                totalPrice: TOTAL,
                commission: +(TOTAL * COMMISSION_RATE).toFixed(2),
                status: 'confirmed',
                snapshotTitle: listing.title,
                snapshotPricePerDay: TOTAL,
                snapshotCommissionRate: COMMISSION_RATE,
                snapshotCurrency: 'TND',
            },
        });
        bookingId = booking.id;

        // Payment intent at 'authorized' state (ready to capture)
        await prisma.paymentIntent.create({
            data: { bookingId, renterId: renter.id, hostId, amount: TOTAL, currency: 'TND', status: 'authorized' },
        });

        // Get tokens (login using emailOrPhone field)
        const lr = (email: string) =>
            request(app.getHttpServer()).post('/api/auth/login').send({ emailOrPhone: email, password: PW });

        const adminRes = await lr(ADMIN_EMAIL);
        adminToken = adminRes.body.data?.accessToken ?? adminRes.body?.accessToken;

        const hostRes = await lr(HOST_EMAIL);
        hostToken = hostRes.body.data?.accessToken ?? hostRes.body?.accessToken;

        const renterRes = await lr(RENTER_EMAIL);
        renterToken = renterRes.body.data?.accessToken ?? renterRes.body?.accessToken;
    });

    afterAll(async () => {
        await cleanup(prisma, SUFFIX);
        await app.close();
    });

    // ----------------------------------------------------------------
    // Test 1: capture creates exactly 3 ledger entries
    // ----------------------------------------------------------------
    it('capture creates exactly 3 ledger entries with correct totals', async () => {
        // capture endpoint requires auth (JwtAuthGuard); use host token
        const res = await request(app.getHttpServer())
            .post(`/api/payments/booking/${bookingId}/capture`)
            .set('Authorization', `Bearer ${hostToken}`);
        expect(res.status).toBeLessThan(300);

        const entries = await prisma.ledgerEntry.findMany({ where: { bookingId }, orderBy: { createdAt: 'asc' } });
        expect(entries).toHaveLength(3);

        const rent = entries.find((e) => e.type === 'RENT_PAID')!;
        const comm = entries.find((e) => e.type === 'COMMISSION')!;
        const host = entries.find((e) => e.type === 'HOST_PAYOUT_DUE')!;

        expect(Number(rent.amount)).toBe(TOTAL);
        expect(rent.direction).toBe('CREDIT');
        expect(rent.status).toBe('POSTED');

        const expComm = +(TOTAL * COMMISSION_RATE).toFixed(2);
        const expHostNet = +(TOTAL - expComm).toFixed(2);
        expect(Number(comm.amount)).toBe(expComm);
        expect(comm.direction).toBe('DEBIT');
        expect(Number(host.amount)).toBe(expHostNet);
        expect(host.direction).toBe('CREDIT');
    });

    // ----------------------------------------------------------------
    // Test 2: capture is idempotent (call twice → still 3 entries)
    // ----------------------------------------------------------------
    it('capture called twice does not create duplicate entries', async () => {
        await request(app.getHttpServer())
            .post(`/api/payments/booking/${bookingId}/capture`)
            .set('Authorization', `Bearer ${hostToken}`);

        const entries = await prisma.ledgerEntry.findMany({ where: { bookingId } });
        expect(entries).toHaveLength(3);
    });

    // ----------------------------------------------------------------
    // Test 3: refund reverses entries (3 originals REVERSED + 3 REFUND entries)
    // ----------------------------------------------------------------
    it('refund reverses original entries and creates REFUND entries', async () => {
        const res = await request(app.getHttpServer())
            .post(`/api/payments/booking/${bookingId}/refund`)
            .set('Authorization', `Bearer ${hostToken}`);
        expect(res.status).toBeLessThan(300);

        const all = await prisma.ledgerEntry.findMany({ where: { bookingId }, orderBy: { createdAt: 'asc' } });
        expect(all).toHaveLength(6);

        const originals = all.filter((e) => e.type !== 'REFUND');
        const refunds = all.filter((e) => e.type === 'REFUND');
        expect(originals).toHaveLength(3);
        expect(refunds).toHaveLength(3);

        originals.forEach((e) => expect(e.status).toBe('REVERSED'));
        refunds.forEach((e) => expect(e.status).toBe('POSTED'));
        originals.forEach((e) => expect(e.reversedEntryId).not.toBeNull());
    });

    // ----------------------------------------------------------------
    // Test 4: host balance is 0 net after full refund
    // ----------------------------------------------------------------
    it('host balance is 0 net after full refund', async () => {
        const res = await request(app.getHttpServer())
            .get(`/api/admin/hosts/${hostId}/balance`)
            .set('Authorization', `Bearer ${adminToken}`);
        expect(res.status).toBe(200);
        const balance = +(res.body?.data?.balance ?? res.body?.balance ?? 'NaN');
        expect(balance).toBe(0);
    });

    // ----------------------------------------------------------------
    // Test 5: admin ledger summary gross/commission/hostNet are 0 (all reversed)
    // ----------------------------------------------------------------
    it('admin ledger summary totals are 0 gross after full refund', async () => {
        const res = await request(app.getHttpServer())
            .get('/api/admin/ledger/summary')
            .set('Authorization', `Bearer ${adminToken}`);
        expect(res.status).toBe(200);
        const data = res.body?.data ?? res.body;
        expect(Number(data.gross)).toBe(0);      // RENT_PAID entries are REVERSED
        expect(Number(data.hostNet)).toBe(0);    // HOST_PAYOUT_DUE entries are REVERSED
        expect(Number(data.refundCount)).toBeGreaterThanOrEqual(3);
    });

    // ----------------------------------------------------------------
    // Test 6: booking ledger endpoint returns all 6 entries
    // ----------------------------------------------------------------
    it('admin booking ledger endpoint returns all 6 entries', async () => {
        const res = await request(app.getHttpServer())
            .get(`/api/admin/bookings/${bookingId}/ledger`)
            .set('Authorization', `Bearer ${adminToken}`);
        expect(res.status).toBe(200);
        const data = res.body?.data ?? res.body;
        expect(Array.isArray(data)).toBe(true);
        expect(data.length).toBe(6);
    });

    // ----------------------------------------------------------------
    // Test 7: auth guards — 401 unauthenticated, 403 non-admin
    // ----------------------------------------------------------------
    it('unauthenticated request to admin ledger returns 401', async () => {
        const res = await request(app.getHttpServer()).get('/api/admin/ledger/summary');
        expect(res.status).toBe(401);
    });

    it('non-admin user is forbidden from admin ledger (403)', async () => {
        const res = await request(app.getHttpServer())
            .get('/api/admin/ledger/summary')
            .set('Authorization', `Bearer ${renterToken}`);
        expect(res.status).toBe(403);
    });
});

async function cleanup(prisma: PrismaService, suffix: string) {
    try {
        const bookings = await prisma.booking.findMany({ where: { listing: { title: { contains: suffix } } }, select: { id: true } });
        const bids = bookings.map((b) => b.id);
        if (bids.length) {
            await prisma.ledgerEntry.deleteMany({ where: { bookingId: { in: bids } } });
            await prisma.paymentIntent.deleteMany({ where: { bookingId: { in: bids } } });
            await prisma.booking.deleteMany({ where: { id: { in: bids } } });
        }
        await prisma.listing.deleteMany({ where: { title: { contains: suffix } } });
        await prisma.category.deleteMany({ where: { slug: { contains: suffix } } });
        await prisma.user.deleteMany({
            where: { email: { in: [`ladmin-${suffix}@test.com`, `lhost-${suffix}@test.com`, `lrenter-${suffix}@test.com`] } },
        });
    } catch (_) { /* ignore */ }
}
