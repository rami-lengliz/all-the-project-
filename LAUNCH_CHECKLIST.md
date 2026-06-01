# 🚀 RentEverything — Launch Checklist

Your definitive "before you go live" guide. Work top-to-bottom. Items are
ordered by urgency: **blockers first**, then operational setup, then
recommended polish. Everything under "Already done" is verified complete.

---

## 🔴 Blockers — the site cannot take real money / go public without these

- [ ] **Integrate a real payment processor.** Payments are currently *simulated*
      (`src/modules/payments/`). Konnect & Flouci are already wired in `.env`
      (`PAYMENT_PROVIDER`, `KONNECT_*`, `FLOUCI_*`) — you must finish the live
      flow and switch off the simulation. This is a **provider decision** before
      it's code: pick **Konnect** or **Flouci** (both Tunisian rails; Stripe has
      poor TN support). Until then, no real transactions.
- [ ] **Rotate the leaked dev keys.** `GEMINI_API_KEY`, `GOOGLE_CLIENT_SECRET`,
      `GMAIL_APP_PASSWORD`, and the dead `GROQ/OPENAI` key were shared in
      plaintext during development. Generate fresh ones and set them only in your
      production host's secret store — never commit them.
- [ ] **Set strong production secrets.** `JWT_SECRET`, `REFRESH_TOKEN_SECRET`,
      `JWT_REFRESH_SECRET` must be long random values (the app **refuses to boot**
      in production if they're missing or still the placeholder). Generate with:
      `node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"`

---

## ⚙️ Operational — required to deploy correctly

- [ ] **Restart the backend** so it picks up the latest Prisma client. (During
      development the dev server holds the engine DLL, so `prisma generate` can't
      replace it live.) A clean `npm run dev:all` (or a fresh prod boot) fixes it.
- [ ] **Run migrations on the production DB:** `npx prisma migrate deploy`.
      All migrations through `20260601140000_calendar_pricing_ical` must be applied.
- [ ] **Enable PostGIS on the production database:**
      `CREATE EXTENSION IF NOT EXISTS postgis;` (the init migration handles this on
      a fresh DB; verify after any restore).
- [ ] **Set production env vars** on the host (Railway/Render/etc.):
      `NODE_ENV=production`, `DATABASE_URL`, `CORS_ORIGINS=https://yourdomain`,
      `CLOUDINARY_API_SECRET`, `AI_PROVIDER=gemini`, `GEMINI_API_KEY`.
      Frontend: `NEXT_PUBLIC_API_URL=https://your-api-domain`.
- [ ] **Confirm the public domain.** `_app.tsx` hard-codes the OG image and URLs
      to `https://renteverything.tn`. If your domain differs, update the meta tags
      and `og-image` URL there.
- [ ] **Build both apps:** backend `nest build` (the `build` script also runs
      `prisma generate` + `db push`), frontend `npm run build`.

---

## 🟡 Recommended — cheap, high-value, do before or just after launch

- [ ] **Turn on Sentry.** Error tracking is wired but dormant. Create a free
      project at sentry.io → set `SENTRY_DSN` (backend) and
      `NEXT_PUBLIC_SENTRY_DSN` (frontend). Then you'll *know* when a user hits a
      crash instead of finding out from reviews. Zero code changes needed.
- [ ] **Seed real categories/data** for the launch market (`npm run seed` creates
      demo fixtures — replace with real inventory before going public).
- [ ] **Smoke-test the money-adjacent flows** end-to-end once live: book → host
      accept → pay → review → payout. And the new calendar: block dates, set a
      custom price, confirm the renter's total matches, export/import an iCal feed.
- [ ] **Host ID verification.** KYC has a status flag but no document-upload review
      UI. Fine for soft launch; build before scaling trust-sensitive categories.

---

## ✅ Already done & verified (this build)

- **Auth & security:** JWT + refresh with boot-time secret audit, bcrypt cost 12,
  Helmet, compression, CORS allow-list, rate limiting, password reset, email/phone
  OTP, Google OAuth with account linking.
- **Marketplace core:** daily + slot bookings with atomic double-booking
  prevention, two-sided reviews & ratings, disputes + resolution, wishlists,
  compare, last-minute deals, cancellation policies.
- **AI:** natural-language search, AI listing assistant (titles/descriptions/image
  classify), AI price suggestion (PostGIS comps), content-based personalization.
- **Trust:** host quality score + renter trust score, KYC status, masked chat
  (anti contact-leak), realtime Socket.IO messaging.
- **Money rails:** wallet, ledger, payouts (payment *capture* is the simulated
  part — see blockers).
- **Airbnb-style calendar:** host date-blocking, per-date custom pricing,
  minimum-nights, occupancy stats, two-way iCal sync (export + import). Bookings
  enforce blocks, per-day totals, and min-nights server-side.
- **Polish:** responsive layouts (mobile-first), skip-to-content + ARIA on modals,
  branded 404/500 + React error boundary, SEO meta + OG image + sitemap +
  manifest, Sentry plumbing (dormant).
- **Verification status at hand-off:** backend `tsc` clean, frontend `tsc` clean
  (excluding the pre-existing chatbot test files), production build green.

---

## 📌 Quick reference

```bash
# Apply DB migrations (prod)
npx prisma migrate deploy

# Backend type-check
npx tsc --noEmit -p tsconfig.build.json

# Frontend type-check (ignore known chatbot test failures)
cd frontend && npx tsc --noEmit -p tsconfig.json 2>&1 | grep -vE "features/chatbot/tests"

# Frontend production build
cd frontend && npm run build

# Promote a user to host+admin+verified (after they register)
node scripts/promote-user.mjs <email>
```

**Ports:** backend `:3001` (Swagger at `/api/docs`), frontend `:3000`, Postgres `:5433`.
