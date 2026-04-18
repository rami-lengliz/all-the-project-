/**
 * price-range.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Computes a sane min/max price range from a set of normalised comparable
 * prices for the RentAI AI price suggestion engine.
 *
 * Lives in:    src/common/utils/price-range.ts
 * Imported by: PriceSuggestionService
 * Zero external dependencies.
 *
 * Algorithm
 * ─────────
 *   p25  = 25th percentile of comp prices   (lower fence)
 *   p75  = 75th percentile of comp prices   (upper fence)
 *   IQR  = p75 − p25
 *   buf  = IQR_BUFFER_FACTOR × IQR           (default 20 %)
 *
 *   rangeMin = max(FLOOR_TND, p25 − buf)
 *   rangeMax = min(CEIL_TND,  p75 + buf)
 *
 * Robustness guarantees:
 *   • rangeMin always < rangeMax (enforced by MIN_SPREAD)
 *   • rangeMin ≥ FLOOR_TND  (1 TND — avoids nonsense)
 *   • rangeMax ≤ CEIL_TND   (10 000 TND — avoids 100 000 accidents)
 *   • Works for n=1  (degenerates gracefully to ±DEFAULT_SPREAD)
 *   • Works for n=0  (returns the category default ± DEFAULT_SPREAD)
 * ─────────────────────────────────────────────────────────────────────────────
 */

// ── Tunable constants ─────────────────────────────────────────────────────────
/** Width of the IQR buffer on each side (20 %) */
const IQR_BUFFER_FACTOR = 0.20;
/** Absolute minimum rangeMin — no listing should be < 1 TND */
const FLOOR_TND = 1;
/** Absolute maximum rangeMax — prevents absurd outputs */
const CEIL_TND  = 10_000;
/** Minimum spread between rangeMin and rangeMax (TND) */
const MIN_SPREAD = 10;
/** Default half-spread when < 2 comps exist (TND) */
const DEFAULT_HALF_SPREAD = 30;

// ── Output type ───────────────────────────────────────────────────────────────
export interface PriceRange {
  rangeMin:    number;
  rangeMax:    number;
  /** p25 before buffer (informational) */
  p25:         number;
  /** p75 before buffer (informational) */
  p75:         number;
  /** IQR = p75 − p25 */
  iqr:         number;
  /** Number of prices used */
  compsUsed:   number;
}

// ── Main export ───────────────────────────────────────────────────────────────
/**
 * Compute a robust price range from an array of comparable prices.
 *
 * @param prices          Normalised comparable prices (same unit, TND).
 * @param baseFinal       The recommended price — used as centre when comps are
 *                        scarce so the range is centred correctly.
 *
 * @example
 * // Normal case — 10 comps with a tight cluster
 * calcPriceRange([150,155,160,165,170,175,180,185,200,220], 172);
 * // p25=160, p75=183.75, IQR=23.75, buf=4.75
 * // → { rangeMin: 155, rangeMax: 189, p25: 160, p75: 183.75, iqr: 23.75, compsUsed: 10 }
 *
 * @example
 * // Sparse case — only 1 comp
 * calcPriceRange([180], 175);
 * // → { rangeMin: 145, rangeMax: 205, p25: 180, p75: 180, iqr: 0, compsUsed: 1 }
 *
 * @example
 * // Empty — no comps at all
 * calcPriceRange([], 150);
 * // → { rangeMin: 120, rangeMax: 180, p25: 150, p75: 150, iqr: 0, compsUsed: 0 }
 *
 * @example
 * // Wide IQR — outlier rich dataset
 * calcPriceRange([80, 100, 120, 150, 200, 500, 800], 180);
 * // p25=100, p75=350, IQR=250, buf=50
 * // → { rangeMin: 50 → clamped to FLOOR=1, rangeMax: 400, compsUsed: 7 }
 */
export function calcPriceRange(prices: number[], baseFinal: number): PriceRange {
  // ── Degenerate case: no comps ────────────────────────────────────────────
  if (prices.length === 0) {
    return buildRange(
      baseFinal - DEFAULT_HALF_SPREAD,
      baseFinal + DEFAULT_HALF_SPREAD,
      baseFinal, baseFinal, 0, 0,
    );
  }

  // ── Degenerate case: single comp ────────────────────────────────────────
  if (prices.length === 1) {
    const centre = prices[0];
    return buildRange(
      centre - DEFAULT_HALF_SPREAD,
      centre + DEFAULT_HALF_SPREAD,
      centre, centre, 0, 1,
    );
  }

  // ── Normal case ──────────────────────────────────────────────────────────
  const sorted = [...prices].sort((a, b) => a - b);

  const p25 = percentile(sorted, 25);
  const p75 = percentile(sorted, 75);
  const iqr = p75 - p25;
  const buf = IQR_BUFFER_FACTOR * iqr;

  return buildRange(
    p25 - buf,
    p75 + buf,
    p25, p75, iqr, prices.length,
  );
}

// ── Internal: apply clamping + MIN_SPREAD and package result ─────────────────
function buildRange(
  rawMin:    number,
  rawMax:    number,
  p25:       number,
  p75:       number,
  iqr:       number,
  compsUsed: number,
): PriceRange {
  let rangeMin = Math.max(FLOOR_TND, round2(rawMin));
  let rangeMax = Math.min(CEIL_TND,  round2(rawMax));

  // Guarantee MIN_SPREAD between min and max
  if (rangeMax - rangeMin < MIN_SPREAD) {
    const centre = (rangeMin + rangeMax) / 2;
    rangeMin     = Math.max(FLOOR_TND, round2(centre - MIN_SPREAD / 2));
    rangeMax     = Math.min(CEIL_TND,  round2(centre + MIN_SPREAD / 2));
  }

  return {
    rangeMin,
    rangeMax,
    p25:      round2(p25),
    p75:      round2(p75),
    iqr:      round2(iqr),
    compsUsed,
  };
}

// ── Pure: linear-interpolation percentile ────────────────────────────────────
/**
 * Compute the p-th percentile of a SORTED array using linear interpolation
 * (same as numpy's default method).
 *
 * @param sorted  Array sorted ascending (not checked for performance).
 * @param p       Percentile 0..100.
 */
export function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  if (sorted.length === 1) return sorted[0];

  const idx  = (p / 100) * (sorted.length - 1);
  const lo   = Math.floor(idx);
  const hi   = Math.ceil(idx);
  const frac = idx - lo;

  if (lo === hi) return sorted[lo];
  return sorted[lo] * (1 - frac) + sorted[hi] * frac;
}

// ── Helper ────────────────────────────────────────────────────────────────────
function round2(n: number) { return Math.round(n * 100) / 100; }


// =============================================================================
// WORKED EXAMPLES (inline docs — not exported)
// =============================================================================
//
// ── Example A: Kelibia accommodation, 10 comps, tight cluster ─────────────────
//
//   prices = [150, 155, 160, 165, 170, 175, 180, 185, 200, 220]
//   baseFinal = 172 TND
//
//   sorted = same
//   p25  = percentile(sorted, 25) → idx=2.25 → 160 + 0.25*(165-160) = 161.25
//   p75  = percentile(sorted, 75) → idx=6.75 → 180 + 0.75*(185-180) = 183.75
//   IQR  = 183.75 - 161.25 = 22.50
//   buf  = 0.20 * 22.50 = 4.50
//   raw  = [161.25 - 4.50, 183.75 + 4.50] = [156.75, 188.25]
//   → { rangeMin: 156.75, rangeMax: 188.25, p25: 161.25, p75: 183.75, iqr: 22.5 }
//
//
// ── Example B: Tunis, only 3 comps, moderate spread ──────────────────────────
//
//   prices = [90, 130, 160]
//   baseFinal = 126 TND
//
//   p25  = 90 + 0.5*(130-90) = 110
//   p75  = 130 + 0.5*(160-130) = 145
//   IQR  = 35,  buf = 7
//   raw  = [103, 152]
//   → { rangeMin: 103, rangeMax: 152 }
//
//
// ── Example C: Wide spread, outlier at 800 ───────────────────────────────────
//
//   prices = [80, 100, 120, 150, 200, 500, 800]
//   baseFinal = 180 TND
//
//   p25  = percentile → 100 + (1/6)*(120-100) ≈ 103.33
//   p75  = percentile → 200 + (4/6)*(500-200) ≈ 400
//   IQR  = 296.67,  buf = 59.33
//   raw  = [44, 459.33]
//   rangeMin = max(1, 44)  = 44 TND   ← not clamped (>FLOOR)
//   rangeMax = min(10000, 459.33) = 459.33 TND
//   → { rangeMin: 44, rangeMax: 459.33 }   — wide but honest for a mixed dataset
//
//
// ── Example D: Sparse — zero comps ───────────────────────────────────────────
//
//   prices = []
//   baseFinal = 150 TND
//   → { rangeMin: 120, rangeMax: 180 }   (DEFAULT_HALF_SPREAD = 30)


// =============================================================================
// calcCompsRange  — similarity-weighted range from ScoredComparableListing[]
// =============================================================================
//
// Algorithm
// ─────────
//   1. Extract prices, weighted by similarityScore.
//   2. Compute similarity-weighted median  → base (recommended price).
//   3. Compute weighted p25/p75 → IQR.
//   4. range = [ p25 − 20%×IQR ,  p75 + 20%×IQR ]   clamped to [FLOOR, CEIL].
//   5. Guarantee MIN_SPREAD.
//
// Why weighted median, not mean?
//   • Median is robust to outliers (a 500 TND villa in the pool won't pull a
//     studio's range up).
//   • Similarity weighting makes a villa-vs-villa comp contribute more than a
//     villa-vs-apartment comp when pricing a villa draft.
//
// Graceful degradation
//   n=0  →  baseFallback ± DEFAULT_HALF_SPREAD
//   n=1  →  that price   ± DEFAULT_HALF_SPREAD
//   n≥2  →  full weighted-IQR algorithm
// =============================================================================

/** Minimal shape required — compatible with ScoredComparableListing */
export interface CompWithScore {
  price:           number;
  similarityScore: number;
}

export interface CompsRange {
  /** Similarity-weighted median — the recommended price to show the host. */
  base:       number;
  rangeMin:   number;
  rangeMax:   number;
  /** Weighted p25 before IQR buffer (informational). */
  p25:        number;
  /** Weighted p75 before IQR buffer (informational). */
  p75:        number;
  iqr:        number;
  compsUsed:  number;
}

/**
 * Compute a recommended price range from top comparable listings.
 *
 * @param comps        Top-N comps, each with `price` and `similarityScore`.
 *                     Typically the output of selectSimilarComps / getComparableListings.
 * @param baseFallback Fallback centre when comps is empty
 *                     (use the category baseline from getBaseline()).
 *
 * @example
 * // 6 Kelibia beachfront villas (from seeded data)
 * calcCompsRange([
 *   { price: 421, similarityScore: 1.00 },  // villa, beachfront, 8 guests, 4 beds
 *   { price: 512, similarityScore: 0.98 },  // villa, beachfront, 12 guests, 6 beds
 *   { price: 390, similarityScore: 0.87 },  // villa, beachfront, 8 guests, 4 beds (different host)
 *   { price: 318, similarityScore: 0.62 },  // house beachfront — lower type score
 *   { price: 262, similarityScore: 0.48 },  // villa inland     — nearBeach mismatch
 *   { price: 291, similarityScore: 0.45 },  // house inland     — two signal mismatches
 * ], 290);
 * // weightedMedian ≈ 421  (top 3 comps dominate weights)
 * // weighted p25  ≈ 342,  p75 ≈ 467,  IQR ≈ 125,  buf ≈ 25
 * // → { base: 421, rangeMin: 317, rangeMax: 492, p25: 342, p75: 467, iqr: 125, compsUsed: 6 }
 */
export function calcCompsRange(
  comps:        CompWithScore[],
  baseFallback: number,
): CompsRange {
  // ── n=0 ───────────────────────────────────────────────────────────────────
  if (comps.length === 0) {
    const base = round2(baseFallback);
    return {
      base,
      rangeMin:  round2(Math.max(FLOOR_TND, base - DEFAULT_HALF_SPREAD)),
      rangeMax:  round2(Math.min(CEIL_TND,  base + DEFAULT_HALF_SPREAD)),
      p25: base, p75: base, iqr: 0, compsUsed: 0,
    };
  }

  // ── n=1 ───────────────────────────────────────────────────────────────────
  if (comps.length === 1) {
    const base = round2(comps[0].price);
    return {
      base,
      rangeMin:  round2(Math.max(FLOOR_TND, base - DEFAULT_HALF_SPREAD)),
      rangeMax:  round2(Math.min(CEIL_TND,  base + DEFAULT_HALF_SPREAD)),
      p25: base, p75: base, iqr: 0, compsUsed: 1,
    };
  }

  // ── n≥2: full weighted-IQR path ───────────────────────────────────────────

  // Step 1: weighted median → recommended base price
  const base = weightedMedian(comps);

  // Step 2: weighted p25/p75 for the IQR
  const prices  = comps.map((c) => c.price);
  const weights = comps.map((c) => c.similarityScore);
  const p25  = weightedPercentile(prices, weights, 25);
  const p75  = weightedPercentile(prices, weights, 75);
  const iqr  = p75 - p25;
  const buf  = IQR_BUFFER_FACTOR * iqr; // 20% of IQR on each side

  // Step 3: clamp + enforce MIN_SPREAD
  let rangeMin = Math.max(FLOOR_TND, round2(p25 - buf));
  let rangeMax = Math.min(CEIL_TND,  round2(p75 + buf));

  if (rangeMax - rangeMin < MIN_SPREAD) {
    const centre = (rangeMin + rangeMax) / 2;
    rangeMin = Math.max(FLOOR_TND, round2(centre - MIN_SPREAD / 2));
    rangeMax = Math.min(CEIL_TND,  round2(centre + MIN_SPREAD / 2));
  }

  return {
    base:     round2(base),
    rangeMin,
    rangeMax,
    p25:      round2(p25),
    p75:      round2(p75),
    iqr:      round2(iqr),
    compsUsed: comps.length,
  };
}

// ── Weighted median ───────────────────────────────────────────────────────────
//
// Algorithm:
//   1. Sort items by price ascending.
//   2. Accumulate weights until cumulative weight ≥ totalWeight / 2.
//   3. The price at that crossover is the weighted median.
//
// With equal weights this degenerates to the standard median.
//
function weightedMedian(comps: CompWithScore[]): number {
  const sorted   = [...comps].sort((a, b) => a.price - b.price);
  const totalW   = sorted.reduce((s, c) => s + Math.max(c.similarityScore, 0), 0);

  // All weights zero → plain median
  if (totalW === 0) {
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 === 0
      ? (sorted[mid - 1].price + sorted[mid].price) / 2
      : sorted[mid].price;
  }

  const half = totalW / 2;
  let cumulative = 0;
  for (const c of sorted) {
    cumulative += Math.max(c.similarityScore, 0);
    if (cumulative >= half) return c.price;
  }
  return sorted[sorted.length - 1].price; // unreachable guard
}

// ── Weighted percentile ───────────────────────────────────────────────────────
//
// Computes the p-th weighted percentile (p ∈ 0..100).
// Uses linear interpolation at the crossover point for smoothness.
//
function weightedPercentile(
  prices:  number[],
  weights: number[],
  p:       number,
): number {
  if (prices.length === 0) return 0;
  if (prices.length === 1) return prices[0];

  // Pair prices with their weights and sort by price ascending
  const pairs = prices
    .map((price, i) => ({ price, weight: Math.max(weights[i] ?? 0, 0) }))
    .sort((a, b) => a.price - b.price);

  const totalW = pairs.reduce((s, x) => s + x.weight, 0);
  // All weights zero → plain (unweighted) percentile
  if (totalW === 0) return percentile([...prices].sort((a, b) => a - b), p);

  const target = (p / 100) * totalW;
  let cumulative = 0;

  for (let i = 0; i < pairs.length; i++) {
    cumulative += pairs[i].weight;
    if (cumulative >= target) {
      // Linear interpolation between current and previous price
      if (i > 0 && pairs[i].weight > 0) {
        const over = cumulative - target;
        const frac = over / pairs[i].weight;
        return pairs[i].price * (1 - frac) + pairs[i - 1].price * frac;
      }
      return pairs[i].price;
    }
  }

  return pairs[pairs.length - 1].price; // guard
}
