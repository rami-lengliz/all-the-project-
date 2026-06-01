import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { InteractionKind, Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { EmbeddingService } from '../ai/embedding.service';

/**
 * Personalization engine.
 *
 * Pipeline:
 *   1. Every meaningful user action (view/wishlist/message/booking/review) is
 *      logged as a UserInteraction row, weighted by signal strength.
 *   2. The user's preferenceVector is the recency-weighted average of the
 *      embeddings of recently-interacted listings. Recomputed eagerly on
 *      strong signals (booking, wishlist, review) and lazily on read.
 *   3. recommend() scores candidate listings against the user vector using:
 *        0.40 × cosine(user, listing)      semantic similarity
 *      + 0.25 × listing.qualityScore/100   quality boost
 *      + 0.15 × location_proximity         distance falloff
 *      + 0.10 × category_affinity          share of past interactions in this cat
 *      + 0.10 × freshness                  gentle boost for new listings
 *      Then multipliers / exclusions for recency, KYC, and self-listings.
 *
 * Cold start: users with <3 interactions get a quality+location+diversity feed.
 */

/** Weight per interaction kind. Booking is strongest (real action, paid). */
const KIND_WEIGHT: Record<InteractionKind, number> = {
  BOOKING: 5,
  REVIEW: 4,
  WISHLIST_ADD: 3,
  MESSAGE: 3,
  WISHLIST_REMOVE: -2, // negative signal
  VIEW: 1,
};

/** Recompute the user vector if it's older than this. */
const USER_VECTOR_TTL_MS = 6 * 60 * 60 * 1000; // 6h

/** How many recent interactions to consider when building the user vector. */
const RECENT_INTERACTION_LIMIT = 100;

/** Days over which interaction weight decays to 1/e. */
const RECENCY_HALF_LIFE_DAYS = 30;

const COLD_START_THRESHOLD = 3;

/** Scoring weights (must sum to 1.0). */
const WEIGHTS = {
  similarity: 0.4,
  quality: 0.25,
  location: 0.15,
  category: 0.1,
  freshness: 0.1,
};

interface RecommendOptions {
  limit?: number;
  offset?: number;
  lat?: number;
  lng?: number;
  excludeIds?: string[];
}

interface ScoredListing {
  listing: any;
  score: number;
  reasons: string[];
}

const EMBED_TOPUP_INTERVAL_MS = 5 * 60 * 1_000; // top-up every 5 min

@Injectable()
export class PersonalizationService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PersonalizationService.name);
  private topUpTimer: ReturnType<typeof setInterval> | null = null;
  private backfilling = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly embedding: EmbeddingService,
  ) {}

  // ───────────────────────────────────────────────────────────────────────
  // Lifecycle: keep listing embeddings populated
  // ───────────────────────────────────────────────────────────────────────

  onModuleInit(): void {
    if (!this.embedding.isAvailable) {
      this.logger.warn('GEMINI_API_KEY not set — personalization cold-start only.');
      return;
    }
    void this.runBackfill();
    this.topUpTimer = setInterval(() => void this.runBackfill(), EMBED_TOPUP_INTERVAL_MS);
    this.topUpTimer.unref?.();
  }

  onModuleDestroy(): void {
    if (this.topUpTimer) clearInterval(this.topUpTimer);
  }

  async runBackfill(): Promise<{ embedded: number; remaining: number }> {
    if (this.backfilling || !this.embedding.isAvailable) return { embedded: 0, remaining: 0 };
    this.backfilling = true;
    let total = 0;
    let remaining = 0;
    try {
      // Drain in passes of 200 so a fresh DB gets fully embedded on first start.
      for (let i = 0; i < 25; i++) {
        const { embedded, remaining: rem } = await this.embedding.backfillMissingEmbeddings(200);
        total += embedded;
        remaining = rem;
        if (embedded === 0 || rem === 0) break;
      }
      if (total > 0) this.logger.log(`Embedding backfill: +${total} embedded, ${remaining} remaining`);
    } catch (err: any) {
      this.logger.warn(`Embedding backfill error: ${err?.message}`);
    } finally {
      this.backfilling = false;
    }
    return { embedded: total, remaining };
  }

  async embeddingStats() {
    const [total, embedded] = await Promise.all([
      this.prisma.listing.count({ where: { isActive: true, deletedAt: null } }),
      this.prisma.listing.count({ where: { isActive: true, deletedAt: null, embeddingUpdatedAt: { not: null } } }),
    ]);
    return { available: this.embedding.isAvailable, total, embedded, missing: total - embedded };
  }

  // ───────────────────────────────────────────────────────────────────────
  // Interaction logging
  // ───────────────────────────────────────────────────────────────────────

  /**
   * Record a user-listing interaction. Fire-and-forget — never throws, so it
   * can be wired into booking/wishlist/review flows without risking the
   * primary operation.
   */
  async recordInteraction(
    userId: string,
    listingId: string,
    kind: InteractionKind,
  ): Promise<void> {
    try {
      // Skip self-interactions (host viewing their own listing)
      const listing = await this.prisma.listing.findUnique({
        where: { id: listingId },
        select: { hostId: true },
      });
      if (!listing || listing.hostId === userId) return;

      // Dedup VIEW: don't record more than one view per (user, listing) per hour.
      if (kind === 'VIEW') {
        const recent = await this.prisma.userInteraction.findFirst({
          where: {
            userId,
            listingId,
            kind: 'VIEW',
            createdAt: { gte: new Date(Date.now() - 60 * 60 * 1000) },
          },
          select: { id: true },
        });
        if (recent) return;
      }

      await this.prisma.userInteraction.create({
        data: {
          userId,
          listingId,
          kind,
          weight: KIND_WEIGHT[kind],
        },
      });

      // Strong signals: invalidate the cached vector so the next read recomputes.
      if (kind === 'BOOKING' || kind === 'WISHLIST_ADD' || kind === 'REVIEW') {
        await this.prisma.user.update({
          where: { id: userId },
          data: { preferenceVectorUpdatedAt: null },
        });
      }
    } catch (err: any) {
      this.logger.warn(`recordInteraction failed (${kind}): ${err?.message}`);
    }
  }

  // ───────────────────────────────────────────────────────────────────────
  // User preference vector
  // ───────────────────────────────────────────────────────────────────────

  /** Get the user's preference vector, recomputing if stale or never built. */
  async getUserVector(userId: string): Promise<number[] | null> {
    const u = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { preferenceVector: true, preferenceVectorUpdatedAt: true },
    });
    if (!u) return null;
    const stale =
      !u.preferenceVectorUpdatedAt ||
      Date.now() - u.preferenceVectorUpdatedAt.getTime() > USER_VECTOR_TTL_MS;
    if (!stale && u.preferenceVector.length > 0) return u.preferenceVector;
    return this.recomputeUserVector(userId);
  }

  /** Force-recompute and persist the user's preference vector. */
  async recomputeUserVector(userId: string): Promise<number[] | null> {
    const interactions = await this.prisma.userInteraction.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: RECENT_INTERACTION_LIMIT,
      include: {
        listing: {
          select: { id: true, embedding: true, embeddingUpdatedAt: true },
        },
      },
    });

    if (interactions.length === 0) {
      await this.prisma.user.update({
        where: { id: userId },
        data: { preferenceVector: [], preferenceVectorUpdatedAt: new Date() },
      });
      return null;
    }

    // Sum (weight × decay × listing_embedding) across interactions.
    const now = Date.now();
    const dim = this.findFirstEmbeddingDimension(interactions);
    if (!dim) return null;

    const accum = new Array<number>(dim).fill(0);
    let totalWeight = 0;

    for (const i of interactions) {
      if (!i.listing.embedding || i.listing.embedding.length !== dim) continue;
      const ageDays = (now - i.createdAt.getTime()) / 86_400_000;
      const decay = Math.exp(-ageDays / RECENCY_HALF_LIFE_DAYS);
      const effectiveWeight = i.weight * decay;
      if (effectiveWeight === 0) continue;
      for (let k = 0; k < dim; k++) {
        accum[k] += i.listing.embedding[k] * effectiveWeight;
      }
      totalWeight += Math.abs(effectiveWeight);
    }

    if (totalWeight === 0) return null;

    const vec = accum.map((v) => v / totalWeight);
    await this.prisma.user.update({
      where: { id: userId },
      data: { preferenceVector: vec, preferenceVectorUpdatedAt: new Date() },
    });
    return vec;
  }

  // ───────────────────────────────────────────────────────────────────────
  // Recommend
  // ───────────────────────────────────────────────────────────────────────

  /**
   * Return a personalized, ranked feed for a user. Logged-out / cold-start
   * users get a quality + location + diversity feed instead.
   */
  async recommend(
    userId: string | null,
    opts: RecommendOptions = {},
  ): Promise<ScoredListing[]> {
    try {
    const limit = Math.min(opts.limit ?? 20, 50);
    const offset = opts.offset ?? 0;

    const candidatePool = limit * 5 + offset;
    const excludeSet = new Set(opts.excludeIds ?? []);

    // Use Prisma queries (not raw SQL) to avoid PostgreSQL enum-cast issues.
    if (userId) {
      const [ownedListings, recentBookings] = await Promise.all([
        this.prisma.listing.findMany({
          where: { hostId: userId },
          select: { id: true },
        }),
        this.prisma.booking.findMany({
          where: {
            renterId: userId,
            status: { in: ['pending', 'confirmed', 'paid', 'completed'] as any[] },
            createdAt: { gte: new Date(Date.now() - 30 * 86_400_000) },
          },
          select: { listingId: true },
        }),
      ]);
      for (const l of ownedListings) excludeSet.add(l.id);
      for (const b of recentBookings) excludeSet.add(b.listingId);
    }

    const [userVector, userMeta] = await Promise.all([
      userId ? this.getUserVector(userId) : Promise.resolve(null),
      userId
        ? this.prisma.user.findUnique({
            where: { id: userId },
            select: { homeLat: true, homeLng: true },
          })
        : Promise.resolve(null),
    ]);
    const isColdStart = !userVector || userVector.length === 0;
    const lat = opts.lat ?? userMeta?.homeLat ?? null;
    const lng = opts.lng ?? userMeta?.homeLng ?? null;

    const candidates = await this.prisma.listing.findMany({
      where: {
        isActive: true,
        deletedAt: null,
        status: 'ACTIVE' as any,
        ...(excludeSet.size > 0 ? { id: { notIn: [...excludeSet] } } : {}),
      },
      include: {
        category: { select: { id: true, name: true, slug: true } },
        host: {
          select: {
            id: true,
            name: true,
            avatarUrl: true,
            idVerifiedAt: true,
            qualityScore: true,
          },
        },
      },
      take: candidatePool,
    });

    // Category affinity from the user's recent interactions.
    const catAffinity = userId ? await this.computeCategoryAffinity(userId) : new Map<string, number>();

    // Real coordinates per candidate. Prisma can't read the PostGIS `location`
    // column, so without this every listing would score a flat 0.5 proximity
    // and the user's lat/lng would be ignored. One raw query covers the pool.
    const coordsById =
      lat != null && lng != null
        ? await this.fetchCoords(candidates.map((c) => c.id))
        : new Map<string, { lat: number; lng: number }>();

    const scored: ScoredListing[] = candidates.map((l) => {
      const reasons: string[] = [];
      let simScore = 0;
      if (!isColdStart && l.embedding.length === userVector!.length) {
        simScore = clamp01(
          (this.embedding.cosineSimilarity(userVector!, l.embedding) + 1) / 2, // [-1,1] → [0,1]
        );
      }
      const qualityScore = clamp01((l.qualityScore ?? 0) / 100);
      const c = coordsById.get(l.id);
      const proximityScore =
        lat != null && lng != null && c
          ? 1 / (1 + haversineKm(lat, lng, c.lat, c.lng) / 10)
          : 0.5;
      const catScore = catAffinity.get(l.categoryId) ?? 0;
      const freshnessScore = this.freshnessBoost(l.createdAt);

      let score: number;
      if (isColdStart) {
        // Random jitter (±5%) so the order varies each visit for new users.
        score = 0.5 * qualityScore + 0.3 * proximityScore + 0.2 * freshnessScore + Math.random() * 0.05;
        // Pick the badge from whichever signal is this listing's strongest, so
        // a row of cold-start cards shows varied, honest reasons instead of all
        // reading the same thing. Order matters: location (when known) and the
        // listing's own merits (rating, verified host) come before "just listed",
        // otherwise a freshly-seeded catalog makes every card read "Just listed".
        reasons.push(this.coldStartReason({ proximityScore, qualityScore, freshnessScore, verified: !!l.host?.idVerifiedAt, hasLoc: lat != null && lng != null }));
      } else {
        score =
          WEIGHTS.similarity * simScore +
          WEIGHTS.quality * qualityScore +
          WEIGHTS.location * proximityScore +
          WEIGHTS.category * catScore +
          WEIGHTS.freshness * freshnessScore;

        if (simScore > 0.6) reasons.push('Matches what you usually like');
        else if (catScore > 0.4) reasons.push(`More ${l.category?.name ?? 'like this'}`);
        else if (proximityScore >= 0.6 && lat != null && lng != null) reasons.push('Near you');
        else if (qualityScore >= 0.15) reasons.push('Highly rated');
        else reasons.push('Try something new');
      }

      // Multipliers
      if (l.host?.idVerifiedAt) {
        score *= 1.1;
        if (reasons.length === 1 && reasons[0] === 'Try something new') {
          reasons[0] = 'Verified host';
        }
      }

      return { listing: l, score, reasons };
    });

    scored.sort((a, b) => b.score - a.score);
    const result = scored.slice(offset, offset + limit);

    // Hard fallback: if scoring produced nothing (e.g. new user, empty DB shard),
    // return a randomly-shuffled grab of any active listings so the page is never blank.
    if (result.length === 0) {
      const fallback = await this.prisma.listing.findMany({
        where: { isActive: true, deletedAt: null, status: 'ACTIVE' as any },
        include: {
          category: { select: { id: true, name: true, slug: true } },
          host: { select: { id: true, name: true, avatarUrl: true, idVerifiedAt: true, qualityScore: true } },
        },
        take: limit,
        orderBy: { createdAt: 'desc' },
      });
      for (let i = fallback.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [fallback[i], fallback[j]] = [fallback[j], fallback[i]] as any;
      }
      return fallback.map((l) => ({ listing: l, score: 0, reasons: ['Worth exploring'] }));
    }

    return result;
    } catch (err: any) {
      this.logger.error(`recommend() failed: ${err?.message}`, err?.stack);
      return [];
    }
  }

  /**
   * Pure content similarity: given a listing, find the K most similar other
   * listings by embedding cosine similarity. Used by the "You might also like"
   * carousel on the listing detail page.
   */
  async findSimilarListings(listingId: string, limit = 6): Promise<any[]> {
    const target = await this.prisma.listing.findUnique({
      where: { id: listingId },
      select: { id: true, embedding: true, categoryId: true, hostId: true },
    });
    if (!target || target.embedding.length === 0) {
      // Fallback: same-category, highest qualityScore
      return this.prisma.listing.findMany({
        where: {
          id: { not: listingId },
          categoryId: target?.categoryId,
          isActive: true,
          deletedAt: null,
          status: 'ACTIVE' as any,
        },
        orderBy: [{ qualityScore: 'desc' }, { ratingAvg: 'desc' }],
        take: limit,
        include: {
          category: { select: { id: true, name: true, slug: true } },
          host: { select: { id: true, name: true, avatarUrl: true, idVerifiedAt: true } },
        },
      });
    }

    // Pull a candidate pool and score in app — fine up to ~10k listings.
    const pool = await this.prisma.listing.findMany({
      where: {
        id: { not: listingId },
        isActive: true,
        deletedAt: null,
        status: 'ACTIVE' as any,
        embeddingUpdatedAt: { not: null },
      },
      select: { id: true, embedding: true },
      take: 1000,
    });
    const scored = pool
      .filter((l) => l.embedding.length === target.embedding.length)
      .map((l) => ({
        id: l.id,
        score: this.embedding.cosineSimilarity(target.embedding, l.embedding),
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);

    if (scored.length === 0) return [];
    const ids = scored.map((s) => s.id);
    const listings = await this.prisma.listing.findMany({
      where: { id: { in: ids } },
      include: {
        category: { select: { id: true, name: true, slug: true } },
        host: { select: { id: true, name: true, avatarUrl: true, idVerifiedAt: true } },
      },
    });
    // Preserve the cosine-similarity order.
    const byId = new Map(listings.map((l) => [l.id, l]));
    return ids.map((id) => byId.get(id)).filter(Boolean);
  }

  /**
   * "Trending this week" — listings with the most confirmed/paid/completed
   * bookings in the last 7 days. Falls back to top-quality listings when there
   * isn't enough recent booking activity (e.g. a fresh deployment).
   */
  async trending(limit = 8): Promise<any[]> {
    const since = new Date(Date.now() - 7 * 86_400_000);
    const include = {
      category: { select: { id: true, name: true, slug: true } },
      host: { select: { id: true, name: true, avatarUrl: true, idVerifiedAt: true } },
    };
    try {
      const grouped = await this.prisma.booking.groupBy({
        by: ['listingId'],
        where: {
          createdAt: { gte: since },
          status: { in: ['confirmed', 'paid', 'completed'] as any[] },
        },
        _count: { listingId: true },
        orderBy: { _count: { listingId: 'desc' } },
        take: limit,
      });
      const ids = grouped.map((g) => g.listingId).filter(Boolean) as string[];
      if (ids.length > 0) {
        const listings = await this.prisma.listing.findMany({
          where: { id: { in: ids }, isActive: true, deletedAt: null, status: 'ACTIVE' as any },
          include,
        });
        const byId = new Map(listings.map((l) => [l.id, l]));
        const ordered = ids.map((id) => byId.get(id)).filter(Boolean);
        if (ordered.length > 0) return ordered;
      }
    } catch (err: any) {
      this.logger.warn(`trending() failed, falling back to quality: ${err?.message}`);
    }
    // Fallback: highest-quality, newest active listings.
    return this.prisma.listing.findMany({
      where: { isActive: true, deletedAt: null, status: 'ACTIVE' as any },
      orderBy: [{ qualityScore: 'desc' }, { createdAt: 'desc' }],
      take: limit,
      include,
    });
  }

  /**
   * "Because you viewed X" — finds the most recent listing the user viewed and
   * returns listings semantically similar to it. Returns null for anonymous
   * users or users with no view history, so the UI can hide the row.
   */
  async becauseYouViewed(
    userId: string | null,
    limit = 8,
  ): Promise<{ seed: any; items: any[] } | null> {
    if (!userId) return null;
    try {
      const lastView = await this.prisma.userInteraction.findFirst({
        where: { userId, kind: 'VIEW' },
        orderBy: { createdAt: 'desc' },
        include: {
          listing: {
            include: {
              category: { select: { id: true, name: true, slug: true } },
              host: { select: { id: true, name: true, avatarUrl: true, idVerifiedAt: true } },
            },
          },
        },
      });
      if (!lastView?.listing) return null;
      const items = await this.findSimilarListings(lastView.listingId, limit);
      if (!items || items.length === 0) return null;
      return { seed: lastView.listing, items };
    } catch (err: any) {
      this.logger.warn(`becauseYouViewed() failed: ${err?.message}`);
      return null;
    }
  }

  // ───────────────────────────────────────────────────────────────────────
  // Internal helpers
  // ───────────────────────────────────────────────────────────────────────

  private findFirstEmbeddingDimension(
    interactions: { listing: { embedding: number[] } }[],
  ): number | null {
    for (const i of interactions) {
      if (i.listing.embedding && i.listing.embedding.length > 0) {
        return i.listing.embedding.length;
      }
    }
    return null;
  }

  private async computeCategoryAffinity(userId: string): Promise<Map<string, number>> {
    const interactions = await this.prisma.userInteraction.findMany({
      where: {
        userId,
        createdAt: { gte: new Date(Date.now() - 60 * 86_400_000) },
      },
      select: {
        weight: true,
        listing: { select: { categoryId: true } },
      },
    });

    const categoryWeights = new Map<string, number>();
    for (const i of interactions) {
      const catId = i.listing?.categoryId;
      if (!catId) continue;
      categoryWeights.set(catId, (categoryWeights.get(catId) ?? 0) + i.weight);
    }

    const total = [...categoryWeights.values()].reduce((sum, w) => sum + Math.max(0, w), 0);
    const map = new Map<string, number>();
    if (total > 0) {
      for (const [catId, weight] of categoryWeights) {
        map.set(catId, Math.max(0, weight) / total);
      }
    }
    return map;
  }

  /**
   * Choose a single cold-start badge for a listing based on its strongest
   * trait. Prioritises location and the listing's own merits over freshness so
   * a brand-new catalogue doesn't make every card read "Just listed".
   */
  private coldStartReason(s: {
    proximityScore: number;
    qualityScore: number;
    freshnessScore: number;
    verified: boolean;
    hasLoc: boolean;
  }): string {
    if (s.hasLoc && s.proximityScore >= 0.6) return 'Near you';
    if (s.qualityScore >= 0.15) return 'Highly rated';
    if (s.verified) return 'Verified host';
    if (s.freshnessScore > 0.3) return 'Just listed';
    return 'Popular pick';
  }

  /**
   * Fetch real lat/lng for a set of listings. The PostGIS `location` column is
   * an Unsupported type in Prisma and can't be read via findMany, so we pull
   * it out with ST_Y/ST_X in one raw query. Rows with null geometry are skipped.
   */
  private async fetchCoords(
    ids: string[],
  ): Promise<Map<string, { lat: number; lng: number }>> {
    const map = new Map<string, { lat: number; lng: number }>();
    if (ids.length === 0) return map;
    try {
      const rows = await this.prisma.$queryRaw<
        { id: string; lat: number | null; lng: number | null }[]
      >`
        SELECT id,
               ST_Y(location::geometry) AS lat,
               ST_X(location::geometry) AS lng
        FROM listings
        WHERE id IN (${Prisma.join(ids)}) AND location IS NOT NULL
      `;
      for (const r of rows) {
        if (r.lat != null && r.lng != null) {
          map.set(r.id, { lat: Number(r.lat), lng: Number(r.lng) });
        }
      }
    } catch (err: any) {
      this.logger.warn(`fetchCoords failed: ${err?.message}`);
    }
    return map;
  }

  /** Gentle boost for listings <14 days old (anti-cold-start for new hosts). */
  private freshnessBoost(createdAt: Date): number {
    const days = (Date.now() - createdAt.getTime()) / 86_400_000;
    if (days < 14) return 1 - days / 14;
    return 0;
  }
}

function clamp01(x: number): number {
  if (!Number.isFinite(x)) return 0;
  return Math.max(0, Math.min(1, x));
}

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}
