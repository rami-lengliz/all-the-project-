import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';

/**
 * Quality scoring for listings and hosts.
 *
 * Why this exists:
 *   - Search ranking needs a quality signal beyond raw rating + count.
 *   - Hosts need a visible number they can improve.
 *   - The founder dashboard needs a defensible "top X" list.
 *
 * Design:
 *   - Each score is an integer 0..100.
 *   - Components are independently capped so no single signal can dominate.
 *   - Pure function of DB state (no external calls) — safe to run in a cron.
 *   - Recomputed on relevant events (new booking accepted, new review)
 *     AND nightly for everything (catches stragglers / decayed signals).
 *
 * Listing score (0..100):
 *   - Photos:        ≥5 → 12, 3-4 → 7, 1-2 → 3, 0 → 0
 *   - Description:   ≥200 chars → 10, 100-199 → 6, 40-99 → 3, <40 → 0
 *   - Rating value:  ratingAvg / 5 * 30   (max 30 at 5.0)
 *   - Rating volume: log10(ratingCount+1) * 10, capped at 15
 *   - Bookings 30d:  min(bookingCount30d * 2, 20)
 *   - Slot config:   +5 if SLOT listing and slotConfiguration is set
 *   - Inactive / deleted: hard zero
 *   - Verified host: +5
 *
 * Host score (0..100):
 *   - Verified email: +5
 *   - Verified phone: +5
 *   - Avg listing rating across own listings: ratingAvg / 5 * 40 (max 40)
 *   - Listing count signal: log10(listings+1) * 12, capped at 20
 *   - Recent bookings (30d) across all listings: min(sum * 1.5, 20)
 *   - Has profile photo: +5
 *   - Suspended: hard zero
 */

interface ListingForScoring {
  id: string;
  images: string[];
  description: string;
  ratingAvg: number;
  bookingCount30d: number;
  isActive: boolean;
  deletedAt: Date | null;
  bookingType: 'DAILY' | 'SLOT';
  slotConfiguration: { id: string } | null;
  host: { verifiedEmail: boolean; verifiedPhone: boolean };
}

interface ReviewAggregate {
  _avg: { rating: number | null };
  _count: { _all: number };
}

@Injectable()
export class QualityScoreService implements OnModuleInit {
  private readonly logger = new Logger(QualityScoreService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Self-heal on startup: scores are otherwise only written on booking/review
   * events, so a freshly seeded or restored DB would leave every listing at
   * qualityScore=0 — which silently zeroes out 25% of the recommendation
   * formula and gives "Trending" nothing to rank by. If any active listing is
   * unscored, recompute everything once (in the background, non-blocking).
   */
  async onModuleInit(): Promise<void> {
    try {
      const unscored = await this.prisma.listing.count({
        where: { deletedAt: null, isActive: true, qualityUpdatedAt: null },
      });
      if (unscored > 0) {
        this.logger.log(
          `${unscored} listing(s) have never been scored — running initial quality recompute…`,
        );
        // Don't block app boot; let it run in the background.
        void this.recomputeAll().catch((err) =>
          this.logger.warn(`Initial quality recompute failed: ${err?.message ?? err}`),
        );
      }
    } catch (err: any) {
      this.logger.warn(`Quality startup check failed: ${err?.message ?? err}`);
    }
  }

  // ─── Listing ──────────────────────────────────────────────────────────

  computeListingScore(l: ListingForScoring, reviewCount: number): number {
    if (l.deletedAt || !l.isActive) return 0;

    let score = 0;

    // Photos
    const photos = (l.images ?? []).length;
    score += photos >= 5 ? 12 : photos >= 3 ? 7 : photos >= 1 ? 3 : 0;

    // Description length
    const desc = (l.description ?? '').length;
    score += desc >= 200 ? 10 : desc >= 100 ? 6 : desc >= 40 ? 3 : 0;

    // Rating value
    score += Math.round((Math.min(l.ratingAvg, 5) / 5) * 30);

    // Rating volume (log scale so 50 reviews ≠ 500 → 5 reviews ≠ 50 reviews)
    score += Math.min(15, Math.round(Math.log10(reviewCount + 1) * 10));

    // Recent bookings
    score += Math.min(20, l.bookingCount30d * 2);

    // SLOT listings that bothered configuring slots (signals seriousness)
    if (l.bookingType === 'SLOT' && l.slotConfiguration) score += 5;

    // Verified host bonus
    if (l.host.verifiedEmail || l.host.verifiedPhone) score += 5;

    return Math.max(0, Math.min(100, score));
  }

  async recomputeListing(listingId: string): Promise<number> {
    const listing = await this.prisma.listing.findUnique({
      where: { id: listingId },
      select: {
        id: true,
        images: true,
        description: true,
        ratingAvg: true,
        bookingCount30d: true,
        isActive: true,
        deletedAt: true,
        bookingType: true,
        slotConfiguration: { select: { id: true } },
        host: { select: { verifiedEmail: true, verifiedPhone: true } },
      },
    });

    if (!listing) return 0;

    const reviewCount = await this.prisma.review.count({
      where: { listingId },
    });

    const score = this.computeListingScore(
      listing as ListingForScoring,
      reviewCount,
    );

    await this.prisma.listing.update({
      where: { id: listingId },
      data: { qualityScore: score, qualityUpdatedAt: new Date() },
    });

    return score;
  }

  // ─── Host ─────────────────────────────────────────────────────────────

  computeHostScore(input: {
    verifiedEmail: boolean;
    verifiedPhone: boolean;
    hasAvatar: boolean;
    suspendedAt: Date | null;
    listingCount: number;
    avgRating: number;
    bookings30dTotal: number;
  }): number {
    if (input.suspendedAt) return 0;

    let score = 0;

    if (input.verifiedEmail) score += 5;
    if (input.verifiedPhone) score += 5;
    if (input.hasAvatar) score += 5;

    score += Math.round((Math.min(input.avgRating, 5) / 5) * 40);
    score += Math.min(20, Math.round(Math.log10(input.listingCount + 1) * 12));
    score += Math.min(20, Math.round(input.bookings30dTotal * 1.5));

    return Math.max(0, Math.min(100, score));
  }

  async recomputeHost(userId: string): Promise<number> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        verifiedEmail: true,
        verifiedPhone: true,
        avatarUrl: true,
        suspendedAt: true,
        isHost: true,
      },
    });
    if (!user) return 0;
    if (!user.isHost) {
      // Non-hosts have score 0; still update so the column is meaningful
      await this.prisma.user.update({
        where: { id: userId },
        data: { qualityScore: 0, qualityUpdatedAt: new Date() },
      });
      return 0;
    }

    const [listingCount, ratingAgg, bookingsAgg] = await Promise.all([
      this.prisma.listing.count({
        where: { hostId: userId, deletedAt: null },
      }),
      this.prisma.review.aggregate({
        where: { targetUserId: userId },
        _avg: { rating: true },
        _count: { _all: true },
      }) as Promise<ReviewAggregate>,
      this.prisma.listing.aggregate({
        where: { hostId: userId, deletedAt: null },
        _sum: { bookingCount30d: true },
      }),
    ]);

    const score = this.computeHostScore({
      verifiedEmail: user.verifiedEmail,
      verifiedPhone: user.verifiedPhone,
      hasAvatar: !!user.avatarUrl,
      suspendedAt: user.suspendedAt,
      listingCount,
      avgRating: ratingAgg._avg.rating ?? 0,
      bookings30dTotal: bookingsAgg._sum.bookingCount30d ?? 0,
    });

    await this.prisma.user.update({
      where: { id: userId },
      data: { qualityScore: score, qualityUpdatedAt: new Date() },
    });

    return score;
  }

  // ─── Renter trust score ───────────────────────────────────────────────

  /**
   * Renter trust score is conceptually different from host quality: it
   * combines positive signals (completed bookings, good reviews from hosts,
   * KYC, account age) with *penalty* signals (cancellations, especially
   * last-minute, and disputes opened against this renter by a host).
   *
   * Inputs (sum, clamp 0..100):
   *   +20 max: log-scaled completed bookings
   *   +30 max: avg rating from host reviews — defaults to 15 (neutral) if 0 reviews
   *   −20 max: cancellation rate (cancelled / cancelled+completed)
   *   −15 max: late cancels (cancellations within 24h of start)
   *   −20 max: disputes a host has opened against this renter
   *   +5 KYC verified, +5 verified email, +5 verified phone
   *   +10 max: log-scaled account age in days
   *   suspended → 0
   */
  computeRenterTrustScore(input: {
    completedBookings: number;
    cancelledBookings: number;
    lateCancels: number;
    hostDisputes: number;
    reviewCount: number;
    avgRatingFromHosts: number;
    accountAgeDays: number;
    verifiedEmail: boolean;
    verifiedPhone: boolean;
    kycVerified: boolean;
    suspendedAt: Date | null;
  }): number {
    if (input.suspendedAt) return 0;

    let score = 0;

    // Completed bookings (log-scaled, max 20)
    score += Math.min(20, Math.round(Math.log10(input.completedBookings + 1) * 15));

    // Review signal: average rating from hosts — defaults to 15 for new renters
    // so a fresh account isn't penalised for having no reviews yet.
    if (input.reviewCount > 0) {
      score += Math.min(30, Math.round((Math.min(input.avgRatingFromHosts, 5) / 5) * 30));
    } else {
      score += 15;
    }

    // Cancellation rate penalty
    const totalBookings = input.completedBookings + input.cancelledBookings;
    if (totalBookings > 0) {
      const cancelRate = input.cancelledBookings / totalBookings;
      score -= Math.round(cancelRate * 20);
    }

    // Late cancels (more punitive than regular cancels)
    score -= Math.min(15, input.lateCancels * 5);

    // Host-opened disputes — strongest negative signal
    score -= Math.min(20, input.hostDisputes * 10);

    // Verification bonuses
    if (input.verifiedEmail) score += 5;
    if (input.verifiedPhone) score += 5;
    if (input.kycVerified) score += 5;

    // Account age (log-scaled, max 10)
    score += Math.min(10, Math.round(Math.log10(input.accountAgeDays + 1) * 3));

    return Math.max(0, Math.min(100, score));
  }

  async recomputeRenter(userId: string): Promise<number> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        verifiedEmail: true,
        verifiedPhone: true,
        idVerifiedAt: true,
        suspendedAt: true,
        createdAt: true,
      },
    });
    if (!user) return 0;

    const twentyFourHoursMs = 24 * 60 * 60 * 1000;
    const accountAgeDays = Math.max(
      0,
      Math.floor((Date.now() - new Date(user.createdAt).getTime()) / (1000 * 60 * 60 * 24)),
    );

    const [completed, cancelledRows, reviewAgg, hostDisputes] = await Promise.all([
      this.prisma.booking.count({
        where: { renterId: userId, status: 'completed' },
      }),
      this.prisma.booking.findMany({
        where: { renterId: userId, status: 'cancelled' },
        select: { startDate: true, updatedAt: true },
      }),
      this.prisma.review.aggregate({
        where: { targetUserId: userId, authorRole: 'HOST' },
        _avg: { rating: true },
        _count: { _all: true },
      }) as Promise<ReviewAggregate>,
      this.prisma.dispute.count({
        where: {
          booking: { renterId: userId },
          openedBy: 'HOST',
        },
      }),
    ]);

    // Late cancel = cancelled (updatedAt) within 24h of startDate
    const lateCancels = cancelledRows.filter((b) => {
      const start = new Date(b.startDate).getTime();
      const cancelledAt = new Date(b.updatedAt).getTime();
      return start - cancelledAt < twentyFourHoursMs && cancelledAt < start;
    }).length;

    const score = this.computeRenterTrustScore({
      completedBookings: completed,
      cancelledBookings: cancelledRows.length,
      lateCancels,
      hostDisputes,
      reviewCount: reviewAgg._count._all,
      avgRatingFromHosts: reviewAgg._avg.rating ?? 0,
      accountAgeDays,
      verifiedEmail: user.verifiedEmail,
      verifiedPhone: user.verifiedPhone,
      kycVerified: !!user.idVerifiedAt,
      suspendedAt: user.suspendedAt,
    });

    await this.prisma.user.update({
      where: { id: userId },
      data: { renterTrustScore: score, renterTrustUpdatedAt: new Date() },
    });

    return score;
  }

  // ─── Bulk / cron ──────────────────────────────────────────────────────

  /**
   * Recompute every active listing, host, and renter. Designed to run nightly
   * via cron. Bounded concurrency so we don't blow up the DB on a big table.
   */
  async recomputeAll(opts?: { concurrency?: number }): Promise<{
    listings: number;
    hosts: number;
    renters: number;
  }> {
    const concurrency = opts?.concurrency ?? 5;
    const start = Date.now();

    const [listings, hosts, renters] = await Promise.all([
      this.prisma.listing.findMany({
        where: { deletedAt: null },
        select: { id: true },
      }),
      this.prisma.user.findMany({
        where: { isHost: true, suspendedAt: null },
        select: { id: true },
      }),
      // Score every non-suspended user as a renter — even hosts rent things,
      // so they accumulate a renter trust score too.
      this.prisma.user.findMany({
        where: { suspendedAt: null },
        select: { id: true },
      }),
    ]);

    await this.runBounded(
      listings.map((l) => () => this.recomputeListing(l.id)),
      concurrency,
    );
    await this.runBounded(
      hosts.map((h) => () => this.recomputeHost(h.id)),
      concurrency,
    );
    await this.runBounded(
      renters.map((r) => () => this.recomputeRenter(r.id)),
      concurrency,
    );

    const ms = Date.now() - start;
    this.logger.log(
      `Quality recompute done: ${listings.length} listings + ${hosts.length} hosts + ${renters.length} renters in ${ms}ms`,
    );
    return {
      listings: listings.length,
      hosts: hosts.length,
      renters: renters.length,
    };
  }

  private async runBounded<T>(tasks: (() => Promise<T>)[], concurrency: number) {
    const results: T[] = [];
    let i = 0;
    const workers = Array.from({ length: concurrency }, async () => {
      while (i < tasks.length) {
        const idx = i++;
        try {
          results[idx] = await tasks[idx]();
        } catch (err: any) {
          this.logger.warn(`Quality recompute task ${idx} failed: ${err?.message ?? err}`);
        }
      }
    });
    await Promise.all(workers);
    return results;
  }
}
