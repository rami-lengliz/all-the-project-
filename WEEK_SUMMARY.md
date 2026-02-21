# RentAI — Week 1 Summary

> **Sprint:** Feb 17–21, 2026 | **Branch:** `main` | **Tests:** 42 / 42 ✅

---

## ✅ What Was Done This Week

### Day 1–2 — Core Feature Foundation
- **`GET /api/categories/nearby`** — PostGIS distance query, returns categories sorted by listing count within radius
- **AI Search (`POST /api/ai/search`)** — natural language → structured filters, stable response contract (`mode`, `filters`, `chips`, `followUp`, `results` always present)
  - FOLLOW_UP mode (1 clarification question max, enforced by `followUpUsed` guard)
  - RESULT mode with real listing results
  - Fallback keyword search when no OpenAI key
  - `followUpAnswer` field passed on second call to incorporate the user's answer
- Swagger fully documented for all endpoints

### Day 3 — E2E Test Coverage
| Suite | Tests | Result |
|-------|-------|--------|
| `categories-nearby.e2e-spec.ts` | 5 | ✅ PASS |
| `ai-search-guardrails.e2e-spec.ts` | 9 | ✅ PASS |
| `booking-conflict.e2e-spec.ts` | 8 | ✅ PASS |
| `slot-booking-conflict.e2e-spec.ts` | 8 | ✅ PASS |
| `app.e2e-spec.ts` | 12 | ✅ PASS |
| **Total** | **42** | **0 failures** |

### Day 4 — Logging, Constants, Demo Seed, Runbook
- **AI Search Logging** — Prisma `AiSearchLog` model, migration `20260221124136_add_ai_search_log`, fire-and-forget write after every search. Admin endpoint: `GET /api/ai/admin/search-logs?limit=N`
- **`BLOCKING_BOOKING_STATUSES` constant** — `src/common/constants/booking-status.constants.ts`, imported by all 4 availability checks. Single place to edit.
- **Demo Seed** — `npm run seed` guarantees:
  - DAILY listing with confirmed booking D+30→D+33 + overlapping pending
  - SLOT listing with confirmed 10:00–12:00 on D+7 + overlapping pending 11:00–13:00
  - 49 realistic French messages across 5 conversations
  - Prints IDs and dates in a formatted box for immediate curl use
- **`RUNBOOK.md`** + **`.env.example`** — new developer running in < 15 min

### Day 5 — Cleanup & Summary
- Fixed last hardcoded blocking-status array in `listings.service.ts` `getAvailableSlots()` — now uses the constant
- Full smoke test: 42/42 passing
- This file

---

## 🧪 How to Test (Quick Commands)

```bash
# 1. Start DB
docker-compose up -d postgres

# 2. Migrate + seed
npx prisma migrate deploy
npm run seed

# 3. Start API
npm run start:dev

# 4. Run all E2E tests (~30s)
npx jest --config test/jest-e2e.json --forceExit

# 5. Categories nearby (proof curl)
curl -s "http://localhost:3000/api/categories/nearby?lat=36.8578&lng=11.092&radiusKm=50" | python -m json.tool

# 6. AI Search — RESULT
curl -s -X POST http://localhost:3000/api/ai/search \
  -H "Content-Type: application/json" \
  -d '{"query":"villa with pool","lat":36.8578,"lng":11.092,"radiusKm":50,"followUpUsed":true}' \
  | python -m json.tool

# 7. AI Search — FOLLOW_UP then RESULT
# Step 1 (may return FOLLOW_UP):
curl -s -X POST http://localhost:3000/api/ai/search \
  -H "Content-Type: application/json" \
  -d '{"query":"tennis court","lat":36.8578,"lng":11.092,"radiusKm":50}' \
  | python -m json.tool
# Step 2 (force RESULT with answer):
curl -s -X POST http://localhost:3000/api/ai/search \
  -H "Content-Type: application/json" \
  -d '{"query":"tennis court","lat":36.8578,"lng":11.092,"radiusKm":50,"followUpUsed":true,"followUpAnswer":"Tomorrow afternoon"}' \
  | python -m json.tool

# 8. View AI search logs
curl -s "http://localhost:3000/api/ai/admin/search-logs?limit=5" | python -m json.tool

# 9. SLOT conflict demo (replace IDs from seed output)
curl -s "http://localhost:3000/api/listings/SLOT_ID/available-slots?date=SLOT_DATE" | python -m json.tool
# → 10:00–12:00 slot should be missing/unavailable
```

---

## 📋 Known Issues

| Issue | Severity | Notes |
|-------|----------|-------|
| SLOT conflict booking returns `400` instead of `409` in some edge cases | Low | Core logic correct, HTTP status code cosmetic. Tracked for cleanup. |
| `aiSearchLog` TS error in VS Code until server restart | Dev-only | TS language server cache; `npx prisma generate` fixes it. |
| Frontend JSX TS errors (pre-existing) | Low | Not related to backend changes; frontend uses separate tsconfig. |

---

## 🔭 Next Week — Top 2 Priorities

### Priority 1 — Reviews & Rating System (Feature Owner: Backend)
- `POST /api/reviews` — renter reviews host after `completed` booking
- `GET /api/listings/:id/reviews` — paginated, with average rating
- Update `User.ratingAvg` / `ratingCount` atomically on each review
- **DoD:** Renter can leave a review; host rating updates immediately; reviews visible on listing page.

### Priority 2 — Payment Integration (Feature Owner: Backend + Frontend)
- Integrate Stripe (or mock) for `PaymentIntent` flow
- `POST /api/bookings/:id/pay` → creates `PaymentIntent`, transitions booking to `paid`
- Webhook: `payment_intent.succeeded` → set `booking.paid = true`
- **DoD:** Full DAILY booking lifecycle: pending → paid → host confirms → completed.

---

## 📁 File Index (What Changed This Week)

```
src/
  modules/
    categories/
      categories.service.ts         ← findNearbyWithCounts() (PostGIS)
      categories.controller.ts      ← GET /api/categories/nearby
    ai/
      ai-search.service.ts          ← search() + logging + fallback
      ai.controller.ts              ← POST /api/ai/search, GET /api/ai/admin/search-logs
      dto/ai-search.dto.ts          ← stable contract with followUpAnswer
  common/
    constants/
      booking-status.constants.ts   ← BLOCKING_BOOKING_STATUSES (NEW)
    utils/
      availability.service.ts       ← uses constant, checkSlotAvailability raw SQL
  database/
    seeds/seed.service.ts           ← demo scenarios + 49 chat messages

prisma/
  schema.prisma                     ← AiSearchLog model (NEW)
  migrations/
    20260221124136_add_ai_search_log/  ← applied

test/
  categories-nearby.e2e-spec.ts     ← NEW (5 tests)
  ai-search-guardrails.e2e-spec.ts  ← NEW (9 tests)
  booking-conflict.e2e-spec.ts      ← NEW (8 tests)
  slot-booking-conflict.e2e-spec.ts ← NEW (8 tests)

RUNBOOK.md                          ← NEW
.env.example                        ← updated (JWT_REFRESH_SECRET added)
```
