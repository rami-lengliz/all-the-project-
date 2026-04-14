import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/database/prisma.service';
import { TransformInterceptor } from '../src/common/interceptors/transform.interceptor';
import { HttpExceptionFilter } from '../src/common/filters/http-exception.filter';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const request = require('supertest');

/**
 * Payouts v1 + Dispute Freeze E2E
 *
 * Run:
 *   npx jest --config test/jest-e2e.json test/payouts.e2e-spec.ts --forceExit
 */
describe('Payouts v1 + Dispute Freeze E2E', () => {
    let app: INestApplication;
    let prisma: PrismaService;

    let adminToken: string;
    let hostToken: string;
    let hostId: string;

    const COMMISSION_RATE = 0.1;
    const TOTAL = 500.0;            // booking total
    const HOST_NET = TOTAL * (1 - COMMISSION_RATE); // 450 per booking
    const PW = 'password123';
    const SUFFIX = `payouts-${Date.now()}`;
    const ADMIN_EMAIL = `pa-${SUFFIX}@test.com`;
    const HOST_EMAIL = `ph-${SUFFIX}@test.com`;
    const RENTER_EMAIL = `pr-${SUFFIX}@test.com`;

    // Booking IDs so we can dispute one
    let bookingId1: string;
    let bookingId2: string;

    beforeAll(async () => {
        const moduleFixture: TestingModule = await Test.createTestingModule({ imports: [AppModule] }).compile();
        app = moduleFixture.createNestApplication();
        app.useGlobalInterceptors(new TransformInterceptor());
        app.useGlobalFilters(new HttpExceptionFilter());
        app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
        await app.init();

        prisma = moduleFixture.get<PrismaService>(PrismaService);

        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const hash = await require('bcrypt').hash(PW, 10);

        const host = await prisma.user.create({
            data: { name: `PH-${SUFFIX}`, email: HOST_EMAIL, passwordHash: hash, roles: ['user', 'host'], isHost: true, verifiedEmail: true },
        });
        hostId = host.id;

        const renter = await prisma.user.create({
            data: { name: `PR-${SUFFIX}`, email: RENTER_EMAIL, passwordHash: hash, roles: ['user'], isHost: false, verifiedEmail: true },
        });
        await prisma.user.create({
            data: { name: `PA-${SUFFIX}`, email: ADMIN_EMAIL, passwordHash: hash, roles: ['user', 'ADMIN'], isHost: false, verifiedEmail: true },
        });

        const cat = await prisma.category.create({ data: { name: `PC-${SUFFIX}`, slug: `pc-${SUFFIX}` } });

        const listing = await prisma.listing.create({
            data: { hostId, title: `PL-${SUFFIX}`, description: 'd', categoryId: cat.id, images: [], pricePerDay: TOTAL, address: 'x', status: 'ACTIVE', isActive: true },
        });

        // Create 2 captured bookings with HOST_PAYOUT_DUE entries
        for (let i = 1; i <= 2; i++) {
            const booking = await prisma.booking.create({
                data: {
                    listingId: listing.id, renterId: renter.id, hostId,
                    startDate: new Date(`2030-0${i}-10`), endDate: new Date(`2030-0${i}-11`),
                    totalPrice: TOTAL, commission: +(TOTAL * COMMISSION_RATE).toFixed(2),
                    status: 'confirmed',
                    snapshotTitle: listing.title, snapshotPricePerDay: TOTAL,
                    snapshotCommissionRate: COMMISSION_RATE, snapshotCurrency: 'TND',
                },
            });
            if (i === 1) bookingId1 = booking.id;
            if (i === 2) bookingId2 = booking.id;

            await prisma.paymentIntent.create({
                data: { bookingId: booking.id, renterId: renter.id, hostId, amount: TOTAL, currency: 'TND', status: 'authorized' },
            });
        }

        // Login
        const lr = (email: string) => request(app.getHttpServer()).post('/api/auth/login').send({ emailOrPhone: email, password: PW });
        const adminRes = await lr(ADMIN_EMAIL);
        adminToken = adminRes.body.data?.accessToken;
        const hostRes = await lr(HOST_EMAIL);
        hostToken = hostRes.body.data?.accessToken;

        // Capture both bookings — this seeds HOST_PAYOUT_DUE ledger entries
        for (const bId of [bookingId1, bookingId2]) {
            const res = await request(app.getHttpServer())
                .post(`/api/payments/booking/${bId}/capture`)
                .set('Authorization', `Bearer ${hostToken}`);
            expect(res.status).toBeLessThan(300);
        }
    });

    afterAll(async () => {
        // Cleanup in FK-safe order
        await prisma.payoutItem.deleteMany({ where: { payout: { hostId } } }).catch(() => { });
        await prisma.payout.deleteMany({ where: { hostId } }).catch(() => { });
        const bookings = await prisma.booking.findMany({ where: { hostId }, select: { id: true } });
        const bids = bookings.map((b) => b.id);
        if (bids.length) {
            await prisma.ledgerEntry.deleteMany({ where: { bookingId: { in: bids } } }).catch(() => { });
            await prisma.paymentIntent.deleteMany({ where: { bookingId: { in: bids } } }).catch(() => { });
            await prisma.booking.deleteMany({ where: { id: { in: bids } } }).catch(() => { });
        }
        await prisma.listing.deleteMany({ where: { title: { contains: SUFFIX } } }).catch(() => { });
        await prisma.category.deleteMany({ where: { slug: { contains: SUFFIX } } }).catch(() => { });
        await prisma.user.deleteMany({ where: { email: { in: [ADMIN_EMAIL, HOST_EMAIL, RENTER_EMAIL] } } }).catch(() => { });
        await app.close();
    });

    // ----------------------------------------------------------------
    // Test 1: host balance = 2 × HOST_NET after 2 captures
    // ----------------------------------------------------------------
    it('host balance equals 2 × HOST_NET after two captures', async () => {
        const res = await request(app.getHttpServer())
            .get(`/api/admin/hosts/${hostId}/balance`)
            .set('Authorization', `Bearer ${adminToken}`);
        expect(res.status).toBe(200);
        const balance = +(res.body?.data?.balance ?? res.body?.balance);
        expect(balance).toBeCloseTo(HOST_NET * 2, 2);
    });

    // ----------------------------------------------------------------
    // Test 2: create payout ≤ balance → returns PENDING + payoutItems
    // ----------------------------------------------------------------
    let payoutId: string;
    it('create payout ≤ balance returns PENDING payout with payoutItems', async () => {
        const amount = HOST_NET; // pay out exactly one booking's worth
        const res = await request(app.getHttpServer())
            .post(`/api/admin/hosts/${hostId}/payouts`)
            .set('Authorization', `Bearer ${adminToken}`)
            .send({ amount, method: 'bank_transfer', reference: 'REF-001', notes: 'First test payout' });
        expect(res.status).toBeLessThan(300);

        const data = res.body?.data ?? res.body;
        expect(data.payout).toBeDefined();
        expect(data.payout.status).toBe('PENDING');
        expect(+data.payout.amount).toBeCloseTo(amount, 2);
        expect(data.itemsCount).toBeGreaterThanOrEqual(1);
        payoutId = data.payout.id;
    });

    // ----------------------------------------------------------------
    // Test 3: mark payout paid → balance decreases
    // ----------------------------------------------------------------
    it('mark payout paid decreases host balance by payout amount', async () => {
        const res = await request(app.getHttpServer())
            .patch(`/api/admin/payouts/${payoutId}/mark-paid`)
            .set('Authorization', `Bearer ${adminToken}`)
            .send({ method: 'bank_transfer', reference: 'REF-001' });
        expect(res.status).toBeLessThan(300);

        const data = res.body?.data ?? res.body;
        expect(data.status).toBe('PAID');

        const balRes = await request(app.getHttpServer())
            .get(`/api/admin/hosts/${hostId}/balance`)
            .set('Authorization', `Bearer ${adminToken}`);
        const newBalance = +(balRes.body?.data?.balance ?? balRes.body?.balance);
        // Should be approximately 1 × HOST_NET now (was 2, paid out 1)
        expect(newBalance).toBeCloseTo(HOST_NET, 2);
    });

    // ----------------------------------------------------------------
    // Test 4: double-pay prevention — same ledger entries already in PayoutItems
    // ----------------------------------------------------------------
    it('second payout cannot reuse already-linked ledger entries (picks remaining only)', async () => {
        // Try to request more than remaining balance
        const res = await request(app.getHttpServer())
            .post(`/api/admin/hosts/${hostId}/payouts`)
            .set('Authorization', `Bearer ${adminToken}`)
            .send({ amount: HOST_NET * 2, method: 'cash' }); // exceeds remaining balance

        // Should fail: amount > available balance
        expect(res.status).toBeGreaterThanOrEqual(400);

        // But we can still payout the remaining HOST_NET (one unpaid booking)
        const okRes = await request(app.getHttpServer())
            .post(`/api/admin/hosts/${hostId}/payouts`)
            .set('Authorization', `Bearer ${adminToken}`)
            .send({ amount: HOST_NET, method: 'cash' });
        expect(okRes.status).toBeLessThan(300);
        const data = okRes.body?.data ?? okRes.body;
        expect(data.payout.status).toBe('PENDING');
    });

    // ----------------------------------------------------------------
    // Test 5: dispute freeze — open dispute on booking, payout must exclude entries
    // ----------------------------------------------------------------
    it('opening dispute on a booking prevents its entries from being included in new payouts', async () => {
        // First mark the 2nd payout (from test 4) as paid so entries are consumed
        const payouts = await prisma.payout.findMany({ where: { hostId, status: 'PENDING' } });
        for (const p of payouts) {
            await request(app.getHttpServer())
                .patch(`/api/admin/payouts/${p.id}/mark-paid`)
                .set('Authorization', `Bearer ${adminToken}`)
                .send({ method: 'cash', reference: 'REF-CASH' });
        }

        // Create a NEW booking + capture to get fresh HOST_PAYOUT_DUE entry
        const renterUser = await prisma.user.findUnique({ where: { email: RENTER_EMAIL } });
        const listing = await prisma.listing.findFirst({ where: { hostId } });
        const newBooking = await prisma.booking.create({
            data: {
                listingId: listing!.id, renterId: renterUser!.id, hostId,
                startDate: new Date('2031-01-10'), endDate: new Date('2031-01-11'),
                totalPrice: TOTAL, commission: +(TOTAL * COMMISSION_RATE).toFixed(2),
                status: 'confirmed', snapshotTitle: 't', snapshotPricePerDay: TOTAL,
                snapshotCommissionRate: COMMISSION_RATE, snapshotCurrency: 'TND',
            },
        });
        await prisma.paymentIntent.create({
            data: { bookingId: newBooking.id, renterId: renterUser!.id, hostId, amount: TOTAL, currency: 'TND', status: 'authorized' },
        });
        // Capture it
        await request(app.getHttpServer())
            .post(`/api/payments/booking/${newBooking.id}/capture`)
            .set('Authorization', `Bearer ${hostToken}`);

        // Open dispute on the new booking
        const disputeRes = await request(app.getHttpServer())
            .patch(`/api/admin/bookings/${newBooking.id}/dispute/open`)
            .set('Authorization', `Bearer ${adminToken}`);
        expect(disputeRes.status).toBeLessThan(300);

        // Check booking disputeStatus in DB
        const updated = await prisma.booking.findUnique({ where: { id: newBooking.id } });
        expect(updated?.disputeStatus).toBe('OPEN');

        // Attempt to create a payout — should fail because the only eligible entry is disputed
        const payoutRes = await request(app.getHttpServer())
            .post(`/api/admin/hosts/${hostId}/payouts`)
            .set('Authorization', `Bearer ${adminToken}`)
            .send({ amount: HOST_NET, method: 'bank_transfer' });

        expect(payoutRes.status).toBeGreaterThanOrEqual(400); // 400 Bad Request: no eligible entries or insufficient

        // Resolve dispute — now payout should succeed
        await request(app.getHttpServer())
            .patch(`/api/admin/bookings/${newBooking.id}/dispute/resolve`)
            .set('Authorization', `Bearer ${adminToken}`);

        const afterResolveRes = await request(app.getHttpServer())
            .post(`/api/admin/hosts/${hostId}/payouts`)
            .set('Authorization', `Bearer ${adminToken}`)
            .send({ amount: HOST_NET, method: 'bank_transfer' });
        expect(afterResolveRes.status).toBeLessThan(300);
    });

    // ----------------------------------------------------------------
    // Test 6: GET /api/admin/payouts lists payouts
    // ----------------------------------------------------------------
    it('GET /api/admin/payouts returns a list of payouts', async () => {
        const res = await request(app.getHttpServer())
            .get('/api/admin/payouts')
            .set('Authorization', `Bearer ${adminToken}`);
        expect(res.status).toBe(200);
        const data = res.body?.data ?? res.body;
        expect(Array.isArray(data.payouts)).toBe(true);
        expect(data.payouts.length).toBeGreaterThan(0);
    });
});
