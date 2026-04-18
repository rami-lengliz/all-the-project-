import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
const request = require('supertest');
import { AppModule }            from '../src/app.module';
import { AiService }            from '../src/modules/ai/ai.service';
import { TransformInterceptor } from '../src/common/interceptors/transform.interceptor';
import { ALLOWED_CATEGORY_SLUGS } from '../src/modules/ai/ai-search.service';

/**
 * E2E tests for the category-slug anti-hallucination guardrail.
 *
 * Strategy
 * ────────
 * Override AiService so generateCompletion returns exactly what we specify.
 * This lets us simulate:
 *   A) AI returns a valid slug           → slug must appear in response.filters
 *   B) AI returns a hallucinated slug    → slug must be absent/null in response.filters
 *   C) AI returns a valid slug, but it
 *      is not in the geo-restricted list → slug must be absent
 *   D) AI returns no slug at all         → filters.categorySlug should be absent
 *   E) AI returns an empty string slug   → must never pass through
 *
 * The tests import ALLOWED_CATEGORY_SLUGS from the service module itself so
 * there is a single source of truth — if someone adds a new category, these
 * tests continue to work without touching the test file.
 */
describe('POST /api/ai/search — category slug anti-hallucination', () => {
  let app: INestApplication;
  const mockGenerateCompletion = jest.fn<Promise<string>, [string, any?]>();

  // ── helper: build a RESULT JSON the "AI" would return ─────────────────────
  function resultWith(categorySlug: string | undefined | null): string {
    const filters: Record<string, unknown> = { q: 'test' };
    if (categorySlug !== undefined && categorySlug !== null) {
      filters.categorySlug = categorySlug;
    }
    return JSON.stringify({
      mode: 'RESULT',
      filters,
      chips: categorySlug
        ? [{ key: 'q', label: 'test' }, { key: 'category', label: categorySlug }]
        : [{ key: 'q', label: 'test' }],
    });
  }

  // ── helper: extract body regardless of TransformInterceptor wrapper ────────
  function body(res: any): any {
    return res.body.data ?? res.body;
  }

  // ── bootstrap ─────────────────────────────────────────────────────────────
  beforeAll(async () => {
    process.env.OPENAI_API_KEY = 'sk-category-guard-dummy-key';

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(AiService)
      .useValue({
        generateCompletion: mockGenerateCompletion,
        isAiEnabled:        () => true,
        estimateTokens:     (t: string) => Math.ceil(t.length / 4),
      })
      .compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalInterceptors(new TransformInterceptor());
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();
  });

  afterAll(async () => {
    delete process.env.OPENAI_API_KEY;
    if (app) await app.close();
  });

  beforeEach(() => mockGenerateCompletion.mockReset());

  // ══════════════════════════════════════════════════════════════════════════
  // Section A: Valid slugs must pass through
  // ══════════════════════════════════════════════════════════════════════════

  describe('Section A — valid slugs from the whitelist must appear in filters', () => {
    test.each(
      (ALLOWED_CATEGORY_SLUGS as readonly string[]).map((slug) => [slug]),
    )(
      'slug "%s" is accepted and forwarded to filters',
      async (slug: string) => {
        mockGenerateCompletion.mockResolvedValueOnce(resultWith(slug));

        const res = await request(app.getHttpServer())
          .post('/api/ai/search')
          .send({ query: 'something', lat: 36.8578, lng: 11.092 })
          .expect(201);

        const b = body(res);
        expect(b.mode).toBe('RESULT');
        expect(b.filters.categorySlug).toBe(slug);

        // The chip for this category must exist
        const categoryChip = (b.chips as any[]).find((c) => c.key === 'category');
        expect(categoryChip).toBeDefined();
        expect(categoryChip.label).toBeTruthy();
      },
    );
  });

  // ══════════════════════════════════════════════════════════════════════════
  // Section B: Hallucinated slugs must be silently dropped
  // ══════════════════════════════════════════════════════════════════════════

  describe('Section B — hallucinated slugs must be discarded', () => {
    const HALLUCINATED_SLUGS = [
      'restaurants',       // food delivery
      'healthcare',        // medical services
      'education',         // school / tutoring
      'real-estate',       // property sale
      'STAYS',             // wrong case (not normalised)
      'stays ',            // trailing space
      'Stays',             // mixed case
      '',                  // empty string
      'undefined',         // stringified undefined
      'null',              // stringified null
      'any',               // wildcard that AI sometimes emits
      '../../etc/passwd',  // path traversal attempt
      '<script>alert(1)</script>', // XSS attempt
    ];

    test.each(HALLUCINATED_SLUGS.map((slug) => [slug]))(
      'slug "%s" is discarded and categorySlug absent from filters',
      async (slug: string) => {
        mockGenerateCompletion.mockResolvedValueOnce(resultWith(slug));

        const res = await request(app.getHttpServer())
          .post('/api/ai/search')
          .send({ query: 'random query' })
          .expect(201);

        const b = body(res);
        expect(b.mode).toBe('RESULT');

        // categorySlug must NOT be present or must be null/undefined
        expect(b.filters.categorySlug == null).toBe(true);
      },
    );
  });

  // ══════════════════════════════════════════════════════════════════════════
  // Section C: Valid slug, but not in the geo-derived available list
  // ══════════════════════════════════════════════════════════════════════════

  describe('Section C — valid slug rejected because not in geo subset', () => {
    /**
     * The test mock for CategoriesService returns [] by default (no nearby).
     * But we can simulate geo-restriction by passing availableCategorySlugs
     * directly in the request body (the DTO supports this).
     *
     * If the geo subset only contains 'stays', then 'sports-facilities'
     * (which IS in the global whitelist) should still be rejected.
     */
    it('slug "sports-facilities" discarded when availableCategorySlugs restricts to ["stays"]', async () => {
      // AI returns sports-facilities, but geo only has stays
      mockGenerateCompletion.mockResolvedValueOnce(resultWith('sports-facilities'));

      const res = await request(app.getHttpServer())
        .post('/api/ai/search')
        .send({
          query: 'football pitch',
          availableCategorySlugs: ['stays'], // simulated geo restriction
        })
        .expect(201);

      const b = body(res);
      expect(b.mode).toBe('RESULT');
      expect(b.filters.categorySlug == null).toBe(true);
    });

    it('slug "stays" accepted when availableCategorySlugs includes "stays"', async () => {
      mockGenerateCompletion.mockResolvedValueOnce(resultWith('stays'));

      const res = await request(app.getHttpServer())
        .post('/api/ai/search')
        .send({
          query: 'villa',
          availableCategorySlugs: ['stays', 'mobility'],
        })
        .expect(201);

      const b = body(res);
      expect(b.mode).toBe('RESULT');
      expect(b.filters.categorySlug).toBe('stays');
    });

    it('slug "mobility" discarded when availableCategorySlugs only has ["beach-gear"]', async () => {
      mockGenerateCompletion.mockResolvedValueOnce(resultWith('mobility'));

      const res = await request(app.getHttpServer())
        .post('/api/ai/search')
        .send({
          query: 'scooter',
          availableCategorySlugs: ['beach-gear'],
        })
        .expect(201);

      const b = body(res);
      expect(b.mode).toBe('RESULT');
      expect(b.filters.categorySlug == null).toBe(true);
    });
  });

  // ══════════════════════════════════════════════════════════════════════════
  // Section D: No slug emitted by AI → filters.categorySlug absent
  // ══════════════════════════════════════════════════════════════════════════

  describe('Section D — absent slug must not appear in filters', () => {
    it('when AI returns no categorySlug, filters.categorySlug is absent/null', async () => {
      mockGenerateCompletion.mockResolvedValueOnce(resultWith(undefined));

      const res = await request(app.getHttpServer())
        .post('/api/ai/search')
        .send({ query: 'something in Kelibia' })
        .expect(201);

      const b = body(res);
      expect(b.mode).toBe('RESULT');
      expect(b.filters.categorySlug == null).toBe(true);
    });
  });

  // ══════════════════════════════════════════════════════════════════════════
  // Section E: ALLOWED_CATEGORY_SLUGS constant integrity
  // ══════════════════════════════════════════════════════════════════════════

  describe('Section E — ALLOWED_CATEGORY_SLUGS constant integrity', () => {
    it('ALLOWED_CATEGORY_SLUGS is a non-empty read-only array', () => {
      expect(Array.isArray(ALLOWED_CATEGORY_SLUGS)).toBe(true);
      expect(ALLOWED_CATEGORY_SLUGS.length).toBeGreaterThan(0);
    });

    it('every slug in ALLOWED_CATEGORY_SLUGS is a non-empty lowercase string with no spaces', () => {
      for (const slug of ALLOWED_CATEGORY_SLUGS) {
        expect(typeof slug).toBe('string');
        expect(slug.trim().length).toBeGreaterThan(0);
        expect(slug).toBe(slug.trim().toLowerCase());
        expect(slug).not.toContain(' ');
      }
    });

    it('ALLOWED_CATEGORY_SLUGS has no duplicates', () => {
      const unique = new Set(ALLOWED_CATEGORY_SLUGS);
      expect(unique.size).toBe(ALLOWED_CATEGORY_SLUGS.length);
    });

    it('known platform slugs are present', () => {
      expect(ALLOWED_CATEGORY_SLUGS).toContain('stays');
      expect(ALLOWED_CATEGORY_SLUGS).toContain('sports-facilities');
      expect(ALLOWED_CATEGORY_SLUGS).toContain('mobility');
      expect(ALLOWED_CATEGORY_SLUGS).toContain('beach-gear');
    });
  });

  // ══════════════════════════════════════════════════════════════════════════
  // Section F: FOLLOW_UP mode — partial categorySlug in partial filters
  // ══════════════════════════════════════════════════════════════════════════

  describe('Section F — FOLLOW_UP partial filters also validate categorySlug', () => {
    it('hallucinated slug in FOLLOW_UP partial filters is discarded', async () => {
      mockGenerateCompletion.mockResolvedValueOnce(JSON.stringify({
        mode: 'FOLLOW_UP',
        followUp: { question: 'Which dates?', field: 'dates' },
        filters: { q: 'restaurant booking', categorySlug: 'restaurants' }, // hallucinated
        chips: [{ key: 'q', label: 'restaurant booking' }],
      }));

      const res = await request(app.getHttpServer())
        .post('/api/ai/search')
        .send({ query: 'restaurant booking tonight' })
        .expect(201);

      const b = body(res);
      // Could be FOLLOW_UP or RESULT depending on guardrail order
      expect(['FOLLOW_UP', 'RESULT']).toContain(b.mode);
      // In either case, the hallucinated slug must not appear
      expect(b.filters.categorySlug == null).toBe(true);
    });

    it('valid slug in FOLLOW_UP partial filters is preserved', async () => {
      mockGenerateCompletion.mockResolvedValueOnce(JSON.stringify({
        mode: 'FOLLOW_UP',
        followUp: { question: 'For how many days?', field: 'duration' },
        filters: { q: 'scooter', categorySlug: 'mobility' }, // valid
        chips: [{ key: 'q', label: 'scooter' }, { key: 'category', label: 'mobility' }],
      }));

      const res = await request(app.getHttpServer())
        .post('/api/ai/search')
        .send({ query: 'scooter rentals Kelibia' })
        .expect(201);

      const b = body(res);
      expect(['FOLLOW_UP', 'RESULT']).toContain(b.mode);
      // Valid slug must pass through
      expect(b.filters.categorySlug).toBe('mobility');
    });
  });
});
