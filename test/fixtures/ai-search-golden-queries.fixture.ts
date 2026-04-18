/**
 * ai-search-golden-queries.fixture.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * "Golden queries" for the /api/ai/search endpoint.
 *
 * Purpose
 * ───────
 *   Each entry defines one realistic user query against the RentAI marketplace
 *   (Kelibia / Tunisia context) together with the expected AI-parsed output.
 *   These serve as regression anchors: if the AI model or prompt changes, run
 *   the golden suite to catch unexpected regressions in filter extraction.
 *
 * Coverage
 * ────────
 *   GQ-01  English   — direct category + city intent
 *   GQ-02  French    — budget + category intent
 *   GQ-03  Arabic    — sea proximity intent
 *   GQ-04  Mixed     — Tunisian-dialect Arabic + French category word
 *   GQ-05  English   — price cap + duration
 *   GQ-06  French    — sports facility + city
 *   GQ-07  Mixed     — ambiguous intent → must trigger FOLLOW_UP
 *   GQ-08  English   — mobility (scooter / vehicle)
 *   GQ-09  Edge      — blank / whitespace input
 *   GQ-10  Edge      — completely off-topic input
 *
 * How to use in a test
 * ────────────────────
 *   import { GOLDEN_QUERIES, GoldenQuery } from './ai-search-golden-queries.fixture';
 *
 *   describe.each(GOLDEN_QUERIES)('Golden: $id $description', (gq: GoldenQuery) => {
 *     it('returns the expected mode', async () => { ... });
 *   });
 *
 * Field meanings
 * ──────────────
 *   request       — body passed to service.search()
 *   expectedMode  — 'RESULT' | 'FOLLOW_UP'
 *   mustFilters   — key/value pairs that MUST appear in response.filters
 *   forbidFilters — keys that must NOT appear in response.filters
 *   mustChipKeys  — chip.key values that must be present in response.chips
 *   followUpField — (FOLLOW_UP only) the field the AI should ask about
 *   notes         — why this query is interesting / what it exercises
 * ─────────────────────────────────────────────────────────────────────────────
 */

// ── Shared Kelibia anchor coordinates ────────────────────────────────────────
export const KELIBIA_LAT = 36.8578;
export const KELIBIA_LNG = 11.0920;

// ── Types ─────────────────────────────────────────────────────────────────────

export interface GoldenQueryRequest {
  query:          string;
  lat?:           number;
  lng?:           number;
  radiusKm?:      number;
  followUpUsed?:  boolean;
  followUpAnswer?: string;
}

export interface GoldenQuery {
  /** Stable identifier — never renumber, just append */
  id:             string;
  language:       'en' | 'fr' | 'ar' | 'mixed' | 'edge';
  description:    string;
  request:        GoldenQueryRequest;
  expectedMode:   'RESULT' | 'FOLLOW_UP';
  /** Filters that MUST appear with their expected value (partial match OK) */
  mustFilters:    Record<string, unknown>;
  /** Filter keys that must NOT appear in the response */
  forbidFilters?: string[];
  /** chip.key values that must be present in chips[] */
  mustChipKeys:   string[];
  /** (FOLLOW_UP only) the field the system should ask about */
  followUpField?: string;
  notes:          string;
}

// ── Golden query corpus ───────────────────────────────────────────────────────

export const GOLDEN_QUERIES: GoldenQuery[] = [

  // ── GQ-01 · English — direct stays + city ────────────────────────────────
  {
    id:          'GQ-01',
    language:    'en',
    description: 'English: villa in Kelibia with geo context',
    request: {
      query:    'I want to rent a villa in Kelibia near the beach',
      lat:      KELIBIA_LAT,
      lng:      KELIBIA_LNG,
      radiusKm: 25,
    },
    expectedMode: 'RESULT',
    mustFilters: {
      categorySlug: 'stays',
      q: expect.stringMatching(/villa/i),
    },
    mustChipKeys: ['q', 'category'],
    notes:
      'Standard stays search with explicit city + sea proximity. ' +
      'AI must extract categorySlug=stays and keyword=villa. ' +
      'No price filter — should NOT appear in filters.',
    forbidFilters: ['maxPrice', 'minPrice'],
  },

  // ── GQ-02 · French — budget stays ────────────────────────────────────────
  {
    id:          'GQ-02',
    language:    'fr',
    description: 'French: cheap apartment with max price',
    request: {
      query:    'appartement pas cher à Kélibia, moins de 150 dinars',
      lat:      KELIBIA_LAT,
      lng:      KELIBIA_LNG,
      radiusKm: 25,
    },
    expectedMode: 'RESULT',
    mustFilters: {
      categorySlug: 'stays',
      maxPrice:     expect.toBeGreaterThanOrEqualTo(100),  // AI may extract 150 or nearby
    },
    mustChipKeys: ['category', 'maxPrice'],
    notes:
      'French query with explicit price ceiling. ' +
      'AI must parse "150 dinars" → maxPrice. ' +
      '"pas cher" should not add irrelevant filters.',
  },

  // ── GQ-03 · Arabic (MSA/Tunisian) — sea proximity ─────────────────────────
  {
    id:          'GQ-03',
    language:    'ar',
    description: 'Arabic MSA: villa close to sea in Kelibia',
    request: {
      query:    'أريد استئجار فيلا قريبة من البحر في قليبية',
      lat:      KELIBIA_LAT,
      lng:      KELIBIA_LNG,
      radiusKm: 30,
    },
    expectedMode: 'RESULT',
    mustFilters: {
      categorySlug: 'stays',
    },
    mustChipKeys: ['category'],
    notes:
      'Full Arabic query — "فيلا" (villa) + "قريبة من البحر" (near sea) + "قليبية" (Kelibia). ' +
      'AI must resolve Arabic to stays category. ' +
      'Sea proximity may surface as a chip but not a hard filter. ' +
      'Regression guard: AI must not hallucinate a sports-facility category here.',
    forbidFilters: ['categorySlug_sports'],
  },

  // ── GQ-04 · Mixed Arabic + French — sports facility ──────────────────────
  {
    id:          'GQ-04',
    language:    'mixed',
    description: 'Tunisian dialect Arabic + French: football pitch',
    request: {
      query:    'نحب نلقى terrain de foot قريب مني في قليبية',
      lat:      KELIBIA_LAT,
      lng:      KELIBIA_LNG,
      radiusKm: 15,
    },
    expectedMode: 'RESULT',
    mustFilters: {
      categorySlug: 'sports-facilities',
    },
    mustChipKeys: ['category'],
    notes:
      'Tunisian dialect ("نحب نلقى" = I want to find) mixed with French "terrain de foot". ' +
      'AI must map "terrain de foot" → categorySlug=sports-facilities. ' +
      'Key regression test: Tunisian dialect is not standard Arabic; prompts must handle it.',
  },

  // ── GQ-05 · English — price cap + duration (tools/equipment) ─────────────
  {
    id:          'GQ-05',
    language:    'en',
    description: 'English: tool rental with price and duration intent',
    request: {
      query:    'I need a drill or power tool for a weekend, max 30 TND',
      lat:      KELIBIA_LAT,
      lng:      KELIBIA_LNG,
      radiusKm: 20,
    },
    expectedMode: 'RESULT',
    mustFilters: {
      categorySlug: 'tools-equipment',
      maxPrice:     expect.toBeGreaterThanOrEqualTo(25),
    },
    mustChipKeys: ['category', 'maxPrice'],
    notes:
      'Tools category + explicit price cap ("30 TND"). ' +
      '"for a weekend" implies duration but should not produce date filters ' +
      '(no specific dates given — ambiguity is acceptable here as no FOLLOW_UP needed).',
  },

  // ── GQ-06 · French — sports facility + specific city ─────────────────────
  {
    id:          'GQ-06',
    language:    'fr',
    description: 'French: tennis court or football pitch in Kelibia',
    request: {
      query:    'terrain de football ou court de tennis à Kélibia disponible ce week-end',
    },
    expectedMode: 'FOLLOW_UP',
    mustFilters:  {},           // before FOLLOW_UP the AI may emit partial filters
    mustChipKeys: [],
    followUpField: 'dates',      // AI should ask: "Pour quelles dates exactement ?"
    notes:
      '"ce week-end" (this weekend) is intentionally vague — no specific dates. ' +
      'The AI must detect ambiguity and return FOLLOW_UP asking for exact dates. ' +
      'This is the key FOLLOW_UP regression case for French input.',
  },

  // ── GQ-07 · Mixed English/Arabic — ambiguous category ────────────────────
  {
    id:          'GQ-07',
    language:    'mixed',
    description: 'Mixed: vague mobility query without quantity or duration',
    request: {
      query:    'scooter أو voiture in Kelibia',
    },
    expectedMode: 'FOLLOW_UP',
    mustFilters:  {},
    mustChipKeys: [],
    followUpField: expect.stringMatching(/duration|dates|quantity/i),
    notes:
      '"scooter أو voiture" (scooter or car) — ambiguous category (mobility) + ' +
      'no duration/dates. AI should ask a clarifying question. ' +
      'Tests that the system does not blindly emit RESULT for under-specified mobility queries.',
  },

  // ── GQ-08 · English — scooter rental, fully specified ────────────────────
  {
    id:          'GQ-08',
    language:    'en',
    description: 'English: scooter rental, price and dates provided',
    request: {
      query:         'rent a scooter from July 10 to July 15, budget 200 TND',
      lat:           KELIBIA_LAT,
      lng:           KELIBIA_LNG,
      radiusKm:      20,
      followUpUsed:  true,
      followUpAnswer: 'July 10 to July 15',
    },
    expectedMode: 'RESULT',
    mustFilters: {
      categorySlug:  'mobility',
      maxPrice:      expect.toBeGreaterThanOrEqualTo(150),
    },
    mustChipKeys: ['category', 'maxPrice'],
    notes:
      'Fully specified mobility query with followUpUsed=true (simulates the ' +
      'FOLLOW_UP → RESULT second call). ' +
      'AI must return RESULT even if it "wants" to ask another question, because ' +
      'followUpUsed=true forces RESULT (Guardrail 1).',
  },

  // ── GQ-09 · Edge — blank / whitespace ────────────────────────────────────
  {
    id:          'GQ-09',
    language:    'edge',
    description: 'Edge: blank query (whitespace only)',
    request: {
      query:    '   ',
      lat:      KELIBIA_LAT,
      lng:      KELIBIA_LNG,
      radiusKm: 25,
    },
    expectedMode: 'RESULT',
    mustFilters:  {},          // no filters on blank
    mustChipKeys: [],          // possibly empty chips
    notes:
      'Blank input should never throw — must return a stable RESULT with empty filters. ' +
      'chips[] may be empty or contain a radius chip. ' +
      'Guardrail: AI must not be called on empty queries (confirmed by unit test); ' +
      'fallback path returns { mode: RESULT, filters: {}, chips: [{key:"q", label:""}] }.',
  },

  // ── GQ-10 · Edge — completely off-topic ───────────────────────────────────
  {
    id:          'GQ-10',
    language:    'edge',
    description: 'Edge: completely off-topic input (recipe request)',
    request: {
      query:    'how do I make tajine with lamb and olives?',
      lat:      KELIBIA_LAT,
      lng:      KELIBIA_LNG,
    },
    expectedMode: 'RESULT',
    mustFilters:  {},   // AI must NOT produce a meaningful category filter
    forbidFilters: ['categorySlug', 'maxPrice', 'availableFrom'],
    mustChipKeys: [],
    notes:
      'Off-topic query must never produce a plausible-looking filter set. ' +
      'The system should return a minimal RESULT with the raw text in filters.q ' +
      'OR an empty RESULT, but must NOT suggest a category or price. ' +
      'Tests content-safety / out-of-domain guardrail.',
  },

];

// ── Convenience subsets ───────────────────────────────────────────────────────

/** Queries that must return RESULT mode */
export const RESULT_QUERIES = GOLDEN_QUERIES.filter(
  (q) => q.expectedMode === 'RESULT',
);

/** Queries that must return FOLLOW_UP mode */
export const FOLLOW_UP_QUERIES = GOLDEN_QUERIES.filter(
  (q) => q.expectedMode === 'FOLLOW_UP',
);

/** Edge cases that must never throw */
export const EDGE_QUERIES = GOLDEN_QUERIES.filter(
  (q) => q.language === 'edge',
);

/** Non-English queries — regression guard for multilingual support */
export const MULTILINGUAL_QUERIES = GOLDEN_QUERIES.filter(
  (q) => q.language !== 'en' && q.language !== 'edge',
);
