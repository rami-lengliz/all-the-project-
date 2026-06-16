import { Injectable, Logger } from '@nestjs/common';
import { AiService } from './ai.service';
import { ListingsService } from '../listings/listings.service';
import { CategoriesService } from '../categories/categories.service';
import { PrismaService } from '../../database/prisma.service';
import { EmbeddingService } from './embedding.service';
import {
  AiSearchRequestDto,
  AiSearchResponseDto,
  SearchFiltersDto,
} from './dto/ai-search.dto';

// ─── Local-fallback patterns — used when AI returns categorySlug: null ────────
// AI is the primary path for all languages. These are safety nets only.

const CATEGORY_PATTERNS: [RegExp, string][] = [
  [/\b(paddleboard|sup|jet[- ]?ski|kayak|snorkel|plonge|wakeboard|kitesurf|bouee|bouée)\b/i, 'beach-gear'],
  [/\b(padel|tennis|foot(ball)?|futsal|basket(ball)?|volley(ball)?|badminton|squash|handball)\b/i, 'sports-facilities'],
  [/\b(voiture|auto|v[eé]hicule|vehicle|scooter|moto(rbike|cyclette)?|v[eé]lo|bike|bicy?cle|cycle|trottinette|camion|minibus|car|quad|van|karhba|tomobil|sayara)\b/i, 'mobility'],
  [/\b(maison|villa|dar|appartement|studio|logement|s[eé]jour|h[eé]bergement|chalet|bungalow|chambre|house|home|apartment|flat|room|cottage|cabin|beit|stay|lodging)\b/i, 'stays'],
];

// Arabic/Darija word list — pure Unicode escapes, no Arabic source chars, no encoding risk.
// Used ONLY when AI returns categorySlug: null (i.e., AI didn't recognise the Arabic word).
const ARABIC_FALLBACK: [string, string][] = [
  // Mobility
  ['سيارة', 'mobility'], // سيارة
  ['سياره', 'mobility'], // سياره (alt keyboard)
  ['عربية', 'mobility'], // عربية
  ['عربيه', 'mobility'], // عربيه
  ['موتو',       'mobility'], // موتو
  ['دراجة', 'mobility'], // دراجة
  ['مركبة', 'mobility'], // مركبة
  // Stays
  ['بيت',             'stays'],    // بيت
  ['دار',             'stays'],    // دار
  ['شقة',             'stays'],    // شقة
  ['شقه',             'stays'],    // شقه
  ['فيلا',       'stays'],    // فيلا
  ['منزل',       'stays'],    // منزل
  ['شاليه', 'stays'],    // شاليه
  ['غرفة',       'stays'],    // غرفة
  // Sports
  ['ملعب',       'sports-facilities'], // ملعب
  ['بادل',       'sports-facilities'], // بادل
  // Beach gear
  ['كاياك', 'beach-gear'], // كاياك
  ['لوح',             'beach-gear'], // لوح
];

function arabicFallbackCategory(query: string): string | null {
  const norm = query.normalize('NFC');
  for (const [word, slug] of ARABIC_FALLBACK) {
    if (norm.includes(word.normalize('NFC'))) return slug;
  }
  return null;
}

// Slug passthrough — when AI returns old format with categorySlug
const VALID_SLUGS = ['stays', 'mobility', 'sports-facilities', 'beach-gear'];
export const ALLOWED_CATEGORY_SLUGS = VALID_SLUGS;

// Ambiguous terms — need disambiguation before assigning category
const AMBIGUOUS_TERMS: Record<string, {
  question: string;
  field: 'category';
  options: string[];
  resolve: Record<string, string | null>;
}> = {
  paddle: {
    question: 'Vous cherchez un terrain de padel ou un paddleboard ?',
    field:    'category',
    options:  ['Terrain de padel (sport)', 'Paddleboard / SUP (mer)', 'Pas de préférence'],
    resolve:  {
      'Terrain de padel (sport)': 'sports-facilities',
      'Paddleboard / SUP (mer)':  'beach-gear',
      'Pas de préférence':         null,
    },
  },
};

// Follow-up registry — one entry per (slug, field). pickFollowUp walks fields in
// priority order: category → location → dates. Each turn returns at most one.
type FollowUpDef = {
  field:    'dates' | 'location' | 'price' | 'bookingType' | 'category' | 'other';
  question: string;
  options:  string[];
};

const LOCATION_FOLLOWUPS: Record<string, FollowUpDef> = {
  stays: {
    field: 'location',
    question: 'Dans quelle ville cherchez-vous votre logement ?',
    options: ['Près de moi', 'Kelibia', 'Hammamet', 'Nabeul', 'Sousse', 'Djerba', 'Tunis', 'Peu importe'],
  },
  mobility: {
    field: 'location',
    question: 'Où voulez-vous récupérer le véhicule ?',
    options: ['Près de moi', 'Kelibia', 'Hammamet', 'Tunis', 'Sousse', 'Nabeul', 'Peu importe'],
  },
  'sports-facilities': {
    field: 'location',
    question: 'Dans quelle ville cherchez-vous le terrain ?',
    options: ['Près de moi', 'Kelibia', 'Hammamet', 'Tunis', 'Sousse', 'Peu importe'],
  },
  'beach-gear': {
    field: 'location',
    question: 'Sur quelle plage cherchez-vous ?',
    options: ['Près de moi', 'Kelibia', 'Hammamet', 'Nabeul', 'Djerba', 'Peu importe'],
  },
};

const DATE_FOLLOWUPS: Record<string, FollowUpDef> = {
  stays: {
    field: 'dates',
    question: 'Pour quelles dates ?',
    options: ["Aujourd'hui", 'Demain', 'Ce week-end', 'La semaine prochaine', 'Pas de préférence'],
  },
  mobility: {
    field: 'dates',
    question: 'Pour quand avez-vous besoin du véhicule ?',
    options: ["Aujourd'hui", 'Demain', 'Ce week-end', 'La semaine prochaine', 'Pas de préférence'],
  },
  'sports-facilities': {
    field: 'dates',
    question: 'Pour quand souhaitez-vous réserver le terrain ?',
    options: ["Aujourd'hui", 'Demain', 'Ce week-end', 'Pas de préférence'],
  },
  'beach-gear': {
    field: 'dates',
    question: "Pour quand avez-vous besoin de l'équipement ?",
    options: ["Aujourd'hui", 'Demain', 'Ce week-end', 'Pas de préférence'],
  },
};

const GENERIC_CATEGORY_FOLLOWUP: FollowUpDef = {
  field:    'category',
  question: 'Que souhaitez-vous louer ?',
  options:  ['Logement / Villa', 'Voiture / Scooter', 'Terrain de sport', 'Kayak / Équipement de plage'],
};

// Synonyms used to broaden the title/description ILIKE search so "cycle" still
// finds "Vélo électrique", "paddle" finds "Paddleboard", etc.
const SEARCH_SYNONYMS: Record<string, string[]> = {
  cycle:        ['cycle', 'vélo', 'velo', 'bicyclette', 'bike'],
  bicycle:      ['bicycle', 'cycle', 'vélo', 'velo', 'bicyclette'],
  vélo:         ['vélo', 'velo', 'cycle', 'bicyclette', 'bike'],
  velo:         ['velo', 'vélo', 'cycle', 'bicyclette', 'bike'],
  bike:         ['bike', 'vélo', 'velo', 'cycle', 'bicyclette'],
  paddle:       ['paddle', 'paddleboard', 'sup'],
  paddleboard:  ['paddleboard', 'paddle', 'sup'],
  sup:          ['sup', 'paddle', 'paddleboard'],
  voiture:      ['voiture', 'auto', 'car'],
  auto:         ['auto', 'voiture', 'car'],
  car:          ['car', 'voiture', 'auto'],
  scooter:      ['scooter', 'mobylette', 'moto'],
  moto:         ['moto', 'motorbike', 'scooter'],
  van:          ['van', 'minivan', 'fourgon'],
  karhba:       ['karhba', 'voiture', 'car'],
  jetski:       ['jet-ski', 'jetski', 'jet ski'],
  'jet-ski':    ['jet-ski', 'jetski', 'jet ski'],
  kayak:        ['kayak'],
  padel:        ['padel'],
  tennis:       ['tennis'],
  foot:         ['foot', 'football', 'futsal'],
  football:     ['football', 'foot', 'futsal'],
  futsal:       ['futsal', 'foot', 'football'],
  basket:       ['basket', 'basketball'],
  basketball:   ['basketball', 'basket'],
  villa:        ['villa', 'maison'],
  maison:       ['maison', 'villa', 'house'],
  house:        ['house', 'maison', 'villa'],
  dar:          ['dar', 'maison', 'house'],
  appartement:  ['appartement', 'apartment', 'flat'],
  apartment:    ['apartment', 'appartement', 'flat'],
  studio:       ['studio'],
  chalet:       ['chalet', 'bungalow'],
  bungalow:     ['bungalow', 'chalet'],
};

function expandSynonyms(keyword: string): string[] {
  const key = keyword.toLowerCase().trim();
  return SEARCH_SYNONYMS[key] ?? [key];
}

const CITY_COORDS: Record<string, { lat: number; lng: number }> = {
  kelibia:   { lat: 36.8578, lng: 11.092  },
  kerkouane: { lat: 36.8971, lng: 11.1015 },
  tunis:     { lat: 36.8065, lng: 10.1815 },
  hammamet:  { lat: 36.4000, lng: 10.6170 },
  nabeul:    { lat: 36.4561, lng: 10.7376 },
  sousse:    { lat: 35.8256, lng: 10.6369 },
  monastir:  { lat: 35.7643, lng: 10.8113 },
  sfax:      { lat: 34.7406, lng: 10.7603 },
  bizerte:   { lat: 37.2744, lng: 9.8739  },
  djerba:    { lat: 33.8667, lng: 10.8500 },
  gammarth:  { lat: 36.9167, lng: 10.2833 },
  carthage:  { lat: 36.8528, lng: 10.3231 },
};

const BIG_CITY_RADIUS: Record<string, number> = {
  tunis: 30, sousse: 30, sfax: 30, bizerte: 25,
};

const CATEGORY_LABELS: Record<string, string> = {
  stays: 'Séjours', mobility: 'Mobilité',
  'sports-facilities': 'Sports', 'beach-gear': 'Plage & Mer',
};

interface NluResult {
  categorySlug:  string | null;   // AI picks category for ANY language/dialect — no hardcoded map needed
  searchKeyword: string | null;   // specific item word for title search (e.g. "paddle", "kayak", "scooter")
  priceMin:      number | null;
  priceMax:      number | null;
  locationName:  string | null;
  nearSea:       boolean | null;
  availableFrom: string | null;
  availableTo:   string | null;
  amenities:     string[];
  bookingType:   'DAILY' | 'SLOT' | null;
  sortPreference:'price_asc' | 'price_desc' | null;
  mode?: 'RESULT' | 'FOLLOW_UP';
  followUp?: FollowUpDef | null;
}

@Injectable()
export class AiSearchService {
  private readonly logger = new Logger(AiSearchService.name);
  private readonly cache = new Map<string, { result: AiSearchResponseDto; expiresAt: number }>();
  private readonly CACHE_TTL = 5 * 60 * 1_000;

  constructor(
    private readonly aiService: AiService,
    private readonly listingsService: ListingsService,
    private readonly categoriesService: CategoriesService,
    private readonly prisma: PrismaService,
    private readonly embeddingService: EmbeddingService,
  ) {}

  // ─── Public entry point ───────────────────────────────────────────────────

  async search(
    dto: AiSearchRequestDto,
    onProgress?: (event: { type: 'understanding' | 'result' | 'cached'; data: any }) => void,
  ): Promise<AiSearchResponseDto> {
    if (!dto.query.trim()) {
      const result = await this.fallbackSearch(dto);
      onProgress?.({ type: 'result', data: result });
      return result;
    }

    let availableSlugs = dto.availableCategorySlugs ?? [];
    if (!availableSlugs.length && dto.lat && dto.lng) {
      const nearby = await this.categoriesService.findNearbyWithCounts(dto.lat, dto.lng, 50, false);
      availableSlugs = nearby.map((c) => c.slug);
    }

    const cacheEnabled = process.env.NODE_ENV !== 'test';
    const key = this.cacheKey(dto);
    const cached = cacheEnabled ? this.fromCache(key) : null;
    if (cached) {
      onProgress?.({ type: 'cached', data: cached });
      return cached;
    }

    let result: AiSearchResponseDto;
    try {
      result = await this.runSearch(dto, availableSlugs, onProgress);
    } catch (err) {
      this.logger.error('Search failed completely, using basic fallback', err);
      result = await this.fallbackSearch(dto);
    }
    onProgress?.({ type: 'result', data: result });

    if (cacheEnabled && result.mode === 'RESULT') this.toCache(key, result);

    this.prisma.aiSearchLog.create({
      data: {
        query:         dto.query,
        lat:           dto.lat      ?? null,
        lng:           dto.lng      ?? null,
        radiusKm:      dto.radiusKm ?? null,
        followUpAsked: result.mode === 'FOLLOW_UP',
        mode:          result.mode,
        filters:       (result.filters as any) ?? {},
        resultsCount:  result.results?.length ?? 0,
      },
    }).catch((err) => this.logger.warn(`AiSearchLog write failed: ${err.message}`));

    return result;
  }

  // ─── Two-stage pipeline ───────────────────────────────────────────────────
  // Stage 1: AI does narrow NLU extraction (entities, price, city, dates)
  // Stage 2: Deterministic code maps entities → category, decides follow-up

  private async runSearch(
    dto: AiSearchRequestDto,
    availableSlugs: string[],
    onProgress?: (event: { type: 'understanding' | 'result' | 'cached'; data: any }) => void,
  ): Promise<AiSearchResponseDto> {
    let nlu: NluResult;
    try {
      nlu = await this.extractNlu(dto);
    } catch (err) {
      this.logger.warn(`AI NLU failed (${(err as any)?.message ?? err}), using local extraction`);
      nlu = this.localNlu(dto);
    }
    // Backfill any fields the AI missed using the deterministic local NLU
    // (handles Darija dates like "ll jem3a jaya", local city names, "near the sea", etc.)
    const local = this.localNlu(dto);
    nlu = {
      categorySlug:   nlu.categorySlug   ?? local.categorySlug,
      searchKeyword:  nlu.searchKeyword  ?? local.searchKeyword,
      priceMin:       nlu.priceMin       ?? local.priceMin,
      priceMax:       nlu.priceMax       ?? local.priceMax,
      locationName:   nlu.locationName   ?? local.locationName,
      nearSea:        nlu.nearSea        ?? local.nearSea,
      availableFrom:  nlu.availableFrom  ?? local.availableFrom,
      availableTo:    nlu.availableTo    ?? local.availableTo,
      amenities:      nlu.amenities.length ? nlu.amenities : local.amenities,
      bookingType:    nlu.bookingType    ?? local.bookingType,
      sortPreference: nlu.sortPreference ?? local.sortPreference,
      mode:           nlu.mode,
      followUp:       nlu.followUp,
    };
    // Emit early progress: the user sees chips and the AI's understanding as soon as NLU is done,
    // even before the DB query runs. This cuts perceived latency in half.
    if (onProgress) {
      const merged = this.mergeWithPrev(nlu, dto);
      const previewFilters = this.assembleFilters(nlu.categorySlug ?? undefined, merged, dto);
      onProgress({
        type: 'understanding',
        data: {
          filters: previewFilters,
          chips:   this.buildChips(previewFilters),
          reasoning: this.buildReasoning(dto.query, previewFilters, nlu),
        },
      });
    }
    return this.processNlu(nlu, dto, availableSlugs);
  }

  // ─── Stage 1: AI NLU extraction ───────────────────────────────────────────

  private async extractNlu(dto: AiSearchRequestDto): Promise<NluResult> {
    const d = this.dateRefs();

    let ctx = `Query: "${dto.query}"`;
    if (dto.followUpAnswer) ctx += `\nUser answered: "${dto.followUpAnswer}"`;
    if (dto.previousFilters) {
      const prev = Object.fromEntries(
        Object.entries(dto.previousFilters).filter(([, v]) => v != null && v !== ''),
      );
      if (Object.keys(prev).length > 0) ctx += `\nPrevious search context: ${JSON.stringify(prev)}`;
    }

    const prompt = `${ctx}
Dates: today=${d.today} tomorrow=${d.tomorrow} weekend=${d.nextSat}→${d.nextSun} next-week=${d.nextMon}→${d.nextSun2}

Extract rental intent. Return JSON only — no markdown, no explanation:
{"categorySlug":null,"searchKeyword":null,"priceMin":null,"priceMax":null,"locationName":null,"nearSea":null,"availableFrom":null,"availableTo":null,"amenities":[],"bookingType":null,"sortPreference":null}

Rules:
- categorySlug: ONE of "stays"|"mobility"|"sports-facilities"|"beach-gear" — works for ANY language or dialect (French, Arabic, Darija, English, Tunisian slang). Use null ONLY if the query is genuinely ambiguous between two categories (like "paddle" which could be padel sport or paddleboard).
  "stays" = any housing: maison/villa/appartement/logement/chalet/studio/chambre/beit/dar/شقة/بيت/فيلا/منزل/...
  "mobility" = any vehicle: voiture/auto/scooter/moto/vélo/bicycle/cycle/van/karhba/sayara/سيارة/عربية/دراجة/...
  "sports-facilities" = sports venues: padel/tennis/football/basket/futsal/squash/handball/ملعب/بادل/...
  "beach-gear" = water/beach equipment: kayak/paddleboard/SUP/jet-ski/snorkel/كاياك/لوح/...
- searchKeyword: the specific product word from the CURRENT Query only (ignore Previous search context entirely for this field). Set it for any concrete product name in the current query: cycle/vélo/scooter/moto/karhba/van/kayak/paddle/jet-ski/padel/dar/villa/studio/chalet/... Use null ONLY when the current query is vague with NO specific product (e.g. "je cherche quelque chose à louer", "n'importe quoi"). Do NOT copy from Previous search context or User answered option labels.
- priceMax: number if "moins de"/"max"/"ta7t"/"under"/"pas plus de X" — else null (NEVER 0)
- priceMin: number only if a minimum is explicitly stated — else null
- locationName: lowercase city name when present in Query OR in "User answered" (kelibia/tunis/hammamet/nabeul/sousse/djerba/sfax/monastir/bizerte/gammarth/carthage). If "User answered" is just "Près de moi"/"Near me"/"Peu importe"/"Pas de préférence", set null (those mean keep current location). Else null.
- nearSea: true ONLY if the user's original Query explicitly mentions sea/beach proximity: "mer"/"plage"/"beach"/"sea"/"near the sea"/"near sea"/"by the sea"/"bord de mer"/"ba7dha lba7ar"/"قرب البحر". Do NOT set true because "mer" appears inside an option label in "User answered". Else null.
- availableFrom/availableTo: YYYY-MM-DD from date expressions using dates above — else null
- amenities: specific features (piscine/parking/jacuzzi/wifi/terrasse/climatisé) NOT category words
- bookingType: "SLOT" for hourly/créneau | "DAILY" for per-day | null
- sortPreference: "price_asc" if cheapest/r5is/pas cher/moins cher | "price_desc" if luxe/premium | null`;

    const raw = await this.aiService.generateCompletion(prompt, {
      systemPrompt: 'Rental intent extractor. Return ONLY the JSON template filled in. Do not add any other fields or change the format.',
      temperature:  0,
      maxTokens:    512,
      jsonMode:     true,
      // Gemini 2.5-flash burns "thinking" tokens that expand to fill the budget,
      // truncating the JSON to nothing — which silently dropped every query onto
      // the keyword fallback. Skip thinking so intent extraction actually runs.
      reasoningEffort: 'none',
      maxRetries:   0,
      timeoutMs:    8_000,
    });

    return this.parseNlu(raw, dto.query);
  }

  private parseNlu(raw: string, _rawQuery = ''): NluResult {
    const empty: NluResult = {
      categorySlug: null, searchKeyword: null,
      priceMin: null, priceMax: null, locationName: null,
      nearSea: null, availableFrom: null, availableTo: null,
      amenities: [], bookingType: null, sortPreference: null,
    };
    const rawText = typeof raw === 'string' ? raw : '';
    try {
      const s = rawText.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '');
      const d = JSON.parse(s);

      // If AI returned old search format (mode/filters), extract what we can
      if (d.mode && d.filters) {
        const f = d.filters;
        const followUp = d.followUp && typeof d.followUp.question === 'string'
          ? {
              question: String(d.followUp.question),
              field: ['dates', 'location', 'price', 'bookingType', 'category', 'other'].includes(d.followUp.field)
                ? d.followUp.field
                : 'other',
              options: Array.isArray(d.followUp.options) ? d.followUp.options.map(String) : [],
            } as FollowUpDef
          : null;
        return {
          mode:          d.mode === 'FOLLOW_UP' ? 'FOLLOW_UP' : d.mode === 'RESULT' ? 'RESULT' : undefined,
          followUp,
          categorySlug:  VALID_SLUGS.includes(f.categorySlug) ? f.categorySlug : null,
          searchKeyword: typeof f.q === 'string' && f.q.trim() ? f.q.trim().toLowerCase() : null,
          priceMin:      typeof f.minPrice === 'number' && f.minPrice > 0 ? f.minPrice : null,
          priceMax:      typeof f.maxPrice === 'number' && f.maxPrice > 0 ? f.maxPrice : null,
          locationName:  typeof f.city === 'string' && f.city.trim() ? f.city.toLowerCase() : null,
          nearSea:       f.nearSea === true ? true : null,
          availableFrom: typeof f.availableFrom === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(f.availableFrom) ? f.availableFrom : null,
          availableTo:   typeof f.availableTo   === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(f.availableTo)   ? f.availableTo   : null,
          amenities:     Array.isArray(f.amenities) ? f.amenities.map(String).filter(Boolean) : [],
          bookingType:   f.bookingType === 'SLOT' ? 'SLOT' : f.bookingType === 'DAILY' ? 'DAILY' : null,
          sortPreference:null,
        };
      }

      const isDate = (v: any) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);
      const sk = typeof d.searchKeyword === 'string' && d.searchKeyword.trim()
        ? d.searchKeyword.toLowerCase().trim() : null;

      return {
        categorySlug:  VALID_SLUGS.includes(d.categorySlug) ? d.categorySlug : null,
        searchKeyword: sk,
        priceMin:      typeof d.priceMin  === 'number' && d.priceMin  > 0 ? d.priceMin  : null,
        priceMax:      typeof d.priceMax  === 'number' && d.priceMax  > 0 ? d.priceMax  : null,
        locationName:  typeof d.locationName === 'string' && d.locationName.trim()
                         ? d.locationName.toLowerCase().trim() : null,
        nearSea:       d.nearSea === true ? true : null,
        availableFrom: isDate(d.availableFrom) ? d.availableFrom : null,
        availableTo:   isDate(d.availableTo)   ? d.availableTo   : null,
        amenities:     Array.isArray(d.amenities) ? d.amenities.map(String).filter(Boolean) : [],
        bookingType:   d.bookingType === 'SLOT' ? 'SLOT' : d.bookingType === 'DAILY' ? 'DAILY' : null,
        sortPreference:d.sortPreference === 'price_asc' ? 'price_asc'
                       : d.sortPreference === 'price_desc' ? 'price_desc' : null,
      };
    } catch {
      this.logger.warn(`NLU parse failed: ${rawText.substring(0, 150)}`);
      return empty;
    }
  }

  // ─── Local NLU fallback (no API — regex + dictionary, always works) ────────

  private localNlu(dto: AiSearchRequestDto): NluResult {
    const q  = dto.query;
    const ql = q.toLowerCase();
    const d  = this.dateRefs();

    // Price
    const priceMaxM = q.match(/(?:moins de|max|ta7t|under|pas plus de|أقل من)\s*(\d+)/i);
    const priceMinM = q.match(/(?:à partir de|at least|min(?:imum)?)\s*(\d+)/i);

    // City — word-boundary match against known cities
    let locationName: string | null = null;
    for (const city of Object.keys(CITY_COORDS)) {
      if (new RegExp(`\\b${city}\\b`, 'i').test(q)) { locationName = city; break; }
    }

    // Sea proximity — covers French + common Darija transliterations
    const nearSea = /(?:mer\b|plage\b|beach\b|bord de mer|ba7dh[ae]\s+l?b[a7]+ar?|côte\b|بحر|مرسى|ba7r\b|bahr\b)/i.test(q)
      ? true : null;

    // Amenities
    const AMENITIES = ['piscine', 'parking', 'jacuzzi', 'wifi', 'wi-fi', 'terrasse',
      'climatisé', 'clim', 'meublé', 'jardin', 'garage', 'balcon'];
    const amenities = AMENITIES.filter(a => ql.includes(a));

    // Sort preference
    const sortPreference: 'price_asc' | 'price_desc' | null =
      /\b(moins cher|r5is|r5iss|pas cher|économique|budget)\b/i.test(q) ? 'price_asc'
      : /\b(luxe|haut de gamme|premium|vip)\b/i.test(q) ? 'price_desc'
      : null;

    // Booking type
    let bookingType: 'DAILY' | 'SLOT' | null = null;
    if (/\b(créneau|creneau|slot|par heure|hourly)\b/i.test(q)) bookingType = 'SLOT';
    else if (/\b(par jour|journée|per day|daily)\b/i.test(q)) bookingType = 'DAILY';

    // Dates
    let availableFrom: string | null = null;
    let availableTo:   string | null = null;
    const addDays = (base: string, n: number) => {
      const dt = new Date(base); dt.setDate(dt.getDate() + n);
      return dt.toISOString().split('T')[0];
    };

    if      (/\b(aujourd'?hui|lyoum|today|اليوم)\b/i.test(q)) {
      availableFrom = d.today;
    } else if (/\b(demain|ghodwa|tomorrow|غدا)\b/i.test(q)) {
      availableFrom = d.tomorrow; availableTo = d.tomorrow;
    } else if (/\b(après-?demain|apres-?demain)\b/i.test(q)) {
      availableFrom = addDays(d.today, 2);
    } else if (/\b(ce\s?week-?end|le\s?week-?end|el\s?week-?end|fi\s?l?weekend|lweekend)\b/i.test(q)) {
      availableFrom = d.nextSat; availableTo = d.nextSun;
    } else if (/\b(lil?\s?weekend|lil\s?week-?end)\b/i.test(q)) {
      availableFrom = d.nextSat; availableTo = d.nextSun;
    } else if (/\b(?:ll\s+)?(?:semaine\s?prochaine|next\s?week|jem3a\s?jay?a|jm3a\s?jay?a|jum3a\s?jay?a|الأسبوع\s?القادم)\b/i.test(q)) {
      availableFrom = d.nextMon; availableTo = d.nextSun2;
    } else {
      const nightsM = q.match(/(\d+)\s*(?:nuits?|jours?|nights?|days?)/i);
      if (nightsM) {
        const n = parseInt(nightsM[1], 10);
        availableFrom = d.today; availableTo = addDays(d.today, n);
      }
      if (!availableFrom) {
        const MONTHS: Record<string, number> = {
          jan: 0, janv: 0, fev: 1, fév: 1, mar: 2, mars: 2, avr: 3, avril: 3,
          mai: 4, may: 4, juin: 5, jun: 5, juil: 6, juillet: 6, aou: 7, août: 7,
          sep: 8, oct: 9, nov: 10, dec: 11, déc: 11,
        };
        const dateM = q.match(/(\d{1,2})\s+(jan\w*|f[eé]v\w*|mar\w*|avr\w*|mai|juin|jun\w*|juil\w*|ao[uû]\w*|sep\w*|oct\w*|nov\w*|d[eé]c\w*)/i);
        if (dateM) {
          const month = MONTHS[dateM[2].toLowerCase().substring(0, 3)];
          if (month !== undefined) {
            const year = new Date().getFullYear();
            const dt = new Date(year, month, parseInt(dateM[1], 10));
            if (dt < new Date()) dt.setFullYear(year + 1);
            availableFrom = dt.toISOString().split('T')[0];
          }
        }
      }
    }

    // Also resolve follow-up date option buttons
    if (!availableFrom && dto.followUpAnswer) {
      const fa = dto.followUpAnswer;
      if (/aujourd'?hui|today/i.test(fa))            { availableFrom = d.today; }
      else if (/demain|tomorrow/i.test(fa))           { availableFrom = d.tomorrow; availableTo = d.tomorrow; }
      else if (/week-?end/i.test(fa))                 { availableFrom = d.nextSat; availableTo = d.nextSun; }
      else if (/semaine\s?prochaine|next\s?week/i.test(fa)) { availableFrom = d.nextMon; availableTo = d.nextSun2; }
    }

    // Local category detection — used only when the AI is offline
    let categorySlug: string | null = null;
    for (const [pattern, slug] of CATEGORY_PATTERNS) {
      if (pattern.test(ql)) { categorySlug = slug; break; }
    }

    return {
      categorySlug, searchKeyword: null,
      priceMin: priceMinM ? Number(priceMinM[1]) : null,
      priceMax: priceMaxM ? Number(priceMaxM[1]) : null,
      locationName, nearSea, availableFrom, availableTo,
      amenities, bookingType, sortPreference,
    };
  }

  // ─── Stage 2: deterministic logic ────────────────────────────────────────

  private async processNlu(
    nlu: NluResult,
    dto: AiSearchRequestDto,
    availableSlugs: string[],
  ): Promise<AiSearchResponseDto> {
    const followUpUsed = Number(dto.followUpUsed ?? 0);

    // Detect ambiguous terms (e.g. "paddle" = padel sport OR paddleboard water gear)
    const ambiguousKey = this.detectAmbiguity(dto.query);

    // If a known ambiguous word is in the query and the user hasn't answered yet, ask immediately.
    // This takes priority over the AI's category guess — we need explicit user intent first.
    if (ambiguousKey && !dto.followUpAnswer && followUpUsed < 3) {
      const merged0 = this.mergeWithPrev(nlu, dto);
      const filters0 = this.assembleFilters(undefined, merged0, dto);
      return {
        mode: 'FOLLOW_UP',
        followUp: AMBIGUOUS_TERMS[ambiguousKey],
        filters: filters0,
        chips:   this.buildChips(filters0),
        results: [],
      };
    }

    // Use category chosen by AI; validate against available slugs.
    // If AI returned null, try local fallbacks (Latin patterns + Arabic word list).
    const allow = (s: string) => !availableSlugs.length || availableSlugs.includes(s);
    let categorySlug: string | undefined =
      (nlu.categorySlug && allow(nlu.categorySlug)) ? nlu.categorySlug : (() => {
        const arabic = arabicFallbackCategory(dto.query);
        if (arabic && allow(arabic)) return arabic;
        for (const [pat, slug] of CATEGORY_PATTERNS) {
          if (pat.test(dto.query) && allow(slug)) return slug;
        }
        return undefined;
      })();

    // If follow-up answer resolves an ambiguity, apply it
    if (dto.followUpAnswer) {
      for (const amb of Object.values(AMBIGUOUS_TERMS)) {
        const resolved = amb.resolve[dto.followUpAnswer.trim()];
        if (resolved !== undefined) { categorySlug = resolved ?? undefined; break; }
      }
    }

    // Inherit category from previous search only during follow-up (not fresh searches)
    if (!categorySlug && followUpUsed > 0 && dto.previousFilters?.categorySlug) {
      categorySlug = dto.previousFilters.categorySlug;
    }

    // Merge NLU with previous filters
    let merged = this.mergeWithPrev(nlu, dto);

    // When ambiguity resolved, always use the trigger word as searchKeyword —
    // it's what the user typed and most likely to appear in listing titles.
    if (ambiguousKey && categorySlug) {
      merged = { ...merged, searchKeyword: ambiguousKey };
    }

    // Fallback: if AI returned no searchKeyword but the query is a single concrete word
    // (not a vague phrase), use the query word directly — ensures ITEM chip always appears
    // when the user types a specific product name like "cycle", "karhba", "dar", "scooter"
    if (!merged.searchKeyword && categorySlug) {
      const VAGUE = /^(un|une|des|le|la|les|je|cherche|louer|location|quelque|chose|logement|hébergement|sejour|séjour|vehicule|véhicule|equipement|équipement|trouver|besoin|veux|voudrais|bghit|nheb)\b/i;
      const qTrim = dto.query.trim();
      const words = qTrim.split(/\s+/).filter(Boolean);
      if (words.length <= 3 && !VAGUE.test(qTrim)) {
        merged = { ...merged, searchKeyword: words[0].toLowerCase() };
      }
    }

    // Assemble filters and chips
    const filters = this.assembleFilters(categorySlug, merged, dto);
    const chips   = this.buildChips(filters);

    // Smart follow-up: ask for the next missing essential field one at a time
    // (category → location → dates), up to the 3-round budget. pickFollowUp
    // returns null once location and dates are resolved, so a fully-specified
    // query ("villa à Kelibia ce week-end") skips straight to results, while a
    // bare "house" / "cycle" gets asked for location, then dates.
    if (followUpUsed < 3) {
      const followUp = this.pickFollowUp(categorySlug, filters, dto);
      if (followUp) {
        return { mode: 'FOLLOW_UP', followUp, filters, chips, results: [] };
      }
    }

    const { results: rawResults, relaxedConstraints } = await this.fetchListings(filters, dto.lat, dto.lng);

    // Strip relaxed constraints from the returned filters so chips reflect reality.
    const effectiveFilters: SearchFiltersDto = { ...filters };
    if (relaxedConstraints.includes('price'))  { delete effectiveFilters.minPrice; delete effectiveFilters.maxPrice; }
    if (relaxedConstraints.includes('dates'))  { delete effectiveFilters.availableFrom; delete effectiveFilters.availableTo; }
    if (relaxedConstraints.includes('radius')) effectiveFilters.radiusKm = Math.min(200, (filters.radiusKm ?? 20) * 4);

    // Re-rank by blended quality signal (ts_rank × 0.55 + listing rating × 0.30 + popularity × 0.15)
    const results = this.rerankWithQuality(rawResults, !!filters.q);

    // Attach per-result match explanations ("why is this here?").
    const annotated = results.map(r => ({ ...r, matches: this.explainMatch(r, effectiveFilters) }));

    const effectiveChips = this.buildChips(effectiveFilters);
    const stats       = this.buildStats(annotated, effectiveFilters);
    const summary     = this.buildSummary(dto.query, effectiveFilters, stats, relaxedConstraints);
    const suggestions = this.buildSuggestions(effectiveFilters, annotated, stats);
    const reasoning   = this.buildReasoning(dto.query, filters, nlu);

    return {
      mode: 'RESULT',
      filters: effectiveFilters,
      chips: effectiveChips,
      followUp: null,
      results: annotated,
      relaxedConstraints,
      summary, stats, suggestions, reasoning,
    };
  }

  // Per-result explanation: short list of reasons the listing matched the active filters.
  // Frontend renders these as ✓ chips under each card.
  private explainMatch(listing: any, filters: SearchFiltersDto): string[] {
    const matches: string[] = [];
    const title = String(listing.title ?? '').toLowerCase();
    const desc  = String(listing.description ?? '').toLowerCase();
    const text  = `${title} ${desc}`;

    if (filters.q) {
      const syns = expandSynonyms(filters.q).map(s => s.toLowerCase());
      if (syns.some(s => text.includes(s))) matches.push(`Correspond à "${filters.q}"`);
    }
    if (filters.amenities?.length) {
      for (const a of filters.amenities) {
        if (text.includes(a.toLowerCase()))
          matches.push(`Avec ${a.toLowerCase()}`);
      }
    }
    if (filters.nearSea && /\b(mer|plage|beach|sea|c[oô]te|bord)\b|baignade/i.test(text)) {
      matches.push('Bord de mer');
    }
    if (filters.city) {
      const cityLower = filters.city.toLowerCase();
      const addr = String(listing.address ?? '').toLowerCase();
      if (addr.includes(cityLower) || text.includes(cityLower)) {
        matches.push(`À ${filters.city.charAt(0).toUpperCase() + filters.city.slice(1)}`);
      }
    }
    if (filters.maxPrice != null || filters.minPrice != null) {
      const p = Number(listing.pricePerDay ?? listing.pricePerSlot ?? listing.price);
      if (Number.isFinite(p)) {
        const okMax = filters.maxPrice == null || p <= filters.maxPrice;
        const okMin = filters.minPrice == null || p >= filters.minPrice;
        if (okMax && okMin) {
          const label = filters.minPrice && filters.maxPrice
            ? `Prix ${filters.minPrice}–${filters.maxPrice} TND`
            : filters.maxPrice ? `Sous ${filters.maxPrice} TND` : `Dès ${filters.minPrice} TND`;
          matches.push(label);
        }
      }
    }
    if (filters.availableFrom) {
      // The listings query already filters by availability — if the listing is here, it's available.
      const from = new Date(filters.availableFrom);
      const months = ['jan','fév','mar','avr','mai','juin','juil','aoû','sep','oct','nov','déc'];
      const label = filters.availableTo && filters.availableTo !== filters.availableFrom
        ? `Disponible ${from.getUTCDate()}–${new Date(filters.availableTo).getUTCDate()} ${months[from.getUTCMonth()]}`
        : `Disponible le ${from.getUTCDate()} ${months[from.getUTCMonth()]}`;
      matches.push(label);
    }
    if (filters.bookingType === 'SLOT') matches.push('Réservable par créneau');
    return matches;
  }

  // ─── Summary / stats / suggestions ────────────────────────────────────────

  private buildStats(results: any[], filters: SearchFiltersDto) {
    const prices: number[] = [];
    const cities = new Map<string, number>();
    const toNum = (v: any) => (typeof v === 'number' && Number.isFinite(v) ? v : Number(v));
    for (const r of results) {
      const p = toNum(r.pricePerDay ?? r.pricePerSlot ?? r.price ?? r.pricePerNight);
      if (Number.isFinite(p) && p > 0) prices.push(p);
      const city = (r.city ?? r.location?.city ?? r.address?.city) as string | undefined;
      if (city) cities.set(city.toLowerCase(), (cities.get(city.toLowerCase()) ?? 0) + 1);
    }
    const sorted   = [...prices].sort((a, b) => a - b);
    const minPrice = sorted[0];
    const maxPrice = sorted[sorted.length - 1];
    const avgPrice = prices.length ? Math.round(prices.reduce((a, b) => a + b, 0) / prices.length) : undefined;
    const priceUnit = filters.bookingType === 'SLOT' ? 'TND/créneau' : 'TND/jour';
    const topCities = [...cities.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([c]) => c.charAt(0).toUpperCase() + c.slice(1));
    return {
      totalResults: results.length,
      minPrice, maxPrice, avgPrice,
      priceUnit: prices.length ? priceUnit : undefined,
      topCities: topCities.length ? topCities : undefined,
    };
  }

  private buildSummary(
    query: string,
    filters: SearchFiltersDto,
    stats: ReturnType<AiSearchService['buildStats']>,
    relaxed: string[],
  ): string {
    // Zero results — be honest, suggest concrete next steps.
    if (stats.totalResults === 0) {
      const item = filters.q ? filters.q.toLowerCase() : null;
      const where = filters.city ? ` à ${filters.city.charAt(0).toUpperCase() + filters.city.slice(1)}` : '';
      if (item) {
        return `Aucun "${item}" disponible${where} pour vos critères. Essayez une autre ville, retirez la contrainte de date, ou élargissez votre recherche.`;
      }
      return `Aucun résultat pour "${query}". Essayez d'élargir la zone ou de retirer une contrainte.`;
    }

    const catLabel = filters.categorySlug ? (CATEGORY_LABELS[filters.categorySlug] ?? filters.categorySlug) : 'résultats';
    const item = filters.q ? `${filters.q.charAt(0).toUpperCase() + filters.q.slice(1)}` : null;
    const where = filters.city ? `à ${filters.city.charAt(0).toUpperCase() + filters.city.slice(1)}` : 'dans votre zone';
    const price = (stats.minPrice != null && stats.maxPrice != null)
      ? (stats.minPrice === stats.maxPrice
          ? ` à ${stats.minPrice} ${stats.priceUnit}`
          : ` entre ${stats.minPrice} et ${stats.maxPrice} ${stats.priceUnit}`)
      : '';
    const head = item
      ? `J'ai trouvé ${stats.totalResults} ${item.toLowerCase()} (${catLabel.toLowerCase()}) ${where}${price}.`
      : `J'ai trouvé ${stats.totalResults} ${catLabel.toLowerCase()} ${where}${price}.`;

    // Be specific about what was relaxed (only meaningful relaxations).
    const labels: Record<string, string> = {
      price:  'la limite de prix',
      radius: 'la zone géographique',
      dates:  'la contrainte de date',
    };
    const human = relaxed.filter(r => labels[r]).map(r => labels[r]);
    if (human.length) {
      return `${head} Aucun résultat exact — j'ai retiré ${human.join(' et ')}.`;
    }
    return head;
  }

  private buildSuggestions(
    filters: SearchFiltersDto,
    results: any[],
    stats: ReturnType<AiSearchService['buildStats']>,
  ): string[] {
    // Zero-result recovery suggestions — offer specific ways to widen the search.
    if (stats.totalResults === 0) {
      const out: string[] = [];
      if (filters.city) out.push(`Chercher partout en Tunisie`);
      if (filters.availableFrom) out.push(`Sans contrainte de date`);
      if (filters.maxPrice) out.push(`Sans limite de prix`);
      if (filters.q && filters.categorySlug) out.push(`Toutes les ${(CATEGORY_LABELS[filters.categorySlug] ?? filters.categorySlug).toLowerCase()}`);
      if (out.length === 0) out.push('Élargir la zone géographique');
      return out.slice(0, 4);
    }

    const out: string[] = [];
    if (stats.minPrice != null && stats.maxPrice != null && stats.maxPrice > stats.minPrice * 1.5) {
      const mid = Math.round(((stats.avgPrice ?? stats.minPrice) + stats.minPrice) / 2);
      if (!filters.maxPrice) out.push(`Moins de ${mid} ${stats.priceUnit ?? 'TND'}`);
    }
    if (!filters.city && stats.topCities && stats.topCities[0]) {
      out.push(`Seulement à ${stats.topCities[0]}`);
    }
    if (!filters.nearSea && (filters.categorySlug === 'stays' || filters.categorySlug === 'beach-gear')) {
      out.push('Bord de mer uniquement');
    }
    if (filters.categorySlug === 'stays' && results.length > 3) {
      out.push('Avec piscine');
    }
    if (filters.sortBy !== 'price_asc' && results.length > 3) {
      out.push('Trier du moins cher au plus cher');
    }
    return out.slice(0, 4);
  }

  private buildReasoning(query: string, filters: SearchFiltersDto, _nlu: NluResult): string {
    const parts: string[] = [];
    if (filters.categorySlug) parts.push(`catégorie ${CATEGORY_LABELS[filters.categorySlug] ?? filters.categorySlug}`);
    if (filters.q)            parts.push(`mot-clé "${filters.q}" (+ synonymes)`);
    if (filters.city)         parts.push(`ville ${filters.city}`);
    if (filters.nearSea)      parts.push(`bord de mer`);
    if (filters.minPrice != null && filters.maxPrice != null) parts.push(`prix ${filters.minPrice}–${filters.maxPrice} TND`);
    else if (filters.maxPrice != null) parts.push(`max ${filters.maxPrice} TND`);
    else if (filters.minPrice != null) parts.push(`min ${filters.minPrice} TND`);
    if (filters.availableFrom) {
      parts.push(filters.availableTo && filters.availableTo !== filters.availableFrom
        ? `dates ${filters.availableFrom} → ${filters.availableTo}`
        : `date ${filters.availableFrom}`);
    }
    if (filters.amenities?.length) parts.push(`équipements: ${filters.amenities.join(', ')}`);
    if (filters.bookingType) parts.push(`type ${filters.bookingType === 'SLOT' ? 'créneau' : 'journée'}`);
    return parts.length
      ? `Compris depuis "${query}": ${parts.join(', ')}.`
      : `Compris depuis "${query}".`;
  }

  private detectAmbiguity(query: string): string | null {
    for (const key of Object.keys(AMBIGUOUS_TERMS)) {
      if (new RegExp(`\\b${key}\\b`, 'i').test(query)) return key;
    }
    return null;
  }

  // ─── Follow-up selection ─────────────────────────────────────────────────

  private pickFollowUp(
    categorySlug: string | undefined,
    filters: SearchFiltersDto,
    dto: AiSearchRequestDto,
  ): FollowUpDef | null {
    if (!categorySlug) return GENERIC_CATEGORY_FOLLOWUP;

    // 1. Location — ask when no explicit city in filters AND user hasn't already
    //    resolved location ("Près de moi" / "Peu importe" via a previous answer).
    const locationResolved = this.isLocationResolved(filters, dto);
    if (!locationResolved) {
      return LOCATION_FOLLOWUPS[categorySlug] ?? null;
    }

    // 2. Dates — ask once location is resolved.
    if (!filters.availableFrom) {
      return DATE_FOLLOWUPS[categorySlug] ?? null;
    }

    return null;
  }

  // True when the user has either typed/answered a city, said "Près de moi",
  // said "Peu importe", or it was already resolved in a previous turn.
  private isLocationResolved(filters: SearchFiltersDto, dto: AiSearchRequestDto): boolean {
    if (filters.city) return true;
    if ((dto.previousFilters as any)?.locationConfirmed === true) return true;
    // Strip combining diacritical marks (U+0300..U+036F) — pure-ASCII source.
    const DIACRITICS = new RegExp('[\\u0300-\\u036f]', 'g');
    const ans = (dto.followUpAnswer ?? '')
      .toLowerCase()
      .normalize('NFD')
      .replace(DIACRITICS, '');
    return /pres de moi|near me|on my location|peu importe|pas de preference|here\b|ici\b|importe|preference/.test(ans);
  }

  // ─── Filter + chip assembly ───────────────────────────────────────────────

  private mergeWithPrev(nlu: NluResult, dto: AiSearchRequestDto): NluResult {
    const p = dto.previousFilters;
    if (!p) return nlu;
    const prevBt = p.bookingType === 'DAILY' || p.bookingType === 'SLOT' ? p.bookingType : null;
    // searchKeyword from previous turn ONLY during follow-ups (followUpUsed > 0).
    // Fresh searches (followUpUsed === 0) must never inherit the previous item keyword —
    // otherwise "cycle" after "paddle" would show ITEM=Paddle.
    const isFollowUp = (dto.followUpUsed ?? 0) > 0;
    const prevKeyword = isFollowUp && typeof p.q === 'string' && p.q.trim() ? p.q.trim() : null;
    return {
      categorySlug:  nlu.categorySlug,
      searchKeyword: nlu.searchKeyword ?? prevKeyword,
      priceMin:      nlu.priceMin      ?? (p.minPrice      ?? null),
      priceMax:      nlu.priceMax      ?? (p.maxPrice      ?? null),
      locationName:  nlu.locationName  ?? (p.city          ?? null),
      nearSea:       nlu.nearSea       ?? (p.nearSea       ?? null),
      availableFrom: nlu.availableFrom ?? (p.availableFrom ?? null),
      availableTo:   nlu.availableTo   ?? (p.availableTo   ?? null),
      amenities:     nlu.amenities,
      bookingType:   nlu.bookingType   ?? prevBt,
      sortPreference:nlu.sortPreference ?? null,
    };
  }

  private assembleFilters(
    categorySlug: string | undefined,
    nlu: NluResult,
    dto: AiSearchRequestDto,
  ): SearchFiltersDto {
    // Resolve city: prefer AI's extracted locationName; fall back to matching the
    // followUpAnswer against the known city list (the AI sometimes returns null
    // when the answer is just a bare city name like "Kelibia").
    let city: string | undefined = nlu.locationName && CITY_COORDS[nlu.locationName] ? nlu.locationName : undefined;
    if (!city && dto.followUpAnswer) {
      const ansLower = dto.followUpAnswer.toLowerCase().trim();
      for (const k of Object.keys(CITY_COORDS)) {
        if (ansLower === k || ansLower.includes(k)) { city = k; break; }
      }
    }
    // Same fallback against the raw query (city mentioned without prefix word)
    if (!city) {
      const qLower = dto.query.toLowerCase();
      for (const k of Object.keys(CITY_COORDS)) {
        if (new RegExp(`\\b${k}\\b`, 'i').test(qLower)) { city = k; break; }
      }
    }
    const cityRadius = city ? (BIG_CITY_RADIUS[city] ?? 20) : undefined;
    const DIACRITICS_RE = new RegExp('[\\u0300-\\u036f]', 'g');
    const ans = (dto.followUpAnswer ?? '').toLowerCase().normalize('NFD').replace(DIACRITICS_RE, '');
    const noLocPref = /importe|preference|peu importe|pas de preference/.test(ans);
    const nearMe    = /pres de moi|near me|on my location|here|ici/.test(ans);
    const radiusKm = noLocPref ? 200 : (cityRadius ?? dto.radiusKm ?? 20);

    let bookingType = nlu.bookingType;
    if (!bookingType && (categorySlug === 'sports-facilities' || categorySlug === 'beach-gear')) bookingType = 'SLOT';
    if (!bookingType && (categorySlug === 'stays' || categorySlug === 'mobility')) bookingType = 'DAILY';

    // Sticky across turns: once the user has resolved location, don't ask again.
    const prevConfirmed = (dto.previousFilters as any)?.locationConfirmed === true;
    const locationConfirmed = !!city || noLocPref || nearMe || prevConfirmed;

    return {
      categorySlug,
      city,
      // Deterministic nearSea fallback when the AI missed an explicit mention.
      nearSea:       nlu.nearSea ?? (/\b(sea|mer|plage|beach|c[oô]te)\b|bord\s+de\s+mer|ba7dh[ae]?\s+l?b[a7]+ar?|قرب\s*البحر|بحر/i.test(dto.query) ? true : undefined),
      minPrice:      nlu.priceMin      ?? undefined,
      maxPrice:      nlu.priceMax      ?? undefined,
      bookingType:   bookingType       ?? undefined,
      availableFrom: nlu.availableFrom ?? undefined,
      availableTo:   nlu.availableTo   ?? undefined,
      sortBy:        nlu.sortPreference ?? 'distance',
      radiusKm,
      q:             nlu.searchKeyword ?? undefined,
      amenities:     nlu.amenities.length ? nlu.amenities : undefined,
      locationConfirmed: locationConfirmed || undefined,
    };
  }

  private buildChips(filters: SearchFiltersDto): { key: string; label: string }[] {
    const chips: { key: string; label: string }[] = [];
    if (filters.categorySlug)
      chips.push({ key: 'category', label: CATEGORY_LABELS[filters.categorySlug] ?? filters.categorySlug });
    if (filters.q)
      chips.push({ key: 'q', label: filters.q });
    if (filters.amenities?.length) {
      for (const a of filters.amenities)
        chips.push({ key: 'amenity', label: a.charAt(0).toUpperCase() + a.slice(1) });
    }
    if (filters.city)
      chips.push({ key: 'city', label: filters.city.charAt(0).toUpperCase() + filters.city.slice(1) });
    if (filters.nearSea)
      chips.push({ key: 'sea', label: 'Bord de mer' });
    if (filters.maxPrice || filters.minPrice) {
      const label = filters.minPrice && filters.maxPrice
        ? `${filters.minPrice}–${filters.maxPrice} TND`
        : filters.maxPrice ? `Sous ${filters.maxPrice} TND` : `Depuis ${filters.minPrice} TND`;
      chips.push({ key: 'price', label });
    }
    if (filters.availableFrom) {
      const from = new Date(filters.availableFrom);
      const months = ['jan','fév','mar','avr','mai','juin','juil','aoû','sep','oct','nov','déc'];
      const label = filters.availableTo && filters.availableTo !== filters.availableFrom
        ? `${from.getUTCDate()}–${new Date(filters.availableTo).getUTCDate()} ${months[from.getUTCMonth()]}`
        : `${from.getUTCDate()} ${months[from.getUTCMonth()]}`;
      chips.push({ key: 'dates', label });
    }
    if (filters.bookingType === 'SLOT')
      chips.push({ key: 'bookingType', label: 'Par créneau' });
    return chips;
  }

  // ─── Fetch listings with progressive fallback ─────────────────────────────

  private async fetchListings(
    filters: SearchFiltersDto,
    reqLat?: number,
    reqLng?: number,
  ): Promise<{ results: any[]; relaxedConstraints: string[] }> {
    const relaxed: string[] = [];

    let lat = reqLat;
    let lng = reqLng;
    if (filters.city) {
      const coords = CITY_COORDS[filters.city];
      if (coords) { lat = coords.lat; lng = coords.lng; }
    }

    let categoryId: string | undefined;
    if (filters.categorySlug) {
      const cat = await this.categoriesService.findBySlug(filters.categorySlug);
      if (cat) categoryId = cat.id;
    }

    // Build keyword list with synonyms so "cycle" also matches "vélo", "bicyclette", "bike"
    const keywords: string[] = [];
    if (filters.q) keywords.push(...expandSynonyms(filters.q));
    if (filters.nearSea) keywords.push('mer', 'plage');
    const hasKeyword = keywords.length > 0;

    const base: Record<string, any> = {
      ...(categoryId               && { category: categoryId }),
      ...(filters.minPrice != null && { minPrice: filters.minPrice }),
      ...(filters.maxPrice != null && { maxPrice: filters.maxPrice }),
      ...(filters.availableFrom    && { availableFrom: filters.availableFrom }),
      ...(filters.availableTo      && { availableTo: filters.availableTo }),
      ...(filters.sortBy           && { sortBy: filters.sortBy }),
      ...(lat != null              && { lat }),
      ...(lng != null              && { lng }),
      ...(filters.amenities?.length && { amenities: filters.amenities }),
      radiusKm: filters.radiusKm ?? 20,
      limit: 30,
    };

    // Helper: run keyword search across all synonyms in parallel, merged by id.
    const runWithKeywords = async (params: Record<string, any>) => {
      if (!hasKeyword) return this.listingsService.findAll(params);
      const buckets = await Promise.all(
        keywords.map(k => this.listingsService.findAll({ ...params, q: k })),
      );
      const seen = new Map<string, any>();
      for (const bucket of buckets) for (const item of bucket) if (!seen.has(item.id)) seen.set(item.id, item);
      return Array.from(seen.values()).slice(0, 30);
    };

    // ── Progressive relaxation — keyword is SACRED, drop it only as last resort.
    // Order: full -> drop price -> wider radius -> drop dates -> (only then) drop keyword.

    // 1. Full filters
    let results = await runWithKeywords(base);
    if (results.length > 0) return { results, relaxedConstraints: relaxed };

    // 2. Drop price (keep keyword + category + dates + location)
    if (filters.minPrice != null || filters.maxPrice != null) {
      const { minPrice: _a, maxPrice: _b, ...noPrice } = base;
      results = await runWithKeywords(noPrice);
      if (results.length > 0) { relaxed.push('price'); return { results, relaxedConstraints: relaxed }; }
    }

    // 3. Wider radius (keep keyword + category + dates)
    const widerRadius = Math.min(200, (filters.radiusKm ?? 20) * 4);
    if (widerRadius > (filters.radiusKm ?? 20)) {
      const { minPrice: _a, maxPrice: _b, ...wide } = base;
      results = await runWithKeywords({ ...wide, radiusKm: widerRadius });
      if (results.length > 0) {
        if (filters.minPrice != null || filters.maxPrice != null) relaxed.push('price');
        relaxed.push('radius');
        return { results, relaxedConstraints: relaxed };
      }
    }

    // 4. Drop dates (keep keyword + category)
    if (filters.availableFrom) {
      const { minPrice: _a, maxPrice: _b, availableFrom: _c, availableTo: _d, ...noDate } = base;
      results = await runWithKeywords({ ...noDate, radiusKm: widerRadius });
      if (results.length > 0) {
        if (filters.minPrice != null || filters.maxPrice != null) relaxed.push('price');
        relaxed.push('dates');
        return { results, relaxedConstraints: relaxed };
      }
    }

    // 5. Semantic fallback — try vector similarity before giving up.
    // The keyword search (ILIKE + synonym map) is rigid. The embedding index understands
    // "appartement moderne" ≈ "studio rénové" without any synonym entry.
    // Only fires if a keyword search actually happened and we have an embedding provider.
    if (hasKeyword && this.embeddingService.isAvailable) {
      try {
        const semantic = await this.embeddingService.findSimilarListings(filters.q ?? keywords.join(' '), 20);
        // Only trust reasonably-good matches (cosine > 0.55) to avoid Tesla-for-cycle again.
        const goodIds = semantic.filter(s => s.score >= 0.55).map(s => s.id);
        if (goodIds.length > 0) {
          // Fetch full listing payloads in the ranked order, then re-apply category constraint.
          const fetched = await this.listingsService.findManyByIds(goodIds);
          const filtered = categoryId
            ? fetched.filter((l: any) => l.categoryId === categoryId || l.category?.id === categoryId)
            : fetched;
          if (filtered.length > 0) {
            relaxed.push('semantic');
            return { results: filtered.slice(0, 30), relaxedConstraints: relaxed };
          }
        }
      } catch (err: any) {
        this.logger.warn(`Semantic fallback failed: ${err?.message ?? err}`);
      }
    }

    // 6. Last resort — return zero results. Do NOT drop the keyword and show
    // unrelated items (Tesla for "cycle"). The UX layer should show suggestions instead.
    return { results: [], relaxedConstraints: hasKeyword ? ['no-match'] : [] };
  }

  // ─── Fallback (last resort) ───────────────────────────────────────────────

  private async fallbackSearch(dto: AiSearchRequestDto): Promise<AiSearchResponseDto> {
    const filters: SearchFiltersDto = { q: dto.query.trim(), radiusKm: dto.radiusKm || 20, sortBy: 'distance' };
    const chips = dto.query.trim() ? [{ key: 'q', label: dto.query.trim() }] : [];
    const { results, relaxedConstraints } = await this.fetchListings(filters, dto.lat, dto.lng);
    const stats     = this.buildStats(results, filters);
    const summary   = this.buildSummary(dto.query, filters, stats, relaxedConstraints);
    return {
      mode: 'RESULT', filters, chips, followUp: null, results, relaxedConstraints,
      summary, stats,
    };
  }

  // ─── Helpers ──────────────────────────────────────────────────────────────

  private dateRefs() {
    const now = new Date();
    const fmt = (d: Date) => d.toISOString().split('T')[0];
    const today    = fmt(now);
    const tomorrow = fmt(new Date(now.getTime() + 86_400_000));
    const dSat = new Date(now);
    dSat.setDate(dSat.getDate() + ((6 - dSat.getDay() + 7) % 7 || 7));
    const nextSat  = fmt(dSat);
    const nextSun  = fmt(new Date(dSat.getTime() + 86_400_000));
    const dMon = new Date(now);
    dMon.setDate(dMon.getDate() + ((8 - dMon.getDay()) % 7 || 7));
    const nextMon  = fmt(dMon);
    const nextSun2 = fmt(new Date(dMon.getTime() + 6 * 86_400_000));
    return { today, tomorrow, nextSat, nextSun, nextMon, nextSun2 };
  }

  private cacheKey(dto: AiSearchRequestDto): string {
    return JSON.stringify({
      q:   dto.query.trim().toLowerCase(),
      lat: dto.lat  != null ? Math.round(dto.lat  * 100) / 100 : null,
      lng: dto.lng  != null ? Math.round(dto.lng  * 100) / 100 : null,
      fu:  dto.followUpUsed ?? 0,
      fa:  (dto.followUpAnswer ?? '').trim().toLowerCase(),
      pf:  dto.previousFilters ?? null,
    });
  }

  private fromCache(key: string): AiSearchResponseDto | null {
    const entry = this.cache.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) { this.cache.delete(key); return null; }
    return entry.result;
  }

  private toCache(key: string, result: AiSearchResponseDto): void {
    this.cache.set(key, { result, expiresAt: Date.now() + this.CACHE_TTL });
    if (this.cache.size > 200) {
      const now = Date.now();
      for (const [k, v] of this.cache) { if (now > v.expiresAt) this.cache.delete(k); }
    }
  }

  // ─── Quality re-ranker ────────────────────────────────────────────────────
  // Blends DB-computed ts_rank (text relevance) with listing-level quality
  // signals so highly-rated, recently-booked listings surface above equal-text matches.
  // Only applies meaningful reordering when there's a text query; otherwise
  // preserves the DB ordering (distance / recency).
  private rerankWithQuality(results: any[], hasQuery: boolean): any[] {
    if (results.length <= 1) return results;

    const maxTsvRank    = Math.max(1e-6, ...results.map((r) => r.tsvRank ?? 0));
    const maxBookings   = Math.max(1,    ...results.map((r) => r.bookingCount30d ?? 0));

    const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

    const scored = results.map((r, i) => {
      // ts_rank already encodes text relevance; normalise to 0–1.
      const textScore = hasQuery
        ? clamp01((r.tsvRank ?? 0) / maxTsvRank)
        : clamp01(1 - i / results.length); // preserve DB position when no query

      const ratingScore     = clamp01((r.ratingAvg ?? 0) / 5);
      const popularityScore = clamp01((r.bookingCount30d ?? 0) / maxBookings);
      const photoScore      = clamp01((r.images?.length ?? 0) / 5);

      // Weights: text relevance 55%, listing rating 25%, popularity 10%, photo count 10%
      const score = 0.55 * textScore + 0.25 * ratingScore + 0.10 * popularityScore + 0.10 * photoScore;
      return { r, score };
    });

    return scored.sort((a, b) => b.score - a.score).map((s) => s.r);
  }
}
