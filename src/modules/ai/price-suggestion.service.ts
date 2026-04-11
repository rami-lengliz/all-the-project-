import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { AiService } from './ai.service';
import {
  PriceSuggestionRequestDto,
  PriceSuggestionResponseDto,
  PricingSeason,
  PropertyType,
} from './dto/price-suggestion.dto';
import { CATEGORY_PRICING_UNITS } from '../../common/constants/category-pricing-units';
import { selectTopKComps, type TargetDraft, type CompCandidate } from '../../common/utils/comp-scorer';
import { calcBasePrice }   from '../../common/utils/base-price-calculator';
import { calcPriceRange, percentile } from '../../common/utils/price-range';
import { calcConfidence }  from '../../common/utils/confidence-score';
import { buildExplanation } from '../../common/utils/explanation-builder';
import { getBaseline }     from '../../common/config/price-baselines';
import { applyGuardrails } from '../../common/utils/output-guardrails';

// ── Comp row types ──────────────────────────────────────────────────────────
/** Normalised comp returned by both fetchCompsGeo and the fallback */
interface CompRow {
  listingId:    string;
  price:        number;      // ground-truth booking price, or listing asking price
  source:       'booking' | 'listing';
  categorySlug: string;
  address:      string;
  lat:          number;
  lng:          number;
  distanceM:    number;       // 0 for city-string fallback comps
}

/** Raw row returned by $queryRaw before normalisation */
interface RawCompRow {
  listingId:    string;
  listingPrice: number;       // Prisma returns ::float as JS number
  address:      string;
  lat:          string | number;  // PostGIS returns text from $queryRaw
  lng:          string | number;
  distanceM:    string | number;
  categorySlug: string;
  bookedPrice:  number | null;
}

// ── City-first thresholds ─────────────────────────────────────────────────────
const MIN_CITY_COMPS  = 5;   // below this → ramp from national
const HIGH_CITY_COMPS = 10;  // at/above this → full city trust
const W_CITY_PARTIAL     = 0.60;
const W_NATIONAL_PARTIAL = 0.40;

// ── Comparable selection constants ───────────────────────────────────────────
// Primary source: bookings with these statuses carry a real agreed price
const COMP_BOOKING_STATUSES = ['confirmed', 'paid', 'completed'] as const;
// How many comps to keep (topK) — enough for a stable average, not so many we
// include stale/outlier data from years ago
const TOPK_CITY_BOOKINGS     = 30;   // city-level booking comps
const TOPK_NATIONAL_BOOKINGS = 100;  // national booking comps
const TOPK_CITY_LISTINGS     = 30;   // fallback: active listing prices (city)
const TOPK_NATIONAL_LISTINGS = 150;  // fallback: active listing prices (national)
// Radius used for city-level comp matching (km stored in address string — PostGIS
// not used here; we match on city string extracted from address instead)
const CITY_RADIUS_LABEL = 'city'; // placeholder; filter is address-contains(city)

// ── Season ────────────────────────────────────────────────────────────────────
const PEAK_MONTHS     = new Set([6, 7]);
const SHOULDER_MONTHS = new Set([5, 8]);
const SEASON_MULTIPLIER: Record<string, number> = {
  peak:     1.35,
  shoulder: 1.10,
  off_peak: 1.00,
};

// ── National baseline prices ──────────────────────────────────────────────────
// Deprecated stub — now sourced from src/common/config/price-baselines.ts
// Kept only for the outer suggest() catch block (before catSlug is available)
const CATEGORY_DEFAULTS_FALLBACK: Record<string, number> = {
  accommodation:   150,
  sports_facility:  35,
  tool:             60,
  vehicle:         180,
  event_space:      80,
};

// ── Accommodation: distance-to-sea tiers ─────────────────────────────────────
// multiplier applied on top of the city-weighted base price
const SEA_TIERS: { maxKm: number; multiplier: number; label: string }[] = [
  { maxKm: 0.3,  multiplier: 1.40, label: 'beachfront (≤ 300 m)'  },
  { maxKm: 1.0,  multiplier: 1.25, label: 'near sea (300 m – 1 km)' },
  { maxKm: 3.0,  multiplier: 1.10, label: 'coastal area (1 – 3 km)' },
  { maxKm: 999,  multiplier: 1.00, label: 'inland (> 3 km)'         },
];

// ── Accommodation: property-type multipliers ──────────────────────────────────
const PROPERTY_TYPE_MULTIPLIER: Record<string, number> = {
  villa:     1.30,
  house:     1.10,
  apartment: 1.00,  // baseline
};

const EXPLANATION_FALLBACK = 'No additional data available for this signal.';

@Injectable()
export class PriceSuggestionService {
  private readonly logger = new Logger(PriceSuggestionService.name);

  constructor(
    private prisma: PrismaService,
    private aiService: AiService,
  ) {}

  async suggest(
    dto: PriceSuggestionRequestDto,
  ): Promise<PriceSuggestionResponseDto> {
    // ── Guard: city must be a non-empty string (DTO validator allows '' by default)
    if (!dto.city?.trim()) {
      throw new BadRequestException('city must be a non-empty string');
    }

    try {
      return await this._suggest(dto);
    } catch (err) {
      // Engine error → graceful degradation using category baseline
      this.logger.error('PriceSuggestionEngine fatal error — using baseline', err);
      const catSlug = this.categoryToSlug(dto.category);
      const baseline = getBaseline(catSlug, dto.unit);
      const raw = {
        recommended: baseline.recommended,
        rangeMin:    baseline.rangeMin,
        rangeMax:    baseline.rangeMax,
        confidence:  'low' as const,
        explanation: [
          `No comparable listings found for ${dto.city} yet.`,
          `Using national baseline of ${baseline.recommended} TND as a starting point.`,
          'Low confidence: adjust the price based on your local knowledge.',
        ] as [string, string, string],
        compsUsed: 0,
        currency:  'TND',
        unit:      dto.unit,
      };
      const guarded = applyGuardrails(raw, catSlug, dto.unit, baseline);
      return {
        recommended: guarded.recommended,
        range:       { min: guarded.rangeMin, max: guarded.rangeMax },
        confidence:  guarded.confidence,
        explanation: guarded.explanation,
        compsUsed:   guarded.compsUsed,
        currency:    guarded.currency,
        unit:        guarded.unit,
      };
    }
  }

  /** Internal engine — called by suggest(), isolated so errors can be caught cleanly */
  private async _suggest(
    dto: PriceSuggestionRequestDto,
  ): Promise<PriceSuggestionResponseDto> {
    const hasGeo  = dto.lat !== undefined && dto.lng !== undefined;
    const radiusKm = dto.radiusKm ?? 25;
    const catSlug  = this.categoryToSlug(dto.category);
    const season   = dto.season ?? this.currentSeason();
    const seasonMult = SEASON_MULTIPLIER[season] ?? 1.0;

    // ── 1. Fetch raw comps ────────────────────────────────────────────────────
    const rawCityComps: CompRow[] = hasGeo
      ? await this.fetchCompsGeo(dto, dto.lat!, dto.lng!, radiusKm)
      : (await this.fetchComps(dto, dto.city)).map((p) => ({
          listingId: '', price: p, source: 'listing' as const,
          categorySlug: catSlug, address: dto.city, lat: 0, lng: 0, distanceM: 0,
        }));

    const rawNationalComps: CompRow[] = await this.fetchNationalComps(dto);

    // ── 2. Score + select topK comps ─────────────────────────────────────────
    const target: TargetDraft = {
      categorySlug:  catSlug,
      city:          dto.city,
      lat:           dto.lat ?? null,
      lng:           dto.lng ?? null,
      propertyType:  dto.propertyType ?? null,
      capacity:      dto.capacity ?? null,
      amenities:     dto.amenities ?? null,
    };

    const scoredCity     = selectTopKComps(target, rawCityComps     as CompCandidate[], 30, 0.10);
    const scoredNational = selectTopKComps(target, rawNationalComps as CompCandidate[], 80, 0.05);

    // ── 3. Base price (weighted median + city-first blend) ───────────────────
    // getBaseline() gives the accurate per-unit default so the weighted median
    // has a sensible anchor when comps are sparse.
    const baseline        = getBaseline(catSlug, dto.unit);
    const categoryDefault = baseline.recommended;
    const { baseFinal, baseCity, baseNational, wCity, wNational, cityCompsN } =
      calcBasePrice(scoredCity, scoredNational, categoryDefault);

    // ── 4. Accommodation-specific adjustments ─────────────────────────────────
    const { adjustedBase, seaTier, seaMult, propMult, capacityMult, adjustments } =
      dto.category === 'accommodation'
        ? this.accommodationAdjustments(baseFinal, dto)
        : { adjustedBase: baseFinal, seaTier: null, seaMult: 1, propMult: 1, capacityMult: 1, adjustments: [] };

    // ── 5. Final recommended price (round to nearest 0.5 TND) ────────────────
    const raw         = adjustedBase * seasonMult;
    const recommended = Math.round(raw * 2) / 2;

    // ── 6. Price range (IQR-based, not ±25%) ─────────────────────────────────
    const allPrices = [...scoredCity, ...scoredNational].map((c) => c.price).sort((a, b) => a - b);
    const { rangeMin, rangeMax, iqr } = calcPriceRange(allPrices, recommended);
    const medianPrice = percentile(allPrices, 50);

    // ── 7. Confidence (multi-signal) ──────────────────────────────────────────
    const allScored = [...scoredCity, ...scoredNational];
    const avgSim    = allScored.length > 0
      ? allScored.reduce((s, c) => s + c.similarityScore, 0) / allScored.length
      : 0;
    const { score: confidenceScore, band: confidence } = calcConfidence({
      cityCompsN,
      nationalCompsN: scoredNational.length,
      avgSimilarity:  avgSim,
      iqr,
      medianPrice:    medianPrice || recommended,
    });

    // ── 8. Explanation (deterministic 3 bullets) ──────────────────────────────
    const explanation = buildExplanation({
      city:             dto.city,
      cityCompsN,
      nationalCompsN:   scoredNational.length,
      wCity,
      wNational,
      distanceToSeaKm:  dto.distanceToSeaKm ?? null,
      propertyType:     dto.propertyType    ?? null,
      capacity:         dto.capacity        ?? null,
      confidence,
      confidenceScore,
      recommended,
      rangeMin,
      rangeMax,
      categorySlug:     catSlug,
    });

    // ── 9. Write log (fire-and-forget) ────────────────────────────────────────
    let logId: string | undefined;
    try {
      const log = await (this.prisma as any).priceSuggestionLog.create({
        data: {
          city:            dto.city,
          categorySlug:    catSlug,
          unit:            dto.unit,
          season,
          propertyType:    dto.propertyType    ?? null,
          distanceToSeaKm: dto.distanceToSeaKm ?? null,
          capacity:        dto.capacity        ?? null,
          lat:             dto.lat             ?? null,
          lng:             dto.lng             ?? null,
          inputJson:       dto as object,
          suggestedPrice:  recommended,
          rangeMin,
          rangeMax,
          confidence,
          compsCity:       cityCompsN,
          compsNational:   scoredNational.length,
          wCity,
          wNational,
          adjustments:     adjustments.length ? adjustments : null,
          explanation,
          outputJson: {
            recommended, range: { min: rangeMin, max: rangeMax },
            confidence, compsUsed: cityCompsN, currency: 'TND',
            unit: dto.unit, explanation,
          },
        },
        select: { id: true },
      });
      logId = log.id;
    } catch (err) {
      this.logger.error('Failed to write PriceSuggestionLog', err);
    }

    // ── 10. Apply output guardrails (clamp NaN/outliers before returning) ──────────
    const guarded = applyGuardrails(
      { recommended, rangeMin, rangeMax, confidence, explanation,
        compsUsed: cityCompsN, currency: 'TND', unit: dto.unit, logId },
      catSlug,
      dto.unit,
      baseline,
    );
    if (guarded._guardrailApplied) {
      this.logger.warn('Output guardrail corrected suggestion', {
        before: { recommended, rangeMin, rangeMax },
        after:  { recommended: guarded.recommended, rangeMin: guarded.rangeMin, rangeMax: guarded.rangeMax },
      });
    }

    return {
      recommended: guarded.recommended,
      range:       { min: guarded.rangeMin, max: guarded.rangeMax },
      confidence:  guarded.confidence,
      explanation: guarded.explanation,
      compsUsed:   guarded.compsUsed,
      currency:    guarded.currency,
      unit:        guarded.unit,
      logId:       guarded.logId,
    };
    }  // end _suggest


  /**
   * Patch the log after the host publishes the listing.
   * Called from ListingsService.create() once the listing ID is known.
   * Never throws — logging failure must not block listing creation.
   */
  async patchLog(
    logId: string,
    listingId: string,
    finalPrice: number,
    suggestedPrice: number,
  ): Promise<void> {
    try {
      await (this.prisma as any).priceSuggestionLog.update({
        where: { id: logId },
        data: {
          listingId,
          finalPrice,
          overridden: Math.abs(finalPrice - suggestedPrice) > 0.01,
        },
      });
    } catch (err) {
      this.logger.error('Failed to patch PriceSuggestionLog', err);
    }
  }

  /**
   * Admin: return the N most recent price suggestion log rows.
   * Scalar fields only — no inputJson/outputJson to keep payload small.
   */
  async getRecentLogs(limit = 50) {
    try {
      return await (this.prisma as any).priceSuggestionLog.findMany({
        orderBy: { createdAt: 'desc' },
        take:    Math.min(limit, 200),
        select: {
          id:            true,
          createdAt:     true,
          city:          true,
          categorySlug:  true,
          unit:          true,
          suggestedPrice: true,
          rangeMin:       true,
          rangeMax:       true,
          confidence:    true,
          compsCity:     true,
          compsNational: true,
          wCity:         true,
          wNational:     true,
          listingId:     true,
          finalPrice:    true,
          overridden:    true,
        },
      });
    } catch (err) {
      this.logger.error('Failed to fetch PriceSuggestionLogs', err);
      return [];
    }
  }

  // ── Accommodation adjustment engine ────────────────────────────────────────

  /**
   * Formula:
   *   adjustedBase = base
   *                × seaMultiplier        (distance-to-sea tier)
   *                × propertyMultiplier   (villa / house / apartment)
   *                × capacityMultiplier   (gentle log scale: √(capacity/2))
   */
  private accommodationAdjustments(
    base: number,
    dto: PriceSuggestionRequestDto,
  ): {
    adjustedBase: number;
    seaTier: string | null;
    seaMult: number;
    propMult: number;
    capacityMult: number;
    adjustments: string[];
  } {
    const adjustments: string[] = [];

    // — Sea proximity —
    let seaMult = 1.0;
    let seaTier: string | null = null;
    if (dto.distanceToSeaKm !== undefined && dto.distanceToSeaKm !== null) {
      const tier = SEA_TIERS.find((t) => dto.distanceToSeaKm! <= t.maxKm)
                   ?? SEA_TIERS[SEA_TIERS.length - 1];
      seaMult = tier.multiplier;
      seaTier = tier.label;
      if (seaMult !== 1) {
        adjustments.push(
          `Sea proximity (${tier.label}): ×${seaMult.toFixed(2)} (+${Math.round((seaMult - 1) * 100)}%)`,
        );
      }
    }

    // — Property type —
    let propMult = 1.0;
    if (dto.propertyType) {
      propMult = PROPERTY_TYPE_MULTIPLIER[dto.propertyType] ?? 1.0;
      if (propMult !== 1) {
        adjustments.push(
          `Property type (${dto.propertyType}): ×${propMult.toFixed(2)} (+${Math.round((propMult - 1) * 100)}%)`,
        );
      }
    }

    // — Capacity scaling: gentle √(capacity / baseCapacity) —
    // Base capacity = 2 (smallest realistic group).
    // A 6-person property gets √(6/2) = √3 ≈ 1.73 → clamped to max ×1.50
    let capacityMult = 1.0;
    if (dto.capacity && dto.capacity > 2) {
      const raw    = Math.sqrt(dto.capacity / 2);
      capacityMult = Math.min(raw, 1.50); // cap at +50%
      if (capacityMult > 1.01) {
        adjustments.push(
          `Capacity (${dto.capacity} guests): ×${capacityMult.toFixed(2)} (+${Math.round((capacityMult - 1) * 100)}%)`,
        );
      }
    }

    const adjustedBase = base * seaMult * propMult * capacityMult;

    return { adjustedBase, seaTier, seaMult, propMult, capacityMult, adjustments };
  }

  // ── City-first piecewise weighting ─────────────────────────────────────────

  private cityFirstWeight(
    cityComps: number,
    cityAvg: number | null,
    nationalAvg: number,
    category: string,
  ): { basePrice: number; wCity: number; wNational: number } {
    if (cityComps === 0 || cityAvg === null) {
      return { basePrice: nationalAvg, wCity: 0, wNational: 1 };
    }
    if (cityComps < MIN_CITY_COMPS) {
      const wCity = cityComps / MIN_CITY_COMPS;
      return {
        basePrice: wCity * cityAvg + (1 - wCity) * nationalAvg,
        wCity,
        wNational: 1 - wCity,
      };
    }
    if (cityComps < HIGH_CITY_COMPS) {
      return {
        basePrice: W_CITY_PARTIAL * cityAvg + W_NATIONAL_PARTIAL * nationalAvg,
        wCity: W_CITY_PARTIAL,
        wNational: W_NATIONAL_PARTIAL,
      };
    }
    return { basePrice: cityAvg, wCity: 1, wNational: 0 };
  }

  // ── DB helpers ─────────────────────────────────────────────────────────────

  // ── PostGIS city comp query (used when lat/lng are provided) ──────────────
  //
  // Returns structured comp objects — NOT yet ranked/scored.
  // Sorted by distance ASC so the closest comps come first.
  //
  // SQL:
  //   SELECT l.id, l.price_per_day, l.address, l.availability,
  //          ST_Y(l.location::geometry) AS lat,
  //          ST_X(l.location::geometry) AS lng,
  //          ST_Distance(l.location::geography, ref::geography) AS dist_m,
  //          c.slug AS category_slug,
  //          b.snapshot_price_per_day AS booked_price
  //   FROM listings l
  //   JOIN categories c ON c.id = l.category_id
  //   LEFT JOIN bookings b ON b.listing_id = l.id
  //     AND b.status IN ('confirmed','paid','completed')
  //     AND b.snapshot_price_per_day IS NOT NULL
  //   WHERE l.is_active = true
  //     AND l.deleted_at IS NULL
  //     AND c.slug = $catSlug
  //     AND ST_DWithin(
  //           l.location::geography,
  //           ST_SetSRID(ST_MakePoint($lng, $lat), 4326)::geography,
  //           $radiusM
  //         )
  //   ORDER BY dist_m ASC
  //   LIMIT 50;

  async fetchCompsGeo(
    dto: PriceSuggestionRequestDto,
    lat: number,
    lng: number,
    radiusKm: number,
  ): Promise<CompRow[]> {
    const catSlug = this.categoryToSlug(dto.category);
    const radiusM = radiusKm * 1000;

    try {
      const rows = await this.prisma.$queryRaw<RawCompRow[]>`
        SELECT
          l.id                                      AS "listingId",
          l.price_per_day::float                    AS "listingPrice",
          l.address,
          ST_Y(l.location::geometry)                AS lat,
          ST_X(l.location::geometry)                AS lng,
          ROUND(ST_Distance(
            l.location::geography,
            ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography
          )::numeric, 0)                            AS "distanceM",
          c.slug                                    AS "categorySlug",
          -- Best booking price for this listing (most recent confirmed/paid/completed)
          (
            SELECT b.snapshot_price_per_day::float
            FROM   bookings b
            WHERE  b.listing_id = l.id
              AND  b.status IN ('confirmed', 'paid', 'completed')
              AND  b.snapshot_price_per_day IS NOT NULL
            ORDER  BY b.created_at DESC
            LIMIT  1
          )                                         AS "bookedPrice"
        FROM   listings   l
        JOIN   categories c ON c.id = l.category_id
        WHERE  l.is_active   = true
          AND  l.deleted_at  IS NULL
          AND  l.status      = 'ACTIVE'
          AND  c.slug        = ${catSlug}
          AND  l.location    IS NOT NULL
          AND  ST_DWithin(
                 l.location::geography,
                 ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography,
                 ${radiusM}
               )
        ORDER  BY "distanceM" ASC
        LIMIT  ${TOPK_CITY_BOOKINGS + TOPK_CITY_LISTINGS}
      `;

      return rows.map((r) => ({
        listingId:    r.listingId,
        // bookedPrice is ground-truth; fall back to listing asking price
        price:        r.bookedPrice ?? r.listingPrice,
        source:       r.bookedPrice !== null ? 'booking' : 'listing',
        categorySlug: r.categorySlug,
        address:      r.address,
        lat:          Number(r.lat),
        lng:          Number(r.lng),
        distanceM:    Number(r.distanceM),
      }));
    } catch (err) {
      this.logger.error('fetchCompsGeo error', err);
      // Graceful fallback to city-string query
      const prices = await this.fetchComps(dto, dto.city);
      return prices.map((p) => ({ listingId: '', price: p, source: 'listing' as const, categorySlug: catSlug, address: '', lat: 0, lng: 0, distanceM: 0 }));
    }
  }
  //
  // Comp selection strategy:
  //   PRIMARY   → bookings WHERE status IN (confirmed, paid, completed)
  //               AND snapshotPricePerDay IS NOT NULL
  //               → uses the actual agreed market price, not asking price
  //   FALLBACK  → if booking comps < MIN_CITY_COMPS for the scope,
  //               supplement/replace with active listing asking prices
  //   FILTERS   → categorySlug (exact), city string match (city scope)
  //               or no city filter (national scope)
  //   TOP-K     → city: 30 booking + 30 listing; national: 100 booking + 150 listing

  private async fetchComps(
    dto: PriceSuggestionRequestDto,
    city: string | null,
  ): Promise<number[]> {
    const catSlug = this.categoryToSlug(dto.category);
    const topKBookings  = city ? TOPK_CITY_BOOKINGS     : TOPK_NATIONAL_BOOKINGS;
    const topKListings  = city ? TOPK_CITY_LISTINGS     : TOPK_NATIONAL_LISTINGS;

    // ── 1. Primary: real transaction prices from bookings ─────────────────────
    let bookingPrices: number[] = [];
    try {
      const bookings = await this.prisma.booking.findMany({
        where: {
          status:                  { in: COMP_BOOKING_STATUSES as any },
          snapshotPricePerDay:     { not: null },
          listing: {
            isActive:  true,
            status:    'ACTIVE',
            category:  { slug: catSlug },
            ...(city ? { address: { contains: city, mode: 'insensitive' as const } } : {}),
          },
        },
        select:  { snapshotPricePerDay: true },
        orderBy: { createdAt: 'desc' },   // recency bias: most recent comps first
        take:    topKBookings,
      });
      bookingPrices = this.toNumbers(bookings.map((b) => b.snapshotPricePerDay));
    } catch (err) {
      this.logger.error('fetchComps (bookings) error', err);
    }

    // ── 2. Fallback: active listing asking prices ─────────────────────────────
    //    Used when booking data is sparse (below MIN_CITY_COMPS threshold)
    //    or as a supplement to reach a stable average.
    let listingPrices: number[] = [];
    if (bookingPrices.length < MIN_CITY_COMPS) {
      try {
        const listings = await this.prisma.listing.findMany({
          where: {
            isActive:  true,
            status:    'ACTIVE',
            category:  { slug: catSlug },
            ...(city ? { address: { contains: city, mode: 'insensitive' as const } } : {}),
          },
          select:  { pricePerDay: true },
          orderBy: { createdAt: 'desc' },
          take:    topKListings,
        });
        listingPrices = this.toNumbers(listings.map((l) => l.pricePerDay));
      } catch (err) {
        this.logger.error('fetchComps (listings) error', err);
      }
    }

    // Merge: booking prices first (ground truth), listing prices as supplement
    const merged = [...bookingPrices, ...listingPrices];
    return merged;
  }

  // ── National comparables query ───────────────────────────────────────────────
  //
  // Lives in PriceSuggestionService (same file) — it is the “national fallback”
  // path used whenever city comps are below MIN_CITY_COMPS.
  //
  // Input:  dto.category (maps to catSlug), dto.unit, optional dto.city
  //         (city is accepted only to EXCLUDE same-city rows if needed, not used here)
  // Scope:  country = Tunisia (all listings, no PostGIS filter)
  // Output: CompRow[] — same shape as fetchCompsGeo(), price/source/lat/lng present
  //
  // Source priority:
  //   1. snapshotPricePerDay from confirmed/paid/completed bookings (true market price)
  //   2. listing.pricePerDay for listings with no qualifying booking (asking price)
  //
  // Limit: TOPK_NATIONAL_BOOKINGS (100) + TOPK_NATIONAL_LISTINGS (150) = 250 max rows
  //
  async fetchNationalComps(
    dto: Pick<PriceSuggestionRequestDto, 'category' | 'unit'>,
  ): Promise<CompRow[]> {
    const catSlug = this.categoryToSlug(dto.category);

    // ── 1. Primary: real transaction prices ──────────────────────────────────
    // $queryRaw gives us lat/lng + booking price in one shot.
    // No ST_DWithin — national means the whole country.
    let rows: CompRow[] = [];
    try {
      type NatRaw = {
        listingId:    string;
        listingPrice: number;
        address:      string;
        lat:          string | number | null;
        lng:          string | number | null;
        categorySlug: string;
        bookedPrice:  number | null;
      };
      const rawRows = await this.prisma.$queryRaw<NatRaw[]>`
        SELECT
          l.id                            AS "listingId",
          l.price_per_day::float          AS "listingPrice",
          l.address,
          -- coordinates (null when listing has no geometry)
          ST_Y(l.location::geometry)      AS lat,
          ST_X(l.location::geometry)      AS lng,
          c.slug                          AS "categorySlug",
          -- Most recent confirmed/paid/completed booking price
          (
            SELECT b.snapshot_price_per_day::float
            FROM   bookings b
            WHERE  b.listing_id = l.id
              AND  b.status IN ('confirmed', 'paid', 'completed')
              AND  b.snapshot_price_per_day IS NOT NULL
            ORDER  BY b.created_at DESC
            LIMIT  1
          )                               AS "bookedPrice"
        FROM   listings   l
        JOIN   categories c ON c.id = l.category_id
        WHERE  l.is_active  = true
          AND  l.deleted_at IS NULL
          AND  l.status     = 'ACTIVE'
          AND  c.slug       = ${catSlug}
        -- Prioritise rows that have a real booking price so they rank first
        ORDER  BY
          CASE WHEN (
            SELECT 1 FROM bookings b2
            WHERE  b2.listing_id = l.id
              AND  b2.status IN ('confirmed', 'paid', 'completed')
              AND  b2.snapshot_price_per_day IS NOT NULL
            LIMIT  1
          ) IS NOT NULL THEN 0 ELSE 1 END ASC,
          l.created_at DESC
        LIMIT  ${TOPK_NATIONAL_BOOKINGS + TOPK_NATIONAL_LISTINGS}
      `;

      rows = rawRows.map((r) => ({
        listingId:    r.listingId,
        price:        r.bookedPrice ?? r.listingPrice,
        source:       r.bookedPrice !== null ? 'booking' : 'listing',
        categorySlug: r.categorySlug,
        address:      r.address,
        lat:          r.lat !== null ? Number(r.lat) : 0,
        lng:          r.lng !== null ? Number(r.lng) : 0,
        distanceM:    0,   // distance is irrelevant at national scope
      } as CompRow));
    } catch (err) {
      this.logger.error('fetchNationalComps error', err);
      // Hard fallback: Prisma ORM query (no PostGIS, no lat/lng)
      try {
        const bookings = await this.prisma.booking.findMany({
          where: {
            status:              { in: COMP_BOOKING_STATUSES as any },
            snapshotPricePerDay: { not: null },
            listing: { isActive: true, status: 'ACTIVE', category: { slug: catSlug } },
          },
          select:  { snapshotPricePerDay: true, listingId: true },
          orderBy: { createdAt: 'desc' },
          take:    TOPK_NATIONAL_BOOKINGS,
        });
        const listings = await this.prisma.listing.findMany({
          where:   { isActive: true, status: 'ACTIVE', category: { slug: catSlug } },
          select:  { id: true, pricePerDay: true, address: true },
          orderBy: { createdAt: 'desc' },
          take:    TOPK_NATIONAL_LISTINGS,
        });
        const bookingRows: CompRow[] = bookings.map((b) => ({
          listingId: b.listingId, price: this.toNumbers([b.snapshotPricePerDay])[0] ?? 0,
          source: 'booking' as const, categorySlug: catSlug,
          address: '', lat: 0, lng: 0, distanceM: 0,
        })).filter((r) => r.price > 0);
        const listingRows: CompRow[] = listings.map((l) => ({
          listingId: l.id, price: this.toNumbers([l.pricePerDay])[0] ?? 0,
          source: 'listing' as const, categorySlug: catSlug,
          address: l.address, lat: 0, lng: 0, distanceM: 0,
        })).filter((r) => r.price > 0);
        rows = [...bookingRows, ...listingRows];
      } catch (fallbackErr) {
        this.logger.error('fetchNationalComps ORM fallback error', fallbackErr);
      }
    }

    return rows;
  }

  /** Resolve the canonical category slug from the API category key */
  private categoryToSlug(cat: string): string {
    const map: Record<string, string> = {
      accommodation:   'stays',
      sports_facility: 'sports-facilities',
      tool:            'tools-equipment',
      vehicle:         'mobility',
      event_space:     'event-spaces',
    };
    return map[cat] ?? cat;
  }

  /** Safely convert Prisma Decimal | number | null[] → positive number[] */
  private toNumbers(values: (any | null)[]): number[] {
    return values
      .map((v) => {
        if (v === null || v === undefined) return null;
        const n = typeof v?.toNumber === 'function' ? v.toNumber() : Number(v);
        return isFinite(n) && n > 0 ? n : null;
      })
      .filter((n): n is number => n !== null);
  }

  private avg(prices: number[]): number | null {
    if (prices.length === 0) return null;
    return prices.reduce((a, b) => a + b, 0) / prices.length;
  }

  private deriveConfidence(cityComps: number): 'high' | 'medium' | 'low' {
    if (cityComps >= HIGH_CITY_COMPS) return 'high';
    if (cityComps >= MIN_CITY_COMPS)  return 'medium';
    return 'low';
  }

  private currentSeason(): PricingSeason {
    const month = new Date().getMonth();
    if (PEAK_MONTHS.has(month))     return PricingSeason.PEAK;
    if (SHOULDER_MONTHS.has(month)) return PricingSeason.SHOULDER;
    return PricingSeason.OFF_PEAK;
  }

  // ── Explanation ────────────────────────────────────────────────────────────

  private async buildExplanation(
    dto: PriceSuggestionRequestDto,
    recommended: number,
    cityComps: number,
    wCity: number,
    wNational: number,
    season: string,
    seaTier: string | null,
    adjustments: string[],
  ): Promise<[string, string, string]> {
    if (!this.aiService.isAiEnabled()) {
      return this.heuristicExplanation(dto, recommended, cityComps, wCity, wNational, season, seaTier);
    }

    const amenitiesText = dto.amenities?.length
      ? `Amenities: ${dto.amenities.join(', ')}.`
      : 'No specific amenities listed.';

    const weightingNote =
      wCity === 0
        ? 'No city comparables found; price is based entirely on national benchmarks.'
        : wCity === 1
          ? `Price is based entirely on ${cityComps} local comparables in ${dto.city}.`
          : `Price blends ${Math.round(wCity * 100)}% local data (${cityComps} comps in ${dto.city}) and ${Math.round(wNational * 100)}% national average.`;

    const adjNote = adjustments.length
      ? `Applied adjustments: ${adjustments.join('; ')}.`
      : 'No accommodation-specific adjustments applied.';

    const prompt = `You are a pricing analyst for a Tunisian rental platform.
Write EXACTLY 3 short explanation bullets (1 sentence each) justifying the suggested price of ${recommended} TND.

Listing details:
- City: ${dto.city}
- Category: ${dto.category}
- Unit: ${dto.unit}
- Season: ${season}
- Property type: ${dto.propertyType ?? 'not specified'}
- Distance to sea: ${dto.distanceToSeaKm !== undefined ? `${dto.distanceToSeaKm} km (${seaTier ?? ''})` : 'not specified'}
- Capacity: ${dto.capacity ?? 'not specified'}
- ${amenitiesText}
- Weighting: ${weightingNote}
- ${adjNote}

Reply with a JSON array of exactly 3 strings.
["Reason 1.", "Reason 2.", "Reason 3."]`;

    const raw = await this.aiService.generateCompletion(prompt, {
      maxTokens: 280,
      temperature: 0.5,
      systemPrompt:
        'You are a concise pricing analyst. Always respond with a valid JSON array of 3 strings.',
    });

    const match = raw.match(/\[[\s\S]*\]/);
    if (!match) throw new Error('No JSON array in AI response');

    const parsed: string[] = JSON.parse(match[0]);
    if (!Array.isArray(parsed) || parsed.length < 3) {
      throw new Error('AI returned fewer than 3 explanations');
    }

    return [
      parsed[0] ?? EXPLANATION_FALLBACK,
      parsed[1] ?? EXPLANATION_FALLBACK,
      parsed[2] ?? EXPLANATION_FALLBACK,
    ];
  }

  private heuristicExplanation(
    dto: PriceSuggestionRequestDto,
    recommended: number,
    cityComps: number,
    wCity: number,
    wNational: number,
    season: string,
    seaTier: string | null,
  ): [string, string, string] {
    const seasonLabel =
      season === 'peak' ? 'peak summer' :
      season === 'shoulder' ? 'shoulder' : 'off-peak';

    const bullet1 =
      cityComps === 0
        ? `No comparable listings found in ${dto.city}; price estimated from national benchmarks for ${dto.category} rentals.`
        : wCity < 1
          ? `Price blends ${Math.round(wCity * 100)}% local data (${cityComps} listings in ${dto.city}) and ${Math.round(wNational * 100)}% national average.`
          : `Based on ${cityComps} comparable listings in ${dto.city}, the local market rate for this category is ${recommended} TND ${dto.unit.replace('_', ' ')}.`;

    const bullet2 = seaTier
      ? `Sea proximity adjustment applied for ${seaTier}, reflecting Kelibia's coastal premium.`
      : `The ${seasonLabel} seasonal multiplier has been applied to reflect current demand in Tunisia.`;

    const bullet3 =
      dto.propertyType === 'villa'
        ? `Villa-type premium (+30%) applied, consistent with the higher expectations and space of this property type.`
        : dto.amenities?.length
          ? `Amenities such as ${dto.amenities.slice(0, 3).join(', ')} contribute positively to this pricing tier.`
          : `Adding amenities (e.g., wifi, parking, sea view) could justify a higher price for this listing.`;

    return [bullet1, bullet2, bullet3];
  }
}
