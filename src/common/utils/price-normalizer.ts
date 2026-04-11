/**
 * price-normalizer.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * A pure, stateless helper that converts any listing or booking record into a
 * single canonical price + unit pair suitable for use in the AI price
 * suggestion engine's comparable averaging.
 *
 * Lives in: src/common/utils/price-normalizer.ts
 * Imported by: PriceSuggestionService, seed scripts, future ranking logic.
 * Has ZERO external dependencies — no Prisma, no NestJS, no OpenAI.
 * ─────────────────────────────────────────────────────────────────────────────
 */

// ── Canonical unit type (matches PricingUnit enum in the DTO) ──────────────
export type CanonicalUnit =
  | 'per_night'    // accommodation DAILY bookings
  | 'per_day'      // vehicles, tools, beach gear
  | 'per_hour'     // sports facilities (time-boxed)
  | 'per_slot';    // sports facilities (predefined slot)

// ── Output of normalizePrice() ─────────────────────────────────────────────
export interface NormalizedComp {
  /** Canonical price value in TND */
  canonicalPrice: number;
  /** Canonical pricing unit */
  canonicalUnit: CanonicalUnit;
  /** Always 'TND' for MVP */
  currency: 'TND';
  /** True when the price came from a real booking, false = listing asking price */
  isTransactionPrice: boolean;
}

// ── Input record accepted by normalizePrice() ──────────────────────────────
// Accepts the minimal shape needed — partial so callers don't need to
// construct a full Prisma model.
export interface PriceRecord {
  /** Category slug exactly as stored in DB (e.g. 'stays', 'sports-facilities') */
  categorySlug: string;
  /** BookingType: 'DAILY' or 'SLOT' */
  bookingType?: 'DAILY' | 'SLOT';
  /** Listing pricePerDay (Prisma Decimal serialised as number, string, or Decimal) */
  pricePerDay?: number | string | { toNumber(): number } | null;
  /** Booking snapshot price — set only when record comes from a confirmed booking */
  snapshotPricePerDay?: number | string | { toNumber(): number } | null;
  /** Slot duration in minutes — used only for SLOT bookings to convert to per_hour */
  slotDurationMinutes?: number | null;
  /** Explicit currency — defaults to TND */
  currency?: string | null;
}

// ── Category slug → canonical unit map ────────────────────────────────────
// Single source of truth for the backend.  Keep in sync with:
//   frontend/src/lib/categoryPricingUnits.ts
const SLUG_TO_UNIT: Record<string, CanonicalUnit> = {
  // Accommodation
  'stays':             'per_night',
  'accommodation':     'per_night',
  'holiday-rentals':   'per_night',
  // Sports facilities
  'sports-facilities': 'per_slot',   // MVP: slot is the primary unit
  'courts':            'per_slot',
  // Vehicles / Mobility
  'mobility':          'per_day',
  'vehicles':          'per_day',
  'scooters':          'per_day',
  // Tools & beach gear
  'tools-equipment':   'per_day',
  'beach-gear':        'per_day',
  'equipment':         'per_day',
  // Event spaces
  'event-spaces':      'per_hour',
  'venues':            'per_hour',
};

// ── Internal helper: safely convert any Decimal-like value to number ───────
function toNum(v: number | string | { toNumber(): number } | null | undefined): number | null {
  if (v === null || v === undefined) return null;
  if (typeof v === 'number')         return isFinite(v) && v > 0 ? v : null;
  if (typeof v === 'string')         { const n = parseFloat(v); return isFinite(n) && n > 0 ? n : null; }
  if (typeof v?.toNumber === 'function') { const n = v.toNumber(); return isFinite(n) && n > 0 ? n : null; }
  return null;
}

// ── Main export ────────────────────────────────────────────────────────────
/**
 * Normalise any listing or booking record into a single { canonicalPrice,
 * canonicalUnit, currency, isTransactionPrice } object.
 *
 * Returns null when the record cannot produce a valid positive price,
 * so callers can safely filter(Boolean) the result array.
 *
 * @example
 * // From a booking row (transaction price — most accurate)
 * normalizePrice({
 *   categorySlug: 'stays',
 *   bookingType: 'DAILY',
 *   snapshotPricePerDay: 180,
 * });
 * // → { canonicalPrice: 180, canonicalUnit: 'per_night', currency: 'TND', isTransactionPrice: true }
 *
 * @example
 * // From a sports-facility listing with 90-minute slots
 * normalizePrice({
 *   categorySlug: 'sports-facilities',
 *   bookingType: 'SLOT',
 *   pricePerDay: 45,
 *   slotDurationMinutes: 90,
 * });
 * // → { canonicalPrice: 45, canonicalUnit: 'per_slot', currency: 'TND', isTransactionPrice: false }
 */
export function normalizePrice(record: PriceRecord): NormalizedComp | null {
  // ── 1. Resolve canonical unit from category slug ────────────────────────
  const slug = (record.categorySlug ?? '').toLowerCase().trim();
  const resolvedUnit: CanonicalUnit = SLUG_TO_UNIT[slug] ?? deriveUnitFromBookingType(record.bookingType);

  // ── 2. Resolve raw price value ──────────────────────────────────────────
  // Priority: booking snapshot > listing pricePerDay
  const snapshotPrice  = toNum(record.snapshotPricePerDay);
  const listingPrice   = toNum(record.pricePerDay);
  const rawPrice       = snapshotPrice ?? listingPrice;
  const isTransaction  = snapshotPrice !== null;

  if (rawPrice === null || rawPrice <= 0) return null;   // no usable price

  // ── 3. Unit-specific corrections ───────────────────────────────────────
  // The DB stores a single pricePerDay column.  For SLOT bookings, this column
  // actually holds the per-slot price (set at listing creation).  For DAILY
  // accommodation it is the per-night rate.  We do NOT convert between units
  // here — just tag correctly so the averaging engine never mixes them.

  // Edge case A: SLOT facility but unit resolved to per_slot
  //   → price is already per-slot, no conversion needed.
  // Edge case B: caller provides slotDurationMinutes and we know it's SLOT
  //   → still keep per_slot; only tag unit correctly.
  //   If a future version wants per_hour comps, conversion is:
  //   pricePerHour = (rawPrice / slotDurationMinutes) * 60  (not done in MVP)
  //
  // Edge case C: category slug could not be resolved (unknown slug)
  //   → we still return the record but with the best-guess unit so averaging
  //   doesn't silently break.

  const canonicalUnit: CanonicalUnit =
    record.bookingType === 'SLOT' && resolvedUnit === 'per_day'
      ? 'per_slot'  // override: e.g. a beach-gear item rented per slot
      : resolvedUnit;

  return {
    canonicalPrice:     rawPrice,
    canonicalUnit,
    currency:           'TND',
    isTransactionPrice: isTransaction,
  };
}

// ── Batch helper ────────────────────────────────────────────────────────────
/**
 * Normalise an array of records and filter out nulls.
 * Optionally filter to a single unit to prevent mixing.
 */
export function normalizePriceBatch(
  records: PriceRecord[],
  filterUnit?: CanonicalUnit,
): NormalizedComp[] {
  const all = records.map(normalizePrice).filter((r): r is NormalizedComp => r !== null);
  return filterUnit ? all.filter((r) => r.canonicalUnit === filterUnit) : all;
}

// ── Private: unit fallback when slug is unknown ─────────────────────────────
function deriveUnitFromBookingType(bookingType?: 'DAILY' | 'SLOT' | null): CanonicalUnit {
  return bookingType === 'SLOT' ? 'per_slot' : 'per_day';
}
