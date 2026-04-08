/**
 * category-pricing-units.ts
 *
 * Single source of truth for the MVP pricing unit per category slug.
 *
 * Rules:
 *  - accommodation / stays → night
 *  - sports-facilities      → hour  (slot bookings = 1 hr blocks; price is per hour)
 *  - mobility / vehicles    → day
 *  - tools-equipment        → day
 *  - event-spaces           → hour
 *  - beach-gear             → day   (half-day / full-day hire)
 *
 * No multiple units per category until a post-MVP iteration.
 * The DB column stays `pricePerDay`; this map controls display + AI suggestion.
 */

export type PricingUnit = 'night' | 'day' | 'hour' | 'slot';

export const CATEGORY_PRICING_UNITS: Record<string, PricingUnit> = {
  // accommodation slugs
  stays: 'night',
  accommodation: 'night',
  'holiday-rentals': 'night',

  // sports
  'sports-facilities': 'hour',
  sports: 'hour',

  // vehicles / mobility
  mobility: 'day',
  vehicles: 'day',
  cars: 'day',

  // tools & equipment
  'tools-equipment': 'day',
  tools: 'day',
  equipment: 'day',

  // event spaces
  'event-spaces': 'hour',
  events: 'hour',

  // beach / outdoor gear
  'beach-gear': 'day',
  outdoor: 'day',
};

/** Human-readable label for a pricing unit */
export const UNIT_LABELS: Record<PricingUnit, string> = {
  night: 'per night',
  day: 'per day',
  hour: 'per hour',
  slot: 'per slot',
};

/** Short suffix used inline with a price value, e.g. "150 TND / night" */
export const UNIT_SUFFIX: Record<PricingUnit, string> = {
  night: '/night',
  day: '/day',
  hour: '/hour',
  slot: '/slot',
};

/**
 * Resolve the pricing unit for a category slug.
 * Falls back to 'day' if the slug is unrecognised (safe default).
 */
export function getPricingUnit(categorySlug: string): PricingUnit {
  return CATEGORY_PRICING_UNITS[categorySlug.toLowerCase()] ?? 'day';
}
