/**
 * comp-scorer.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Pure similarity scoring for the RentAI price suggestion engine.
 *
 * Lives in:    src/common/utils/comp-scorer.ts
 * Imported by: PriceSuggestionService  (src/modules/ai/price-suggestion.service.ts)
 * Zero external dependencies — no Prisma, no NestJS, no OpenAI.
 *
 * Algorithm
 * ─────────
 * Each comp gets a score ∈ [0, 1] built from 4 independent dimensions:
 *
 *   score = w_loc * locationScore
 *         + w_type * typeScore
 *         + w_size * sizeScore
 *         + w_amen * amenityScore
 *
 * Default weights (MVP — must sum to 1):
 *   location  0.40  ← strongest signal; nearby comps are most comparable
 *   type      0.25  ← property type match (villa vs apartment etc.)
 *   size      0.20  ← capacity / surface area similarity
 *   amenities 0.15  ← Jaccard overlap of feature tags
 *
 * Graceful degradation: if a dimension cannot be computed (missing fields),
 * it returns a NEUTRAL score (0.5) and its weight is NOT redistributed —
 * this keeps scores comparable across missing-data scenarios.
 * ─────────────────────────────────────────────────────────────────────────────
 */

// ── Weights ──────────────────────────────────────────────────────────────────
const W: Record<'location' | 'type' | 'size' | 'amenities', number> = {
  location:  0.40,
  type:      0.25,
  size:      0.20,
  amenities: 0.15,
};
// Verify at import time that weights sum to 1 (catches config drift):
const _sum = Object.values(W).reduce((a, b) => a + b, 0);
if (Math.abs(_sum - 1) > 0.001) throw new Error(`comp-scorer: weights must sum to 1, got ${_sum}`);

// ── Input types ───────────────────────────────────────────────────────────────

/** The listing we are trying to price (partial fields are fine) */
export interface TargetDraft {
  categorySlug:  string;
  city?:         string | null;
  lat?:          number | null;
  lng?:          number | null;
  propertyType?: string | null;  // 'villa' | 'house' | 'apartment' | null
  capacity?:     number | null;  // max guests / persons
  surfaceM2?:    number | null;  // floor area in m²
  amenities?:    string[] | null;
}

/** A comparable listing retrieved from DB (extends TargetDraft + price) */
export interface CompCandidate {
  listingId:     string;
  price:         number;          // normalised canonical price in TND
  source:        'booking' | 'listing';
  categorySlug:  string;
  city?:         string | null;
  lat?:          number | null;
  lng?:          number | null;
  propertyType?: string | null;
  capacity?:     number | null;
  surfaceM2?:    number | null;
  amenities?:    string[] | null;
  distanceM?:    number;          // pre-computed by PostGIS query (0 = unknown)
}

/** A comp with its computed similarity score */
export interface ScoredComp extends CompCandidate {
  similarityScore:  number;  // 0..1
  /** Breakdown per dimension — useful for debugging / explanation */
  scoreBreakdown: {
    location:  number;
    type:      number;
    size:      number;
    amenities: number;
  };
}

// ── Main export: score one comp against the target ────────────────────────────
/**
 * Score a single comp against the target draft.
 * Returns the comp extended with `similarityScore` and `scoreBreakdown`.
 */
export function scoreComp(target: TargetDraft, comp: CompCandidate): ScoredComp {
  const location  = locationScore(target, comp);
  const type      = typeScore(target, comp);
  const size      = sizeScore(target, comp);
  const amenities = amenityScore(target, comp);

  const similarityScore =
    W.location  * location  +
    W.type      * type      +
    W.size      * size      +
    W.amenities * amenities;

  return {
    ...comp,
    similarityScore: round4(similarityScore),
    scoreBreakdown: {
      location:  round4(location),
      type:      round4(type),
      size:      round4(size),
      amenities: round4(amenities),
    },
  };
}

// ── Batch export: score + select top-K ────────────────────────────────────────
/**
 * Score all comps against the target and return them sorted by
 * `similarityScore` descending, optionally capped at `topK`.
 *
 * @param target   The listing draft we are pricing.
 * @param comps    Raw comps from the DB (output of fetchCompsGeo / fetchNationalComps).
 * @param topK     How many top-scoring comps to return (default: 30).
 * @param minScore Minimum score to include a comp (default: 0 — include all).
 */
export function selectTopKComps(
  target:   TargetDraft,
  comps:    CompCandidate[],
  topK     = 30,
  minScore = 0,
): ScoredComp[] {
  return comps
    .map((c) => scoreComp(target, c))
    .filter((c) => c.similarityScore >= minScore)
    .sort((a, b) => b.similarityScore - a.similarityScore)
    .slice(0, topK);
}

// ── Dimension: Location (0..1) ────────────────────────────────────────────────
//
// Priority order:
//   1. If both have real lat/lng AND comp.distanceM > 0  → use pre-computed km
//   2. If both have real lat/lng but distanceM missing   → compute haversine
//   3. Same city string                                  → 0.65 (good proxy)
//   4. Neither                                           → 0.50 (neutral)
//
// Distance decay (km → score):
//   0..1    km  → 1.00
//   1..3    km  → 0.85
//   3..10   km  → 0.65
//   10..25  km  → 0.35
//   25..50  km  → 0.10
//   > 50    km  → 0.00
//
function locationScore(t: TargetDraft, c: CompCandidate): number {
  const hasTargetGeo = isValidCoord(t.lat) && isValidCoord(t.lng);
  const hasCompGeo   = isValidCoord(c.lat) && isValidCoord(c.lng);

  if (hasTargetGeo && hasCompGeo) {
    const km =
      c.distanceM && c.distanceM > 0
        ? c.distanceM / 1000
        : haversineKm(t.lat!, t.lng!, c.lat!, c.lng!);
    return distanceToScore(km);
  }

  // Fallback: city string match
  if (t.city && c.city) {
    return normalise(t.city) === normalise(c.city) ? 0.65 : 0.20;
  }

  return 0.50; // neutral — no spatial data at all
}

function distanceToScore(km: number): number {
  if (km <= 1)   return 1.00;
  if (km <= 3)   return 0.85;
  if (km <= 10)  return 0.65;
  if (km <= 25)  return 0.35;
  if (km <= 50)  return 0.10;
  return 0.00;
}

// ── Dimension: Type (0..1) ────────────────────────────────────────────────────
//
// Score = categorySlugScore (0.5) + propertyTypeScore (0.5)
//
// If propertyType is missing on either side → skip that half and return
// 0.5 (category match only).
//
function typeScore(t: TargetDraft, c: CompCandidate): number {
  // Category must always match (comps are already filtered by category,
  // but we still check for safety).
  const catMatch   = normalise(t.categorySlug) === normalise(c.categorySlug);
  if (!catMatch) return 0.00;  // different category → completely wrong comp

  const tProp = t.propertyType ? normalise(t.propertyType) : null;
  const cProp = c.propertyType ? normalise(c.propertyType) : null;

  if (!tProp || !cProp) return 0.50; // neutral: no property type to compare

  // Exact match → full score.
  if (tProp === cProp) return 1.00;

  // Partial match: house ↔ apartment are closer than villa ↔ apartment
  const closeTypes = new Set(['house', 'apartment']);
  if (closeTypes.has(tProp) && closeTypes.has(cProp)) return 0.60;

  return 0.20; // e.g. villa vs apartment — different tier
}

// ── Dimension: Size (0..1) ────────────────────────────────────────────────────
//
// Uses capacity (guests) first; falls back to surfaceM2.
// If neither is available on either side → neutral 0.5.
//
// Ratio method: score = min(a, b) / max(a, b)
//   → 1.0 when identical, 0.5 when one is 2× the other, etc.
//
function sizeScore(t: TargetDraft, c: CompCandidate): number {
  // Try capacity first
  if (t.capacity && t.capacity > 0 && c.capacity && c.capacity > 0) {
    return ratio(t.capacity, c.capacity);
  }
  // Try surface
  if (t.surfaceM2 && t.surfaceM2 > 0 && c.surfaceM2 && c.surfaceM2 > 0) {
    return ratio(t.surfaceM2, c.surfaceM2);
  }
  // Only target has size → weak signal: penalise very slightly
  if ((t.capacity || t.surfaceM2) && !(c.capacity || c.surfaceM2)) return 0.45;
  // Neither side has size data
  return 0.50; // neutral
}

// ── Dimension: Amenities (0..1) ───────────────────────────────────────────────
//
// Jaccard similarity: |A ∩ B| / |A ∪ B|
// If both arrays are empty or null → neutral 0.5
// If one is empty → 0.30 (slight penalty for unknown amenities)
//
function amenityScore(t: TargetDraft, c: CompCandidate): number {
  const tSet = toSet(t.amenities);
  const cSet = toSet(c.amenities);

  if (tSet.size === 0 && cSet.size === 0) return 0.50; // neutral
  if (tSet.size === 0 || cSet.size === 0) return 0.30; // one side unknown

  const intersection = new Set([...tSet].filter((a) => cSet.has(a)));
  const union        = new Set([...tSet, ...cSet]);

  return intersection.size / union.size; // Jaccard 0..1
}

// ── Pure helpers ──────────────────────────────────────────────────────────────

/** Haversine distance in km between two WGS84 points */
function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R  = 6371;
  const dL = deg2rad(lat2 - lat1);
  const dG = deg2rad(lng2 - lng1);
  const a  =
    Math.sin(dL / 2) ** 2 +
    Math.cos(deg2rad(lat1)) * Math.cos(deg2rad(lat2)) * Math.sin(dG / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function deg2rad(d: number) { return (d * Math.PI) / 180; }

/** Symmetric ratio: 1 when equal, approaches 0 as divergence grows */
function ratio(a: number, b: number): number {
  if (a <= 0 || b <= 0) return 0;
  return Math.min(a, b) / Math.max(a, b);
}

/** Normalise string for case/whitespace-insensitive comparison */
function normalise(s: string): string { return s.toLowerCase().trim(); }

/** Check a coordinate is a finite non-zero number */
function isValidCoord(v: number | null | undefined): v is number {
  return typeof v === 'number' && isFinite(v) && v !== 0;
}

/** Convert nullable string array to a lower-cased Set */
function toSet(arr: string[] | null | undefined): Set<string> {
  if (!arr || arr.length === 0) return new Set();
  return new Set(arr.map((s) => s.toLowerCase().trim()));
}

/** Round to 4 decimal places for clean output */
function round4(n: number): number { return Math.round(n * 10000) / 10000; }
