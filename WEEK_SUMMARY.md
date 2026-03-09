# RentAI — Week Summary (Demo Freeze · Week 3)

> **Sprint:** Mar 3–9, 2026 | **Branch:** `week3-deploy-frontend` | **Tag:** `demo-ready-week3`

---

## 🔗 Quick Links

| Resource | Link |
|---|---|
| **Frontend (local)** | `http://localhost:3000` |
| **Categories Demo** | `http://localhost:3000/demo/categories` |
| **AI Search Demo** | `http://localhost:3000/demo/ai-search` |
| **Swagger / API Docs** | `http://localhost:3000/api/docs` |
| **Reset Procedure** | [RESET_GUIDE.md](./RESET_GUIDE.md) |
| **Demo Script** | [DEMO_SCRIPT.md](./DEMO_SCRIPT.md) |
| **Known Limitations** | [KNOWN_LIMITATIONS.md](./KNOWN_LIMITATIONS.md) |
| **Pre-Demo Checklist** | [DEMO_CHECKLIST.md](./DEMO_CHECKLIST.md) |
| **Day 7 Rehearsal** | [DEMO_REHEARSAL_DAY7.md](./DEMO_REHEARSAL_DAY7.md) |

---

## ✅ What Was Done This Week

### Frontend Demo Pages (New)
- **`/demo/categories`** — Location-aware category list driven by PostGIS.
  - Kelibia / Tunis city presets; 5/10/20/50 km radius buttons.
  - Live count badges; empty + error + loading states.
- **`/demo/ai-search`** — Natural-language rental search UI.
  - Direct RESULT flow (chips + result cards).
  - FOLLOW_UP → RESULT flow (one question max, enforced client + server).
  - Loading skeleton, error banner with Retry, Reset button.
  - Location + radius picker; debug payload panel.

### Frontend Hardening
- **20 s AbortController timeout** on `fetchAiSearch` — no more hanging spinners.
- **10 s timeout** on `fetchNearbyCategories`.
- **Friendly error messages** — timeout vs network vs HTTP, parses NestJS JSON body.
- **Radius clamped to [1, 50] km** client-side before every API call.
- **Follow-up loop guard** now checks `followUpUsed.current` ref in addition to the call flag — double-locks the "max 1 follow-up" invariant.

### Backend Performance
- **In-memory TTL cache (45 s)** on `CategoriesService.findNearbyWithCounts`.
  - Key: `lat:lng:radiusKm:includeEmpty` (coords rounded to 4 dp).
  - Periodic 60 s sweeper via `setInterval`, cleared on `onModuleDestroy`.
  - Cache hit latency: sub-5 ms vs 20-25 ms DB query.
- **PostGIS GIST index** confirmed present (`20260226000000_add_location_spatial_index`).

### Demo Documentation (New Files)
| File | Purpose |
|---|---|
| `DEMO_SCRIPT.md` | 5–8 min presenter script with exact narration per step |
| `DEMO_CHECKLIST.md` | Pre-demo 15-min verification checklist |
| `DEMO_REHEARSAL_DAY7.md` | 3-run rehearsal plan with quick-fixes table |
| `RESET_GUIDE.md` | Seed reset procedure with copy-paste commands + troubleshooting |
| `KNOWN_LIMITATIONS.md` | Honest MVP scope record (AI, calendar, payments, privacy) |

---

## 🔄 How to Reset Demo Data

```bash
cd all-the-project-
npm run seed:demo
# → "✅ Demo seed completed successfully!" in ~15 s
```

See [RESET_GUIDE.md](./RESET_GUIDE.md) for production (Railway/Render) reset and troubleshooting.

---

## 🧪 Smoke Test (Copy-Paste)

```bash
# Health
curl http://localhost:3000/api/health

# Categories — Kelibia
curl "http://localhost:3000/api/categories/nearby?lat=36.8578&lng=11.092&radiusKm=10"

# AI search — RESULT
curl -s -X POST http://localhost:3000/api/ai/search \
  -H "Content-Type: application/json" \
  -d '{"query":"villa with pool","lat":36.8578,"lng":11.092,"radiusKm":20,"followUpUsed":true}'
```

---

## 📋 Status of Known Issues

| Issue | Status |
|---|---|
| SLOT conflict returns `400` instead of `409` in edge case | ⚠️ Low — tracked, cosmetic |
| `aiSearchLog` TS error until server restart | ✅ Fixed — `npx prisma generate` resolves |
| Frontend JSX TS errors (pre-existing) | ⚠️ Pre-existing, not blocking demo |
| ~~No AbortController timeout on fetch~~ | ✅ Fixed this week |
| ~~Unclamped radius value sent to API~~ | ✅ Fixed this week |
| ~~No in-memory cache on categories/nearby~~ | ✅ Fixed this week |

---

## 📁 Files Changed This Week

```
frontend/src/
  lib/api/
    ai-search.ts              ← 20 s timeout, friendly errors
    categories.ts             ← 10 s timeout, radius clamp, friendly errors
  pages/demo/
    ai-search.tsx             ← loop guard, radius clamp, error banner
    categories.tsx            ← minor polish

src/modules/categories/
  categories.service.ts       ← 45 s TTL cache + sweeper (OnModuleDestroy)

DEMO_SCRIPT.md                ← NEW
DEMO_CHECKLIST.md             ← NEW
DEMO_REHEARSAL_DAY7.md        ← NEW
RESET_GUIDE.md                ← NEW
KNOWN_LIMITATIONS.md          ← NEW
WEEK_SUMMARY.md               ← updated (this file)
```

---

*Frozen at tag `demo-ready-week3` — 2026-03-09*
