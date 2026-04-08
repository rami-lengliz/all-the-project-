/**
 * categoryPricingUnits.ts — Frontend mirror of the MVP pricing unit map.
 *
 * Kept in sync manually with:
 *   backend/src/common/constants/category-pricing-units.ts
 *
 * Do NOT import the backend file directly — Next.js cannot resolve NestJS paths.
 */

export type PricingUnit = 'night' | 'day' | 'hour' | 'slot';

export const CATEGORY_PRICING_UNITS: Record<string, PricingUnit> = {
  // accommodation
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

  // beach / outdoor
  'beach-gear': 'day',
  outdoor: 'day',
};

export const UNIT_LABELS: Record<PricingUnit, string> = {
  night: 'per night',
  day: 'per day',
  hour: 'per hour',
  slot: 'per slot',
};

export const UNIT_SUFFIX: Record<PricingUnit, string> = {
  night: '/night',
  day: '/day',
  hour: '/hour',
  slot: '/slot',
};

/** Resolve unit from slug. Falls back to 'day'. */
export function getPricingUnit(categorySlug: string): PricingUnit {
  return CATEGORY_PRICING_UNITS[categorySlug.toLowerCase()] ?? 'day';
}

/**
 * Map a category slug to the correct AI price-suggestion DTO unit value.
 * The AI endpoint uses 'per_X' format.
 */
export function getApiUnit(
  categorySlug: string,
): 'per_night' | 'per_day' | 'per_hour' | 'per_session' {
  const unit = getPricingUnit(categorySlug);
  const map: Record<PricingUnit, 'per_night' | 'per_day' | 'per_hour' | 'per_session'> = {
    night: 'per_night',
    day: 'per_day',
    hour: 'per_hour',
    slot: 'per_session',
  };
  return map[unit];
}

/**
 * Map a category slug or name to the AI category field.
 * Handles real seeded slugs (stays, sports-facilities, mobility, beach-gear).
 */
export function getApiCategory(
  slugOrName: string,
): 'accommodation' | 'sports_facility' | 'tool' | 'vehicle' | 'event_space' {
  const lower = slugOrName.toLowerCase();
  if (lower.includes('stay') || lower.includes('accommodation') || lower.includes('holiday')) {
    return 'accommodation';
  }
  if (lower.includes('sport') || lower.includes('court') || lower.includes('field')) {
    return 'sports_facility';
  }
  if (lower.includes('mobility') || lower.includes('vehicle') || lower.includes('car') || lower.includes('bike')) {
    return 'vehicle';
  }
  if (lower.includes('tool') || lower.includes('equipment')) {
    return 'tool';
  }
  if (lower.includes('event') || lower.includes('hall') || lower.includes('space')) {
    return 'event_space';
  }
  // beach-gear → tool (closest MVP fit)
  return 'tool';
}
