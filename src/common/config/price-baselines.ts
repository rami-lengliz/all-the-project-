/**
 * price-baselines.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Rule-based baseline prices for the RentAI price suggestion fallback layer.
 *
 * Used ONLY when both city and national comparable sets are empty
 * (cold-start market or new category).
 *
 * Lives in:    src/common/config/price-baselines.ts
 * Imported by: PriceSuggestionService
 *
 * Sources / rationale:
 *   Accommodation  — Tunisian coastal holiday rental market (2023–2024)
 *   Sports         — Tunis/Kelibia court/field rental surveys
 *   Vehicles       — local car-rental baseline rack rates
 *   Tools/gear     — beach equipment rental common pricing
 *   Event spaces   — Tunis event venue hourly rates
 *
 * Keep in sync with:
 *   src/modules/ai/price-suggestion.service.ts  (CATEGORY_DEFAULTS stub replaced by this)
 *   frontend/src/lib/categoryPricingUnits.ts
 * ─────────────────────────────────────────────────────────────────────────────
 */

export interface CategoryBaseline {
  /** Recommended starting price (TND) */
  recommended: number;
  /** Conservative low end of the range */
  rangeMin: number;
  /** Optimistic high end of the range */
  rangeMax: number;
  /** Canonical unit this baseline applies to */
  unit: string;
  /** Human note — for logs/explanation only */
  note: string;
}

// ── Baseline table ────────────────────────────────────────────────────────────
// Key format: `${categorySlug}::${unit}`
// Falls back to `${categorySlug}` (unit-agnostic) if exact key not found.

export const PRICE_BASELINES: Record<string, CategoryBaseline> = {

  // ── Accommodation (stays) ─────────────────────────────────────────────────
  'stays::per_night': {
    recommended: 150,
    rangeMin:     80,
    rangeMax:    220,   // tightened: 280 was too optimistic with zero comps
    unit: 'per_night',
    note: 'Tunisian coastal holiday rental median 2024',
  },
  'accommodation::per_night': {
    recommended: 150,
    rangeMin:     80,
    rangeMax:    220,
    unit: 'per_night',
    note: 'Alias for stays::per_night',
  },
  'holiday-rentals::per_night': {
    recommended: 160,
    rangeMin:     90,
    rangeMax:    260,   // premium segment — slightly wider but still honest
    unit: 'per_night',
    note: 'Premium holiday-rental segment',
  },

  // ── Sports facilities ─────────────────────────────────────────────────────
  'sports-facilities::per_slot': {
    recommended:  35,
    rangeMin:     20,
    rangeMax:     80,
    unit: 'per_slot',
    note: '90-min court or pitch slot — Kelibia/Tunis suburbs',
  },
  'sports-facilities::per_hour': {
    recommended:  25,
    rangeMin:     15,
    rangeMax:     55,
    unit: 'per_hour',
    note: 'Hourly sports facility rate',
  },
  'courts::per_slot': {
    recommended:  30,
    rangeMin:     20,
    rangeMax:     60,
    unit: 'per_slot',
    note: 'Tennis / paddle court slot',
  },

  // ── Vehicles / Mobility ───────────────────────────────────────────────────
  'mobility::per_day': {
    recommended: 180,
    rangeMin:     80,
    rangeMax:    400,
    unit: 'per_day',
    note: 'Small to mid-size car daily rate',
  },
  'vehicles::per_day': {
    recommended: 180,
    rangeMin:     80,
    rangeMax:    400,
    unit: 'per_day',
    note: 'Alias for mobility::per_day',
  },
  'scooters::per_day': {
    recommended:  60,
    rangeMin:     35,
    rangeMax:    100,
    unit: 'per_day',
    note: 'Scooter / e-bike daily rate',
  },

  // ── Tools & equipment ─────────────────────────────────────────────────────
  'tools-equipment::per_day': {
    recommended:  60,
    rangeMin:     20,
    rangeMax:    150,
    unit: 'per_day',
    note: 'General tool / equipment daily rental',
  },
  'beach-gear::per_day': {
    recommended:  25,
    rangeMin:     10,
    rangeMax:     60,
    unit: 'per_day',
    note: 'Beach chair, umbrella, paddle set per day',
  },
  'equipment::per_day': {
    recommended:  50,
    rangeMin:     15,
    rangeMax:    120,
    unit: 'per_day',
    note: 'Generic equipment alias',
  },

  // ── Event spaces ──────────────────────────────────────────────────────────
  'event-spaces::per_hour': {
    recommended:  80,
    rangeMin:     40,
    rangeMax:    200,
    unit: 'per_hour',
    note: 'Tunis / coastal event venue hourly rate',
  },
  'venues::per_hour': {
    recommended:  90,
    rangeMin:     50,
    rangeMax:    220,
    unit: 'per_hour',
    note: 'Premium venue alias',
  },
};

// ── Lookup helper ─────────────────────────────────────────────────────────────
/**
 * Get the baseline for a categorySlug + unit combination.
 * Tries exact key first (`slug::unit`), then slug-only, then a hardcoded catch-all.
 *
 * @example
 * getBaseline('stays', 'per_night')
 * // → { recommended: 150, rangeMin: 80, rangeMax: 280, unit: 'per_night', ... }
 *
 * @example
 * getBaseline('unknown-slug', 'per_day')
 * // → { recommended: 100, rangeMin: 50, rangeMax: 200, unit: 'per_day', note: 'catch-all' }
 */
export function getBaseline(categorySlug: string, unit: string): CategoryBaseline {
  const exactKey = `${categorySlug}::${unit}`;
  if (PRICE_BASELINES[exactKey]) return PRICE_BASELINES[exactKey];

  // Slug-only fallback (unit-agnostic) — checks first entry matching slug prefix
  const slugKey = Object.keys(PRICE_BASELINES).find((k) => k.startsWith(`${categorySlug}::`));
  if (slugKey) return PRICE_BASELINES[slugKey];

  // Hard catch-all — should never happen if categorySlug is valid
  return {
    recommended: 100,
    rangeMin:     50,
    rangeMax:    200,
    unit,
    note: 'catch-all baseline — categorySlug not in table',
  };
}
