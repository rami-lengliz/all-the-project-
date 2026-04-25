# RentAI — Demo Reset Guide

**Target:** Reset all demo data in < 5 minutes, any time before a demo.

---

## Prerequisites

```
DATABASE_URL set in .env
Docker running  →  docker ps
```

---

## Method A — CLI Reset (Local / SSH)

```bash
# 1. From the project root (all-the-project-)

# Hard-reset schema + demo seed (drops everything, re-seeds)
npx prisma migrate reset --force && npm run seed:demo
```

**Or if only re-seeding an already migrated DB (faster):**

```bash
npm run seed:demo
```

> `seed:demo` clears all rows, re-creates 65+ listings, users, bookings, chat messages, and reviews. It is **idempotent** — run it as many times as needed.

### Expected output

```
🌱  RentAI — Demo Seed starting…

🗑️  Clearing existing data…
📂  Creating categories…
👤  Creating users…
🏠  Creating Kelibia listings…     ✓ 32 Kelibia listings created
🌆  Creating Tunis listings…       ✓ 27 Tunis listings created
🎯  Creating demo conflict scenarios…
📅  Creating general bookings…     ✓ N general bookings created
💬  Creating chat conversations…
⭐  Creating reviews…

╔══════════════════════════════════════════════════════╗
║         RentAI — Demo Seed Summary                   ║
╠══════════════════════════════════════════════════════╣
║  DAILY listing : b1000001-0000-4000-8000-000000000001 ║
║  Blocked dates : YYYY-MM-DD → YYYY-MM-DD  (D+30→D+33) ║
║  SLOT listing  : b2000001-0000-4000-8000-000000000001 ║
║  Blocked slot  : 10:00–12:00 on YYYY-MM-DD  (D+7)    ║
╚══════════════════════════════════════════════════════╝

✅  Demo seed completed successfully!
```

> **IDs are stable fixed UUIDs** — they never change between resets. Copy them once; reuse forever.

---

## Method B — Production (Railway / Render "Run command")

> No SSH needed — use the platform's one-off job runner.

```bash
# After build (JS already compiled):
node dist/database/seeds/run-seed-demo.js

# Or using ts-node in production (if typescript deps are present):
npx ts-node src/database/seeds/run-seed-demo.ts
```

Set `DATABASE_URL` in the platform env vars before running.

---

## Fixed Demo IDs (memorize or paste)

| Asset | Fixed UUID |
|---|---|
| **DAILY listing** | `b1000001-0000-4000-8000-000000000001` |
| **SLOT listing** | `b2000001-0000-4000-8000-000000000001` |
| **DAILY conflict dates** | D+30 → D+33 _(computed at seed time, printed in summary)_ |
| **SLOT conflict date/time** | D+7, 10:00–12:00 _(printed in summary)_ |

---

## Demo Credentials

| Role | Email | Password |
|---|---|---|
| Host (Kelibia) | `host.kelibia@rentai.tn` | `password123` |
| Host (Tunis) | `host.tunis@rentai.tn` | `password123` |
| RenterA | `renter.a@rentai.tn` | `password123` |
| RenterB | `renter.b@rentai.tn` | `password123` |
| Admin | `admin@rentai.tn` | `password123` |

---

## Quick Verify (after reset)

```bash
# Health check
curl http://localhost:3000/api/health

# Categories near Kelibia — expect 5–7 results
curl "http://localhost:3000/api/categories/nearby?lat=36.8578&lng=11.092&radiusKm=10"

# AI search smoke test
curl -s -X POST http://localhost:3000/api/ai/search \
  -H "Content-Type: application/json" \
  -d '{"query":"villa with pool","lat":36.8578,"lng":11.092,"radiusKm":50,"followUpUsed":true}'

# Slot availability — 10:00 must be MISSING from list
curl "http://localhost:3000/api/listings/b2000001-0000-4000-8000-000000000001/available-slots?date=<SLOT_DATE>"
```

---

## Troubleshooting

### DB not reachable
```
Error: Can't reach database server at localhost:5432
```
```bash
docker-compose up -d postgres
# wait 5 s, then retry
```

---

### Migration drift (schema out of sync)
```
Error: P3009 migrate found failed migrations
```
```bash
# Local only — drops and recreates everything cleanly:
npx prisma migrate reset --force
npm run seed:demo
```

---

### PostGIS extension missing
```
ERROR: type "geography" does not exist
```
```bash
# Run once against your DB:
psql $DATABASE_URL -c "CREATE EXTENSION IF NOT EXISTS postgis;"
# Then re-run seed
npm run seed:demo
```

> Railway/Render managed Postgres instances have PostGIS pre-installed. If missing, create a new DB instance with the PostGIS add-on enabled.

---

### Seed fails — FK constraint / unique violation
```
Error: Unique constraint failed on field: email
```
The DB was not fully cleared before seeding. This happens if a previous seed was interrupted.

```bash
# Force a full schema reset first:
npx prisma migrate reset --force
npm run seed:demo
```

---

### `aiSearchLog does not exist` on startup
```bash
npx prisma generate
npx prisma migrate deploy
```

---

### Port 3000 already in use
```bash
npx kill-port 3000
npm run dev:all
```

---

*Total reset time: ~40 s on local SSD · ~90 s on Railway free tier.*
