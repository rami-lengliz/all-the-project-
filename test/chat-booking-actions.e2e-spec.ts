import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { AppModule } from './../src/app.module';
import { PrismaService } from './../src/database/prisma.service';
import { TransformInterceptor } from './../src/common/interceptors/transform.interceptor';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const request = require('supertest');

/**
 * E2E — Chat-based booking actions
 *
 * Covers:
 *  1. Host can confirm pending booking (PATCH /api/bookings/:id/confirm → 200)
 *  2. Host can reject pending booking  (PATCH /api/bookings/:id/reject  → 200)
 *  3. Renter cannot confirm/reject     (→ 403)
 *  4. Unrelated host cannot confirm    (→ 403)
 *  5. After confirm, booking status = 'confirmed'
 *  6. After reject,  booking status = 'rejected'
 *  7. Accept/reject each post a system chat message to the conversation
 *  8. GET /api/bookings/:id returns correct status for the renter
 *     (used by the frontend BookingCardActions component to decide Pay now visibility)
 *  9. Wallet-first payment: renter pays confirmed booking with wallet
 * 10. Insufficient wallet balance is rejected without debiting
 */
describe('Chat Booking Actions (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  const SUFFIX = `chat-actions-${Date.now()}`;
  const PASSWORD = 'Password123!';

  const HOST_EMAIL = `host-${SUFFIX}@example.com`;
  const HOST2_EMAIL = `host2-${SUFFIX}@example.com`;   // unrelated host
  const RENTER_EMAIL = `renter-${SUFFIX}@example.com`;

  let hostToken: string;
  let host2Token: string;
  let renterToken: string;

  let listingId: string;

  // IDs created per test-step
  let confirmBookingId: string;   // used in confirm flow
  let rejectBookingId: string;    // used in reject flow
  let walletBookingId: string;    // used in wallet-payment flow
  let confirmConversationId: string;
  let rejectConversationId: string;

  // date window 60 days out
  const startDate = (() => {
    const d = new Date();
    d.setDate(d.getDate() + 60);
    return d.toISOString().split('T')[0];
  })();
  const endDate = (() => {
    const d = new Date(startDate);
    d.setDate(d.getDate() + 2);
    return d.toISOString().split('T')[0];
  })();

  // Non-overlapping window for the reject booking
  const start2 = (() => {
    const d = new Date(startDate);
    d.setDate(d.getDate() + 10);
    return d.toISOString().split('T')[0];
  })();
  const end2 = (() => {
    const d = new Date(start2);
    d.setDate(d.getDate() + 2);
    return d.toISOString().split('T')[0];
  })();

  // Non-overlapping window for the wallet-payment booking
  const start3 = (() => {
    const d = new Date(startDate);
    d.setDate(d.getDate() + 20);
    return d.toISOString().split('T')[0];
  })();
  const end3 = (() => {
    const d = new Date(start3);
    d.setDate(d.getDate() + 2); // 2-night stay → totalPrice = 200 TND
    return d.toISOString().split('T')[0];
  })();

  /* ═══════════════════════════════════════════════════ beforeAll ══ */
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

    const bcrypt = require('bcrypt');
    const hash = await bcrypt.hash(PASSWORD, 10);

    const host = await prisma.user.create({
      data: {
        name: `Host ${SUFFIX}`, email: HOST_EMAIL,
        passwordHash: hash, roles: ['user', 'host'],
        isHost: true, verifiedEmail: true,
      },
    });

    await prisma.user.create({
      data: {
        name: `Host2 ${SUFFIX}`, email: HOST2_EMAIL,
        passwordHash: hash, roles: ['user', 'host'],
        isHost: true, verifiedEmail: true,
      },
    });

    await prisma.user.create({
      data: {
        name: `Renter ${SUFFIX}`, email: RENTER_EMAIL,
        passwordHash: hash, roles: ['user'],
        isHost: false, verifiedEmail: true,
      },
    });

    const login = async (email: string) => {
      const res = await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ emailOrPhone: email, password: PASSWORD });
      return res.body.data?.accessToken ?? res.body.accessToken ?? '';
    };

    hostToken   = await login(HOST_EMAIL);
    host2Token  = await login(HOST2_EMAIL);
    renterToken = await login(RENTER_EMAIL);

    const cat = await prisma.category.create({
      data: {
        name: `Cat ${SUFFIX}`, slug: `cat-${SUFFIX}`,
        icon: '🏠', allowedForPrivate: true,
      },
    });

    const rows = await prisma.$queryRaw<Array<{ id: string }>>`
      INSERT INTO listings (
        id, title, description, "categoryId", "hostId",
        "pricePerDay", address, location, "bookingType", "isActive",
        "createdAt", "updatedAt"
      ) VALUES (
        gen_random_uuid(),
        ${'Chat Action Villa ' + SUFFIX},
        'Test listing for chat booking actions',
        ${cat.id}::uuid, ${host.id}::uuid,
        100, 'Tunis',
        ST_SetSRID(ST_MakePoint(10.18, 36.82), 4326),
        'DAILY'::"BookingType", true, NOW(), NOW()
      )
      RETURNING id
    `;
    listingId = (rows as any[])[0].id;
  });

  /* ═══════════════════════════════════════════════════ afterAll ═══ */
  afterAll(async () => {
    if (prisma) {
      await prisma.message.deleteMany({
        where: { conversation: { listing: { title: { contains: SUFFIX } } } },
      });
      await prisma.conversation.deleteMany({
        where: {
          OR: [
            { listing: { title: { contains: SUFFIX } } },
            { renter: { email: { contains: SUFFIX } } },
          ],
        },
      });
      await prisma.paymentIntent.deleteMany({
        where: { booking: { listing: { title: { contains: SUFFIX } } } },
      });
      await prisma.booking.deleteMany({
        where: { listing: { title: { contains: SUFFIX } } },
      });
      await prisma.listing.deleteMany({ where: { title: { contains: SUFFIX } } });
      await prisma.category.deleteMany({ where: { slug: { contains: SUFFIX } } });
      // Delete wallets (and their transactions) before users due to FK constraint
      const userIds = (
        await prisma.user.findMany({
          where: { email: { contains: SUFFIX } },
          select: { id: true },
        })
      ).map((u) => u.id);
      const wallets = await prisma.wallet.findMany({
        where: { userId: { in: userIds } },
        select: { id: true },
      });
      const walletIds = wallets.map((w) => w.id);
      await prisma.walletTransaction.deleteMany({ where: { walletId: { in: walletIds } } });
      await prisma.wallet.deleteMany({ where: { id: { in: walletIds } } });
      await prisma.user.deleteMany({ where: { email: { contains: SUFFIX } } });
    }
    if (app) await app.close();
  });

  /* ═══════════════════════════════════════════════════════════════════
     STEP 0 — sanity: fixtures
     ═══════════════════════════════════════════════════════════════════ */
  describe('Step 0 — fixtures', () => {
    it('tokens and listingId are set', () => {
      expect(hostToken).toBeTruthy();
      expect(host2Token).toBeTruthy();
      expect(renterToken).toBeTruthy();
      expect(listingId).toBeTruthy();
    });
  });

  /* ═══════════════════════════════════════════════════════════════════
     STEP 1 — renter creates two pending bookings (non-overlapping)
     ═══════════════════════════════════════════════════════════════════ */
  describe('Step 1 — renter creates bookings', () => {
    it('creates booking A (to be confirmed)', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/bookings')
        .set('Authorization', `Bearer ${renterToken}`)
        .send({ listingId, startDate, endDate })
        .expect(201);

      const b = res.body.data ?? res.body;
      expect(b.status).toBe('pending');
      confirmBookingId = b.id;
      confirmConversationId = b.conversationId ?? null;
    });

    it('creates booking B (to be rejected)', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/bookings')
        .set('Authorization', `Bearer ${renterToken}`)
        .send({ listingId, startDate: start2, endDate: end2 })
        .expect(201);

      const b = res.body.data ?? res.body;
      expect(b.status).toBe('pending');
      rejectBookingId = b.id;
      rejectConversationId = b.conversationId ?? null;
    });
  });

  /* ═══════════════════════════════════════════════════════════════════
     STEP 2 — authorization guards
     ═══════════════════════════════════════════════════════════════════ */
  describe('Step 2 — authorization guards', () => {
    it('3. renter cannot confirm booking (403)', async () => {
      await request(app.getHttpServer())
        .patch(`/api/bookings/${confirmBookingId}/confirm`)
        .set('Authorization', `Bearer ${renterToken}`)
        .expect(403);
    });

    it('3. renter cannot reject booking (403)', async () => {
      await request(app.getHttpServer())
        .patch(`/api/bookings/${rejectBookingId}/reject`)
        .set('Authorization', `Bearer ${renterToken}`)
        .expect(403);
    });

    it('4. unrelated host cannot confirm booking (403)', async () => {
      await request(app.getHttpServer())
        .patch(`/api/bookings/${confirmBookingId}/confirm`)
        .set('Authorization', `Bearer ${host2Token}`)
        .expect(403);
    });

    it('4. unrelated host cannot reject booking (403)', async () => {
      await request(app.getHttpServer())
        .patch(`/api/bookings/${rejectBookingId}/reject`)
        .set('Authorization', `Bearer ${host2Token}`)
        .expect(403);
    });
  });

  /* ═══════════════════════════════════════════════════════════════════
     STEP 3 — host confirms booking A
     ═══════════════════════════════════════════════════════════════════ */
  describe('Step 3 — host confirms booking A', () => {
    it('1. PATCH /api/bookings/:id/confirm → 200', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/api/bookings/${confirmBookingId}/confirm`)
        .set('Authorization', `Bearer ${hostToken}`)
        .expect(200);

      const b = res.body.data ?? res.body;
      expect(b.status).toBe('confirmed');
    });

    it('5. GET /api/bookings/:id returns status=confirmed for renter', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/bookings/${confirmBookingId}`)
        .set('Authorization', `Bearer ${renterToken}`)
        .expect(200);

      const b = res.body.data ?? res.body;
      expect(b.status).toBe('confirmed');
    });

    it('6. pending booking B still returns status=pending (no Pay now yet)', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/bookings/${rejectBookingId}`)
        .set('Authorization', `Bearer ${renterToken}`)
        .expect(200);

      const b = res.body.data ?? res.body;
      expect(b.status).toBe('pending');
    });

    it('7. accept created a system chat message in the conversation', async () => {
      if (!confirmConversationId) {
        // Fallback: find conversation via Prisma
        const conv = await prisma.conversation.findFirst({
          where: { bookingId: confirmBookingId },
        });
        confirmConversationId = conv?.id ?? '';
      }
      expect(confirmConversationId).toBeTruthy();

      const msgs = await prisma.message.findMany({
        where: { conversationId: confirmConversationId },
        orderBy: { createdAt: 'asc' },
      });

      const systemMsg = msgs.find((m) => m.content.includes('Booking accepted'));
      expect(systemMsg).toBeDefined();
      expect(systemMsg!.content).toMatch(/pay/i);
    });
  });

  /* ═══════════════════════════════════════════════════════════════════
     STEP 4 — host rejects booking B
     ═══════════════════════════════════════════════════════════════════ */
  describe('Step 4 — host rejects booking B', () => {
    it('2. PATCH /api/bookings/:id/reject → 200', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/api/bookings/${rejectBookingId}/reject`)
        .set('Authorization', `Bearer ${hostToken}`)
        .expect(200);

      const b = res.body.data ?? res.body;
      expect(b.status).toBe('rejected');
    });

    it('5+6. GET /api/bookings/:id returns status=rejected for renter', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/bookings/${rejectBookingId}`)
        .set('Authorization', `Bearer ${renterToken}`)
        .expect(200);

      const b = res.body.data ?? res.body;
      expect(b.status).toBe('rejected');
    });

    it('7. reject created a system chat message in the conversation', async () => {
      if (!rejectConversationId) {
        const conv = await prisma.conversation.findFirst({
          where: { bookingId: rejectBookingId },
        });
        rejectConversationId = conv?.id ?? '';
      }
      expect(rejectConversationId).toBeTruthy();

      const msgs = await prisma.message.findMany({
        where: { conversationId: rejectConversationId },
        orderBy: { createdAt: 'asc' },
      });

      const systemMsg = msgs.find((m) => m.content.includes('declined'));
      expect(systemMsg).toBeDefined();
    });
  });

  /* ═══════════════════════════════════════════════════════════════════
     STEP 5 — idempotency guards
     ═══════════════════════════════════════════════════════════════════ */
  describe('Step 5 — idempotency & state guards', () => {
    it('confirming an already-confirmed booking returns 200 (idempotent)', async () => {
      await request(app.getHttpServer())
        .patch(`/api/bookings/${confirmBookingId}/confirm`)
        .set('Authorization', `Bearer ${hostToken}`)
        .expect(200);
    });

    it('rejecting an already-confirmed booking returns 400', async () => {
      await request(app.getHttpServer())
        .patch(`/api/bookings/${confirmBookingId}/reject`)
        .set('Authorization', `Bearer ${hostToken}`)
        .expect(400);
    });
  });

  /* ═══════════════════════════════════════════════════════════════════
     STEP 6 — wallet-first payment from chat
     ═══════════════════════════════════════════════════════════════════ */
  describe('Step 6 — wallet-first payment', () => {
    it('creates booking C (wallet payment target)', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/bookings')
        .set('Authorization', `Bearer ${renterToken}`)
        .send({ listingId, startDate: start3, endDate: end3 })
        .expect(201);

      const b = res.body.data ?? res.body;
      expect(b.status).toBe('pending');
      walletBookingId = b.id;
    });

    it('host confirms booking C', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/api/bookings/${walletBookingId}/confirm`)
        .set('Authorization', `Bearer ${hostToken}`)
        .expect(200);

      expect((res.body.data ?? res.body).status).toBe('confirmed');
    });

    it('10. POST /api/bookings/:id/pay with useWallet=true fails when balance=0 (400)', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/bookings/${walletBookingId}/pay`)
        .set('Authorization', `Bearer ${renterToken}`)
        .send({ useWallet: true })
        .expect(400);

      const body = JSON.stringify(res.body);
      expect(body).toMatch(/insufficient|balance|wallet/i);
    });

    it('wallet balance is still 0 after failed attempt', async () => {
      const wallet = await prisma.wallet.findFirst({
        where: { user: { email: RENTER_EMAIL } },
      });
      expect(Number(wallet?.balance ?? 0)).toBe(0);
    });

    it('seeds renter wallet via simulated top-up (dev endpoint)', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/wallet/topup')
        .set('Authorization', `Bearer ${renterToken}`)
        .send({ amount: 500 })
        .expect(201);

      const data = res.body.data ?? res.body;
      expect(Number(data.balance)).toBe(500);
    });

    it('9. POST /api/bookings/:id/pay with useWallet=true succeeds when balance sufficient (201)', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/bookings/${walletBookingId}/pay`)
        .set('Authorization', `Bearer ${renterToken}`)
        .send({ useWallet: true })
        .expect(201);

      const b = res.body.data ?? res.body;
      expect(b.status).toBe('paid');
    });

    it('booking C status is paid after wallet payment', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/bookings/${walletBookingId}`)
        .set('Authorization', `Bearer ${renterToken}`)
        .expect(200);

      expect((res.body.data ?? res.body).status).toBe('paid');
    });

    it('wallet balance decreased by walletTotal (discounted) after payment', async () => {
      const wallet = await prisma.wallet.findFirst({
        where: { user: { email: RENTER_EMAIL } },
      });
      // listing = 100/night, 2 nights → publicTotal = 200
      // commission 10% → platformMargin = 20, walletDiscount = 10, walletTotal = 190
      // balance: 500 - 190 = 310
      const balance = Number(wallet?.balance ?? 0);
      expect(balance).toBeCloseTo(310, 1);
    });

    it('paying an already-paid booking is idempotent (2xx, status stays paid)', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/bookings/${walletBookingId}/pay`)
        .set('Authorization', `Bearer ${renterToken}`)
        .send({ useWallet: true });

      expect(res.status).toBeGreaterThanOrEqual(200);
      expect(res.status).toBeLessThan(300);
      const b = res.body.data ?? res.body;
      expect(b.status).toBe('paid');
    });
  });

  /* ═══════════════════════════════════════════════════════════════════
     STEP 7 — host-details endpoint authorization + payload
     ═══════════════════════════════════════════════════════════════════ */
  describe('Step 7 — GET /api/bookings/:id/host-details', () => {
    it('listing host can fetch details (200)', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/bookings/${confirmBookingId}/host-details`)
        .set('Authorization', `Bearer ${hostToken}`)
        .expect(200);

      const d = res.body.data ?? res.body;
      expect(d.bookingId).toBe(confirmBookingId);
      expect(d.renter).toBeDefined();
      expect(d.renter.name).toBeTruthy();
      // private fields must NOT be present
      expect(d.renter.email).toBeUndefined();
      expect(d.renter.passwordHash).toBeUndefined();
      expect(d.renter.phone).toBeUndefined();
      expect(d.listing).toBeDefined();
      expect(typeof d.publicTotal).toBe('number');
      expect(typeof d.hostAmount).toBe('number');
      expect(d.hostAmount).toBeLessThan(d.publicTotal);
    });

    it('response includes renter verification and stats', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/bookings/${confirmBookingId}/host-details`)
        .set('Authorization', `Bearer ${hostToken}`)
        .expect(200);

      const d = res.body.data ?? res.body;
      expect(typeof d.renter.verifiedEmail).toBe('boolean');
      expect(typeof d.renter.ratingAvg).toBe('number');
      expect(typeof d.renter.completedBookings).toBe('number');
    });

    it('renter cannot fetch host-only details (403)', async () => {
      await request(app.getHttpServer())
        .get(`/api/bookings/${confirmBookingId}/host-details`)
        .set('Authorization', `Bearer ${renterToken}`)
        .expect(403);
    });

    it('unrelated host cannot fetch another listing\'s booking details (403)', async () => {
      await request(app.getHttpServer())
        .get(`/api/bookings/${confirmBookingId}/host-details`)
        .set('Authorization', `Bearer ${host2Token}`)
        .expect(403);
    });

    it('pending booking card: host can view details and booking status is pending', async () => {
      // Create a fresh pending booking so we have one in pending state
      const futureStart = (() => {
        const d = new Date(startDate);
        d.setDate(d.getDate() + 30);
        return d.toISOString().split('T')[0];
      })();
      const futureEnd = (() => {
        const d = new Date(futureStart);
        d.setDate(d.getDate() + 1);
        return d.toISOString().split('T')[0];
      })();

      const createRes = await request(app.getHttpServer())
        .post('/api/bookings')
        .set('Authorization', `Bearer ${renterToken}`)
        .send({ listingId, startDate: futureStart, endDate: futureEnd })
        .expect(201);

      const pendingBookingId = (createRes.body.data ?? createRes.body).id;

      const detailsRes = await request(app.getHttpServer())
        .get(`/api/bookings/${pendingBookingId}/host-details`)
        .set('Authorization', `Bearer ${hostToken}`)
        .expect(200);

      const d = detailsRes.body.data ?? detailsRes.body;
      expect(d.status).toBe('pending');
      expect(d.displayStatus).toBe('pending');
      expect(d.renter).toBeDefined();
      expect(d.listing).toBeDefined();
    });
  });
});
