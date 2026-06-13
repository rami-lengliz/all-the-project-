import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';

const DEFAULT_RADIUS_KM = 50;
const DEFAULT_LIMIT = 20;
const WINDOW_DAYS = 7;
const MIN_FREE_NIGHTS = 3;
const MIN_QUALITY_SCORE = 30;

interface LastMinuteRow {
  id: string;
  title: string;
  description: string;
  address: string;
  images: string[];
  price_per_day: string;
  rating_avg: number;
  rating_count: number;
  quality_score: number;
  booking_type: string;
  free_nights: number;
  distance_km: number | null;
}

/**
 * "Last-minute deals" surface.
 *
 * Rules:
 *   - Listing must be active, non-deleted, approved.
 *   - quality_score ≥ 30 (low-quality listings cheapen the surface).
 *   - ≥ 3 free nights in the next 7 days (fully-booked listings aren't deals;
 *     barely-booked ones are).
 *   - If lat/lng provided, filter to a radius and sort by a blend of
 *     free-night count and proximity.
 *
 * Surfaces dead-inventory hosts would otherwise lose money on, and gives
 * spontaneous renters a real reason to visit the homepage daily.
 */
@Injectable()
export class LastMinuteService {
  constructor(private readonly prisma: PrismaService) {}

  async findDeals(opts: {
    lat?: number;
    lng?: number;
    radiusKm?: number;
    limit?: number;
  }) {
    const limit = Math.min(opts.limit ?? DEFAULT_LIMIT, 50);
    const radiusKm = Math.min(opts.radiusKm ?? DEFAULT_RADIUS_KM, 200);
    const radiusMeters = radiusKm * 1000;

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const windowEnd = new Date(today);
    windowEnd.setDate(windowEnd.getDate() + WINDOW_DAYS);

    const hasGeo =
      typeof opts.lat === 'number' && typeof opts.lng === 'number' &&
      Number.isFinite(opts.lat) && Number.isFinite(opts.lng);

    // Computed in the subquery so we can filter + order on it.
    // All values still go through $queryRawUnsafe parameters — no
    // interpolation of user-controlled input.
    const params: any[] = [today, windowEnd, MIN_QUALITY_SCORE, MIN_FREE_NIGHTS];
    let geoSelect = ', NULL::float AS distance_km';
    let geoFilter = '';
    let orderBy = 'free_nights DESC, quality_score DESC, rating_avg DESC';

    if (hasGeo) {
      params.push(opts.lng, opts.lat, radiusMeters);
      geoSelect = `,
        ST_Distance(
          location::geography,
          ST_SetSRID(ST_MakePoint($5, $6), 4326)::geography
        ) / 1000.0 AS distance_km`;
      geoFilter = `
        AND location IS NOT NULL
        AND ST_DWithin(
          location::geography,
          ST_SetSRID(ST_MakePoint($5, $6), 4326)::geography,
          $7
        )`;
      orderBy = 'free_nights DESC, distance_km ASC, quality_score DESC';
    }

    const sql = `
      WITH candidate AS (
        SELECT
          l.id,
          l.title,
          l.description,
          l.address,
          l.images,
          l."pricePerDay" AS price_per_day,
          l.rating_avg,
          (SELECT COUNT(*)::int FROM reviews rv WHERE rv."listingId" = l.id) AS rating_count,
          l.quality_score,
          l."bookingType" AS booking_type,
          l.location,
          (
            ($2::date - $1::date) - COALESCE((
              SELECT COUNT(DISTINCT d::date)::int
              FROM bookings b,
                   LATERAL generate_series(
                     GREATEST(b."startDate", $1::date),
                     LEAST(b."endDate", $2::date - INTERVAL '1 day'),
                     INTERVAL '1 day'
                   ) AS d
              WHERE b."listingId" = l.id
                AND b.status IN ('confirmed', 'paid', 'completed')
                AND b."startDate" < $2::date
                AND b."endDate"   >= $1::date
            ), 0)
          )::int AS free_nights
        FROM listings l
        WHERE l."isActive" = true
          AND l."deletedAt" IS NULL
          AND l.status = 'ACTIVE'
          AND l.quality_score >= $3
      )
      SELECT
        id, title, description, address, images, price_per_day,
        rating_avg, rating_count, quality_score, booking_type, free_nights
        ${geoSelect}
      FROM candidate
      WHERE free_nights >= $4
      ${geoFilter}
      ORDER BY ${orderBy}
      LIMIT ${limit}
    `;

    const rows = await this.prisma.$queryRawUnsafe<LastMinuteRow[]>(sql, ...params);

    return rows.map((r) => ({
      id: r.id,
      title: r.title,
      description: r.description,
      address: r.address,
      images: r.images,
      pricePerDay: Number(r.price_per_day),
      ratingAvg: Number(r.rating_avg),
      ratingCount: Number(r.rating_count),
      qualityScore: r.quality_score,
      bookingType: r.booking_type,
      freeNights: r.free_nights,
      distanceKm: r.distance_km == null ? null : Number(r.distance_km),
    }));
  }
}
