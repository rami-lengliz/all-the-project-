import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/database/prisma.service';
import { TransformInterceptor } from '../src/common/interceptors/transform.interceptor';
import { HttpExceptionFilter } from '../src/common/filters/http-exception.filter';
import { PaymentsService } from '../src/modules/payments/payments.service';
import { PaymentProviderRegistry } from '../src/modules/payments/providers/payment-provider.registry';
import { KonnectProvider } from '../src/modules/payments/providers/konnect.provider';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const request = require('supertest');

/**
 * Konnect Webhook E2E — Batch 2.1
 *
 * Tests all guard branches in handleKonnectWebhook:
 *   1. missing payment_ref  → skipped
 *   2. unknown providerRef  → skipped
 *   3. wrong provider field → skipped
 *   4. already_processed    → no duplicate ledger entries
 *   5. pending status       → skipped, no capture
 *   6. amount mismatch      → skipped, no capture
 *   7. currency mismatch    → skipped, no capture
 *   8. happy path           → processed, 3 ledger entries, booking paid
 *
 * Run:
 *   npx jest --config test/jest-e2e.json test/konnect-webhook.e2e-spec.ts --forceExit
 */
describe('Konnect Webhook (Batch 2.1) E2E', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let paymentsService: PaymentsService;

  const PW = 'password123';
  const SUFFIX = `kw-${Date.now()}`;
  const TOTAL = 500.0;
  const TOTAL_MILLIMES = 500000; // 500.00 TND

  let hostId: string;
  let renterId: string;

  // We create one booking/intent per test that needs it; shared base only for cleanup
  const createdBookingIds: string[] = [];
  const createdUserEmails: string[] = [];

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
    paymentsService = moduleFixture.get<PaymentsService>(PaymentsService);

    // Stub the Konnect provider so tests never reach the real API
    const registry = moduleFixture.get<PaymentProviderRegistry>(PaymentProviderRegistry);
    const konnect = registry.get('konnect') as KonnectProvider;

    // Default stub: completed, correct amount, TND
    jest.spyOn(konnect, 'getPaymentDetails').mockResolvedValue({
      status: 'completed',
      amount: TOTAL_MILLIMES,
      token: 'TND',
    });
    jest.spyOn(konnect, 'isConfigured').mockReturnValue(true);

    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const hash = await require('bcrypt').hash(PW, 10);

    const host = await prisma.user.create({
      data: {
        name: `KW-Host-${SUFFIX}`,
        email: `kw-host-${SUFFIX}@test.com`,
        passwordHash: hash,
        roles: ['user', 'host'],
        isHost: true,
        verifiedEmail: true,
      },
    });
    hostId = host.id;
    createdUserEmails.push(host.email);

    const renter = await prisma.user.create({
      data: {
        name: `KW-Renter-${SUFFIX}`,
        email: `kw-renter-${SUFFIX}@test.com`,
        passwordHash: hash,
        roles: ['user'],
        isHost: false,
        verifiedEmail: true,
      },
    });
    renterId = renter.id;
    createdUserEmails.push(renter.email);
  });

  afterAll(async () => {
    for (const bookingId of createdBookingIds) {
      await prisma.ledgerEntry.deleteMany({ where: { bookingId } }).catch(() => {});
      await prisma.paymentIntent.deleteMany({ where: { bookingId } }).catch(() => {});
      await prisma.booking.deleteMany({ where: { id: bookingId } }).catch(() => {});
    }
    await prisma.listing.deleteMany({ where: { title: { contains: SUFFIX } } }).catch(() => {});
    await prisma.category.deleteMany({ where: { slug: { contains: SUFFIX } } }).catch(() => {});
    await prisma.user.deleteMany({ where: { email: { in: createdUserEmails } } }).catch(() => {});
    await app.close();
  });

  /** Creates a confirmed booking + authorized intent with a Konnect providerRef. */
  async function seedConfirmedKonnectBooking(opts: {
    providerRef: string;
    amountTND?: number;
  }): Promise<{ bookingId: string; intentId: string }> {
    const amount = opts.amountTND ?? TOTAL;

    const cat = await prisma.category.upsert({
      where: { slug: `kw-cat-${SUFFIX}` },
      update: {},
      create: { name: `KW-Cat-${SUFFIX}`, slug: `kw-cat-${SUFFIX}` },
    });

    const listing = await prisma.listing.create({
      data: {
        hostId,
        title: `KW-Listing-${SUFFIX}-${opts.providerRef.slice(-6)}`,
        description: 'd',
        categoryId: cat.id,
        images: [],
        pricePerDay: amount,
        address: 'x',
        status: 'ACTIVE',
        isActive: true,
      },
    });

    const booking = await prisma.booking.create({
      data: {
        listingId: listing.id,
        renterId,
        hostId,
        startDate: new Date('2035-01-10'),
        endDate: new Date('2035-01-11'),
        totalPrice: amount,
        commission: +(amount * 0.1).toFixed(2),
        status: 'confirmed',
        paid: false,
        snapshotTitle: 't',
        snapshotPricePerDay: amount,
        snapshotCommissionRate: 0.1,
        snapshotCurrency: 'TND',
      },
    });
    createdBookingIds.push(booking.id);

    const intent = await prisma.paymentIntent.create({
      data: {
        bookingId: booking.id,
        renterId,
        hostId,
        amount,
        currency: 'TND',
        status: 'authorized',
        provider: 'konnect',
        providerRef: opts.providerRef,
      },
    });

    return { bookingId: booking.id, intentId: intent.id };
  }

  // ── 1. Missing payment_ref ──────────────────────────────────────────────

  it('GET /api/payments/konnect/webhook without payment_ref returns skipped', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/payments/konnect/webhook')
      .expect(200);

    const body = res.body?.data ?? res.body;
    expect(body.received).toBe(true);
    expect(body.status).toBe('skipped');
  });

  // ── 2. Unknown providerRef ──────────────────────────────────────────────

  it('unknown payment_ref returns skipped', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/payments/konnect/webhook?payment_ref=nonexistent-ref-xyz')
      .expect(200);

    const body = res.body?.data ?? res.body;
    expect(body.received).toBe(true);
    expect(body.status).toBe('skipped');
  });

  // ── 3. Wrong provider field ─────────────────────────────────────────────

  it('providerRef belonging to a different provider returns skipped', async () => {
    const { bookingId: seedBookingId } = await seedConfirmedKonnectBooking({
      providerRef: `konnect-seed-for-test3-${SUFFIX}`,
    });
    const listing = await prisma.listing.findFirst({ where: { hostId } });

    const booking = await prisma.booking.create({
      data: {
        listingId: listing!.id,
        renterId,
        hostId,
        startDate: new Date('2035-02-01'),
        endDate: new Date('2035-02-02'),
        totalPrice: TOTAL,
        commission: TOTAL * 0.1,
        status: 'confirmed',
        paid: false,
        snapshotTitle: 't',
        snapshotPricePerDay: TOTAL,
        snapshotCommissionRate: 0.1,
        snapshotCurrency: 'TND',
      },
    });
    createdBookingIds.push(booking.id);

    await prisma.paymentIntent.create({
      data: {
        bookingId: booking.id,
        renterId,
        hostId,
        amount: TOTAL,
        currency: 'TND',
        status: 'authorized',
        provider: 'flouci', // different provider
        providerRef: `flouci-ref-${SUFFIX}`,
      },
    });

    const res = await request(app.getHttpServer())
      .get(`/api/payments/konnect/webhook?payment_ref=flouci-ref-${SUFFIX}`)
      .expect(200);

    const body = res.body?.data ?? res.body;
    expect(body.received).toBe(true);
    expect(body.status).toBe('skipped');
  });

  // ── 4. Duplicate webhook → already_processed ───────────────────────────

  it('duplicate webhook on fully-settled intent returns already_processed without re-capturing', async () => {
    const ref = `konnect-dup-${SUFFIX}`;
    const { bookingId, intentId } = await seedConfirmedKonnectBooking({ providerRef: ref });

    // Force-settle the intent to simulate a previously processed webhook
    await prisma.paymentIntent.update({
      where: { id: intentId },
      data: { status: 'captured', paidAt: new Date() },
    });
    await prisma.booking.update({
      where: { id: bookingId },
      data: { status: 'paid', paid: true },
    });

    const ledgerBefore = await prisma.ledgerEntry.count({ where: { bookingId } });

    const res = await request(app.getHttpServer())
      .get(`/api/payments/konnect/webhook?payment_ref=${ref}`)
      .expect(200);

    const body = res.body?.data ?? res.body;
    expect(body.received).toBe(true);
    expect(body.status).toBe('already_processed');

    // No new ledger entries created
    const ledgerAfter = await prisma.ledgerEntry.count({ where: { bookingId } });
    expect(ledgerAfter).toBe(ledgerBefore);
  });

  // ── 5. Pending status → no capture ─────────────────────────────────────

  it('pending Konnect payment status returns skipped and does not capture', async () => {
    const registry = app.get(PaymentProviderRegistry);
    const konnect = registry.get('konnect') as KonnectProvider;
    jest.spyOn(konnect, 'getPaymentDetails').mockResolvedValueOnce({
      status: 'pending',
      amount: TOTAL_MILLIMES,
      token: 'TND',
    });

    const ref = `konnect-pending-${SUFFIX}`;
    const { bookingId } = await seedConfirmedKonnectBooking({ providerRef: ref });

    const res = await request(app.getHttpServer())
      .get(`/api/payments/konnect/webhook?payment_ref=${ref}`)
      .expect(200);

    const body = res.body?.data ?? res.body;
    expect(body.received).toBe(true);
    expect(body.status).toBe('skipped');

    const ledger = await prisma.ledgerEntry.count({ where: { bookingId } });
    expect(ledger).toBe(0);
  });

  // ── 6. Amount mismatch → no capture ────────────────────────────────────

  it('Konnect amount mismatch returns skipped and does not capture', async () => {
    const registry = app.get(PaymentProviderRegistry);
    const konnect = registry.get('konnect') as KonnectProvider;
    jest.spyOn(konnect, 'getPaymentDetails').mockResolvedValueOnce({
      status: 'completed',
      amount: TOTAL_MILLIMES - 1, // 1 millime short
      token: 'TND',
    });

    const ref = `konnect-amt-${SUFFIX}`;
    const { bookingId } = await seedConfirmedKonnectBooking({ providerRef: ref });

    const res = await request(app.getHttpServer())
      .get(`/api/payments/konnect/webhook?payment_ref=${ref}`)
      .expect(200);

    const body = res.body?.data ?? res.body;
    expect(body.received).toBe(true);
    expect(body.status).toBe('skipped');

    const ledger = await prisma.ledgerEntry.count({ where: { bookingId } });
    expect(ledger).toBe(0);
  });

  // ── 7. Currency mismatch → no capture ──────────────────────────────────

  it('Konnect currency mismatch returns skipped and does not capture', async () => {
    const registry = app.get(PaymentProviderRegistry);
    const konnect = registry.get('konnect') as KonnectProvider;
    jest.spyOn(konnect, 'getPaymentDetails').mockResolvedValueOnce({
      status: 'completed',
      amount: TOTAL_MILLIMES,
      token: 'USD', // wrong currency
    });

    const ref = `konnect-cur-${SUFFIX}`;
    const { bookingId } = await seedConfirmedKonnectBooking({ providerRef: ref });

    const res = await request(app.getHttpServer())
      .get(`/api/payments/konnect/webhook?payment_ref=${ref}`)
      .expect(200);

    const body = res.body?.data ?? res.body;
    expect(body.received).toBe(true);
    expect(body.status).toBe('skipped');

    const ledger = await prisma.ledgerEntry.count({ where: { bookingId } });
    expect(ledger).toBe(0);
  });

  // ── 8. Happy path ───────────────────────────────────────────────────────

  it('valid webhook captures payment, creates 3 ledger entries, marks booking paid', async () => {
    const registry = app.get(PaymentProviderRegistry);
    const konnect = registry.get('konnect') as KonnectProvider;
    jest.spyOn(konnect, 'getPaymentDetails').mockResolvedValueOnce({
      status: 'completed',
      amount: TOTAL_MILLIMES,
      token: 'TND',
    });

    const ref = `konnect-ok-${SUFFIX}`;
    const { bookingId, intentId } = await seedConfirmedKonnectBooking({ providerRef: ref });

    const res = await request(app.getHttpServer())
      .get(`/api/payments/konnect/webhook?payment_ref=${ref}`)
      .expect(200);

    const body = res.body?.data ?? res.body;
    expect(body.received).toBe(true);
    expect(body.status).toBe('processed');

    // 3 ledger entries: RENT_PAID, COMMISSION, HOST_PAYOUT_DUE
    const entries = await prisma.ledgerEntry.findMany({ where: { bookingId } });
    expect(entries).toHaveLength(3);
    const types = entries.map((e) => e.type).sort();
    expect(types).toEqual(['COMMISSION', 'HOST_PAYOUT_DUE', 'RENT_PAID']);

    // Intent captured + paidAt stamped
    const intent = await prisma.paymentIntent.findUnique({ where: { id: intentId } });
    expect(intent?.status).toBe('captured');
    expect(intent?.paidAt).not.toBeNull();

    // Booking marked paid
    const booking = await prisma.booking.findUnique({ where: { id: bookingId } });
    expect(booking?.paid).toBe(true);
    expect(booking?.status).toBe('paid');
  });

  // ── 9. Second identical webhook on same settled booking → already_processed

  it('second webhook call after happy path returns already_processed (idempotency)', async () => {
    // Re-use the ref from test 8 — it was settled by the previous test
    const ref = `konnect-ok-${SUFFIX}`;

    const res = await request(app.getHttpServer())
      .get(`/api/payments/konnect/webhook?payment_ref=${ref}`)
      .expect(200);

    const body = res.body?.data ?? res.body;
    expect(body.received).toBe(true);
    expect(body.status).toBe('already_processed');

    // Still only 3 ledger entries — no duplicates
    const entries = await prisma.ledgerEntry.findMany({
      where: { booking: { paymentIntent: { providerRef: ref } } },
    });
    expect(entries).toHaveLength(3);
  });
});
