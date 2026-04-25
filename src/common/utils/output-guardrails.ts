/**
 * output-guardrails.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Final output validation layer for the RentAI price suggestion engine.
 *
 * Applied LAST — after all comp-scoring, base-price blending, adjustments,
 * and seasonal multipliers.  It acts as a safety net that catches:
 *
 *   1. NaN / Infinity / negative values produced by edge-case arithmetic
 *   2. Category-level hard caps (a 10 000 TND/night suggestion is a bug)
 *   3. recommended outside [rangeMin, rangeMax]
 *   4. Exploding ranges (rangeMax/rangeMin > MAX_RANGE_RATIO → tighten)
 *   5. Near-zero or zero min (floor at ABSOLUTE_FLOOR)
 *
 * Lives in:    src/common/utils/output-guardrails.ts
 * Imported by: PriceSuggestionService
 * Zero external dependencies.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { CategoryBaseline } from '../config/price-baselines';

// ── Global constants ──────────────────────────────────────────────────────────
/** Minimum allowed rangeMin in TND — a listing can never be near-free */
const ABSOLUTE_FLOOR = 5;
/** Maximum rangeMax/rangeMin ratio. Beyond 3.5× the range is too wide to be actionable. */
const MAX_RANGE_RATIO = 3.5;
/** Round all output prices to this step (0.5 TND) */
const ROUND_STEP = 0.5;

// ── Hard caps per categorySlug::unit (maximum sane price in TND) ──────────────
// A suggestion above these values is almost certainly a bug or outlier contamination.
const HARD_CAPS: Record<string, number> = {
  // ── Accommodation — DB slugs ──────────────────────────────────────────────
  'stays::per_night':           2_000,   // ultra-luxury villa peak Tunisian cap
  'accommodation::per_night':   2_000,
  'holiday-rentals::per_night': 2_000,

  // ── Sports facilities ─────────────────────────────────────────────────────
  'sports-facilities::per_slot':  300,
  'sports-facilities::per_hour':  200,
  'sports_facility::per_session': 300,  // DTO enum value
  'sports_facility::per_hour':    200,
  'courts::per_slot':             200,

  // ── Vehicles ──────────────────────────────────────────────────────────────
  'mobility::per_day':    1_000,
  'vehicles::per_day':    1_000,
  'vehicle::per_day':     1_000,  // DTO enum value
  'scooters::per_day':      200,

  // ── Tools & equipment ─────────────────────────────────────────────────────
  'tools-equipment::per_day':   600,
  'tool::per_day':              600,  // DTO enum value
  'beach-gear::per_day':        200,
  'equipment::per_day':         600,

  // ── Event spaces ──────────────────────────────────────────────────────────
  'event-spaces::per_hour':   1_500,
  'event_space::per_hour':    1_500,  // DTO enum value
  'venues::per_hour':         1_500,

  // ── Global catch-all — should rarely trigger ──────────────────────────────
  '*': 5_000,
};

// ── Input type ────────────────────────────────────────────────────────────────
export interface RawSuggestion {
  recommended: number;
  rangeMin:    number;
  rangeMax:    number;
  confidence:  'high' | 'medium' | 'low';
  explanation: [string, string, string];
  compsUsed:   number;
  currency:    string;
  unit:        string;
  logId?:      string;
}

// ── Output type ───────────────────────────────────────────────────────────────
export interface GuardedSuggestion extends RawSuggestion {
  /** True when at least one value was clamped or corrected */
  _guardrailApplied?: boolean;
}

// ── Main export ───────────────────────────────────────────────────────────────
/**
 * Validate and clamp a raw price suggestion output.
 *
 * @param raw          Output from _suggest() before returning to client.
 * @param categorySlug Resolved DB slug (e.g. 'stays', 'sports-facilities').
 * @param unit         Canonical unit (e.g. 'per_night').
 * @param baseline     Pre-fetched baseline — used as fallback for NaN values.
 *
 * @example
 * applyGuardrails(
 *   { recommended: NaN, rangeMin: -5, rangeMax: 20000, ... },
 *   'stays', 'per_night', getBaseline('stays', 'per_night'),
 * );
 * // → { recommended: 150, rangeMin: 80, rangeMax: 280, _guardrailApplied: true }
 *
 * @example
 * applyGuardrails(
 *   { recommended: 280, rangeMin: 50, rangeMax: 3000, ... },
 *   'stays', 'per_night', getBaseline('stays', 'per_night'),
 * );
 * // rangeMax/rangeMin = 60× > MAX_RANGE_RATIO(5) → tighten around recommended
 * // tightened: rangeMin=168, rangeMax=392  (recommended ± 40%)
 * // → { recommended: 280, rangeMin: 168, rangeMax: 392, _guardrailApplied: true }
 */
export function applyGuardrails(
  raw:          RawSuggestion,
  categorySlug: string,
  unit:         string,
  baseline:     CategoryBaseline,
): GuardedSuggestion {
  let applied = false;
  const cap   = hardCap(categorySlug, unit);

  // ── 1. Sanitise NaN / Infinity / negative ────────────────────────────────
  let { recommended, rangeMin, rangeMax } = raw;

  if (!isFinitePositive(recommended)) {
    recommended = baseline.recommended;
    applied = true;
  }
  if (!isFinitePositive(rangeMin)) {
    rangeMin = baseline.rangeMin;
    applied  = true;
  }
  if (!isFinitePositive(rangeMax)) {
    rangeMax = baseline.rangeMax;
    applied  = true;
  }

  // ── 2. Apply hard category cap ─────────────────────────────────────────
  if (recommended > cap) { recommended = cap;  applied = true; }
  if (rangeMax    > cap) { rangeMax    = cap;  applied = true; }

  // ── 3. Floor ──────────────────────────────────────────────────────────
  if (rangeMin < ABSOLUTE_FLOOR) { rangeMin = ABSOLUTE_FLOOR; applied = true; }

  // ── 4. Tighten exploding range ────────────────────────────────────────
  // If rangeMax / rangeMin exceeds the ratio threshold, anchor the range
  // around `recommended` using a ±40% spread instead.
  if (rangeMin > 0 && rangeMax / rangeMin > MAX_RANGE_RATIO) {
    const spread = recommended * 0.20;   // ±20% — was ±40% (caused villa/house range overlap)
    rangeMin = Math.max(ABSOLUTE_FLOOR, recommended - spread);
    rangeMax = Math.min(cap,            recommended + spread);
    applied  = true;
  }

  // ── 5. Ensure recommended is within [rangeMin, rangeMax] ─────────────
  if (recommended < rangeMin) { recommended = rangeMin; applied = true; }
  if (recommended > rangeMax) { recommended = rangeMax; applied = true; }

  // ── 6. Enforce minimum spread (10 TND) ───────────────────────────────
  if (rangeMax - rangeMin < 10) {
    const centre = (rangeMin + rangeMax) / 2;
    rangeMin = Math.max(ABSOLUTE_FLOOR, centre - 5);
    rangeMax = Math.min(cap,            centre + 5);
    applied  = true;
  }

  // ── 7. Round to ROUND_STEP TND ────────────────────────────────────────
  recommended = roundStep(recommended);
  rangeMin    = roundStep(rangeMin);
  rangeMax    = roundStep(rangeMax);

  // Final safety: min < max after rounding
  if (rangeMin >= rangeMax) { rangeMax = rangeMin + ROUND_STEP; applied = true; }

  return {
    ...raw,
    recommended,
    rangeMin,
    rangeMax,
    _guardrailApplied: applied || undefined,
  };
}

// ── Pure helpers ──────────────────────────────────────────────────────────────

/** Look up the hard cap for a categorySlug::unit combination */
function hardCap(slug: string, unit: string): number {
  return HARD_CAPS[`${slug}::${unit}`] ?? HARD_CAPS['*'];
}

function isFinitePositive(n: number): boolean {
  return typeof n === 'number' && isFinite(n) && n > 0;
}

function roundStep(n: number): number {
  return Math.round(n / ROUND_STEP) * ROUND_STEP;
}


// =============================================================================
// WORKED EXAMPLES (inline docs)
// =============================================================================
//
// ── Case A: NaN recommended (division by zero in scorer) ─────────────────────
//   raw = { recommended: NaN, rangeMin: 100, rangeMax: 200 }
//   baseline.recommended = 150
//   → step 1: recommended = 150 (NaN replaced)
//   → step 5: 150 within [100,200] ✓
//   → { recommended: 150, rangeMin: 100, rangeMax: 200, _guardrailApplied: true }
//
// ── Case B: exploding range (outlier villa in comps) ────────────────────────
//   raw = { recommended: 280, rangeMin: 50, rangeMax: 3000 }
//   cap = 2000 (stays::per_night)
//   → step 2: rangeMax capped to 2000
//   → step 4: 2000 / 50 = 40× > 5× → tighten ±40%
//             rangeMin = max(1, 280-112) = 168
//             rangeMax = min(2000, 280+112) = 392
//   → { recommended: 280, rangeMin: 168, rangeMax: 392, _guardrailApplied: true }
//
// ── Case C: recommended above cap (luxury outlier) ───────────────────────────
//   raw = { recommended: 2500, rangeMin: 200, rangeMax: 3000 }
//   cap = 2000
//   → step 2: recommended = 2000, rangeMax = 2000
//   → step 5: 2000 == rangeMax ✓
//   → { recommended: 2000, rangeMin: 200, rangeMax: 2000, _guardrailApplied: true }
//
// ── Case D: clean output — no changes ────────────────────────────────────────
//   raw = { recommended: 180, rangeMin: 150, rangeMax: 220 }
//   → all checks pass
//   → { recommended: 180, rangeMin: 150, rangeMax: 220, _guardrailApplied: undefined }
