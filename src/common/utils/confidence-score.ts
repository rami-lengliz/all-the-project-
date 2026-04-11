/**
 * confidence-score.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Computes a 0..1 confidence score for a RentAI price suggestion.
 *
 * Lives in:    src/common/utils/confidence-score.ts
 * Imported by: PriceSuggestionService
 * Zero external dependencies.
 *
 * Formula
 * ───────
 *   confidence = w_data * dataScore
 *              + w_sim  * similarityScore
 *              + w_var  * consistencyScore
 *
 *   Weights (MVP defaults, must sum to 1):
 *     w_data = 0.45  ← data quantity is the strongest signal
 *     w_sim  = 0.35  ← quality of comps matters almost as much
 *     w_var  = 0.20  ← price consistency / low spread
 *
 *   dataScore        = saturation curve on (cityCompsN + 0.5 * nationalCompsN)
 *   similarityScore  = average similarityScore of topK comps (already 0..1)
 *   consistencyScore = 1 − normalised IQR/median  (low variance → high score)
 *
 * Band mapping (matches existing DTO):
 *   confidence ≥ 0.70  → 'high'
 *   confidence ≥ 0.40  → 'medium'
 *   confidence <  0.40 → 'low'
 * ─────────────────────────────────────────────────────────────────────────────
 */

// ── Weights ───────────────────────────────────────────────────────────────────
const W_DATA = 0.45;
const W_SIM  = 0.35;
const W_VAR  = 0.20;

// ── Data-score saturation constants ──────────────────────────────────────────
/**
 * "Effective comps" = cityCompsN + NATIONAL_COMP_WEIGHT * nationalCompsN
 * National comps are down-weighted because local data is more relevant.
 */
const NATIONAL_COMP_WEIGHT = 0.5;
/**
 * The effective-comp count at which dataScore reaches ~0.95.
 * Modelled as: dataScore = effectiveComps / (effectiveComps + SATURATION_K).
 * With K=10: score reaches 0.5 at 10, 0.67 at 20, 0.91 at 100.
 */
const SATURATION_K = 10;

// ── Variance clamping ─────────────────────────────────────────────────────────
/**
 * IQR/median ratio above which consistencyScore = 0 (totally chaotic market).
 * A ratio of 1.0 means the IQR equals the median price — very inconsistent.
 */
const MAX_RELATIVE_IQR = 1.0;

// ── Confidence bands ──────────────────────────────────────────────────────────
export type ConfidenceBand = 'high' | 'medium' | 'low';
const BAND_HIGH   = 0.70;
const BAND_MEDIUM = 0.40;

// ── Input / Output types ──────────────────────────────────────────────────────
export interface ConfidenceInput {
  /** Number of city-scope comps used */
  cityCompsN:       number;
  /** Number of national-scope comps used (down-weighted) */
  nationalCompsN:   number;
  /** Mean similarityScore across the top-K comps (0..1) */
  avgSimilarity:    number;
  /** IQR of the comp prices (in TND) */
  iqr:              number;
  /** Median price of the comp set (in TND) — used to normalise IQR */
  medianPrice:      number;
}

export interface ConfidenceResult {
  /** Final confidence in [0, 1], rounded to 4 dp */
  score:       number;
  /** Human-readable band */
  band:        ConfidenceBand;
  /** Breakdown for logging / explanation */
  breakdown: {
    dataScore:        number;
    similarityScore:  number;
    consistencyScore: number;
    effectiveComps:   number;
  };
}

// ── Main export ───────────────────────────────────────────────────────────────
/**
 * Compute the confidence score for a price suggestion.
 *
 * @example
 * // Well-supported suggestion (Kelibia, peak season, 12 city comps)
 * calcConfidence({
 *   cityCompsN: 12, nationalCompsN: 80,
 *   avgSimilarity: 0.78, iqr: 22, medianPrice: 175,
 * });
 * // effectiveComps = 12 + 0.5*80 = 52
 * // dataScore      = 52 / (52+10)  = 0.839
 * // similarityScore = 0.78
 * // relIQR = 22/175 = 0.126 → consistencyScore = 1 - 0.126 = 0.874
 * // score  = 0.45*0.839 + 0.35*0.78 + 0.20*0.874 = 0.830
 * // → { score: 0.830, band: 'high' }
 *
 * @example
 * // Sparse city data, high variance (unknown city)
 * calcConfidence({
 *   cityCompsN: 2, nationalCompsN: 15,
 *   avgSimilarity: 0.42, iqr: 95, medianPrice: 150,
 * });
 * // effectiveComps = 2 + 0.5*15 = 9.5
 * // dataScore      = 9.5 / 19.5 = 0.487
 * // similarityScore = 0.42
 * // relIQR = 95/150 = 0.633 → consistencyScore = 1 - 0.633 = 0.367
 * // score  = 0.45*0.487 + 0.35*0.42 + 0.20*0.367 = 0.438
 * // → { score: 0.438, band: 'medium' }
 *
 * @example
 * // Cold start — no comps at all
 * calcConfidence({
 *   cityCompsN: 0, nationalCompsN: 0,
 *   avgSimilarity: 0, iqr: 0, medianPrice: 150,
 * });
 * // → { score: 0.000, band: 'low' }
 */
export function calcConfidence(input: ConfidenceInput): ConfidenceResult {
  const {
    cityCompsN, nationalCompsN, avgSimilarity, iqr, medianPrice,
  } = input;

  // ── Component 1: data quantity (saturation curve) ─────────────────────────
  const effectiveComps = cityCompsN + NATIONAL_COMP_WEIGHT * nationalCompsN;
  const dataScore      = effectiveComps / (effectiveComps + SATURATION_K);

  // ── Component 2: comp similarity ──────────────────────────────────────────
  // Already 0..1 — clamp defensively
  const simScore = clamp01(avgSimilarity);

  // ── Component 3: price consistency (low variance = high confidence) ────────
  // relIQR = IQR / median — relative to price level, not absolute
  // score = 1 − clamp(relIQR / MAX_RELATIVE_IQR, 0, 1)
  let consistencyScore: number;
  if (medianPrice <= 0 || iqr < 0) {
    consistencyScore = 0.50; // neutral: cannot compute
  } else if (iqr === 0) {
    consistencyScore = 1.00; // all comps identical — perfect consistency
  } else {
    const relIQR = iqr / medianPrice;
    consistencyScore = 1 - clamp01(relIQR / MAX_RELATIVE_IQR);
  }

  // ── Final score ────────────────────────────────────────────────────────────
  const score = clamp01(
    W_DATA * dataScore +
    W_SIM  * simScore  +
    W_VAR  * consistencyScore,
  );

  return {
    score: round4(score),
    band:  toBand(score),
    breakdown: {
      dataScore:        round4(dataScore),
      similarityScore:  round4(simScore),
      consistencyScore: round4(consistencyScore),
      effectiveComps:   round4(effectiveComps),
    },
  };
}

// ── Band mapper ───────────────────────────────────────────────────────────────
export function toBand(score: number): ConfidenceBand {
  if (score >= BAND_HIGH)   return 'high';
  if (score >= BAND_MEDIUM) return 'medium';
  return 'low';
}

// ── Pure helpers ──────────────────────────────────────────────────────────────
function clamp01(v: number): number { return Math.max(0, Math.min(1, v)); }
function round4(n: number):  number { return Math.round(n * 10000) / 10000; }


// =============================================================================
// BEHAVIOUR TABLE — how the score moves with each input axis
// =============================================================================
//
//  effectiveComps │ dataScore     Notes
//  ───────────────┼───────────────────────────────────────────────
//  0              │ 0.000         Cold start
//  5              │ 0.333         Very sparse
//  10             │ 0.500         Threshold — medium starts to emerge
//  20             │ 0.667         Comfortable
//  50             │ 0.833         Well-supported
//  100            │ 0.909         Saturating
//  ∞              │ 1.000         Theoretical maximum
//
//  avgSimilarity  │ simScore      (pass-through, already 0..1)
//  ───────────────┼──────────────
//  0.30           │ 0.300         Weak matches
//  0.60           │ 0.600         Good matches
//  0.85           │ 0.850         Excellent matches
//
//  relIQR         │ consistencyScore
//  ───────────────┼──────────────
//  0.00           │ 1.000         All comps identical
//  0.20           │ 0.800         Tight market (±10% of median)
//  0.50           │ 0.500         Moderate spread
//  1.00           │ 0.000         Chaotic (IQR = median)
//  > 1.00         │ 0.000         Clamped to zero
