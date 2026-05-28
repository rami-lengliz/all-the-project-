import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/database/prisma.service';
import { TransformInterceptor } from '../src/common/interceptors/transform.interceptor';
import { HttpExceptionFilter } from '../src/common/filters/http-exception.filter';
import { KonnectProvider } from '../src/modules/payments/providers/konnect.provider';
import { WalletService } from '../src/modules/wallet/wallet.service';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const request = require('supertest');

/**
 * Konnect Wallet Top-Up Webhook E2E — Batch 3
 *
 * Tests all guard branches in handleKonnectTopUpWebhook:
 *   1. missing payment_ref       → skipped
 *   2. unknown providerRef       → skipped
 *   3. wrong provider field      → skipped (guard; handled via direct DB seed)
 *   4. already_processed         → no duplicate wallet credit
 *   5. pending Konnect status    → skipped
 *   6. amount mismatch           → skipped
 *   7. currency mismatch         → skipped
 *   8. happy path                → processed, wallet credited, WalletTransaction + LedgerEntry created
 *   9. second identical webhook  → already_processed (idempotency)
 *
 * Run:
 *   npx jest --config test/jest-e2e.json test/konnect-topup-webhook.e2e-spec.ts --forceExit
 */
describe('Konnect Wallet Top-Up Webhook (Batch 3) E2E', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let walletService: WalletService;

  const PW = 'password123';
  const SUFFIX = `ktu-${Date.now()}`;
  const AMOUNT_TND = 100.0;
  const AMOUNT_MILLIMES = 100000; // 100.00 TND

  let userId: string;
  const createdUserEmails: string[] = [];
  const createdTopUpIntentIds: string[] = [];

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
    walletService = moduleFixture.get<WalletService>(WalletService);

    // Stub KonnectProvider on the WalletService instance
    const konnect: KonnectProvider = (walletService as any).konnect;
    jest.spyOn(konnect, 'getPaymentDetails').mockResolvedValue({
      status: 'completed',
      amount: AMOUNT_MILLIMES,
      token: 'TND',
    });
    jest.spyOn(konnect, 'isConfigured').mockReturnValue(true);

    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const hash = await require('bcrypt').hash(PW, 10);

    const user = await prisma.user.create({
      data: {
        name: `KTU-User-${SUFFIX}`,
        email: `ktu-user-${SUFFIX}@test.com`,
        passwordHash: hash,
        roles: ['user'],
        verifiedEmail: true,
      },
    });
    userId = user.id;
    createdUserEmails.push(user.email);
  });

  afterAll(async () => {
    await prisma.topUpIntent.deleteMany({ where: { id: { in: createdTopUpIntentIds } } }).catch(() => {});
    await prisma.user.deleteMany({ where: { email: { in: createdUserEmails } } }).catch(() => {});
    await app.close();
  });

  async function seedPendingTopUpIntent(opts: {
    providerRef: string;
    amountTND?: number;
    provider?: string;
  }) {
    const amount = opts.amountTND ?? AMOUNT_TND;
    const intent = await prisma.topUpIntent.create({
      data: {
        userId,
        amount,
        currency: 'TND',
        provider: opts.provider ?? 'konnect',
        providerRef: opts.providerRef,
        status: 'pending',
      },
    });
    createdTopUpIntentIds.push(intent.id);
    return intent;
  }

  // ── 1. Missing payment_ref ──────────────────────────────────────────────

  it('GET /api/wallet/konnect/webhook without payment_ref returns skipped', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/wallet/konnect/webhook')
      .expect(200);

    const body = res.body?.data ?? res.body;
    expect(body.received).toBe(true);
    expect(body.status).toBe('skipped');
  });

  // ── 2. Unknown providerRef ──────────────────────────────────────────────

  it('unknown payment_ref returns skipped', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/wallet/konnect/webhook?payment_ref=nonexistent-topup-ref-xyz')
      .expect(200);

    const body = res.body?.data ?? res.body;
    expect(body.received).toBe(true);
    expect(body.status).toBe('skipped');
  });

  // ── 3. Wrong provider field ─────────────────────────────────────────────

  it('TopUpIntent with provider != konnect returns skipped', async () => {
    await seedPendingTopUpIntent({ providerRef: `flouci-topup-${SUFFIX}`, provider: 'flouci' });

    const res = await request(app.getHttpServer())
      .get(`/api/wallet/konnect/webhook?payment_ref=flouci-topup-${SUFFIX}`)
      .expect(200);

    const body = res.body?.data ?? res.body;
    expect(body.received).toBe(true);
    expect(body.status).toBe('skipped');
  });

  // ── 4. Already processed → no duplicate credit ──────────────────────────

  it('already-processed TopUpIntent returns already_processed and does not double-credit', async () => {
    const ref = `konnect-dup-topup-${SUFFIX}`;
    await seedPendingTopUpIntent({ providerRef: ref });

    // Manually mark as processed
    await prisma.topUpIntent.updateMany({
      where: { providerRef: ref },
      data: { status: 'processed', paidAt: new Date() },
    });

    const walletBefore = await prisma.wallet.findUnique({ where: { userId } });
    const balanceBefore = parseFloat((walletBefore?.balance ?? 0).toString());

    const res = await request(app.getHttpServer())
      .get(`/api/wallet/konnect/webhook?payment_ref=${ref}`)
      .expect(200);

    const body = res.body?.data ?? res.body;
    expect(body.received).toBe(true);
    expect(body.status).toBe('already_processed');

    // Balance unchanged
    const walletAfter = await prisma.wallet.findUnique({ where: { userId } });
    const balanceAfter = parseFloat((walletAfter?.balance ?? 0).toString());
    expect(balanceAfter).toBe(balanceBefore);
  });

  // ── 5. Pending Konnect status → no credit ──────────────────────────────

  it('pending Konnect payment status returns skipped and does not credit wallet', async () => {
    const konnect: KonnectProvider = (walletService as any).konnect;
    jest.spyOn(konnect, 'getPaymentDetails').mockResolvedValueOnce({
      status: 'pending',
      amount: AMOUNT_MILLIMES,
      token: 'TND',
    });

    const ref = `konnect-pending-topup-${SUFFIX}`;
    await seedPendingTopUpIntent({ providerRef: ref });

    const walletBefore = await prisma.wallet.findUnique({ where: { userId } });
    const balanceBefore = parseFloat((walletBefore?.balance ?? 0).toString());

    const res = await request(app.getHttpServer())
      .get(`/api/wallet/konnect/webhook?payment_ref=${ref}`)
      .expect(200);

    const body = res.body?.data ?? res.body;
    expect(body.received).toBe(true);
    expect(body.status).toBe('skipped');

    const walletAfter = await prisma.wallet.findUnique({ where: { userId } });
    expect(parseFloat((walletAfter?.balance ?? 0).toString())).toBe(balanceBefore);
  });

  // ── 6. Amount mismatch → no credit ─────────────────────────────────────

  it('Konnect amount mismatch returns skipped and does not credit wallet', async () => {
    const konnect: KonnectProvider = (walletService as any).konnect;
    jest.spyOn(konnect, 'getPaymentDetails').mockResolvedValueOnce({
      status: 'completed',
      amount: AMOUNT_MILLIMES - 1,
      token: 'TND',
    });

    const ref = `konnect-amt-topup-${SUFFIX}`;
    await seedPendingTopUpIntent({ providerRef: ref });

    const walletBefore = await prisma.wallet.findUnique({ where: { userId } });
    const balanceBefore = parseFloat((walletBefore?.balance ?? 0).toString());

    const res = await request(app.getHttpServer())
      .get(`/api/wallet/konnect/webhook?payment_ref=${ref}`)
      .expect(200);

    const body = res.body?.data ?? res.body;
    expect(body.received).toBe(true);
    expect(body.status).toBe('skipped');

    const walletAfter = await prisma.wallet.findUnique({ where: { userId } });
    expect(parseFloat((walletAfter?.balance ?? 0).toString())).toBe(balanceBefore);
  });

  // ── 7. Currency mismatch → no credit ───────────────────────────────────

  it('Konnect currency mismatch returns skipped and does not credit wallet', async () => {
    const konnect: KonnectProvider = (walletService as any).konnect;
    jest.spyOn(konnect, 'getPaymentDetails').mockResolvedValueOnce({
      status: 'completed',
      amount: AMOUNT_MILLIMES,
      token: 'USD',
    });

    const ref = `konnect-cur-topup-${SUFFIX}`;
    await seedPendingTopUpIntent({ providerRef: ref });

    const walletBefore = await prisma.wallet.findUnique({ where: { userId } });
    const balanceBefore = parseFloat((walletBefore?.balance ?? 0).toString());

    const res = await request(app.getHttpServer())
      .get(`/api/wallet/konnect/webhook?payment_ref=${ref}`)
      .expect(200);

    const body = res.body?.data ?? res.body;
    expect(body.received).toBe(true);
    expect(body.status).toBe('skipped');

    const walletAfter = await prisma.wallet.findUnique({ where: { userId } });
    expect(parseFloat((walletAfter?.balance ?? 0).toString())).toBe(balanceBefore);
  });

  // ── 8. Happy path ───────────────────────────────────────────────────────

  it('valid webhook credits wallet, creates WalletTransaction and LedgerEntry', async () => {
    const konnect: KonnectProvider = (walletService as any).konnect;
    jest.spyOn(konnect, 'getPaymentDetails').mockResolvedValueOnce({
      status: 'completed',
      amount: AMOUNT_MILLIMES,
      token: 'TND',
    });

    const ref = `konnect-ok-topup-${SUFFIX}`;
    await seedPendingTopUpIntent({ providerRef: ref });

    const walletBefore = await prisma.wallet.findUnique({ where: { userId } });
    const balanceBefore = parseFloat((walletBefore?.balance ?? 0).toString());

    const res = await request(app.getHttpServer())
      .get(`/api/wallet/konnect/webhook?payment_ref=${ref}`)
      .expect(200);

    const body = res.body?.data ?? res.body;
    expect(body.received).toBe(true);
    expect(body.status).toBe('processed');

    // Wallet balance increased
    const walletAfter = await prisma.wallet.findUnique({ where: { userId } });
    const balanceAfter = parseFloat((walletAfter?.balance ?? 0).toString());
    expect(balanceAfter).toBeCloseTo(balanceBefore + AMOUNT_TND, 2);

    // WalletTransaction of type TOP_UP
    const intent = await prisma.topUpIntent.findUnique({ where: { providerRef: ref } });
    const txn = await prisma.walletTransaction.findFirst({
      where: { referenceId: intent!.id, type: 'TOP_UP' },
    });
    expect(txn).not.toBeNull();
    expect(parseFloat(txn!.amount.toString())).toBeCloseTo(AMOUNT_TND, 2);

    // LedgerEntry of type WALLET_TOP_UP
    const ledger = await prisma.ledgerEntry.findFirst({
      where: { actorId: userId, type: 'WALLET_TOP_UP' },
    });
    expect(ledger).not.toBeNull();

    // TopUpIntent marked processed + paidAt stamped
    expect(intent!.status).toBe('processed');
    expect(intent!.paidAt).not.toBeNull();
  });

  // ── 9. Second webhook → already_processed (idempotency) ─────────────────

  it('second webhook call after happy path returns already_processed (idempotency)', async () => {
    const ref = `konnect-ok-topup-${SUFFIX}`;

    const walletBefore = await prisma.wallet.findUnique({ where: { userId } });
    const balanceBefore = parseFloat((walletBefore?.balance ?? 0).toString());

    const res = await request(app.getHttpServer())
      .get(`/api/wallet/konnect/webhook?payment_ref=${ref}`)
      .expect(200);

    const body = res.body?.data ?? res.body;
    expect(body.received).toBe(true);
    expect(body.status).toBe('already_processed');

    // Balance unchanged — no double credit
    const walletAfter = await prisma.wallet.findUnique({ where: { userId } });
    const balanceAfter = parseFloat((walletAfter?.balance ?? 0).toString());
    expect(balanceAfter).toBe(balanceBefore);
  });
});
