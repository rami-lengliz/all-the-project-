import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
const request = require('supertest');
import { AppModule } from '../src/app.module';
import { AiService } from '../src/modules/ai/ai.service';
import { TransformInterceptor } from '../src/common/interceptors/transform.interceptor';

/**
 * E2E guardrail tests for POST /api/ai/search
 *
 * Strategy:
 *  - Mount the full AppModule (real HTTP stack, guards, pipes, interceptor).
 *  - Override AiService at the provider level so generateCompletion never
 *    calls OpenAI.  Set OPENAI_API_KEY to a non-empty dummy value so the
 *    service does NOT fall through to the keyword fallback path.
 *  - All assertions are based on the stable response contract:
 *      { mode, filters (object), chips (array), followUp, results (array) }
 */
describe('POST /api/ai/search — guardrails', () => {
    let app: INestApplication;

    // The mock function we control per test
    const mockGenerateCompletion = jest.fn<Promise<string>, [string, any?]>();

    beforeAll(async () => {
        // Provide a dummy key so AiSearchService doesn't use the fallback path
        process.env.OPENAI_API_KEY = 'sk-test-dummy-key-for-e2e';

        const moduleFixture: TestingModule = await Test.createTestingModule({
            imports: [AppModule],
        })
            .overrideProvider(AiService)
            .useValue({
                generateCompletion: mockGenerateCompletion,
                isAiEnabled: () => true,
                estimateTokens: (t: string) => Math.ceil(t.length / 4),
            })
            .compile();

        app = moduleFixture.createNestApplication();

        // Mirror main.ts global setup
        app.useGlobalInterceptors(new TransformInterceptor());
        app.useGlobalPipes(
            new ValidationPipe({
                whitelist: true,
                forbidNonWhitelisted: true,
                transform: true,
            }),
        );

        await app.init();
    });

    afterAll(async () => {
        delete process.env.OPENAI_API_KEY;
        if (app) await app.close();
    });

    beforeEach(() => {
        mockGenerateCompletion.mockReset();
    });

    // ─── Helper: a minimal FOLLOW_UP JSON the "AI" would return ─────────────────

    function followUpJson(): string {
        return JSON.stringify({
            mode: 'FOLLOW_UP',
            followUp: {
                question: 'Which dates do you need?',
                field: 'dates',
                options: ['Today', 'Tomorrow', 'This weekend'],
            },
            filters: { q: 'villa', sortBy: 'date', radiusKm: 10 },
            chips: [{ key: 'q', label: 'villa' }],
        });
    }

    function resultJson(): string {
        return JSON.stringify({
            mode: 'RESULT',
            filters: {
                q: 'villa',
                categorySlug: 'accommodation',
                maxPrice: 250,
                sortBy: 'date',
                radiusKm: 10,
            },
            chips: [
                { key: 'q', label: 'villa' },
                { key: 'category', label: 'Accommodation' },
                { key: 'price', label: 'Up to 250 TND' },
            ],
        });
    }

    // ─── Test 1: First call → FOLLOW_UP ─────────────────────────────────────────

    it('TC-1  first call returns FOLLOW_UP when AI returns FOLLOW_UP and followUpUsed is false', async () => {
        mockGenerateCompletion.mockResolvedValueOnce(followUpJson());

        const res = await request(app.getHttpServer())
            .post('/api/ai/search')
            .send({ query: 'villa near beach', followUpUsed: false })
            .expect(201);

        const body = res.body.data ?? res.body;

        // Mode
        expect(body.mode).toBe('FOLLOW_UP');

        // followUp must be present and have question
        expect(body.followUp).toBeDefined();
        expect(typeof body.followUp.question).toBe('string');
        expect(body.followUp.question.length).toBeGreaterThan(0);

        // Stable keys: filters (object) + chips (array) + results (array)
        expect(body.filters).toBeDefined();
        expect(typeof body.filters).toBe('object');
        expect(Array.isArray(body.chips)).toBe(true);
        expect(Array.isArray(body.results)).toBe(true);
        expect(body.results).toHaveLength(0); // always empty in FOLLOW_UP
    });

    // ─── Test 2: Second call with followUpUsed=true → must be RESULT ────────────

    it('TC-2  followUpUsed=true forces RESULT even if AI returns FOLLOW_UP', async () => {
        // Mock still returns FOLLOW_UP — the guardrail must override it
        mockGenerateCompletion.mockResolvedValueOnce(followUpJson());

        const res = await request(app.getHttpServer())
            .post('/api/ai/search')
            .send({
                query: 'villa near beach',
                followUpUsed: true,
                followUpAnswer: 'tomorrow',
            })
            .expect(201);

        const body = res.body.data ?? res.body;

        // Guardrail: mode must be RESULT regardless of what the AI returned
        expect(body.mode).toBe('RESULT');

        // followUp must be null/absent in RESULT mode
        expect(body.followUp == null).toBe(true);

        // Stable contract
        expect(body.filters).toBeDefined();
        expect(typeof body.filters).toBe('object');
        expect(Array.isArray(body.chips)).toBe(true);
        expect(Array.isArray(body.results)).toBe(true);
    });

    // ─── Test 3: RESULT responses always include filters + chips ─────────────────

    it('TC-3  RESULT mode always includes filters object and chips array', async () => {
        mockGenerateCompletion.mockResolvedValueOnce(resultJson());

        const res = await request(app.getHttpServer())
            .post('/api/ai/search')
            .send({ query: 'villa under 250', followUpUsed: false })
            .expect(201);

        const body = res.body.data ?? res.body;

        expect(body.mode).toBe('RESULT');

        // filters must be a non-null object
        expect(body.filters).not.toBeNull();
        expect(typeof body.filters).toBe('object');
        expect(Array.isArray(body.filters)).toBe(false); // not an array

        // chips must be an array (can be empty, but must be array)
        expect(Array.isArray(body.chips)).toBe(true);

        // results must be an array
        expect(Array.isArray(body.results)).toBe(true);
    });

    // ─── Test 4: FOLLOW_UP mode also has filters + chips ────────────────────────

    it('TC-4  FOLLOW_UP mode includes filters object AND non-empty chips when filters have data', async () => {
        mockGenerateCompletion.mockResolvedValueOnce(followUpJson());
        // followUpJson() returns filters: { q: 'villa', ... }
        // so filtersToChips() must produce at least one chip for 'q'

        const res = await request(app.getHttpServer())
            .post('/api/ai/search')
            .send({ query: 'I want something fun', followUpUsed: false })
            .expect(201);

        const body = res.body.data ?? res.body;

        expect(body.mode).toBe('FOLLOW_UP');
        expect(typeof body.filters).toBe('object');
        expect(Array.isArray(body.chips)).toBe(true);

        // Partial filters were provided (q='villa') — chips must not be empty
        expect(body.chips.length).toBeGreaterThan(0);

        // Each chip must have key and label
        body.chips.forEach((chip: any) => {
            expect(typeof chip.key).toBe('string');
            expect(typeof chip.label).toBe('string');
            expect(chip.label.length).toBeGreaterThan(0);
        });
    });

    // ─── Test 5: Malformed AI JSON → fallback RESULT (no crash) ─────────────────

    it('TC-5  malformed AI JSON falls back to RESULT without crashing', async () => {
        mockGenerateCompletion.mockResolvedValueOnce('NOT VALID JSON at all!!!');

        const res = await request(app.getHttpServer())
            .post('/api/ai/search')
            .send({ query: 'something random' })
            .expect(201);

        const body = res.body.data ?? res.body;

        // Must still return a valid response
        expect(['FOLLOW_UP', 'RESULT']).toContain(body.mode);
        expect(typeof body.filters).toBe('object');
        expect(Array.isArray(body.chips)).toBe(true);
        expect(Array.isArray(body.results)).toBe(true);
    });

    // ─── Test 6: followUpUsed=true + RESULT from AI → plain RESULT ───────────────

    it('TC-6  followUpUsed=true with AI returning RESULT yields RESULT with filters+chips', async () => {
        mockGenerateCompletion.mockResolvedValueOnce(resultJson());

        const res = await request(app.getHttpServer())
            .post('/api/ai/search')
            .send({
                query: 'villa under 250',
                followUpUsed: true,
                followUpAnswer: 'tomorrow',
            })
            .expect(201);

        const body = res.body.data ?? res.body;

        expect(body.mode).toBe('RESULT');
        expect(body.followUp == null).toBe(true);
        expect(typeof body.filters).toBe('object');
        expect(Array.isArray(body.chips)).toBe(true);
    });

    // ─── Test 7: Missing required `query` field → 400 ────────────────────────────

    it('TC-7  missing query field returns 400', async () => {
        await request(app.getHttpServer())
            .post('/api/ai/search')
            .send({}) // no query
            .expect(400);
    });

    // ─── Test 8: RESULT chips are non-empty when filters have data ────────────────

    it('TC-8  RESULT mode chips are non-empty when filters carry data', async () => {
        mockGenerateCompletion.mockResolvedValueOnce(resultJson());
        // resultJson() returns q='villa', categorySlug='accommodation', maxPrice=250
        // → 3 chips expected: q, category, price

        const res = await request(app.getHttpServer())
            .post('/api/ai/search')
            .send({ query: 'villa under 250', followUpUsed: false })
            .expect(201);

        const body = res.body.data ?? res.body;

        expect(body.mode).toBe('RESULT');
        expect(body.chips.length).toBeGreaterThanOrEqual(2);

        const keys = body.chips.map((c: any) => c.key);
        expect(keys).toContain('q');         // query keyword chip
        expect(keys).toContain('category'); // category chip
        expect(keys).toContain('price');    // price chip
    });

    // ─── Test 9: FOLLOW_UP chip keys match the filter fields returned ─────────────

    it('TC-9  FOLLOW_UP chips are derived from filters (key=q chip exists for q filter)', async () => {
        mockGenerateCompletion.mockResolvedValueOnce(followUpJson());
        // followUpJson() has filters: { q: 'villa' }

        const res = await request(app.getHttpServer())
            .post('/api/ai/search')
            .send({ query: 'villa near beach', followUpUsed: false })
            .expect(201);

        const body = res.body.data ?? res.body;

        expect(body.mode).toBe('FOLLOW_UP');

        // Since filters.q = 'villa', there must be a chip with key='q'
        const qChip = body.chips.find((c: any) => c.key === 'q');
        expect(qChip).toBeDefined();
        expect(qChip.label).toBe('villa');

        // And results must always be an empty array in FOLLOW_UP
        expect(body.results).toHaveLength(0);
    });
});
