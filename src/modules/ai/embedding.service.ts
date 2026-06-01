import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { PrismaService } from '../../database/prisma.service';

const EMBED_MODEL = 'gemini-embedding-2';      // Gemini's 3072-d model
const EMBED_URL   = `https://generativelanguage.googleapis.com/v1/models/${EMBED_MODEL}:embedContent`;
const INDEX_TTL_MS = 30 * 60 * 1_000;          // refresh listing index every 30 min
const TEXT_CACHE_TTL_MS = 60 * 60 * 1_000;     // cache query embeddings 1h

interface IndexEntry {
  id:        string;
  title:     string;
  embedding: number[];
}

@Injectable()
export class EmbeddingService {
  private readonly logger = new Logger(EmbeddingService.name);
  private readonly apiKey: string | null;

  // Lazy in-memory index of all active listings (built on first semantic search,
  // refreshed every INDEX_TTL_MS). Avoids needing a pgvector migration for PFE demo.
  private listingIndex: IndexEntry[] = [];
  private indexBuiltAt: number = 0;
  private indexBuildInFlight: Promise<void> | null = null;

  // LRU-ish cache of query → embedding (saves API calls on common phrasings).
  private readonly queryCache = new Map<string, { vec: number[]; expiresAt: number }>();

  constructor(
    private readonly configService: ConfigService,
    private readonly prisma:        PrismaService,
  ) {
    this.apiKey = this.configService.get<string>('GEMINI_API_KEY') ?? null;
    if (!this.apiKey) {
      this.logger.warn('GEMINI_API_KEY not set — semantic search will be disabled.');
    }
  }

  get isAvailable(): boolean { return !!this.apiKey; }

  /** Embed a single text. Returns a 768-d vector or null if disabled / on error. */
  async embed(text: string): Promise<number[] | null> {
    if (!this.apiKey) return null;
    const key = text.trim().toLowerCase();
    if (!key) return null;

    const cached = this.queryCache.get(key);
    if (cached && cached.expiresAt > Date.now()) return cached.vec;

    try {
      const { data } = await axios.post(
        `${EMBED_URL}?key=${encodeURIComponent(this.apiKey)}`,
        { content: { parts: [{ text }] } },
        { timeout: 5_000 },
      );
      const vec = data?.embedding?.values as number[] | undefined;
      if (!Array.isArray(vec) || vec.length === 0) return null;
      this.queryCache.set(key, { vec, expiresAt: Date.now() + TEXT_CACHE_TTL_MS });
      // Cheap eviction so the cache doesn't grow unbounded
      if (this.queryCache.size > 500) {
        const oldest = [...this.queryCache.entries()].sort((a, b) => a[1].expiresAt - b[1].expiresAt)[0];
        if (oldest) this.queryCache.delete(oldest[0]);
      }
      return vec;
    } catch (err: any) {
      this.logger.warn(`embed("${text.slice(0, 30)}…") failed: ${err?.response?.status ?? err?.message}`);
      return null;
    }
  }

  /**
   * Find the top-K listings most semantically similar to `query`.
   * Lazily builds (and caches) an in-memory embedding index of all active listings.
   */
  async findSimilarListings(query: string, k: number = 20): Promise<Array<{ id: string; score: number }>> {
    if (!this.apiKey) return [];

    await this.ensureIndex();
    if (this.listingIndex.length === 0) return [];

    const qVec = await this.embed(query);
    if (!qVec) return [];

    const scored = this.listingIndex.map(e => ({
      id:    e.id,
      score: cosineSim(qVec, e.embedding),
    }));
    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, k);
  }

  /** Force a rebuild of the in-memory listing index. Useful after bulk imports. */
  async rebuildIndex(): Promise<{ indexed: number }> {
    this.indexBuiltAt = 0;
    this.listingIndex = [];
    await this.ensureIndex();
    return { indexed: this.listingIndex.length };
  }

  /**
   * Compute and persist a listing's embedding. Called from ListingsService on
   * create + update so that the embedding is always fresh and survives restarts.
   * Safe no-op when GEMINI_API_KEY is missing (returns null).
   */
  async upsertListingEmbedding(listingId: string): Promise<number[] | null> {
    if (!this.apiKey) return null;
    const l = await this.prisma.listing.findUnique({
      where: { id: listingId },
      select: { id: true, title: true, description: true },
    });
    if (!l) return null;
    const text = [l.title, l.description].filter(Boolean).join(' — ').slice(0, 1_500);
    const vec = await this.embed(text);
    if (!vec) return null;
    await this.prisma.listing.update({
      where: { id: listingId },
      data: { embedding: vec, embeddingUpdatedAt: new Date() },
    });
    return vec;
  }

  /**
   * Backfill embeddings for every listing missing one. Run on startup or via
   * an admin endpoint after the personalization migration.
   */
  async backfillMissingEmbeddings(limit = 200): Promise<{ embedded: number; remaining: number }> {
    if (!this.apiKey) return { embedded: 0, remaining: 0 };
    const missing = await this.prisma.listing.findMany({
      where: {
        isActive: true,
        deletedAt: null,
        embeddingUpdatedAt: null,
      },
      select: { id: true, title: true, description: true },
      take: limit,
    });
    let embedded = 0;
    for (const l of missing) {
      const text = [l.title, l.description].filter(Boolean).join(' — ').slice(0, 1_500);
      const vec = await this.embed(text);
      if (vec) {
        await this.prisma.listing.update({
          where: { id: l.id },
          data: { embedding: vec, embeddingUpdatedAt: new Date() },
        });
        embedded++;
      }
      await new Promise((r) => setTimeout(r, 50));
    }
    const remaining = await this.prisma.listing.count({
      where: { isActive: true, deletedAt: null, embeddingUpdatedAt: null },
    });
    this.logger.log(`Backfilled ${embedded} listing embeddings (${remaining} remaining)`);
    return { embedded, remaining };
  }

  /** Public helper so PersonalizationService can score user-vs-listing similarity. */
  cosineSimilarity(a: number[], b: number[]): number {
    return cosineSim(a, b);
  }

  /** Diagnostic stats for /admin endpoints. */
  getIndexStats() {
    return {
      available:    this.isAvailable,
      indexedCount: this.listingIndex.length,
      builtAt:      this.indexBuiltAt ? new Date(this.indexBuiltAt).toISOString() : null,
      ageMs:        this.indexBuiltAt ? Date.now() - this.indexBuiltAt : null,
      queryCacheSize: this.queryCache.size,
    };
  }

  // ── Internal: build (or refresh) the in-memory index ─────────────────────
  private async ensureIndex(): Promise<void> {
    const stale = Date.now() - this.indexBuiltAt > INDEX_TTL_MS;
    if (!stale && this.listingIndex.length > 0) return;

    // Coalesce concurrent build attempts
    if (this.indexBuildInFlight) return this.indexBuildInFlight;
    this.indexBuildInFlight = this.buildIndex().finally(() => { this.indexBuildInFlight = null; });
    return this.indexBuildInFlight;
  }

  private async buildIndex(): Promise<void> {
    this.logger.log('Building listing embedding index…');
    const t0 = Date.now();

    const listings = await this.prisma.listing.findMany({
      where: { isActive: true, deletedAt: null, status: 'ACTIVE' as any },
      select: { id: true, title: true, description: true },
      take: 1_000,    // PFE demo cap — well under the free-tier rate limit
    });

    const entries: IndexEntry[] = [];
    // Embed sequentially with a small delay so we don't trip rate limits.
    for (const l of listings) {
      const text = [l.title, l.description].filter(Boolean).join(' — ').slice(0, 1_500);
      const vec = await this.embed(text);
      if (vec) entries.push({ id: l.id, title: l.title, embedding: vec });
      // Cheap throttle: 60 req/sec is plenty under the free tier
      await new Promise(r => setTimeout(r, 50));
    }

    this.listingIndex = entries;
    this.indexBuiltAt = Date.now();
    this.logger.log(`Embedding index built: ${entries.length}/${listings.length} listings in ${Date.now() - t0}ms`);
  }
}

// ── Math utilities ─────────────────────────────────────────────────────────

function cosineSim(a: number[], b: number[]): number {
  const len = Math.min(a.length, b.length);
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < len; i++) {
    dot += a[i] * b[i];
    na  += a[i] * a[i];
    nb  += b[i] * b[i];
  }
  const denom = Math.sqrt(na) * Math.sqrt(nb);
  return denom > 0 ? dot / denom : 0;
}
