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
