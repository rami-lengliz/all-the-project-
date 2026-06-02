# RentAI / RentEverything — Project Context

> Tunisia-first rental marketplace covering stays, vehicles, sports facilities, and beach gear. AI-first UX: every step that doesn't need the user shouldn't involve the user. Originally a final-year project (PFE), being pushed toward a real summer-2026 business launch.

---

## Tech Stack

- **Backend:** NestJS 10 (TypeScript), Passport, Prisma ORM — **runs on port 3001**
- **Frontend:** Next.js 16 (Pages Router, not App Router), React Query, React Hook Form + Zod, TailwindCSS 4 — **runs on port 3000**
- **Database:** PostgreSQL 15 + PostGIS — Docker container on port 5433
- **AI:** Google Gemini 2.5-flash (via OpenAI-compatible endpoint). **Set `AI_PROVIDER=gemini`** in `.env` — the older Groq key is dead.
- **Realtime:** Socket.IO for chat
- **Media:** Cloudinary for listing images (fallback to local storage)

## Port reminder

Backend on **3001** (Swagger at `http://localhost:3001/api/docs`). Frontend on **3000**. Some older docs and demo scripts have these reversed — they're wrong.

---

## Key Directories

```
src/modules/
  auth/          - JWT + Google OAuth, email/phone verification with OTP codes
  users/         - profile, become-host, home location, findOrCreateFromGoogle
  listings/      - CRUD, slot configuration, availability calculation
  bookings/      - DAILY and SLOT booking flows, host accept/reject
  ai/            - search, listing assistant, price suggestion, image classifier, embeddings
  categories/    - PostGIS nearby-categories
  chat/          - WebSocket gateway
  chatbot/       - separate AI chatbot orchestrator
  payments/      - simulated PaymentIntent flow
  wallet/        - in-app credits
  ledger/        - financial entries (RENT_PAID, COMMISSION, etc.)
  payouts/       - host payout aggregation
  admin/         - admin operations
prisma/
  schema.prisma  - source of truth for data model
  migrations/    - SQL migrations
frontend/src/
  pages/         - Next.js routes
  components/    - UI components (auth/, host/, layout/, listings/, shared/, ui/)
  lib/auth/      - AuthProvider, token storage
  lib/api/       - HTTP client + hooks (React Query)
  lib/hooks/     - shared hooks (useHostMode, useUserLocation)
scripts/
  promote-user.mjs - promote any user to host + admin + verified
```

## Key Features

- **AI search** — natural language → structured filters. Two modes: `FOLLOW_UP` (asks one clarifying question) and `RESULT`. Hybrid scoring (FTS rank + rating + bookings + photos).
- **AI listing assistant** — generates titles, enhances descriptions, classifies images for category auto-fill.
- **AI price suggestion** — PostGIS comparables (25km/75km/national tiers), season multipliers, similarity-weighted median.
- **Daily and slot bookings** — DAILY for stays/cars, SLOT for sports facilities. Atomic row-level locking prevents double-booking.
- **Location-aware categories** — `GET /api/categories/nearby` uses PostGIS to count listings within a radius.
- **Account verification** — 6-digit OTP codes via Resend (email) / Twilio (SMS). In dev, codes log to backend console.
- **Google OAuth** — with smart linking: matching email merges with existing account. Apple/Facebook buttons exist as visual placeholders.
- **Host vs Renter mode toggle** — segmented control in the header; nav adapts per mode. Backed by `useHostMode` hook + localStorage.

---

## Conventions

### Backend

- All routes prefixed `/api/*`
- `@Public()` decorator marks routes that bypass JWT guard
- `PrismaService` is global — inject directly, don't re-import the module
- Use `BadRequestException` for validation, `UnauthorizedException` for auth, `NotFoundException` for missing rows
- Throttle sensitive endpoints with `@Throttle({ default: { limit: N, ttl: 60_000 } })`

### Frontend

- File imports use `@/` alias mapping to `frontend/src/`
- API calls go through `api` from `@/lib/api/http` (handles JWT + refresh)
- Toasts: `import { toast } from '@/components/ui/Toaster'` — variants: `success`, `error`, `info`
- All routes auth-aware via `useAuth()` from `@/lib/auth/AuthProvider`
- Forms use React Hook Form + Zod resolver
- All hardcoded sample data has been replaced — never display fake review counts or ratings

### Code style

- TypeScript strict mode. No `any` unless unavoidable.
- Prefer editing existing files over creating new ones.
- No comments unless the *why* is non-obvious. Don't narrate what the code does.

---

## Gotchas that bite

1. **Gemini `max_tokens` must be ≥ 1500** for any non-trivial completion. Gemini 2.5-flash spends "thinking" tokens before output — low budgets cause mid-sentence truncation. Don't optimize this down.
2. **PostGIS must be enabled** on the DB. Init migration handles it; if you restore a fresh DB, run `CREATE EXTENSION IF NOT EXISTS postgis;`
3. **Seed users use Tunisian-name emails** (`fadi@gmail.com`) — older docs reference `user1@example.com` which doesn't exist by default. Use `node scripts/promote-user.mjs <email>` to make any user host + admin + verified.
4. **Pre-existing frontend type errors** in `frontend/src/features/chatbot/tests/*.test.ts` — ignore with `| grep -v "features/chatbot/tests"` when type-checking.
5. **OAuth-only users have `passwordHash: null`** — login service now checks this and returns a clear "Use Continue with Google" message. Don't `bcrypt.compare` against a null hash.
6. **The `next` query param** is honored by login, register, and Google OAuth — always preserve it through redirects. `safeNext()` helper rejects external URLs.
7. **Wizard draft autosave** writes `formData` and `slotConfig` to `localStorage` key `host:create:draft:v1`. Photos can't be serialized, so users have to re-upload them on refresh.

---

## Commands

```bash
# Start everything (postgres + backend + frontend)
npm run dev:all

# DB only
docker-compose up -d postgres

# Apply pending migrations
npx prisma migrate deploy

# Regenerate Prisma client (after schema change)
npx prisma generate

# Seed (creates Tunisian-name fixtures + demo listings)
npm run seed
# or `npm run seed:demo` if defined

# Promote a user (after registering them via UI or API)
node scripts/promote-user.mjs user1@example.com

# Type-check backend
npx tsc --noEmit -p tsconfig.build.json

# Type-check frontend (ignore pre-existing chatbot test failures)
cd frontend && npx tsc --noEmit -p tsconfig.json 2>&1 | grep -vE "features/chatbot/tests"

# Production build (frontend)
cd frontend && npm run build
```

---

## Booking model — quick reference

- **`Listing.bookingType`** is `'DAILY'` or `'SLOT'`
- **DAILY:** booking has `startDate` + `endDate`
- **SLOT:** booking has same `startDate` and `endDate` (one day) plus `startTime` + `endTime` (`HH:mm`)
- Booking status flow: `pending` → `confirmed` (host accepts) → `paid` (renter pays) → `completed`. Alternates: `rejected`, `cancelled`.
- Only `confirmed` / `paid` / `completed` block availability. `pending` does NOT.
- SLOT availability endpoint: `GET /api/listings/:id/available-slots?date=YYYY-MM-DD`
- 10% commission, configurable via env

---

## Roles

- **Renter** (default) — `isHost: false`
- **Host** — `isHost: true`, has gone through verification + accepted host terms via `BecomeHostModal`
- **Admin** — `'ADMIN'` in the `roles` array

Backend `becomeHost(userId, acceptTerms)` requires `acceptTerms: true` and at least one verified contact channel.

A user can switch contexts via the header mode toggle. Logic in `frontend/src/lib/hooks/useHostMode.ts`.

---

## When working on this project

- **Don't suggest rewriting things.** The codebase has been intentionally polished over many sessions. The owner is shipping, not refactoring.
- **Prefer minimum-viable changes** to high-traffic files like `frontend/src/pages/host/create.tsx` (it's the 5-step wizard — fragile to restructure).
- **Always run type checks** after backend/frontend changes. The frontend has pre-existing chatbot test failures that should be filtered, not "fixed."
- **The AI features are core differentiators.** Don't propose removing them. If they break, fix the prompt or the parsing — don't fall back to non-AI behavior.
- **Mobile responsiveness matters** — most Tunisian users are on phones.
- **Locale matters** — UI mixes French and English. Don't auto-translate without checking what's intentional.

---

## Where to look for things

| Need | Location |
|------|----------|
| Add a new API endpoint | `src/modules/<feature>/<feature>.controller.ts` |
| Change data model | `prisma/schema.prisma` + new migration in `prisma/migrations/` |
| Add a frontend page | `frontend/src/pages/<route>.tsx` |
| Add an API hook | `frontend/src/lib/api/hooks/use<X>.ts` |
| Find an existing UI pattern | `frontend/src/components/` (look in `ui/`, `auth/`, `host/`, `shared/`) |
| Demo script | `DEMO_SCRIPT.md` in repo root |
| Onboarding/CLAUDE rules | this file |
| Memory of past sessions | `~/.claude/projects/.../memory/MEMORY.md` |

---

## Current state (as of June 2026)

Functionally complete for a soft launch. Recent re-engineering:
- 5-step publishing wizard with AI integrations and draft autosave
- Register flow simplified — no Rent/Host intent picker (users pick later)
- Profile completeness card with actionable steps
- Host/Renter mode toggle in header
- Become-a-host modal with verification + terms checks
- Google OAuth with smart account linking
- All hardcoded review counts replaced with real ratings
- Friendly auth error messages and `?next=` redirects everywhere
- Listing edit page exposes slot config + a "Calendar & pricing" link
- **Airbnb-style availability calendar**: host date-blocking, per-date custom
  pricing, minimum-nights, occupancy stats, and two-way iCal sync
  (export `.ics` + import external feeds). Bookings enforce blocks, per-day
  totals, and min-nights. See `ListingsService` + `host/listings/[id]/calendar.tsx`.
- Error monitoring (Sentry) wired but dormant until a DSN is set — `@sentry/node`
  (backend) + dynamically-imported `@sentry/react` (frontend).

### Gotcha worth repeating
- `req.user` is `{ sub, email, role }` — **use `req.user.sub`**, never
  `req.user.id` (the latter is `undefined` and silently fails ownership checks).

Known gaps (mostly post-launch / business decisions):
- **Real payment processor not integrated** — Konnect/Flouci are wired in env
  but the flow is simulated. The #1 launch blocker; it's a provider decision.
- Apple/Facebook OAuth not wired (visual only — intentional).
- No host ID-upload verification beyond the KYC status flag.
- Leaked dev API keys in `.env` should be rotated before going public.
