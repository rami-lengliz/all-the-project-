# PROJECT_STATUS_PACKET.md — RentEverything

> **Purpose**: Hand this file to any new engineer so they can understand the entire project in 10 minutes.

---

## 1) Quick Summary

- **Product**: RentEverything — an all-in-one, location-aware rental marketplace (stays, vehicles, sports facilities, beach gear, etc.) targeting Tunisia (Kelibia, Tunis, Nabeul).
- **Stack**: NestJS + PostgreSQL/PostGIS backend, Next.js 16 frontend, FastAPI ML microservice, Socket.IO realtime chat.
- **Production-ready**: Auth (JWT access+refresh), bookings lifecycle with listing-mutex conflict prevention, PostGIS geo search, AI search (OpenAI + fallback), payments with commissions, Wallet Ledger (audit trails), Host Payouts (FIFO allocation), Refund Guardrails, admin moderation, chat.
- **Demo-only**: Payments are simulated (no real payment gateway), email/phone verification is stubbed (`verify` endpoint auto-approves), ML service uses rule-based heuristics (no real ML model), Cloudinary not wired (local uploads only).
- **Current blockers**: No real payment provider integration. Verification flow is a placeholder. No CI/CD pipeline.

---

## 2) How to Run

### Prerequisites
- **Node.js** ≥ 18 (recommended: 20 LTS)
- **Docker + Docker Compose** (for PostgreSQL + PostGIS)
- **npm** (comes with Node)

### Backend

```bash
# 1. Start database (runs PostGIS-enabled Postgres)
docker compose up -d postgres

# 2. Install dependencies
npm install

# 3. Copy env and fill in secrets
cp .env.example .env
# Edit .env — see Section 3 for keys

# 4. Generate Prisma client + run migrations
npx prisma generate
npx prisma migrate dev

# 5. Seed demo data
npm run seed

# 6. Start backend (watch mode)
npm run start:dev
```

### Frontend

```bash
cd frontend
npm install

# Create env file
echo "NEXT_PUBLIC_API_URL=http://localhost:3000" > .env.local

npm run dev
```

### Full Docker Compose (all services)

```bash
docker compose up -d          # Starts postgres, backend, ml-service, adminer
```

### URLs

| Service | URL |
|---------|-----|
| **Backend API** | `http://localhost:3001` |
| **Swagger Docs** | `http://localhost:3001/api/docs` |
| **Frontend** | `http://localhost:3000` (Next.js default) |
| **Adminer (DB UI)** | `http://localhost:8080` |
| **ML Service** | `http://localhost:8000` |

> **Port conflict note**: Next.js defaults to 3000. If backend is already on 3000, Next will auto-pick 3001. Verify in terminal output.

---

## 3) Environment Variables (NO SECRETS)

### Backend `.env`

| Key | Required | Default | Description |
|-----|----------|---------|-------------|
| `PORT` | No | `3000` | Backend port |
| `NODE_ENV` | No | `development` | Environment |
| `DATABASE_URL` | **Yes** | — | `postgresql://postgres:<PASSWORD>@localhost:5432/rental_platform?schema=public` |
| `JWT_SECRET` | **Yes** | — | `<JWT_SECRET>` |
| `JWT_EXPIRES_IN` | No | `15m` | Access token TTL |
| `REFRESH_TOKEN_SECRET` | **Yes** | — | `<REFRESH_TOKEN_SECRET>` |
| `REFRESH_TOKEN_EXPIRES_IN` | No | `7d` | Refresh token TTL |
| `COMMISSION_PERCENTAGE` | No | `0.10` | Platform commission (10%) |
| `UPLOAD_DIR` | No | `uploads` | Local upload directory |
| `ML_SERVICE_URL` | No | `http://localhost:8000` | ML microservice URL |
| `THROTTLE_TTL` | No | `60` | Rate limit window (seconds) |
| `THROTTLE_LIMIT` | No | `10` | Rate limit max requests |
| `OPENAI_API_KEY` | No | — | `<OPENAI_API_KEY>` (AI search falls back to keyword if missing) |
| `AI_MODEL` | No | `gpt-4o-mini` | OpenAI model |
| `AI_MAX_FOLLOWUPS` | No | `1` | Max AI follow-up questions |
| `CLOUDINARY_CLOUD_NAME` | No | — | `<CLOUDINARY_CLOUD_NAME>` (not wired yet) |
| `CLOUDINARY_API_KEY` | No | — | `<CLOUDINARY_API_KEY>` |
| `CLOUDINARY_API_SECRET` | No | — | `<CLOUDINARY_API_SECRET>` |

### Frontend `frontend/.env.local`

| Key | Required | Default | Description |
|-----|----------|---------|-------------|
| `NEXT_PUBLIC_API_URL` | **Yes** | — | `http://localhost:3000` |
| `NEXT_PUBLIC_DEFAULT_RADIUS_KM` | No | `10` | Default geo radius |

---

## 4) System Architecture

### Backend Modules (`src/modules/`)

| Module | Path | Purpose |
|--------|------|---------|
| **auth** | `src/modules/auth/` | Register, login, refresh, verify. JWT access+refresh tokens. |
| **users** | `src/modules/users/` | Profile CRUD, become-host, user verification. |
| **categories** | `src/modules/categories/` | Category CRUD + `findNearbyWithCounts` (PostGIS radius query). |
| **listings** | `src/modules/listings/` | CRUD with Multer image upload, PostGIS geo search, slot config. |
| **bookings** | `src/modules/bookings/` | Full lifecycle: create → confirm → pay → complete/cancel/reject. |
| **payments** | `src/modules/payments/` | Payment intent lifecycle: authorize → capture → refund/cancel. |
| **reviews** | `src/modules/reviews/` | Post-booking reviews (1 per booking). |
| **admin** | `src/modules/admin/` | Moderation (hide listings/users), audit logs. |
| **ai** | `src/modules/ai/` | AI Search (OpenAI), Listing Assistant, Price suggestion. |
| **ledger** | `src/modules/ledger/` | Wallet Ledger system (idempotent captures/refunds, audit trails). |
| **payouts** | `src/modules/payouts/` | Host payout management, FIFO credit allocation, dispute freezing. |
| **ml** | `src/modules/ml/` | Proxy to FastAPI ML microservice (category + price suggestions). |
| **cloudinary**| `src/modules/cloudinary/`| Cloudinary service integration for uploading images. |
| **chat** | `src/chat/` | Socket.IO WebSocket gateway for realtime messaging. |

### DB Schema Overview (Prisma — 14 models)

```
Category ── Listing
LedgerEntry ── PayoutItem ── Payout
```

**Key relationships:**
- `User` → `Listing` (host), `Booking` (renter/host), `Review` (author/target), `PaymentIntent`, `Conversation`, `Message`, `Payout`, `AdminLog`
- `Listing` → `Category`, `Booking`, `Review`, `Conversation`, `SlotConfiguration`
- `Booking` → one `Review`, one `PaymentIntent`, many `Conversation`, many `LedgerEntry`
- `LedgerEntry` → `Booking`, `PaymentIntent`, `User` (actor), `PayoutItem`
- `Conversation` → renter, host, optional booking/listing

### Frontend Routing (Next.js Pages Router)

| Route | Page |
|-------|------|
| `/` | Home — location detection, categories, AI search bar |
| `/search` | Search results |
| `/map` | Leaflet map view |
| `/listings/[id]` | Listing detail |
| `/profile` | User profile editor |
| `/help` | Help / FAQ |
| `/auth/*` | Login / Register |
| `/host/*` | Host dashboard, Create Listing, Listings, Bookings |
| `/client/*` | Client dashboard, Bookings, Reviews |
| `/booking/*`| Booking pages |
| `/messages/*`| Chat interface |
| `/admin/*` | Admin pages (logs, users, listings, etc) |
| `/demo` `dev`| Demo / Dev testing routes |

### Auth Model

- **Tokens**: JWT access (15m TTL) + refresh (7d TTL). Payload: `{ sub: userId, email, role }`. Role is `USER | HOST | ADMIN`.
- **Storage key**: `re_auth_v1` in `localStorage`. Stores `{ accessToken, refreshToken, user }`.
- **Axios interceptor** (`frontend/src/lib/api/http.ts`):
  - **Request**: reads `re_auth_v1` from localStorage, attaches `Authorization: Bearer <token>` header.
  - **Response 401**: clears localStorage `re_auth_v1`, dispatches StorageEvent (triggers AuthProvider logout), redirects to `/auth/login`.
  - **Other errors**: shows toast with error message.
- **AuthProvider** (`frontend/src/lib/auth/AuthProvider.tsx`): hydration-safe restore on mount; if `accessToken` exists but no `user`, fetches `GET /api/users/me` to restore user object.

---

## 5) Feature Status Table

| Feature | Status | Notes | Key Files |
|---------|--------|-------|-----------|
| **Auth: login/register** | ✅ | JWT access+refresh, bcrypt hashing, rate limited (5/min) | `src/modules/auth/` |
| **Auth: refresh token** | ✅ | Uses separate secret and TTL | `src/modules/auth/auth.service.ts` |
| **Auth: guards** | ✅ | `JwtAuthGuard`, `JwtRefreshGuard`, `HostGuard` | `src/common/guards/` |
| **Become host flow** | ✅ | `POST /api/users/me/become-host` requires `{ acceptTerms: true }` | `src/modules/users/dto/become-host.dto.ts`, `src/modules/users/users.controller.ts` |
| **Listings search (geo)** | ✅ | PostGIS `ST_DWithin` radius filter | `src/modules/listings/listings.service.ts` (L172–374) |
| **Listings search (sort distance)** | ✅ | `ST_Distance` + `ORDER BY distance ASC` when `sortBy=distance` | `src/modules/listings/listings.service.ts` (L240–248) |
| **Listings search (fallback)** | ✅ | If raw SQL fails, falls back to Prisma `findMany` without geo | `src/modules/listings/listings.service.ts` (L302–373) |
| **Categories nearby** | ✅ | `GET /api/categories/nearby` with PostGIS. Verified with 11 E2E tests + proof artifacts. | `src/modules/categories/categories.service.ts` |
| **Wallet Ledger v1** | ✅ | Atomic audit trail for all captures/refunds. Idempotent `postCapture/postRefund`. | `src/modules/ledger/` |
| **Payouts v1** | ✅ | Admin-only FIFO payout allocation, mark-paid flow, host balance tracking. | `src/modules/payouts/` |
| **Dispute Freeze v1** | ✅ | `disputeStatus` (NONE/OPEN/RESOLVED). OPEN disputes block ledger entries from payouts. | `src/modules/payouts/payouts.service.ts` |
| **Refund Guardrail v1** | ✅ | Hard block on refunds if a `HOST_PAYOUT` ledger entry already exists. | `src/modules/payments/payments.service.ts` |
| **Listing create/edit + images** | ✅ | Multer disk storage, 5MB/file, 5 files max, JPEG/PNG only | `src/modules/listings/listings.controller.ts` |
| **Availability rules** | ✅ | DAILY: date ranges. SLOT: `SlotConfiguration` with operating hours. Blocking statuses (confirmed, paid, completed) prevent conflicts. | `src/modules/listings/listings.service.ts`, `src/common/utils/availability.service.ts` |
| **Booking lifecycle + locking** | ✅ | pending → confirmed → paid → completed. Concurrency-safe listing mutex lock on `confirm`. Verified with parallel E2E races. | `src/modules/bookings/bookings.service.ts` |
| **Booking reject** | ✅ | Host rejects pending → status `rejected`, slot freed | `src/modules/bookings/bookings.service.ts` (L300–337) |
| **Payments + commission** | ⚠️ | Simulated gateway. Calculations use `COMMISSION_PERCENTAGE`. Ledger audit integrated. | `src/modules/payments/`, `src/modules/ledger/` |
| **Refunds** | ⚠️ | Full ledger reversal, but payment gateway part is simulated. | `src/modules/payments/payments.controller.ts` |
| **Reviews** | ✅ | One review per booking (unique constraint). Post-booking only. | `src/modules/reviews/` |
| **Admin pages** | ✅ | Dashboard, listing moderation, user management, audit logs, ledger summaries, payouts. | `frontend/src/pages/admin/` |
| **Host pages** | ✅ | Dashboard, create listing, my listings, bookings | `frontend/src/pages/host/` |
| **Client pages** | ✅ | Dashboard, bookings, reviews | `frontend/src/pages/client/` |
| **Chat (realtime)** | ✅ | Socket.IO on `/chat` namespace. JWT auth. Send/read/typing/join. | `src/chat/` |
| **AI Search** | ✅ | OpenAI-powered with Zod validation, fallback, max 1 follow-up | `src/modules/ai/` (see Section 6) |
| **AI Listing Assistant** | ✅ | Generate/enhance descriptions, generate titles | `src/modules/ai/listing-assistant.service.ts` |
| **ML Suggestions** | ⚠️ | Rule-based heuristics, not real ML. Category by keywords, price by location. | `ml-service/main.py` |
| **Email/phone verification** | ❌ | Stubbed — `verify` endpoint auto-approves without actual code check | `src/modules/auth/auth.service.ts` (L137–159) |
| **Cloudinary uploads** | ❌ | Env keys exist but not wired. Using local disk uploads. | `src/modules/listings/listings.service.ts` |

---

## 6) AI Search Details

### File Locations

| Component | Path |
|-----------|------|
| Controller | `src/modules/ai/ai.controller.ts` |
| Search service | `src/modules/ai/ai-search.service.ts` |
| Core AI service (OpenAI calls) | `src/modules/ai/ai.service.ts` |
| Listing assistant | `src/modules/ai/listing-assistant.service.ts` |
| Request/Response DTOs | `src/modules/ai/dto/ai-search.dto.ts` |
| Zod validation schema | `src/modules/ai/schemas/ai-response.schema.ts` |
| Unit tests | `src/modules/ai/ai-search.service.spec.ts` |
| E2E tests | `test/ai-search-guardrails.e2e-spec.ts` |

### Request Format

**Endpoint**: `POST /api/ai/search`

```json
{
  "query": "villa near beach under 250",
  "lat": 36.8578,
  "lng": 11.092,
  "radiusKm": 10,
  "availableCategorySlugs": ["accommodation", "sports-facilities"],
  "followUpUsed": false,
  "followUpAnswer": ""
}
```

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `query` | string | **Yes** | Natural language search |
| `lat` | number | No | User latitude |
| `lng` | number | No | User longitude |
| `radiusKm` | number | No | Default 10, max 50 |
| `availableCategorySlugs` | string[] | No | Auto-detected if lat/lng provided |
| `followUpUsed` | boolean | No | Default `false`. Set `true` on second call. |
| `followUpAnswer` | string | No | User's answer to follow-up question |

### Response JSON Schema

**Two possible modes:**

**Mode: FOLLOW_UP** (AI needs more info, max 1 time)

```json
{
  "mode": "FOLLOW_UP",
  "followUp": {
    "question": "Which dates do you need?",
    "field": "dates",
    "options": ["Today", "Tomorrow", "This weekend"]
  },
  "filters": {
    "q": "villa",
    "categorySlug": "accommodation",
    "maxPrice": 250,
    "sortBy": "distance",
    "radiusKm": 10
  },
  "chips": [
    { "key": "q", "label": "villa" },
    { "key": "category", "label": "Accommodation" },
    { "key": "price", "label": "Up to 250 TND" }
  ],
  "results": []
}
```

**Mode: RESULT** (normal response with listings)

```json
{
  "mode": "RESULT",
  "followUp": null,
  "filters": {
    "q": "villa",
    "categorySlug": "accommodation",
    "minPrice": null,
    "maxPrice": 250,
    "bookingType": "DAILY",
    "availableFrom": "2026-03-01",
    "availableTo": "2026-03-05",
    "sortBy": "distance",
    "radiusKm": 10
  },
  "chips": [
    { "key": "q", "label": "villa" },
    { "key": "category", "label": "Accommodation" },
    { "key": "price", "label": "Up to 250 TND" },
    { "key": "dates", "label": "2026-03-01 to 2026-03-05" },
    { "key": "radius", "label": "Within 10 km" }
  ],
  "results": [
    {
      "id": "abc-123",
      "title": "Beach Villa Kelibia",
      "description": "Beautiful villa near the beach...",
      "pricePerDay": "180.00",
      "address": "Route de la Plage, Kelibia",
      "images": ["/uploads/listings/abc-123/photo.jpg"],
      "bookingType": "DAILY",
      "category": { "id": "cat-1", "name": "Accommodation", "slug": "accommodation" },
      "host": { "id": "user-1", "name": "Ahmed", "ratingAvg": "4.50" }
    }
  ]
}
```

### Max Follow-Up Rule (How Enforced)

1. **Client sends `followUpUsed: false`** on first call.
2. If AI decides critical info is missing, it returns `mode: "FOLLOW_UP"` with a question.
3. **Client sends second call with `followUpUsed: true`** + `followUpAnswer`.
4. **Server enforces**: in `buildSystemPrompt()`, if `followUpUsed=true`, max follow-ups = 0. In `normalizeAiResponse()`, if `dto.followUpUsed === true`, mode is forced to `"RESULT"` regardless of what the AI returns.
5. **Zod schema** validates the AI output structure.
6. **E2E test** in `test/ai-search-guardrails.e2e-spec.ts` verifies this rule.

### Fallback Behavior

If AI fails (no API key, API error, JSON parse failure):
1. Falls back to `fallbackSearch()` which uses the raw `query` as a keyword search.
2. Filters: `{ q: query, radiusKm, sortBy: distance|date }`.
3. Calls `listingsService.findAll()` with these filters.
4. Returns `mode: "RESULT"` with whatever listings match.

### How Results Map to Listings Query

AI filters map to `ListingsService.findAll()` params:

| AI Filter | Listings Query Param |
|-----------|---------------------|
| `q` | `search` (ILIKE on title + description) |
| `categorySlug` | `categorySlug` → resolved to `category` (UUID) |
| `minPrice` | `minPrice` |
| `maxPrice` | `maxPrice` |
| `bookingType` | `bookingType` (if not `ANY`) |
| `radiusKm` | `radius` (meters = km × 1000) |
| `lat`/`lng` (from request) | `latitude`/`longitude` → PostGIS `ST_DWithin` |

---

## 7) API Contract Notes

### Response Wrapper Shape (Success)

Every successful response is wrapped by `TransformInterceptor`:

```json
{
  "success": true,
  "data": { /* actual response payload */ },
  "timestamp": "2026-02-24T01:30:00.000Z"
}
```

**File**: `src/common/interceptors/transform.interceptor.ts`

### Error Shape

All errors use `HttpExceptionFilter`:

```json
{
  "statusCode": 400,
  "timestamp": "2026-02-24T01:30:00.000Z",
  "path": "/api/users/me/become-host",
  "message": "acceptTerms must be a boolean value"
}
```

If the NestJS exception response is an object, `message` is extracted from `.message` property or the entire object.

**File**: `src/common/filters/http-exception.filter.ts`

### Endpoints with Special Validation

| Endpoint | Rule |
|----------|------|
| `POST /api/users/me/become-host` | Body must include `{ "acceptTerms": true }`. `acceptTerms` must be a boolean (`@IsBoolean()`). If `false`, the service will reject. |
| `POST /api/auth/register` | Either `email` or `phone` must be provided (not both required, but at least one). |
| `POST /api/listings` | `multipart/form-data` with `images` field. At least 1 image required, max 5, JPEG/PNG only, 5MB each. |
| `POST /api/ai/search` | `radiusKm` max 50. `followUpUsed` is boolean with default `false`. |

### Pagination Conventions

- **Listings search**: `page` (default 1) + `limit` (default 20, max 100). Offset-based.
- **No cursor pagination** anywhere.
- Response is a plain array (no `total`, `hasMore`, or pagination metadata in wrapper).

### Extra Quirks

- **Frontend data extraction**: The frontend always does `res.data?.data ?? res.data` to handle both wrapped and unwrapped responses.
- **displayStatus mapping**: Bookings API returns both internal `status` and a `displayStatus` field:
  - `pending` → `"pending"`
  - `confirmed` → `"accepted"`
  - `paid` → `"accepted"` (payment is internal milestone)
  - `completed` → `"completed"`
  - `cancelled` → `"canceled"` (American English)
  - `rejected` → `"rejected"`

---

## 8) Known Issues / Bugs

### Bug 1: `debug_findAll.log` file written on every listings search
- **Status**: ✅ FIXED. Disk I/O successfully eliminated from the search route. Verified in codebase.

### Bug 2: Email/Phone verification is a no-op
- **Symptom**: `POST /api/auth/verify` always succeeds regardless of input code.
- **Expected**: Should validate a real verification code.
- **Actual**: ✅ Verified as still buggy/stubbed. Code literally says `// TODO: Implement actual verification code check`.

### Bug 3: 401 interceptor does not attempt token refresh before redirect
- **Status**: ✅ FIXED. Verified that `http.ts` now uses a shared queue (`refreshPromise`) and intercepts `401` gracefully without looping.

### Bug 4: Listing create requires images but error happens after DB insert
- **Status**: ✅ FIXED. Verified that image checks happen *before* the Postgres `INSERT INTO`.

### Bug 5: Chat gateway CORS set to wildcard
- **Symptom**: Chat WebSocket accepts connections from any origin.
- **Actual**: 🚨 Verified as still present. `origin: '*'` is actively deployed on `/chat` gateway.

---

## 9) Recent Changes

> **Note**: This project directory is not a Git repository, so exact commit history is unavailable. The following is derived from file timestamps, migration history, and code comments.

### Timeline (from Prisma migrations)

1. **2026-02-12**: Initial schema — Users, Categories, Listings (with PostGIS), Bookings, Reviews, AdminLog, PaymentIntent.
2. **2026-02-15**: Added SlotConfiguration model and Chat models (Conversation + Message). Added `bookingType` enum (DAILY/SLOT).
3. **2026-02-21**: Added `AiSearchLog` model for AI search analytics.
4. **2026-02-22**: Added `rejected` status to `BookingStatus` enum.
5. **2026-02-24**: **Wallet Ledger v1**. Added LedgerEntry model, postCapture/postRefund logic, and admin read-only ledger endpoints.
6. **2026-02-24**: **Payouts v1 & Dispute Freeze**. Added Payout/PayoutItem models, disputeStatus to Booking. Implemented FIFO payout allocation.
7. **2026-02-24**: **Refund Guardrail v1**. Implementation to block refunds if a payout was already processed.
8. **2026-02-27**: **Nearby Categories Stability**. exhaustive 11-test E2E suite, proof artifacts, and Swagger runbook.
9. **2026-02-27**: **DevOps/DB Maintenance**. Fixed migration sequence order by re-indexing timestamps.
10. **2026-03-02**: **Availability & Conflict Hardening**. Ported DAILY/SLOT checks to use `BLOCKING_BOOKING_STATUSES` constant. Added listing-level MUTEX lock (`SELECT FOR UPDATE`) in `confirm` to prevent race conditions during acceptance.
11. **2026-03-04**: **Demo Hardening & Offline Resilience**. Successfully eliminated NextJS broken image icons natively resolving to `/placeholder.png`. Cleansed stale `/api/api` OpenAPI SDK generator. Added 401 silent background refresh interceptor. Patched remaining database vulnerabilities (orphan queries, lingering fs logs).
### Inferred recent work areas

- **Financial Core**: Wallet Ledger, Payouts, and Refund Guardrails (Atomic transactions, idempotent ledger postings).
- **AI Search module**: Full implementation with OpenAI integration, Zod validation, follow-up enforcement, fallback search, and logging.
- **Nearby Categories Stability**: PostGIS optimizations, includeEmpty flag, and secondary sorting by name.
- **Availability Hardening**: Listing-level mutex locks, transaction-safe SLOT checks, and 100% pass rate on concurrent race E2E tests.
- **Slot booking system**: SlotConfiguration, operating hours, buffer minutes, available slots endpoint.
- **Chat system**: Socket.IO gateway with JWT auth, multi-socket tracking, typing indicators.

### Risky areas

- `src/modules/listings/listings.service.ts` — complex raw SQL with PostGIS, dual fallback paths.
- `src/modules/ai/ai-search.service.ts` — OpenAI prompt engineering, JSON parse with 3 retry strategies.
- `src/modules/bookings/bookings.service.ts` — complex conflict detection relies heavily on explicit `SELECT FOR UPDATE` DB row locks.
- **Payments / Financial Integrity 🚨**: Payments are technically simulated. No robust third party payment webhook handlers exist. The existing state machine strictly controls flow, but only against *stubbed* inputs. There is also a hard guardrail in place blocking refunds if Host Payout assumes funds are cleared (`Refund Guardrail v1`).

---

## 10) Verification

### Backend

```bash
# Build
npm run build
# Expected: compiles to dist/ without errors

# Lint
npm run lint
# Expected: no errors (warnings possible)

# Unit Tests
npm run test
# Expected: ai-search.service.spec.ts should pass

# E2E Tests (requires running database)
npm run test:e2e
# Expected: 5 test suites — may require seeded database
# Test files:
#   test/app.e2e-spec.ts
#   test/booking-conflict.e2e-spec.ts
#   test/slot-booking-conflict.e2e-spec.ts
#   test/categories-nearby.e2e-spec.ts
#   test/ai-search-guardrails.e2e-spec.ts
#   test/ledger.e2e-spec.ts
#   test/payouts.e2e-spec.ts
#   test/refund-guard.e2e-spec.ts
#   test/listings-create.e2e-spec.ts
```

### Frontend

```bash
cd frontend

# Build
npm run build
# Expected: Next.js production build succeeds

# Lint
npm run lint
# Expected: runs eslint

# Tests
npm run test
# Note: Test infrastructure exists (Jest + React Testing Library + MSW configured in devDependencies)
# but no test files were found in frontend/src/. "No tests found" for frontend.
```

### ML Service

```bash
cd ml-service

# Install
pip install -r requirements.txt

# Run
python main.py
# Expected: FastAPI starts on port 8000

# Health check
curl http://localhost:8000/health
# Expected: {"status":"ok"}
```

> **No automated tests found** for the ML service.

---

*Generated: 2026-02-24. This document should be updated whenever major features or bugs are resolved.*
