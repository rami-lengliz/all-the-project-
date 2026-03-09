import { Injectable, NotFoundException, OnModuleDestroy } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { Category, Prisma } from '@prisma/client';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';

// ── In-memory TTL cache for findNearbyWithCounts ──────────────────────────────
// Keyed by "lat:lng:radiusKm:includeEmpty". Entries expire after TTL_MS.
// A periodic sweeper prevents unbounded growth.

type CachedEntry = {
  data: Array<{ id: string; name: string; slug: string; icon: string | null; count: number }>;
  expiresAt: number;
};

const TTL_MS = 45_000;   // 45 seconds — absorbs demo page refreshes
const SWEEP_MS = 60_000; // GC sweep every 60 seconds

function roundCoord(n: number) { return Math.round(n * 1e4) / 1e4; }

@Injectable()
export class CategoriesService implements OnModuleDestroy {
  constructor(private prisma: PrismaService) {
    this._sweepTimer = setInterval(() => this._sweep(), SWEEP_MS);
  }

  private _cache = new Map<string, CachedEntry>();
  private _sweepTimer: ReturnType<typeof setInterval>;

  onModuleDestroy() {
    clearInterval(this._sweepTimer);
  }

  private _sweep() {
    const now = Date.now();
    for (const [key, entry] of this._cache) {
      if (entry.expiresAt <= now) this._cache.delete(key);
    }
  }

  async create(createCategoryDto: CreateCategoryDto): Promise<Category> {
    const slug =
      createCategoryDto.slug ||
      createCategoryDto.name.toLowerCase().replace(/\s+/g, '-');

    return this.prisma.category.create({
      data: { ...createCategoryDto, slug },
    });
  }

  async findAll(): Promise<Category[]> {
    return this.prisma.category.findMany({ orderBy: { name: 'asc' } });
  }

  async findOne(id: string): Promise<Category> {
    const category = await this.prisma.category.findUnique({
      where: { id },
      include: { listings: true },
    });
    if (!category) {
      throw new NotFoundException(`Category with ID ${id} not found`);
    }
    return category;
  }

  async findBySlug(slug: string): Promise<Category | null> {
    return this.prisma.category.findUnique({ where: { slug } });
  }

  async update(id: string, updateCategoryDto: UpdateCategoryDto): Promise<Category> {
    await this.findOne(id);
    return this.prisma.category.update({ where: { id }, data: updateCategoryDto });
  }

  async remove(id: string): Promise<void> {
    await this.findOne(id);
    await this.prisma.category.delete({ where: { id } });
  }

  /**
   * Get categories with listing counts within a radius from a location.
   * Uses PostGIS ST_DWithin for geospatial queries.
   *
   * Results are cached in-memory for 45 s to absorb repeated demo
   * page refreshes without hitting the DB on every click.
   */
  async findNearbyWithCounts(
    lat: number,
    lng: number,
    radiusKm: number = 10,
    includeEmpty: boolean = false,
  ): Promise<Array<{ id: string; name: string; slug: string; icon: string | null; count: number }>> {
    // ── Cache lookup ──────────────────────────────────────────────────────────
    const cacheKey = `${roundCoord(lat)}:${roundCoord(lng)}:${radiusKm}:${includeEmpty}`;
    const cached = this._cache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.data;
    }
    // ─────────────────────────────────────────────────────────────────────────

    const radiusMeters = radiusKm * 1000;

    const baseQuery = Prisma.sql`
      SELECT
        c.id,
        c.name,
        c.slug,
        c.icon,
        CAST(COUNT(l.id) AS INTEGER) as count
      FROM categories c
      LEFT JOIN listings l ON l."categoryId" = c.id
        AND l."isActive" = true
        AND l."deletedAt" IS NULL
        AND l.location IS NOT NULL
        AND ST_DWithin(
          l.location::geography,
          ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography,
          ${radiusMeters}
        )
      GROUP BY c.id, c.name, c.slug, c.icon
    `;

    const finalQuery = includeEmpty
      ? Prisma.sql`${baseQuery} ORDER BY COUNT(l.id) DESC, c.name ASC`
      : Prisma.sql`${baseQuery} HAVING COUNT(l.id) > 0 ORDER BY COUNT(l.id) DESC, c.name ASC`;

    const raw = await this.prisma.$queryRaw<
      Array<{ id: string; name: string; slug: string; icon: string | null; count: bigint | number }>
    >(finalQuery);

    // Coerce BigInt → Number (BigInt is not JSON-serialisable)
    const result = raw.map((row) => ({
      id: row.id,
      name: row.name,
      slug: row.slug,
      icon: row.icon,
      count: Number(row.count),
    }));

    // ── Cache store ───────────────────────────────────────────────────────────
    this._cache.set(cacheKey, { data: result, expiresAt: Date.now() + TTL_MS });
    // ─────────────────────────────────────────────────────────────────────────

    return result;
  }
}
