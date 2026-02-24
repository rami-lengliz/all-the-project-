import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/database/prisma.service';
import { TransformInterceptor } from '../src/common/interceptors/transform.interceptor';
import { HttpExceptionFilter } from '../src/common/filters/http-exception.filter';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const request = require('supertest');

/**
 * Refund Guardrail v1 E2E
 *
 * Verifies that:
 *  - refund is blocked (400 REFUND_AFTER_PAYOUT_NOT_ALLOWED) when host payout was already PAID
 *  - refund succeeds normally when no payout has occurred
 *
 * Run:
 *   npx jest --config test/jest-e2e.json test/refund-guard.e2e-spec.ts --forceExit
 */
describe('Refund Guardrail v1 E2E', () => {
    let app: INestApplication;
    let prisma: PrismaService;

    let adminToken: string;
    let hostToken: string;
    let hostId: string;

    const TOTAL = 300.0;
    const COMMISSION_RATE = 0.1;
    const HOST_NET = +(TOTAL * (1 - COMMISSION_RATE)).toFixed(2);

    const PW = 'password123';
    const SUFFIX = `rguard-${Date.now()}`;
    const ADMIN_EMAIL = `rg-a-${SUFFIX}@test.com`;
    const HOST_EMAIL = `rg-h-${SUFFIX}@test.com`;
    const RENTER_EMAIL = `rg-r-${SUFFIX}@test.com`;

    let bookingWithPayout: string;    // will be captured + paid-out
    let bookingWithoutPayout: string; // will be captured only

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
            data: { name: `RH-${SUFFIX}`, email: HOST_EMAIL, passwordHash: hash, roles: ['user', 'host'], isHost: true, verifiedEmail: true },
        });
        hostId = host.id;

        const renter = await prisma.user.create({
            data: { name: `RR-${SUFFIX}`, email: RENTER_EMAIL, passwordHash: hash, roles: ['user'], isHost: false, verifiedEmail: true },
        });
        await prisma.user.create({
            data: { name: `RA-${SUFFIX}`, email: ADMIN_EMAIL, passwordHash: hash, roles: ['user', 'ADMIN'], isHost: false, verifiedEmail: true },
        });

        const cat = await prisma.category.create({ data: { name: `RC-${SUFFIX}`, slug: `rc-${SUFFIX}` } });
        const listing = await prisma.listing.create({
            data: { hostId, title: `RL-${SUFFIX}`, description: 'd', categoryId: cat.id, images: [], pricePerDay: TOTAL, address: 'x', status: 'ACTIVE', isActive: true },
        });

        for (let i = 1; i <= 2; i++) {
            const booking = await prisma.booking.create({
                data: {
                    listingId: listing.id, renterId: renter.id, hostId,
                    startDate: new Date(`2032-0${i}-10`), endDate: new Date(`2032-0${i}-11`),
                    totalPrice: TOTAL, commission: +(TOTAL * COMMISSION_RATE).toFixed(2),
                    status: 'confirmed', snapshotTitle: listing.title,
                    snapshotPricePerDay: TOTAL, snapshotCommissionRate: COMMISSION_RATE, snapshotCurrency: 'TND',
                },
            });
            await prisma.paymentIntent.create({
                data: { bookingId: booking.id, renterId: renter.id, hostId, amount: TOTAL, currency: 'TND', status: 'authorized' },
            });
            if (i === 1) bookingWithPayout = booking.id;
            else bookingWithoutPayout = booking.id;
        }

        const lr = (email: string) => request(app.getHttpServer()).post('/api/auth/login').send({ emailOrPhone: email, password: PW });
        adminToken = (await lr(ADMIN_EMAIL)).body.data?.accessToken;
        hostToken = (await lr(HOST_EMAIL)).body.data?.accessToken;

        // Capture both bookings
        for (const bId of [bookingWithPayout, bookingWithoutPayout]) {
            const r = await request(app.getHttpServer())
                .post(`/api/payments/booking/${bId}/capture`)
                .set('Authorization', `Bearer ${hostToken}`);
            expect(r.status).toBeLessThan(300);
        }

        // Create + mark-paid a payout covering bookingWithPayout's HOST_NET
        const payoutRes = await request(app.getHttpServer())
            .post(`/api/admin/hosts/${hostId}/payouts`)
            .set('Authorization', `Bearer ${adminToken}`)
            .send({ amount: HOST_NET, method: 'bank_transfer', reference: 'GUARD-TEST-001' });
        expect(payoutRes.status).toBeLessThan(300);
        const payoutId = payoutRes.body?.data?.payout?.id ?? payoutRes.body?.payout?.id;

        const markRes = await request(app.getHttpServer())
            .patch(`/api/admin/payouts/${payoutId}/mark-paid`)
            .set('Authorization', `Bearer ${adminToken}`)
            .send({ method: 'bank_transfer', reference: 'GUARD-TEST-001' });
        expect(markRes.status).toBeLessThan(300);
    }, 30000 /* extend beforeAll timeout */);

    afterAll(async () => {
        const bookings = await prisma.booking.findMany({ where: { hostId }, select: { id: true } });
        const bids = bookings.map((b) => b.id);
        await prisma.payoutItem.deleteMany({ where: { payout: { hostId } } }).catch(() => { });
        await prisma.payout.deleteMany({ where: { hostId } }).catch(() => { });
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
    // Scenario 1: capture → payout marked PAID → refund must be BLOCKED
    // ----------------------------------------------------------------
    it('refund after payout is PAID returns 400 with REFUND_AFTER_PAYOUT_NOT_ALLOWED', async () => {
        const res = await request(app.getHttpServer())
            .post(`/api/payments/booking/${bookingWithPayout}/refund`)
            .set('Authorization', `Bearer ${hostToken}`);

        expect(res.status).toBe(400);

        // Error message is JSON-encoded inside BadRequestException.message
        const errBody = res.body?.error ?? res.body;
        const errMsg = typeof errBody?.message === 'string' ? errBody.message : JSON.stringify(errBody);
        expect(errMsg).toContain('REFUND_AFTER_PAYOUT_NOT_ALLOWED');

        // PI must still be 'captured' — guardrail must have rolled back the tx
        const pi = await prisma.paymentIntent.findUnique({ where: { bookingId: bookingWithPayout } });
        expect(pi?.status).toBe('captured');
    });

    // ----------------------------------------------------------------
    // Scenario 2: capture → refund (no payout) → success
    // ----------------------------------------------------------------
    it('refund before payout succeeds normally', async () => {
        const res = await request(app.getHttpServer())
            .post(`/api/payments/booking/${bookingWithoutPayout}/refund`)
            .set('Authorization', `Bearer ${hostToken}`);

        expect(res.status).toBeLessThan(300);

        const pi = await prisma.paymentIntent.findUnique({ where: { bookingId: bookingWithoutPayout } });
        expect(pi?.status).toBe('refunded');

        // 6 ledger entries: 3 originals (REVERSED) + 3 REFUND entries
        const entries = await prisma.ledgerEntry.findMany({ where: { bookingId: bookingWithoutPayout } });
        expect(entries.length).toBe(6);
        expect(entries.filter((e) => e.status === 'REVERSED').length).toBe(3);
        expect(entries.filter((e) => e.type === 'REFUND').length).toBe(3);
    });
});
