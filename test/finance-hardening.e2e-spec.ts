import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/database/prisma.service';
import { TransformInterceptor } from '../src/common/interceptors/transform.interceptor';
import { HttpExceptionFilter } from '../src/common/filters/http-exception.filter';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const request = require('supertest');

/**
 * Finance Hardening E2E — Batch 1.1
 * 
 * Run:
 *   npx jest --config test/jest-e2e.json test/admin/finance-hardening.e2e-spec.ts --forceExit
 */
describe('Finance Hardening (Batch 1.1) E2E', () => {
    let app: INestApplication;
    let prisma: PrismaService;

    let adminToken: string;
    let hostToken: string;
    let hostId: string;

    const COMMISSION_RATE = 0.1;
    const TOTAL = 1000.0;
    const HOST_NET = TOTAL * (1 - COMMISSION_RATE);
    const PW = 'password123';
    const SUFFIX = `harden-${Date.now()}`;
    const ADMIN_EMAIL = `ha-${SUFFIX}@test.com`;
    const HOST_EMAIL = `hh-${SUFFIX}@test.com`;

    let bookingId: string;

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
            data: { name: `HH-${SUFFIX}`, email: HOST_EMAIL, passwordHash: hash, roles: ['user', 'host'], isHost: true, verifiedEmail: true },
        });
        hostId = host.id;

        await prisma.user.create({
            data: { name: `HA-${SUFFIX}`, email: ADMIN_EMAIL, passwordHash: hash, roles: ['user', 'ADMIN'], isHost: false, verifiedEmail: true },
        });

        const renter = await prisma.user.create({
            data: { name: `HR-${SUFFIX}`, email: `hr-${SUFFIX}@test.com`, passwordHash: hash, roles: ['user'], isHost: false, verifiedEmail: true },
        });

        const cat = await prisma.category.create({ data: { name: `HC-${SUFFIX}`, slug: `hc-${SUFFIX}` } });

        const listing = await prisma.listing.create({
            data: { hostId, title: `HL-${SUFFIX}`, description: 'd', categoryId: cat.id, images: [], pricePerDay: TOTAL, address: 'x', status: 'ACTIVE', isActive: true },
        });

        // Seed 1 active captured booking
        const booking = await prisma.booking.create({
            data: {
                listingId: listing.id, renterId: renter.id, hostId,
                startDate: new Date('2032-01-10'), endDate: new Date('2032-01-11'),
                totalPrice: TOTAL, commission: +(TOTAL * COMMISSION_RATE).toFixed(2),
                status: 'confirmed', snapshotTitle: 't', snapshotPricePerDay: TOTAL,
                snapshotCommissionRate: COMMISSION_RATE, snapshotCurrency: 'TND',
            },
        });
        bookingId = booking.id;

        await prisma.paymentIntent.create({
            data: { bookingId: booking.id, renterId: renter.id, hostId, amount: TOTAL, currency: 'TND', status: 'authorized' },
        });

        // Login
        const lr = (email: string) => request(app.getHttpServer()).post('/api/auth/login').send({ emailOrPhone: email, password: PW });
        const adminRes = await lr(ADMIN_EMAIL);
        adminToken = adminRes.body.data?.accessToken;
        const hostRes = await lr(HOST_EMAIL);
        hostToken = hostRes.body.data?.accessToken;

        // Capture
        await request(app.getHttpServer())
            .post(`/api/payments/booking/${bookingId}/capture`)
            .set('Authorization', `Bearer ${hostToken}`);
    });

    afterAll(async () => {
        await prisma.payoutItem.deleteMany({ where: { payout: { hostId } } }).catch(() => { });
        await prisma.payout.deleteMany({ where: { hostId } }).catch(() => { });
        await prisma.ledgerEntry.deleteMany({ where: { bookingId } }).catch(() => { });
        await prisma.paymentIntent.deleteMany({ where: { bookingId } }).catch(() => { });
        await prisma.booking.deleteMany({ where: { id: bookingId } }).catch(() => { });
        await prisma.listing.deleteMany({ where: { title: { contains: SUFFIX } } }).catch(() => { });
        await prisma.category.deleteMany({ where: { slug: { contains: SUFFIX } } }).catch(() => { });
        await prisma.user.deleteMany({ where: { email: { in: [ADMIN_EMAIL, HOST_EMAIL] } } }).catch(() => { });
        await app.close();
    });

    it('ledger summary includes totalPaid metric initially at 0', async () => {
        const res = await request(app.getHttpServer())
            .get('/api/admin/ledger/summary')
            .set('Authorization', `Bearer ${adminToken}`);
        expect(res.status).toBe(200);
        const data = res.body?.data ?? res.body;
        expect(data.totalPaid).toBeDefined();
        expect(Number(data.totalPaid)).toBe(0);
    });

    let payoutId: string;
    it('payout creation creates an admin audit log', async () => {
        const res = await request(app.getHttpServer())
            .post(`/api/admin/hosts/${hostId}/payouts`)
            .set('Authorization', `Bearer ${adminToken}`)
            .send({ amount: HOST_NET, method: 'bank_transfer', reference: 'INIT' });
        expect(res.status).toBeLessThan(300);
        payoutId = (res.body?.data?.payout ?? res.body?.payout).id;

        const log = await prisma.adminLog.findFirst({
            where: { action: 'create_payout' },
            orderBy: { createdAt: 'desc' },
        });
        expect(log).toBeDefined();
        expect((log?.details as any)?.payoutId).toBe(payoutId);
    });

    it('GET /admin/payouts/:id returns full reconciliation details', async () => {
        const res = await request(app.getHttpServer())
            .get(`/api/admin/payouts/${payoutId}`)
            .set('Authorization', `Bearer ${adminToken}`);
        expect(res.status).toBe(200);
        const data = res.body?.data ?? res.body;
        expect(data.id).toBe(payoutId);
        expect(Array.isArray(data.items)).toBe(true);
        expect(data.items.length).toBeGreaterThan(0);
        expect(data.items[0].ledgerEntry).toBeDefined();
    });

    it('marking payout as paid is idempotent and logs to admin audit trail', async () => {
        const res = await request(app.getHttpServer())
            .patch(`/api/admin/payouts/${payoutId}/mark-paid`)
            .set('Authorization', `Bearer ${adminToken}`)
            .send({ method: 'bank_transfer', reference: 'REF-HARDEN' });
        expect(res.status).toBeLessThan(300);

        const log = await prisma.adminLog.findFirst({
            where: { action: 'mark_payout_paid' },
            orderBy: { createdAt: 'desc' },
        });
        expect(log).toBeDefined();
        expect((log?.details as any)?.payoutId).toBe(payoutId);

        // Check summary totalPaid updated
        const sumRes = await request(app.getHttpServer())
            .get('/api/admin/ledger/summary')
            .set('Authorization', `Bearer ${adminToken}`);
        const sumData = sumRes.body?.data ?? sumRes.body;
        expect(Number(sumData.totalPaid)).toBeCloseTo(HOST_NET, 2);

        // Try double pay (idempotency check)
        const res2 = await request(app.getHttpServer())
            .patch(`/api/admin/payouts/${payoutId}/mark-paid`)
            .set('Authorization', `Bearer ${adminToken}`)
            .send({ method: 'bank_transfer', reference: 'REF-HARDEN' });
        expect(res2.status).toBeLessThan(300); // Should return success (idempotent)
    });

    it('dispute management logs are created for actor tracking', async () => {
        // Open dispute
        await request(app.getHttpServer())
            .patch(`/api/admin/bookings/${bookingId}/dispute/open`)
            .set('Authorization', `Bearer ${adminToken}`);
        
        const openLog = await prisma.adminLog.findFirst({
            where: { action: 'open_dispute' },
            orderBy: { createdAt: 'desc' },
        });
        expect(openLog).toBeDefined();
        expect((openLog?.details as any)?.bookingId).toBe(bookingId);

        // Resolve dispute
        await request(app.getHttpServer())
            .patch(`/api/admin/bookings/${bookingId}/dispute/resolve`)
            .set('Authorization', `Bearer ${adminToken}`);
        
        const resolveLog = await prisma.adminLog.findFirst({
            where: { action: 'resolve_dispute' },
            orderBy: { createdAt: 'desc' },
        });
        expect(resolveLog).toBeDefined();
        expect((resolveLog?.details as any)?.bookingId).toBe(bookingId);
    });
});
