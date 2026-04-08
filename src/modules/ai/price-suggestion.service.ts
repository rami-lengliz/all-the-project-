import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { AiService } from './ai.service';
import {
  PriceSuggestionRequestDto,
  PriceSuggestionResponseDto,
  PricingSeason,
  PropertyType,
} from './dto/price-suggestion.dto';
import { CATEGORY_PRICING_UNITS } from '../../common/constants/category-pricing-units';

// ── City-first thresholds ─────────────────────────────────────────────────────
const MIN_CITY_COMPS  = 5;
const HIGH_CITY_COMPS = 10;
const W_CITY_PARTIAL     = 0.60;
const W_NATIONAL_PARTIAL = 0.40;

// ── Season ────────────────────────────────────────────────────────────────────
const PEAK_MONTHS     = new Set([6, 7]);
const SHOULDER_MONTHS = new Set([5, 8]);
const SEASON_MULTIPLIER: Record<string, number> = {
  peak:     1.35,
  shoulder: 1.10,
  off_peak: 1.00,
};

// ── National baseline prices (per canonical unit) ─────────────────────────────
const CATEGORY_DEFAULTS: Record<string, number> = {
  accommodation:   150,  // per_night
  sports_facility:  30,  // per_hour
  tool:             60,  // per_day
  vehicle:         180,  // per_day
  event_space:      80,  // per_hour
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
    // ── 1. City-first weighted base price ───────────────────────────────────
    const cityComps    = await this.fetchComps(dto, dto.city);
    const cityPrices   = this.extractPrices(cityComps);
    const cityAvg      = this.avg(cityPrices);
    const cityCompsN   = cityPrices.length;

    const nationalComps  = await this.fetchComps(dto, null);
    const nationalPrices = this.extractPrices(nationalComps);
    const nationalAvg    = this.avg(nationalPrices) ?? CATEGORY_DEFAULTS[dto.category] ?? 100;

    const { basePrice, wCity, wNational } = this.cityFirstWeight(
      cityCompsN, cityAvg, nationalAvg, dto.category,
    );

    // ── 2. Accommodation-specific adjustments ───────────────────────────────
    const { adjustedBase, seaTier, seaMult, propMult, capacityMult, adjustments } =
      dto.category === 'accommodation'
        ? this.accommodationAdjustments(basePrice, dto)
        : { adjustedBase: basePrice, seaTier: null, seaMult: 1, propMult: 1, capacityMult: 1, adjustments: [] };

    // ── 3. Seasonal multiplier ──────────────────────────────────────────────
    const season     = dto.season ?? this.currentSeason();
    const seasonMult = SEASON_MULTIPLIER[season] ?? 1.0;

    // ── 4. Final price ──────────────────────────────────────────────────────
    // formula: recommended = round_0.5( adjustedBase × seasonMult )
    const raw         = adjustedBase * seasonMult;
    const recommended = Math.round(raw * 2) / 2;
    const min         = Math.round(recommended * 0.75 * 2) / 2;
    const max         = Math.round(recommended * 1.25 * 2) / 2;

    // ── 5. Confidence ───────────────────────────────────────────────────────
    const confidence = this.deriveConfidence(cityCompsN);

    // ── 6. Explanation ──────────────────────────────────────────────────────
    let explanation: [string, string, string];
    try {
      explanation = await this.buildExplanation(
        dto, recommended, cityCompsN, wCity, wNational, season, seaTier, adjustments,
      );
    } catch (err) {
      this.logger.warn('AI explanation failed, using heuristic fallback', err);
      explanation = this.heuristicExplanation(
        dto, recommended, cityCompsN, wCity, wNational, season, seaTier,
      );
    }

    // ── 7. Write log (fire-and-forget) ────────────────────────────────────
    let logId: string | undefined;
    try {
      const log = await (this.prisma as any).priceSuggestionLog.create({
        data: {
          city:            dto.city,
          category:        dto.category,
          unit:            dto.unit,
          season:          season,
          propertyType:    dto.propertyType ?? null,
          distanceToSeaKm: dto.distanceToSeaKm ?? null,
          capacity:        dto.capacity ?? null,
          lat:             dto.lat ?? null,
          lng:             dto.lng ?? null,
          suggestedPrice:  recommended,
          rangeMin:        min,
          rangeMax:        max,
          confidence,
          compsUsed:       cityCompsN,
          wCity,
          wNational,
          adjustments:     adjustments.length ? adjustments : null,
          explanation,
        },
        select: { id: true },
      });
      logId = log.id;
    } catch (err) {
      // Non-critical — never fail the suggestion because of logging
      this.logger.error('Failed to write PriceSuggestionLog', err);
    }

    return {
      recommended,
      range: { min, max },
      confidence,
      explanation,
      compsUsed: cityCompsN,
      currency: 'TND',
      unit: dto.unit,
      logId,
    };
  }

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

  private async fetchComps(dto: PriceSuggestionRequestDto, city: string | null) {
    try {
      const categoryKeywords = this.categoryToKeywords(dto.category);
      const cityFilter = city
        ? { address: { contains: city, mode: 'insensitive' as const } }
        : {};

      return await this.prisma.listing.findMany({
        where: {
          isActive: true,
          status: 'ACTIVE',
          ...cityFilter,
          ...(categoryKeywords.length > 0
            ? {
                OR: categoryKeywords.map((kw) => ({
                  category: {
                    OR: [
                      { name: { contains: kw, mode: 'insensitive' as const } },
                      { slug: { contains: kw, mode: 'insensitive' as const } },
                    ],
                  },
                })),
              }
            : {}),
        },
        select: { pricePerDay: true },
        take: city ? 50 : 200,
      });
    } catch (err) {
      this.logger.error('fetchComps error', err);
      return [];
    }
  }

  private extractPrices(
    comps: { pricePerDay: { toNumber(): number } | number | null }[],
  ): number[] {
    return comps
      .map((c) => {
        if (c.pricePerDay === null) return null;
        return typeof (c.pricePerDay as any).toNumber === 'function'
          ? (c.pricePerDay as any).toNumber()
          : Number(c.pricePerDay);
      })
      .filter((p): p is number => p !== null && p > 0);
  }

  private avg(prices: number[]): number | null {
    if (prices.length === 0) return null;
    return prices.reduce((a, b) => a + b, 0) / prices.length;
  }

  private categoryToKeywords(cat: string): string[] {
    const map: Record<string, string[]> = {
      accommodation:   ['stays', 'accommodation', 'apartment', 'villa', 'holiday'],
      sports_facility: ['sports-facilities', 'tennis', 'football', 'basketball', 'court', 'sport'],
      tool:            ['tools-equipment', 'beach-gear', 'tool', 'equipment', 'gear'],
      vehicle:         ['mobility', 'vehicle', 'car', 'bike', 'scooter'],
      event_space:     ['event-spaces', 'event', 'hall', 'venue'],
    };
    return map[cat] ?? [];
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
