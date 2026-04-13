/**
 * explanation-builder.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Deterministic 3-bullet explanation generator for RentAI price suggestions.
 *
 * Lives in:    src/common/utils/explanation-builder.ts
 * Imported by: PriceSuggestionService
 * Zero external dependencies — no AI calls, no async, no Prisma.
 *
 * Design philosophy
 * ─────────────────
 * The explanation is always deterministic and reproducible given the same
 * inputs. It does not call GPT. When AI is available, the service can call
 * GPT separately and fall back to this function if it fails.
 *
 * Bullet assignment (always exactly 3):
 *   Bullet 1 — DATA SOURCE  : where the price comes from (city vs national)
 *   Bullet 2 — FEATURE ADJ  : the strongest accommodation/property signal
 *   Bullet 3 — CONFIDENCE   : what confidence means for the host
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { ConfidenceBand } from './confidence-score';

// ── Input ─────────────────────────────────────────────────────────────────────
export interface ExplanationInput {
  // ── Location context
  city:              string;
  cityCompsN:        number;
  nationalCompsN:    number;
  wCity:             number;   // 0..1
  wNational:         number;   // 0..1

  // ── Feature signals (all optional — graceful fallback when missing)
  distanceToSeaKm?:  number | null;
  propertyType?:     string | null;   // 'villa' | 'house' | 'apartment'
  capacity?:         number | null;
  surfaceM2?:        number | null;

  // ── Output metrics (for framing the confidence bullet)
  confidence:        ConfidenceBand;
  confidenceScore:   number;          // 0..1 raw value
  recommended:       number;
  rangeMin:          number;
  rangeMax:          number;
  categorySlug:      string;
}

/** Always exactly 3 strings, each ≤ ~100 chars */
export type ExplanationTuple = [string, string, string];

// ── Main export ───────────────────────────────────────────────────────────────
/**
 * Generate 3 concise explanation bullets for a price suggestion.
 *
 * @example
 * buildExplanation({
 *   city: 'Kelibia', cityCompsN: 12, nationalCompsN: 80,
 *   wCity: 1.0, wNational: 0.0,
 *   distanceToSeaKm: 0.25, propertyType: 'villa', capacity: 8,
 *   confidence: 'high', confidenceScore: 0.83,
 *   recommended: 280, rangeMin: 240, rangeMax: 320,
 *   categorySlug: 'stays',
 * });
 * // → [
 * //   "Price based on 12 active listings in Kelibia — strong local signal.",
 * //   "Villa type and beachfront location (< 300 m) add a premium.",
 * //   "High confidence: market is consistent. Typical range 240–320 TND/night.",
 * // ]
 */
export function buildExplanation(input: ExplanationInput): ExplanationTuple {
  return [
    bullet1_dataSource(input),
    bullet2_featureSignal(input),
    bullet3_confidence(input),
  ];
}

// ── Bullet 1: Data source ─────────────────────────────────────────────────────
function bullet1_dataSource(i: ExplanationInput): string {
  const pct = Math.round(i.wCity * 100);

  if (i.cityCompsN === 0) {
    return trim100(
      `No listings found in ${i.city} yet — price estimated from ${i.nationalCompsN} national comparables.`,
    );
  }

  if (i.cityCompsN >= 10) {
    return trim100(
      `Price fully based on ${i.cityCompsN} comparable listings in ${i.city} — strong local signal.`,
    );
  }

  if (i.cityCompsN >= 5) {
    return trim100(
      `Price blended: ${pct}% from ${i.cityCompsN} ${i.city} listings, ${100 - pct}% national average.`,
    );
  }

  // 1–4 city comps
  return trim100(
    `Only ${i.cityCompsN} listing(s) found in ${i.city}; price weighted ${pct}% local, ${100 - pct}% national.`,
  );
}

// ── Bullet 2: Feature signal ──────────────────────────────────────────────────
// Pick the single STRONGEST accommodation signal; fall back to generic.
function bullet2_featureSignal(i: ExplanationInput): string {
  const isAccomm = isAccommodation(i.categorySlug);

  // Sea proximity (strongest signal for coastal Tunisia)
  if (isAccomm && i.distanceToSeaKm != null) {
    const seaLabel = seaTierLabel(i.distanceToSeaKm);
    const propLabel = i.propertyType ? ` ${capitalise(i.propertyType)} type and` : '';
    return trim100(`${propLabel} ${seaLabel} — sea proximity is a key price driver in this area.`.trimStart());
  }

  // Property type only (no sea data)
  if (isAccomm && i.propertyType) {
    const capNote = i.capacity ? ` for up to ${i.capacity} guests` : '';
    return trim100(
      `${capitalise(i.propertyType)} property${capNote} — type multiplier applied to the base price.`,
    );
  }

  // Capacity/size without property type
  if (i.capacity && i.capacity > 0) {
    return trim100(`Capacity of ${i.capacity} persons factored into the scale adjustment.`);
  }

  if (i.surfaceM2 && i.surfaceM2 > 0) {
    return trim100(`Surface area (${i.surfaceM2} m²) used for size-based scaling.`);
  }

  // Generic fallback for non-accommodation categories
  return trim100(`Price matched to comparable ${slugToLabel(i.categorySlug)} in the same market.`);
}

// ── Bullet 3: Confidence framing ──────────────────────────────────────────────
function bullet3_confidence(i: ExplanationInput): string {
  const unit = unitLabel(i.categorySlug);
  const range = `${i.rangeMin}–${i.rangeMax} TND${unit}`;

  switch (i.confidence) {
    case 'high':
      return trim100(
        `High confidence: market data is consistent. Typical range ${range}.`,
      );
    case 'medium':
      return trim100(
        `Medium confidence: limited local data. Review and adjust if needed. Range ${range}.`,
      );
    case 'low':
    default:
      return trim100(
        `Low confidence: few comparables found. Treat this as a starting point. Range ${range}.`,
      );
  }
}

// ── Pure helpers ──────────────────────────────────────────────────────────────

function seaTierLabel(km: number): string {
  if (km <= 0.3) return 'Beachfront location (< 300 m)';
  if (km <= 1.0) return `Near the sea (${km} km)`;
  if (km <= 3.0) return `Coastal area (${km} km from sea)`;
  return `Inland location (${km} km from sea)`;
}

function isAccommodation(slug: string): boolean {
  return ['stays', 'accommodation', 'holiday-rentals'].includes(slug.toLowerCase());
}

function capitalise(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
}

function slugToLabel(slug: string): string {
  const map: Record<string, string> = {
    'stays':             'accommodation',
    'accommodation':     'accommodation',
    'sports-facilities': 'sports facility',
    'mobility':          'vehicle',
    'tools-equipment':   'equipment',
    'beach-gear':        'beach gear',
    'event-spaces':      'event space',
  };
  return map[slug.toLowerCase()] ?? slug;
}

function unitLabel(slug: string): string {
  const map: Record<string, string> = {
    'stays':             '/night',
    'accommodation':     '/night',
    'mobility':          '/day',
    'tools-equipment':   '/day',
    'beach-gear':        '/day',
    'sports-facilities': '/slot',
    'event-spaces':      '/hour',
  };
  return map[slug.toLowerCase()] ?? '';
}

/** Hard-truncate to 100 chars with ellipsis if exceeded */
function trim100(s: string): string {
  return s.length <= 100 ? s : s.slice(0, 97) + '…';
}
