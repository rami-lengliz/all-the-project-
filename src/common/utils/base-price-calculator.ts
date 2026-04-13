/**
 * base-price-calculator.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Computes the final base price for the RentAI AI price suggestion engine.
 *
 * Lives in:    src/common/utils/base-price-calculator.ts
 * Imported by: PriceSuggestionService
 * Zero external dependencies.
 *
 * Algorithm
 * ─────────
 *  1. Score comps with comp-scorer → select topK city + topK national
 *  2. Compute baseCity     = weightedMedian(cityComps,     weights=similarityScore)
 *  3. Compute baseNational = weightedMedian(nationalComps, weights=similarityScore)
 *  4. baseFinal = wCity * baseCity + wNational * baseNational  (city-first rule)
 *
 * Why weighted median instead of weighted mean?
 *   Median is robust to outliers — a single luxury villa at 800 TND should not
 *   pull the base price for a modest apartment up by 40 TND.
 *
 * Why city-first?
 *   Local demand, sea-proximity, and seasonal patterns differ sharply between
 *   coastal towns (Kelibia) and inland cities (Tunis).  National data fills the
 *   gap when local comps are scarce, but local data is always preferred.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { ScoredComp } from './comp-scorer';

// ── City-first weighting thresholds ──────────────────────────────────────────
// Must stay in sync with price-suggestion.service.ts constants.

/** Below this count the national average has significant influence. */
const MIN_CITY_COMPS  = 5;
/** At/above this count we trust city data fully. */
const HIGH_CITY_COMPS = 10;
const W_CITY_PARTIAL     = 0.60;
const W_NATIONAL_PARTIAL = 0.40;

// ── Returned shape ────────────────────────────────────────────────────────────
export interface BasePriceResult {
  /** Final blended base price (TND), before any feature adjustments */
  baseFinal:    number;
  /** City-scope weighted median (0 when no city comps) */
  baseCity:     number | null;
  /** National-scope weighted median (0 when no national comps) */
  baseNational: number | null;
  /** Weight applied to city component (0..1) */
  wCity:        number;
  /** Weight applied to national component (0..1) */
  wNational:    number;
  /** Number of city comps used */
  cityCompsN:   number;
  /** Number of national comps used */
  nationalCompsN: number;
  /** True when city comps were abundant (>= HIGH_CITY_COMPS) */
  cityDominant: boolean;
}

// ── Main export ───────────────────────────────────────────────────────────────
/**
 * Calculate the base price from pre-scored city and national comps.
 *
 * @param cityComps      Already scored + filtered city comps (from selectTopKComps).
 * @param nationalComps  Already scored + filtered national comps.
 * @param categoryDefault  Hardcoded fallback price when no comps exist at all.
 *
 * @example
 * // Low city comps → national blend kicks in
 * calcBasePrice(
 *   [{ price: 180, similarityScore: 0.9 }, { price: 200, similarityScore: 0.7 }],   // 2 city comps
 *   [{ price: 155, similarityScore: 0.6 }, { price: 170, similarityScore: 0.55 }, ...], // 12 national
 *   150
 * );
 * // cityCompsN=2  (<5) → wCity=0.20, wNational=0.80
 * // baseCity     ≈ 185 TND  (weighted median of 2 comps)
 * // baseNational ≈ 160 TND  (weighted median of 12 comps)
 * // baseFinal    = 0.20*185 + 0.80*160 = 165 TND
 */
export function calcBasePrice(
  cityComps:       ScoredComp[],
  nationalComps:   ScoredComp[],
  categoryDefault: number,
): BasePriceResult {
  // ── 1. Weighted medians ───────────────────────────────────────────────────
  const baseCity     = weightedMedian(cityComps);
  const baseNational = weightedMedian(nationalComps) ?? categoryDefault;

  // ── 2. City-first weights ────────────────────────────────────────────────
  const cityCompsN = cityComps.length;
  const { wCity, wNational } = cityFirstWeights(cityCompsN, baseCity);

  // ── 3. Blend ─────────────────────────────────────────────────────────────
  const effectiveCity = baseCity ?? baseNational;  // fallback if city has no data
  const baseFinal     = wCity * effectiveCity + wNational * baseNational;

  return {
    baseFinal:      round2(baseFinal),
    baseCity:       baseCity !== null ? round2(baseCity) : null,
    baseNational:   round2(baseNational),
    wCity,
    wNational,
    cityCompsN,
    nationalCompsN: nationalComps.length,
    cityDominant:   cityCompsN >= HIGH_CITY_COMPS,
  };
}

// ── Weighted median ───────────────────────────────────────────────────────────
/**
 * Compute the weighted median of a ScoredComp array, using
 * `similarityScore` as the weight for each observation.
 *
 * Algorithm:
 *   1. Sort comps by price ascending.
 *   2. Compute total weight W = Σ similarityScore.
 *   3. Walk through sorted list accumulating weight.
 *   4. The FIRST element whose cumulative weight >= W/2 is the weighted median.
 *
 * Unlike weighted mean, a single very high or low outlier cannot shift the
 * result more than one position in the sorted list.
 *
 * Returns null when the array is empty.
 */
export function weightedMedian(comps: ScoredComp[]): number | null {
  if (comps.length === 0) return null;
  if (comps.length === 1) return comps[0].price;

  // Sort ascending by price (non-destructive)
  const sorted = [...comps].sort((a, b) => a.price - b.price);

  const totalWeight = sorted.reduce((s, c) => s + c.similarityScore, 0);
  if (totalWeight <= 0) {
    // Degenerate: all scores are 0 → fall back to simple median
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 === 1
      ? sorted[mid].price
      : (sorted[mid - 1].price + sorted[mid].price) / 2;
  }

  const halfWeight = totalWeight / 2;
  let cumulative   = 0;

  for (const comp of sorted) {
    cumulative += comp.similarityScore;
    if (cumulative >= halfWeight) {
      return comp.price;
    }
  }

  // Should not be reached, but TypeScript needs a return
  return sorted[sorted.length - 1].price;
}

// ── City-first weights ────────────────────────────────────────────────────────
/**
 * Piecewise rule matching the spec defined in docs/ai-price-suggestion-v1.md:
 *
 *   cityCompsN = 0        → wCity = 0.00,  wNational = 1.00  (national only)
 *   0 < cityCompsN < 5    → linear ramp:   wCity = cityCompsN/5 * W_CITY_PARTIAL
 *   5 ≤ cityCompsN < 10   → wCity = 0.60,  wNational = 0.40  (partial city trust)
 *   cityCompsN ≥ 10       → wCity = 1.00,  wNational = 0.00  (full city trust)
 *
 * If baseCity is null (no city data at all), wCity is forced to 0.
 */
export function cityFirstWeights(
  cityCompsN: number,
  baseCity:   number | null,
): { wCity: number; wNational: number } {
  if (cityCompsN === 0 || baseCity === null) {
    return { wCity: 0, wNational: 1 };
  }
  if (cityCompsN >= HIGH_CITY_COMPS) {
    return { wCity: 1, wNational: 0 };
  }
  if (cityCompsN >= MIN_CITY_COMPS) {
    return { wCity: W_CITY_PARTIAL, wNational: W_NATIONAL_PARTIAL };
  }
  // Linear ramp: 1..4 comps → 0.12..0.48
  const ramp = (cityCompsN / MIN_CITY_COMPS) * W_CITY_PARTIAL;
  return { wCity: round4(ramp), wNational: round4(1 - ramp) };
}

// ── Pure helpers ──────────────────────────────────────────────────────────────
function round2(n: number): number { return Math.round(n * 100) / 100; }
function round4(n: number): number { return Math.round(n * 10000) / 10000; }


// =============================================================================
// EXAMPLE (not exported — for documentation / unit-testing reference only)
// =============================================================================
//
// Scenario: Kelibia accommodation — sparse city comps (2 found)
//
//   cityComps = [
//     { price: 180, similarityScore: 0.92 },   // ← villa, 0.3 km from sea
//     { price: 210, similarityScore: 0.75 },   // ← villa, 0.8 km from sea
//   ]
//   nationalComps = [
//     { price: 140, similarityScore: 0.60 },
//     { price: 155, similarityScore: 0.58 },
//     { price: 165, similarityScore: 0.55 },
//     { price: 170, similarityScore: 0.50 },
//     { price: 180, similarityScore: 0.48 },
//     { price: 190, similarityScore: 0.45 },
//     ... (12 total)
//   ]
//   categoryDefault = 150
//
// Step 1 — Weighted medians:
//   cityComps sorted by price: [180 (w=0.92), 210 (w=0.75)]
//   totalWeight = 1.67,  halfWeight = 0.835
//   cumAt[180]  = 0.92 → 0.92 >= 0.835 → baseCity = 180 TND
//
//   nationalComps sorted and accumulated → baseNational ≈ 162 TND
//
// Step 2 — City-first weights (cityCompsN=2, MIN=5):
//   ramp = (2/5) * 0.60 = 0.24
//   wCity = 0.24,  wNational = 0.76
//
// Step 3 — Blend:
//   baseFinal = 0.24 * 180 + 0.76 * 162
//             = 43.2 + 123.12
//             = 166.32 TND
//
// → Much closer to national average (162) because city data is sparse.
//   Once cityCompsN reaches 10, baseFinal = baseCity = 180 TND (full local trust).
