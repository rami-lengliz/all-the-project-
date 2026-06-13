# RentEverything — Project Briefing for Claude Chat

> Hand this file to Claude (chat) to get full context on the project in one shot.
> Last updated: 2026-05-28 | Branch: dev | Top commit: `735737e`

---

## What Is This?

**RentEverything** (internal name: RentAI) is a Tunisia-first rental marketplace. Renters can book stays, vehicles, sports facilities, and beach gear. The UX is AI-first — AI search, AI listing assistant, AI price suggestion, and an AI chatbot orchestrator are all core features, not add-ons.

Started as a university final-year project (PFE), currently being pushed toward a real **summer-2026 soft launch** targeting Kelibia, Tunis, and Nabeul.

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Backend | NestJS 10 (TypeScript), Prisma ORM, Passport/JWT |
| Frontend | Next.js 16 (Pages Router), React Query, React Hook Form + Zod, TailwindCSS 4 |
| Database | PostgreSQL 15 + PostGIS — Docker on port **5433** |
| AI | Google Gemini 2.5-flash via OpenAI-compatible endpoint (`AI_PROVIDER=gemini`) |
| Realtime | Socket.IO (chat) |
| Media | Cloudinary (wired) + local disk fallback |
| Auth extras | Google OAuth, OTP via Resend (email) / Twilio (SMS) |
| Payments | Flouci + Konnect (real Tunisian gateways, integrated) |

**Ports:** Backend → **3001** (Swagger at `/api/docs`). Frontend → **3000**.

---

## Key Directories

```
src/modules/
  auth/          JWT + Google OAuth, OTP email/phone verification
  users/         profile, become-host, home location
  listings/      CRUD, images, slot config, availability
  bookings/      DAILY and SLOT flows, host accept/reject, mutex locking
  ai/            search, listing assistant, price suggestion, image classifier
  categories/    PostGIS nearby-categories, category requests
  chat/          Socket.IO WebSocket gateway
  chatbot/       AI chatbot orchestrator, tool governance, trust/abuse protection
  payments/      Flouci + Konnect real payment providers
  wallet/        in-app credits, top-up intents, transactions
  ledger/        financial audit trail (RENT_PAID, COMMISSION, etc.)
  payouts/       host payout aggregation, FIFO, dispute freeze
  admin/         moderation, logs, user management, wallets
prisma/
  schema.prisma  source of truth — 26 models
frontend/src/
  pages/         Next.js routes (see routing table below)
  components/    UI components (auth/, host/, layout/, listings/, shared/, ui/)
  lib/auth/      AuthProvider, token storage
  lib/api/       HTTP client + React Query hooks
  lib/hooks/     useHostMode, useUserLocation, etc.
scripts/
  promote-user.mjs  promote any user to host + admin + verified
```

---

## DB Models (Prisma — 26 models)

`User`, `PasswordResetToken`, `CategoryRequest`, `Category`, `Listing`, `Booking`, `Review`, `AdminLog`, `PaymentIntent`, `Conversation`, `Message`, `SlotConfiguration`, `AiSearchLog`, `PriceSuggestionLog`, `LedgerEntry`, `Payout`, `PayoutItem`, `ChatConversation`, `ChatConversationSummary`, `ChatMessage`, `ChatbotActionConfirmation`, `ChatbotSecurityEvent`, `Wallet`, `VerificationCode`, `WalletTransaction`, `TopUpIntent`

---

## Feature Status (current as of 2026-05-28)

| Feature | Status | Notes |
|---------|--------|-------|
| Auth — login/register/refresh | ✅ | JWT access (15m) + refresh (7d), bcrypt, rate-limited |
| Google OAuth | ✅ | Smart linking — matching email merges with existing account |
| OTP verification (email/phone) | ✅ | Resend + Twilio. Dev: codes log to console |
| Password reset | ✅ | Token-based via email |
| Become-host flow | ✅ | Requires `acceptTerms: true` + at least one verified contact |
| Host/Renter mode toggle | ✅ | Header segmented control, `useHostMode` + localStorage |
| Listings CRUD + images | ✅ | Multer, 5 images max, Cloudinary + local fallback |
| AI listing assistant | ✅ | Generate/enhance descriptions, generate titles, image classifier |
| AI price suggestion | ✅ | PostGIS comparables (25km/75km/national), season multipliers |
| AI search | ✅ | Gemini, FOLLOW_UP + RESULT modes, max 1 follow-up enforced |
| Listing availability (DAILY) | ✅ | Date-range conflict detection |
| Listing availability (SLOT) | ✅ | SlotConfiguration, operating hours, buffer, `GET /available-slots` |
| Booking lifecycle | ✅ | pending→confirmed→paid→completed, mutex lock on confirm |
| Host accept/reject | ✅ | Accept frees/blocks slot; reject frees slot |
| Payments — Flouci | ✅ | Real integration |
| Payments — Konnect | ✅ | Real integration |
| Wallet (in-app credits) | ✅ | Top-up, spend on bookings, transaction history |
| Ledger (audit trail) | ✅ | Idempotent captures/refunds, admin view |
| Payouts | ✅ | Admin-only FIFO allocation, mark-paid, dispute freeze |
| Refund guardrail | ✅ | Blocks refund if HOST_PAYOUT ledger entry already exists |
| Two-sided reviews | ✅ | Host reviews renter, renter reviews host. 1 per booking |
| Listing compare page | ✅ | Side-by-side listing comparison |
| Geo / PostGIS search | ✅ | `ST_DWithin` radius filter, `ST_Distance` sort |
| Nearby categories | ✅ | `GET /api/categories/nearby` with PostGIS |
| Realtime chat | ✅ | Socket.IO, JWT auth, typing indicators, booking card in thread |
| AI chatbot | ✅ | Gemini orchestrator, 5-round resilience, trust/abuse protection |
| Chatbot tool governance | ✅ | Propose → confirm token flow before any mutations |
| Admin dashboard | ✅ | Users, listings moderation, logs, ledger, payouts, wallets, trust |
| Category requests | ✅ | Users can request new categories; admin approves/rejects |
| Location-aware home | ✅ | Browser geolocation → nearby categories + AI search |
| Leaflet map view | ✅ | `/map` page with listing pins |
| Host 5-step wizard | ✅ | Draft autosave to localStorage (`host:create:draft:v1`) |
| Profile completeness card | ✅ | Actionable steps shown on profile |
| Apple/Facebook OAuth | ❌ | Buttons exist, not wired |
| Host ID verification | ❌ | Not implemented |
| Chat CORS | ⚠️ | `origin: '*'` on Socket.IO gateway — known, not fixed yet |

---

## Booking Model

- **`bookingType`**: `DAILY` or `SLOT`
- **DAILY**: `startDate` + `endDate`
- **SLOT**: same-day + `startTime` + `endTime` (HH:mm)
- **Status flow**: `pending` → `confirmed` → `paid` → `completed`. Alternates: `rejected`, `cancelled`
- Only `confirmed` / `paid` / `completed` block availability. `pending` does NOT.
- 10% commission (`COMMISSION_PERCENTAGE` env)

---

## Roles

| Role | Condition |
|------|-----------|
| Renter | default (`isHost: false`) |
| Host | `isHost: true`, went through BecomeHostModal |
| Admin | `'ADMIN'` in `roles` array |

---

## Frontend Routing

| Route | Purpose |
|-------|---------|
| `/` | Home — geolocation, nearby categories, AI search bar |
| `/search` | Search results |
| `/map` | Leaflet map view |
| `/listings/[id]` | Listing detail |
| `/listings/compare` | Side-by-side comparison |
| `/profile` | User profile editor |
| `/help` | Help / FAQ |
| `/auth/*` | login, register, forgot-password, reset-password, oauth-callback |
| `/host/create` | 5-step listing wizard |
| `/host/listings` | My listings |
| `/host/listings/[id]/edit` | Edit listing |
| `/host/bookings` | Host booking management |
| `/host/dashboard` | Host dashboard |
| `/client/dashboard` | Renter dashboard |
| `/client/bookings` | Renter bookings |
| `/client/reviews` | Renter reviews |
| `/client/wallet` | Wallet — top-up + transaction history |
| `/booking/[id]` | Booking detail |
| `/booking/[id]/pay` | Payment checkout |
| `/messages` | Chat inbox |
| `/messages/[id]` | Chat thread |
| `/rentals` | Browse all rentals |
| `/admin/*` | dashboard, users, listings, logs, ledger, payouts, wallets, trust, categories |
| `/demo/ai-search` | AI search demo page |
| `/dev/*` | Dev smoke-test pages |

---

## AI Features Detail

### AI Search (`POST /api/ai/search`)
- Gemini 2.5-flash parses natural language → structured filters
- Two modes: `FOLLOW_UP` (one clarifying question max) → `RESULT`
- `followUpUsed: true` forces `RESULT` mode server-side regardless of AI output
- Hybrid scoring: FTS rank + rating + bookings + photos
- Fallback: if AI fails → raw keyword search on title/description

### AI Listing Assistant
- Generate title from details
- Enhance description
- Image classifier → auto-fill category

### AI Price Suggestion
- PostGIS comparables: 25km → 75km → national tiers
- Season multipliers (summer peak for Tunisia)
- Similarity-weighted median
- Shown at step 5 of host wizard, editable

### AI Chatbot
- Gemini orchestrator with tool governance
- Modes: Discovery / Booking / Host / General — deterministic pivoting
- Branching guided flows with outcome detection (completed / interrupted / expired)
- Session resume: detects pending confirmations or interrupted flows
- Trust layer: rate limits, abuse incident recording
- Propose → confirm token pattern — mutations never happen without explicit user confirmation

---

## Payment Providers

Both are real Tunisian payment gateways (not simulated):
- **Flouci**: `src/modules/payments/providers/flouci.provider.ts`
- **Konnect**: `src/modules/payments/providers/konnect.provider.ts`

Provider selected via `PaymentProviderRegistry`. Wallet top-up and booking checkout both use this system.

---

## Auth Flow

- **Storage key**: `re_auth_v1` in localStorage → `{ accessToken, refreshToken, user }`
- **401 handling**: shared `refreshPromise` queue, retries once, then redirects to `/auth/login`
- **Google OAuth**: callback at `/auth/oauth-callback`, `?next=` param preserved
- **OTP**: 6-digit codes — in dev they log to backend console, not sent via email/SMS
- **`@Public()` decorator**: marks routes that bypass JWT guard

---

## Environment Variables (critical ones)

```env
# Backend
DATABASE_URL=postgresql://postgres:<pw>@localhost:5433/rental_platform
JWT_SECRET=...
REFRESH_TOKEN_SECRET=...
AI_PROVIDER=gemini
GEMINI_API_KEY=...
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
RESEND_API_KEY=...
TWILIO_ACCOUNT_SID=...
TWILIO_AUTH_TOKEN=...
FLOUCI_APP_TOKEN=...
KONNECT_API_KEY=...
CLOUDINARY_CLOUD_NAME=...
CLOUDINARY_API_KEY=...
CLOUDINARY_API_SECRET=...
COMMISSION_PERCENTAGE=0.10

# Frontend
NEXT_PUBLIC_API_URL=http://localhost:3001
NEXT_PUBLIC_GOOGLE_CLIENT_ID=...
```

---

## Commands

```bash
# Start everything
npm run dev:all

# DB only
docker-compose up -d postgres

# Apply migrations
npx prisma migrate deploy

# Regenerate Prisma client
npx prisma generate

# Seed
npm run seed

# Promote user to host+admin
node scripts/promote-user.mjs user@example.com

# Type-check backend
npx tsc --noEmit -p tsconfig.build.json

# Type-check frontend (filter pre-existing chatbot test errors)
cd frontend && npx tsc --noEmit 2>&1 | grep -vE "features/chatbot/tests"
```

---

## Known Gotchas

1. **Gemini `max_tokens` ≥ 1500** — thinking tokens eat budget; don't optimize this down
2. **PostGIS must be enabled**: `CREATE EXTENSION IF NOT EXISTS postgis;` on fresh DB
3. **Seed users have Tunisian-name emails** (`ahmed.bensalah@rentai.tn`) — not `user1@example.com`
4. **OAuth-only users have `passwordHash: null`** — never `bcrypt.compare` against null
5. **`?next=` param** must be preserved through all auth redirects; `safeNext()` rejects external URLs
6. **Wizard draft**: `localStorage` key `host:create:draft:v1` — photos not serialized, re-upload needed
7. **Pre-existing type errors** in `frontend/src/features/chatbot/tests/*.test.ts` — filter, don't fix
8. **Socket.IO CORS** is `origin: '*'` — known issue, not yet fixed
9. **Frontend type errors are pre-existing** in chatbot test files — always filter when type-checking

---

## What's Left Before Launch

- Apple / Facebook OAuth (buttons exist, need wiring)
- Host ID verification upload
- Fix Socket.IO CORS from wildcard to origin whitelist
- Real email/SMS OTP validation (currently auto-approves in dev — must tighten for prod)
- CI/CD pipeline
- Production hardening (rate limits, CORS, secrets rotation)

---

## Risky / Complex Files

| File | Why risky |
|------|-----------|
| `src/modules/listings/listings.service.ts` | Complex raw PostGIS SQL, dual fallback paths |
| `src/modules/ai/ai-search.service.ts` | Prompt engineering, JSON parse with 3 retry strategies |
| `src/modules/bookings/bookings.service.ts` | `SELECT FOR UPDATE` mutex locking for conflict prevention |
| `frontend/src/pages/host/create.tsx` | 5-step wizard with autosave — fragile to restructure |
| `src/modules/payments/payments.service.ts` | Real money flow + refund guardrail logic |
