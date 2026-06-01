/**
 * Backfill listing embeddings (Gemini text-embedding-004) for the
 * personalization engine.
 *
 * The backend also does this automatically on startup + every 5 min, but this
 * script lets you run it on demand and verify the pipeline works end-to-end:
 *   - confirms GEMINI_API_KEY produces a 768-d vector
 *   - confirms the listings.embedding column is writable
 *
 * Usage:
 *   node scripts/backfill-embeddings.mjs          # embed all missing
 *   node scripts/backfill-embeddings.mjs --force  # re-embed everything
 *   node scripts/backfill-embeddings.mjs --stats  # just print coverage
 */
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const EMBED_MODEL = 'gemini-embedding-2';
const EMBED_URL = `https://generativelanguage.googleapis.com/v1/models/${EMBED_MODEL}:embedContent`;
const API_KEY = process.env.GEMINI_API_KEY;

const force = process.argv.includes('--force');
const statsOnly = process.argv.includes('--stats');

async function embed(text) {
  const res = await fetch(`${EMBED_URL}?key=${encodeURIComponent(API_KEY)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content: { parts: [{ text }] } }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Gemini ${res.status}: ${body.slice(0, 200)}`);
  }
  const data = await res.json();
  const vec = data?.embedding?.values;
  if (!Array.isArray(vec) || vec.length === 0) {
    throw new Error('Gemini returned no embedding values');
  }
  return vec;
}

async function printStats() {
  const total = await prisma.listing.count({
    where: { isActive: true, deletedAt: null },
  });
  const embedded = await prisma.listing.count({
    where: { isActive: true, deletedAt: null, embeddingUpdatedAt: { not: null } },
  });
  console.log(`\n  Listings (active):  ${total}`);
  console.log(`  With embeddings:    ${embedded}`);
  console.log(`  Missing:            ${total - embedded}\n`);
}

async function main() {
  if (!API_KEY) {
    console.error('✗ GEMINI_API_KEY is not set in .env — cannot embed.');
    process.exit(1);
  }

  await printStats();
  if (statsOnly) return;

  const listings = await prisma.listing.findMany({
    where: {
      isActive: true,
      deletedAt: null,
      ...(force ? {} : { embeddingUpdatedAt: null }),
    },
    select: { id: true, title: true, description: true },
  });

  if (listings.length === 0) {
    console.log('✓ Nothing to embed — all active listings already have vectors.');
    return;
  }

  console.log(`Embedding ${listings.length} listing(s)…\n`);
  let ok = 0;
  let failed = 0;
  for (const l of listings) {
    const text = [l.title, l.description].filter(Boolean).join(' — ').slice(0, 1500);
    try {
      const vec = await embed(text);
      await prisma.listing.update({
        where: { id: l.id },
        data: { embedding: vec, embeddingUpdatedAt: new Date() },
      });
      ok++;
      process.stdout.write(`  ✓ ${l.title.slice(0, 50)} (${vec.length}-d)\n`);
    } catch (err) {
      failed++;
      process.stdout.write(`  ✗ ${l.title.slice(0, 50)} — ${err.message}\n`);
    }
    // Stay well under the free-tier rate limit.
    await new Promise((r) => setTimeout(r, 60));
  }

  console.log(`\nDone: ${ok} embedded, ${failed} failed.`);
  await printStats();
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
