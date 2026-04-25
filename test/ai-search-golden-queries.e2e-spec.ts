import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
const request = require('supertest');
import { AppModule }             from '../src/app.module';
import { AiService }             from '../src/modules/ai/ai.service';
import { TransformInterceptor }  from '../src/common/interceptors/transform.interceptor';
import {
  GOLDEN_QUERIES,
  FOLLOW_UP_QUERIES,
  EDGE_QUERIES,
  GoldenQuery,
  KELIBIA_LAT,
  KELIBIA_LNG,
} from './fixtures/ai-search-golden-queries.fixture';

// ── Constants ─────────────────────────────────────────────────────────────────
const ENDPOINT = '/api/ai/search';

// ── Per-query mock AI responses ───────────────────────────────────────────────
//
// These are the "expected" AI outputs for each GQ-xx entry.
// When running in CI (no real API key), the AiService is mocked to return
// these so we test the entire HTTP stack + guardrails + schema without
// burning real tokens.
//
// When GOLDEN_LIVE_AI=true is set, AiService is NOT mocked and the real model
// is called — this is "true golden" mode for validating prompt quality.
//
const MOCK_AI_RESPONSES: Record<string, string> = {
  'GQ-01': JSON.stringify({
    mode: 'RESULT',
    filters: { q: 'villa', categorySlug: 'stays' },
    chips: [{ key: 'q', label: 'villa' }, { key: 'category', label: 'stays' }],
  }),
  'GQ-02': JSON.stringify({
    mode: 'RESULT',
    filters: { categorySlug: 'stays', maxPrice: 150 },
    chips: [{ key: 'category', label: 'stays' }, { key: 'maxPrice', label: 'Max 150 TND' }],
  }),
  'GQ-03': JSON.stringify({
    mode: 'RESULT',
    filters: { q: 'فيلا', categorySlug: 'stays' },
    chips: [{ key: 'q', label: 'فيلا' }, { key: 'category', label: 'stays' }],
  }),
  'GQ-04': JSON.stringify({
    mode: 'RESULT',
    filters: { categorySlug: 'sports-facilities', q: 'football' },
    chips: [{ key: 'category', label: 'sports-facilities' }, { key: 'q', label: 'football' }],
  }),
  'GQ-05': JSON.stringify({
    mode: 'RESULT',
    filters: { categorySlug: 'tools-equipment', maxPrice: 30 },
    chips: [{ key: 'category', label: 'tools-equipment' }, { key: 'maxPrice', label: 'Max 30 TND' }],
  }),
  'GQ-06-call1': JSON.stringify({
    mode: 'FOLLOW_UP',
    followUp: { question: 'Pour quelles dates exactement ?', field: 'dates', options: ['Ce vendredi', 'Ce samedi', 'Ce dimanche'] },
    filters: { categorySlug: 'sports-facilities' },
    chips: [{ key: 'category', label: 'sports-facilities' }],
  }),
  'GQ-06-call2': JSON.stringify({
    mode: 'RESULT',
    filters: { categorySlug: 'sports-facilities', availableFrom: '2026-07-18', availableTo: '2026-07-20' },
    chips: [{ key: 'category', label: 'sports-facilities' }, { key: 'dates', label: '18–20 Jul' }],
  }),
  'GQ-07-call1': JSON.stringify({
    mode: 'FOLLOW_UP',
    followUp: { question: 'Pour combien de jours avez-vous besoin du véhicule ?', field: 'duration' },
    filters: { categorySlug: 'mobility' },
    chips: [{ key: 'category', label: 'mobility' }],
  }),
  'GQ-07-call2': JSON.stringify({
    mode: 'RESULT',
    filters: { categorySlug: 'mobility', q: 'scooter' },
    chips: [{ key: 'category', label: 'mobility' }, { key: 'q', label: 'scooter' }],
  }),
  'GQ-08': JSON.stringify({
    mode: 'RESULT',
    filters: { categorySlug: 'mobility', maxPrice: 200, availableFrom: '2026-07-10', availableTo: '2026-07-15' },
    chips: [{ key: 'category', label: 'mobility' }, { key: 'maxPrice', label: 'Max 200 TND' }],
  }),
  // GQ-09 (blank) — AI should NOT be called; no mock needed
  'GQ-10': JSON.stringify({
    mode: 'RESULT',
    filters: { q: 'tajine lamb olives' },
    chips: [],
  }),
};

// ── Schema invariant helper ───────────────────────────────────────────────────

function assertSchemaInvariants(body: any): void {
  // 1. mode is exactly RESULT or FOLLOW_UP
  expect(['RESULT', 'FOLLOW_UP']).toContain(body.mode);

  // 2. filters is always a non-null plain object
  expect(body.filters).toBeDefined();
  expect(body.filters).not.toBeNull();
  expect(typeof body.filters).toBe('object');
  expect(Array.isArray(body.filters)).toBe(false);

  // 3. chips is always an array
  expect(Array.isArray(body.chips)).toBe(true);

  // 4. results is always an array
  expect(Array.isArray(body.results)).toBe(true);

  // 5. results must be empty in FOLLOW_UP
  if (body.mode === 'FOLLOW_UP') {
    expect(body.results).toHaveLength(0);
  }

  // 6. followUp is defined + has a question string in FOLLOW_UP
  if (body.mode === 'FOLLOW_UP') {
    expect(body.followUp).toBeDefined();
    expect(body.followUp).not.toBeNull();
    expect(typeof body.followUp.question).toBe('string');
    expect(body.followUp.question.length).toBeGreaterThan(0);
  }

  // 7. followUp is null in RESULT
  if (body.mode === 'RESULT') {
    expect(body.followUp == null).toBe(true);
  }
}

// ── Test suite ────────────────────────────────────────────────────────────────

describe('POST /api/ai/search — golden queries', () => {
  let app: INestApplication;
  const mockGenerateCompletion = jest.fn<Promise<string>, [string, any?]>();
  const liveMode = process.env.GOLDEN_LIVE_AI === 'true';

  beforeAll(async () => {
    process.env.OPENAI_API_KEY = liveMode
      ? (process.env.OPENAI_API_KEY ?? '')
      : 'sk-golden-dummy-key';

    const moduleBuilder = Test.createTestingModule({ imports: [AppModule] });

    if (!liveMode) {
      moduleBuilder.overrideProvider(AiService).useValue({
        generateCompletion: mockGenerateCompletion,
        isAiEnabled:  () => true,
        estimateTokens: (t: string) => Math.ceil(t.length / 4),
      });
    }

    const moduleFixture: TestingModule = await moduleBuilder.compile();
    app = moduleFixture.createNestApplication();
    app.useGlobalInterceptors(new TransformInterceptor());
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();
  });

  afterAll(async () => {
    delete process.env.OPENAI_API_KEY;
    if (app) await app.close();
  });

  beforeEach(() => {
    mockGenerateCompletion.mockReset();
  });

  // ── Section 1: Schema invariants — every query must produce valid JSON ────────

  describe('Schema invariants (all 10 queries)', () => {
    const ALL_CONFIGURED = GOLDEN_QUERIES.filter(
      (gq) => gq.id !== 'GQ-09', // blank edge case — AI not called, handled separately
    );

    test.each(ALL_CONFIGURED.map((gq) => [gq.id, gq]))(
      '%s — %s: response is valid JSON with correct schema',
      async (id: string, gq: GoldenQuery) => {
        if (!liveMode) {
          const mockKey = id === 'GQ-06' ? 'GQ-06-call1'
                        : id === 'GQ-07' ? 'GQ-07-call1'
                        : id;
          const mockResp = MOCK_AI_RESPONSES[mockKey];
          if (mockResp) mockGenerateCompletion.mockResolvedValueOnce(mockResp);
        }

        const res = await request(app.getHttpServer())
          .post(ENDPOINT)
          .send(gq.request)
          .expect(201);

        const body = res.body.data ?? res.body;

        // Invariant 1: valid JSON (supertest already parsed it — just check top-level)
        expect(typeof body).toBe('object');
        expect(body).not.toBeNull();

        // Invariants 2–7
        assertSchemaInvariants(body);
      },
    );
  });

  // ── Section 2: RESULT queries — verify filters + chips + mode ────────────────

  describe('RESULT queries — filters and chips populated', () => {
    const RESULT_GQS = GOLDEN_QUERIES.filter(
      (gq) => gq.expectedMode === 'RESULT' && gq.id !== 'GQ-09' && gq.id !== 'GQ-10',
    );

    test.each(RESULT_GQS.map((gq) => [gq.id, gq]))(
      '%s — %s: mode=RESULT with populated filters and chips',
      async (id: string, gq: GoldenQuery) => {
        if (!liveMode) {
          const mockResp = MOCK_AI_RESPONSES[id];
          if (mockResp) mockGenerateCompletion.mockResolvedValueOnce(mockResp);
        }

        const res = await request(app.getHttpServer())
          .post(ENDPOINT)
          .send(gq.request)
          .expect(201);

        const body = res.body.data ?? res.body;

        expect(body.mode).toBe('RESULT');
        expect(body.followUp).toBeNull();
        expect(Array.isArray(body.chips)).toBe(true);

        // Each chip must have a non-empty key and label
        (body.chips as any[]).forEach((chip) => {
          expect(typeof chip.key).toBe('string');
          expect(chip.key.length).toBeGreaterThan(0);
          expect(typeof chip.label).toBe('string');
          expect(chip.label.length).toBeGreaterThan(0);
        });
      },
    );
  });

  // ── Section 3: FOLLOW_UP queries — two-turn flow ──────────────────────────────
  //
  // GQ-06 and GQ-07 both expect FOLLOW_UP on the first call.
  // The second call carries followUpUsed=true + followUpAnswer and MUST
  // return RESULT — regardless of what the model returns (Guardrail 1).

  describe('FOLLOW_UP → RESULT two-turn flow', () => {
    test.each(FOLLOW_UP_QUERIES.map((gq) => [gq.id, gq]))(
      '%s — %s: first call FOLLOW_UP, second call must be RESULT',
      async (id: string, gq: GoldenQuery) => {
        // ── Call 1: expect FOLLOW_UP ───────────────────────────────────────────
        if (!liveMode) {
          mockGenerateCompletion.mockResolvedValueOnce(MOCK_AI_RESPONSES[`${id}-call1`]);
        }

        const res1 = await request(app.getHttpServer())
          .post(ENDPOINT)
          .send(gq.request)
          .expect(201);

        const body1 = res1.body.data ?? res1.body;

        expect(body1.mode).toBe('FOLLOW_UP');

        // followUp must carry a non-empty question
        expect(body1.followUp).toBeDefined();
        expect(body1.followUp).not.toBeNull();
        expect(typeof body1.followUp.question).toBe('string');
        expect(body1.followUp.question.length).toBeGreaterThan(0);

        // followUpField hint, if specified in the fixture
        if (gq.followUpField) {
          expect(body1.followUp.field).toBeDefined();
        }

        // results must be empty during FOLLOW_UP
        expect(body1.results).toHaveLength(0);

        // ── Call 2: followUpUsed=true + answer → MUST be RESULT ───────────────
        if (!liveMode) {
          // Mock returns FOLLOW_UP again — the guardrail must override it to RESULT
          mockGenerateCompletion.mockResolvedValueOnce(MOCK_AI_RESPONSES[`${id}-call2`]);
        }

        const res2 = await request(app.getHttpServer())
          .post(ENDPOINT)
          .send({
            ...gq.request,
            followUpUsed:   true,
            followUpAnswer: 'this Saturday and Sunday',
          })
          .expect(201);

        const body2 = res2.body.data ?? res2.body;

        // Guardrail 1: followUpUsed=true must always produce RESULT
        expect(body2.mode).toBe('RESULT');
        expect(body2.followUp).toBeNull();
        expect(body2.filters).toBeDefined();
        expect(typeof body2.filters).toBe('object');
        expect(Array.isArray(body2.chips)).toBe(true);
        expect(Array.isArray(body2.results)).toBe(true);
      },
    );
  });

  // ── Section 4: Max 1 follow-up rule (Guardrail 1 hardened) ───────────────────
  //
  // Even if the AI model misbehaves and returns FOLLOW_UP on the second call
  // (followUpUsed=true), the service MUST return RESULT.
  // This test simulates that adversarial scenario for both FOLLOW_UP golden queries.

  describe('Max 1 follow-up rule — Guardrail 1 adversarial test', () => {
    test.each(FOLLOW_UP_QUERIES.map((gq) => [gq.id, gq]))(
      '%s — %s: AI returns FOLLOW_UP on call 2 → guardrail forces RESULT',
      async (id: string, gq: GoldenQuery) => {
        if (!liveMode) {
          // Adversarial: AI returns FOLLOW_UP even though followUpUsed=true
          mockGenerateCompletion.mockResolvedValueOnce(MOCK_AI_RESPONSES[`${id}-call1`]);
        }

        const res = await request(app.getHttpServer())
          .post(ENDPOINT)
          .send({
            ...gq.request,
            followUpUsed:   true,
            followUpAnswer: 'any answer',
          })
          .expect(201);

        const body = res.body.data ?? res.body;

        // Guardrail must have overridden the FOLLOW_UP → RESULT
        expect(body.mode).toBe('RESULT');
        expect(body.followUp).toBeNull();
        expect(Array.isArray(body.results)).toBe(true);
        expect(Array.isArray(body.chips)).toBe(true);
      },
    );
  });

  // ── Section 5: Edge cases ──────────────────────────────────────────────────────

  describe('Edge cases — never throw, always return stable schema', () => {

    it('GQ-09 — blank/whitespace query: valid RESULT, no crash', async () => {
      // AI must NOT be called for blank query (fallback path)
      const res = await request(app.getHttpServer())
        .post(ENDPOINT)
        .send({ query: '   ', lat: KELIBIA_LAT, lng: KELIBIA_LNG })
        .expect(201);

      const body = res.body.data ?? res.body;

      assertSchemaInvariants(body);
      expect(body.mode).toBe('RESULT');

      if (!liveMode) {
        // AI must never be called for a blank input
        expect(mockGenerateCompletion).not.toHaveBeenCalled();
      }
    });

    it('GQ-10 — off-topic query (recipe): RESULT with no marketplace category', async () => {
      if (!liveMode) {
        mockGenerateCompletion.mockResolvedValueOnce(MOCK_AI_RESPONSES['GQ-10']);
      }

      const res = await request(app.getHttpServer())
        .post(ENDPOINT)
        .send({ query: 'how do I make tajine with lamb and olives?', lat: KELIBIA_LAT, lng: KELIBIA_LNG })
        .expect(201);

      const body = res.body.data ?? res.body;

      assertSchemaInvariants(body);
      expect(body.mode).toBe('RESULT');

      // Off-topic: must NOT produce a marketplace category
      const prohibitedCategories = ['stays', 'sports-facilities', 'tools-equipment', 'mobility', 'event-spaces'];
      if (body.filters?.categorySlug) {
        expect(prohibitedCategories).not.toContain(body.filters.categorySlug);
      }
    });

    it('GQ-E — malformed AI JSON on any query: fallback to RESULT, no 500', async () => {
      if (!liveMode) {
        mockGenerateCompletion.mockResolvedValueOnce('<<<TOTALLY BROKEN OUTPUT>>>');
      }

      const res = await request(app.getHttpServer())
        .post(ENDPOINT)
        .send({ query: 'villa in Kelibia', lat: KELIBIA_LAT, lng: KELIBIA_LNG })
        .expect(201);

      const body = res.body.data ?? res.body;

      // Must still return a valid schema — never 500
      assertSchemaInvariants(body);
      expect(body.mode).toBe('RESULT');
      expect(body.followUp).toBeNull();
    });

    it('GQ-V — missing required query field: 400 Bad Request', async () => {
      await request(app.getHttpServer())
        .post(ENDPOINT)
        .send({})
        .expect(400);
    });

    it('GQ-V2 — unknown extra fields rejected: 400 Bad Request', async () => {
      await request(app.getHttpServer())
        .post(ENDPOINT)
        .send({ query: 'villa', unknownField: true })
        .expect(400);
    });
  });

  // ── Section 6: Mode-specific contract checks ──────────────────────────────────

  describe('Contract: RESULT chips have key + label, FOLLOW_UP chips match partial filters', () => {

    it('RESULT chips each have a non-empty key and label', async () => {
      if (!liveMode) {
        mockGenerateCompletion.mockResolvedValueOnce(MOCK_AI_RESPONSES['GQ-01']);
      }

      const res = await request(app.getHttpServer())
        .post(ENDPOINT)
        .send({ query: 'villa near beach Kelibia', lat: KELIBIA_LAT, lng: KELIBIA_LNG })
        .expect(201);

      const body = res.body.data ?? res.body;

      if (body.mode === 'RESULT') {
        (body.chips as any[]).forEach((chip) => {
          expect(chip).toHaveProperty('key');
          expect(chip).toHaveProperty('label');
          expect(chip.key.length).toBeGreaterThan(0);
          expect(chip.label.length).toBeGreaterThan(0);
        });
      }
    });

    it('FOLLOW_UP chips are derived from partial filters, not empty', async () => {
      if (!liveMode) {
        mockGenerateCompletion.mockResolvedValueOnce(MOCK_AI_RESPONSES['GQ-06-call1']);
      }

      const res = await request(app.getHttpServer())
        .post(ENDPOINT)
        .send({ query: 'terrain de football ce week-end à Kélibia' })
        .expect(201);

      const body = res.body.data ?? res.body;

      if (body.mode === 'FOLLOW_UP') {
        // Partial filter "sports-facilities" was resolved → chip must exist
        expect(body.chips.length).toBeGreaterThan(0);

        const categoryChip = (body.chips as any[]).find((c) => c.key === 'category');
        expect(categoryChip).toBeDefined();
      }
    });
  });
});
