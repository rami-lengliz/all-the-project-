# PROJECT_STATUS_PACKET.md — RentEverything

> **Purpose**: Hand this file to any new engineer so they can understand the entire project in 10 minutes.

---

## 1) Quick Summary

- **Product**: RentEverything — an all-in-one, location-aware rental marketplace (stays, vehicles, sports facilities, beach gear, etc.) targeting Tunisia (Kelibia, Tunis, Nabeul).
- **Stack**: NestJS + PostgreSQL/PostGIS backend, Next.js 16 frontend, FastAPI ML microservice, Socket.IO realtime chat.
- **Production-ready**: Auth (JWT access+refresh), bookings lifecycle with conflict prevention, PostGIS geo search, AI search (OpenAI + fallback), payments with commission, admin moderation, chat.
- **Demo-only**: Payments are simulated (no real payment gateway), email/phone verification is stubbed (`verify` endpoint auto-approves), ML service uses rule-based heuristics (no real ML model), Cloudinary not wired (local uploads only).
- **Current blockers**: No real payment provider integration. Verification flow is a placeholder. No CI/CD pipeline. Not deployed to any hosting environment.

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
| **Backend API** | `http://localhost:3000` |
| **Swagger Docs** | `http://localhost:3000/api/docs` |
| **Frontend** | `http://localhost:3001` (if backend is on 3000) |
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
| **ml** | `src/modules/ml/` | Proxy to FastAPI ML microservice (category + price suggestions). |
| **chat** | `src/chat/` | Socket.IO WebSocket gateway for realtime messaging. |

### DB Schema Overview (Prisma — 11 models)

```
User ──┬── Listing ──┬── Booking ──── Review
       │             │             └── PaymentIntent
       │             ├── SlotConfiguration
       │             └── Conversation ── Message
       ├── AdminLog
       └── AiSearchLog
Category ── Listing
```

**Key relationships:**
- `User` → `Listing` (host), `Booking` (renter/host), `Review` (author/target), `PaymentIntent`, `Conversation`, `Message`
- `Listing` → `Category`, `Booking`, `Review`, `Conversation`, `SlotConfiguration`
- `Booking` → one `Review`, one `PaymentIntent`, many `Conversation`
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
| `/auth/login` | Login |
| `/auth/register` | Register |
| `/host/dashboard` | Host dashboard |
| `/host/create` | Create listing (with image upload) |
| `/host/listings` | Host's listings |
| `/host/bookings` | Host's bookings |
| `/client/dashboard` | Client dashboard |
| `/client/bookings` | Client's bookings |
| `/client/reviews` | Client's reviews |
| `/admin/dashboard` | Admin dashboard |
| `/admin/listings` | Admin listing moderation |
| `/admin/users` | Admin user management |
| `/admin/logs` | Admin audit logs |

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
| **Categories nearby** | ✅ | `GET /api/categories/nearby?lat=&lng=&radiusKm=` with PostGIS | `src/modules/categories/categories.service.ts` |
| **Listing create/edit + images** | ✅ | Multer disk storage, 5MB/file, 5 files max, JPEG/PNG only | `src/modules/listings/listings.controller.ts` |
| **Availability rules** | ✅ | DAILY: date ranges. SLOT: `SlotConfiguration` with operating hours. Blocking statuses prevent conflicts. | `src/modules/listings/listings.service.ts`, `src/common/utils/availability.service.ts` |
| **Booking lifecycle + locking** | ✅ | pending → confirmed → paid → completed. Conflict prevention on confirmed/paid bookings. | `src/modules/bookings/bookings.service.ts` |
| **Booking reject** | ✅ | Host rejects pending → status `rejected`, slot freed | `src/modules/bookings/bookings.service.ts` (L300–337) |
| **Payments + commission** | ⚠️ | Simulated (no real gateway). Commission = `COMMISSION_PERCENTAGE` × totalPrice. PaymentIntent lifecycle works. | `src/modules/payments/`, `src/modules/bookings/bookings.service.ts` |
| **Refunds** | ⚠️ | `POST /api/payments/booking/:id/refund` exists but is simulated | `src/modules/payments/payments.controller.ts` |
| **Reviews** | ✅ | One review per booking (unique constraint). Post-booking only. | `src/modules/reviews/` |
| **Admin pages** | ✅ | Dashboard, listing moderation, user management, audit logs | `frontend/src/pages/admin/` |
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

- **Symptom**: A `debug_findAll.log` file gets created/appended at the project root on every call to `GET /api/listings`.
- **Steps to reproduce**: Call `GET /api/listings` (even without filters). Check project root for `debug_findAll.log`.
- **Expected**: No debug file in production code.
- **Actual**: `fs.appendFileSync('debug_findAll.log', ...)` is left in the code.
- **Likely cause**: Debug logging left behind during development.
- **File**: `src/modules/listings/listings.service.ts` (line ~180–183)

### Bug 2: Email/Phone verification is a no-op

- **Symptom**: `POST /api/auth/verify` always succeeds regardless of input code.
- **Steps to reproduce**: Call verify with any `userId` and `type: "email"`.
- **Expected**: Should validate a real verification code.
- **Actual**: Auto-approves with `// TODO: Implement actual verification code check`.
- **Likely cause**: Intentional placeholder for MVP.
- **File**: `src/modules/auth/auth.service.ts` (L137–159)

### Bug 3: 401 interceptor does not attempt token refresh before redirect

- **Symptom**: On 401 response, frontend immediately clears auth and redirects to `/auth/login` instead of trying the refresh token first.
- **Steps to reproduce**: Wait for access token to expire (15m), then make any API call.
- **Expected**: Axios interceptor should attempt `POST /auth/refresh` before clearing auth.
- **Actual**: Immediately clears localStorage `re_auth_v1` and redirects to `/auth/login`. The `refreshAccessToken` function exists in `AuthProvider` but is not used by the interceptor.
- **Likely cause**: The 401 interceptor in `http.ts` was written separately from the `AuthProvider` refresh logic.
- **Files**: `frontend/src/lib/api/http.ts` (L37–61), `frontend/src/lib/auth/AuthProvider.tsx` (L133–153)

### Bug 4: Listing create requires images but error happens after DB insert

- **Symptom**: A listing record is created in the DB but then an error is thrown if no images are provided.
- **Steps to reproduce**: Call `POST /api/listings` with valid fields but no image files.
- **Expected**: Validation should reject before DB insert.
- **Actual**: Listing is inserted, images array is empty, then `BadRequestException('At least one image is required')` is thrown at line ~140–142. Orphan listing remains.
- **Likely cause**: Image validation check is placed after the `INSERT` query.
- **File**: `src/modules/listings/listings.service.ts` (L73–142)

### Bug 5: Chat gateway CORS set to wildcard

- **Symptom**: Chat WebSocket accepts connections from any origin.
- **Steps to reproduce**: Connect to `/chat` namespace from any domain.
- **Expected**: Should restrict to known frontend origins in production.
- **Actual**: `origin: '*'` in gateway decorator.
- **File**: `src/chat/chat.gateway.ts` (line 17)

---

## 9) Recent Changes

> **Note**: This project directory is not a Git repository, so exact commit history is unavailable. The following is derived from file timestamps, migration history, and code comments.

### Timeline (from Prisma migrations)

1. **2026-02-12**: Initial schema — Users, Categories, Listings (with PostGIS), Bookings, Reviews, AdminLog, PaymentIntent.
2. **2026-02-15**: Added SlotConfiguration model and Chat models (Conversation + Message). Added `bookingType` enum (DAILY/SLOT).
3. **2026-02-21**: Added `AiSearchLog` model for AI search analytics.
4. **2026-02-22**: Added `rejected` status to `BookingStatus` enum.

### Inferred recent work areas

- **AI Search module**: Full implementation with OpenAI integration, Zod validation, follow-up enforcement, fallback search, and logging. High-risk area (OpenAI prompt engineering, JSON parsing).
- **Slot booking system**: SlotConfiguration, operating hours, buffer minutes, available slots endpoint.
- **Chat system**: Socket.IO gateway with JWT auth, multi-socket tracking, typing indicators.
- **Booking reject flow**: Added `rejected` status, host can reject pending bookings.
- **Frontend AuthProvider**: Hydration-safe restore, SSR-compatible, StorageEvent sync.

### Risky areas

- `listings.service.ts` — complex raw SQL with PostGIS, dual fallback paths, debug logging left in.
- `ai-search.service.ts` — OpenAI prompt engineering, JSON parse with 3 retry strategies.
- `bookings.service.ts` — complex conflict detection across DAILY and SLOT types.

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
