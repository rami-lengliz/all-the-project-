# RentEverything — ACCEPTANCE_CHECKLIST.md (MVP)

This checklist defines what “Done” means for the RentEverything MVP.  
A feature is **Done** only when its acceptance criteria are met **end-to-end** (frontend + backend + DB) and passes a clean demo scenario.

---

## Global acceptance (applies to everything)

- [ ] **Runs locally from scratch** using documented steps (DB + API + Frontend).
- [ ] **No secrets committed** (keys only via env).
- [ ] **Basic validation + error states** (no silent failures).
- [ ] **Access control is correct** (no unauthorized reads/writes).
- [ ] **API is documented** (Swagger for core endpoints).
- [ ] **Seed + demo reset** exists (one command to reseed demo data).
- [ ] **Logging exists** for key flows (auth, booking, payment, AI calls, chat).

---

## A) Location-first discovery (Facebook Marketplace-style)

### A1. Location detection + fallback
- [ ] On first visit, the app requests geolocation permission once.
- [ ] If user denies/unavailable: user can **manually choose location** (city/area).
- [ ] User can change **location + radius** anytime.
- [ ] Backend supports nearby queries using `lat`, `lng`, `radiusKm`.

### A2. Location-aware categories (supply-driven)
- [ ] Home shows **only categories with active listings** within radius.
- [ ] Each category shows a **count** (e.g., “12 available”).
- [ ] Changing location/radius updates categories & counts correctly.

### A3. Nearby listings
- [ ] “Nearby” feed returns listings filtered by location/radius.
- [ ] Listings outside radius do not appear.
- [ ] Pagination or infinite scroll works without duplicates.

---

## B) Listings (CRUD) + media

### B1. Create listing (minimum steps)
- [ ] Provider can create listing with minimal required fields:
  - Title, description (can be AI-assisted)
  - Listing type/template: `STAY | FACILITY | MOBILITY | ITEM`
  - Category
  - Price (amount + unit)
  - Location (lat/lng + area label)
- [ ] Provider can **edit**, **pause**, and **delete** listing.
- [ ] Paused listings do **not** appear publicly and cannot be booked.

### B2. Media (photos)
- [ ] Provider can upload photos and they are displayed on listing pages.
- [ ] Basic validation exists (max count/size).
- [ ] Listing detail shows gallery reliably.
- [ ] Media URLs are persisted in DB (not only in-memory).

---

## C) Scheduling & availability (calendar)

### C1. Stays (date-based)
- [ ] Listing type `STAY` supports date selection on listing page.
- [ ] Backend checks availability before booking request submission.
- [ ] Once booking is **confirmed (paid)**, dates are blocked.
- [ ] Double booking is prevented for confirmed dates.

### C2. Facilities (slot-based recommended)
- [ ] Listing type `FACILITY` supports a schedule (opening hours + slot duration OR slot table).
- [ ] Renter can pick a **slot** (date + start/end).
- [ ] Backend validates slot availability at booking request time.
- [ ] Once booking is **confirmed (paid)**, slot is blocked.
- [ ] Double booking is prevented for confirmed slots.

### C3. Mobility / Items (MVP-light)
- [ ] Mobility/Items have at least:
  - either date-based booking (simple) **or**
  - “temporarily unavailable” toggle that blocks requests.
- [ ] Backend enforces availability rules (not only UI).

---

## D) Bookings (request → accept → pay → confirm) + commission

> **Product rule kept:** booking is **confirmed only after payment**.  
> **Commission** is applied platform-side (configurable percentage).

### D1. Booking request creation
- [ ] Renter can create a booking request from a listing:
  - STAY: start/end dates
  - FACILITY: slot (start/end)
  - Other: MVP rule applied consistently
- [ ] Booking request is created in status `PENDING`.
- [ ] Provider can view incoming booking requests list.

### D2. Accept / reject / cancel
- [ ] Provider can **accept** or **reject** a pending request.
- [ ] Renter can **cancel** a pending request.
- [ ] Status changes are permissioned correctly (only allowed roles).
- [ ] Status is visible to both sides with timestamps.

### D3. Payment & confirmation (MVP)
- [ ] After provider accepts, renter can **pay** for the booking.
- [ ] Payment results in status `PAID`/`CONFIRMED` (your chosen naming is consistent).
- [ ] Commission is calculated and stored (based on env-config percent).
- [ ] Confirmed booking blocks availability (calendar conflict prevention).

### D4. Booking lifecycle integrity
- [ ] Confirmed bookings cannot be double-confirmed for same slot/dates.
- [ ] If availability becomes unavailable before payment, payment is rejected gracefully.
- [ ] Booking endpoints reject invalid transitions (e.g., paying a rejected booking).

---

## E) Chat (realtime) per booking

### E1. Chat thread & permissions
- [ ] Each booking has a chat thread.
- [ ] Only renter + provider (participants) can read/write messages.

### E2. Realtime + persistence
- [ ] Messages deliver in realtime (Socket.IO).
- [ ] Messages are persisted in DB and reload correctly after refresh.
- [ ] Basic UX exists: timestamps, sender, ordering, pagination if needed.

---

## F) AI (MVP — required)

### F1. AI Search (single-shot + max 1 follow-up)
- [ ] User can search using natural language.
- [ ] AI returns **structured JSON filters** validated by schema.
- [ ] UI shows “What I understood” chips (category, radius, price, dates/slots, etc.).
- [ ] AI asks **at most one** follow-up question only when critical info is missing.
- [ ] If AI fails/timeouts: fallback search/filter flow still works.
- [ ] Logs saved: query, AI filters output, follow-up asked (Y/N), results count.

### F2. AI Listing Assistant (provider)
- [ ] AI suggests category (with confidence).
- [ ] AI generates/improves title + bullet description.
- [ ] AI produces a missing-info checklist (optional score).
- [ ] Suggestions are editable and never forced.
- [ ] AI does not invent facts not provided by the user.
- [ ] Logs saved: suggestions accepted vs edited.

### F3. AI Price suggestion
- [ ] AI outputs a **price range** (min/max) + short rationale + confidence.
- [ ] Provider can apply or ignore.
- [ ] Fallback baseline exists if AI fails.
- [ ] Logs saved: suggested vs final price.

---

## G) Reviews (kept in MVP)

- [ ] Renter can leave a review for a listing/provider after a completed/confirmed booking rule (consistent).
- [ ] Review includes rating + text.
- [ ] Reviews are visible on listing/provider profile pages.
- [ ] Basic moderation exists (admin can hide abusive review OR hide listing/user).

---

## H) Admin / reporting (MVP-light)

- [ ] Users can report listing/user with a reason.
- [ ] Admin can view reports and take action:
  - hide listing
  - suspend user
- [ ] Hidden listings do not appear in public discovery/search.
- [ ] Actions are audited (who/when).

---

## I) Security & anti-abuse (basic)

- [ ] Passwords hashed (argon2 recommended).
- [ ] JWT access + refresh tokens implemented.
- [ ] Rate limiting enabled for:
  - login attempts (optional)
  - creating booking requests
  - sending chat messages
- [ ] CORS configured correctly for frontend domain(s).
- [ ] Input validation enforced on backend (DTO/validation pipe).

---

## J) Seed data (demo quality)

Seed data must allow a convincing demo and test key logic.

- [ ] Multi-city: **Kelibia + Tunis** (optional: Nabeul/Hammamet).
- [ ] 60–90 listings total (recommended distribution across templates).
- [ ] Facility listings include schedules + blocked slots.
- [ ] At least 40 booking requests seeded (mixed statuses).
- [ ] At least 100 chat messages seeded.
- [ ] At least 1 conflict demo exists:
  - one booking confirmed → dates/slots blocked → second request fails.
- [ ] Demo script can be executed repeatedly after reseed.

---

## K) Deployment (MVP demo readiness)

- [ ] Deployed frontend URL works (Vercel recommended).
- [ ] Deployed backend URL works (Render/Railway recommended).
- [ ] Environment variables set correctly.
- [ ] Demo scenario works end-to-end on deployed setup.

---

## “MVP done” definition (final)

The MVP is accepted when:
- [ ] The core demo runs end-to-end: location → AI search → listing → booking request → chat → accept → pay → confirm → availability blocks → review.
- [ ] No empty marketplace: seeded data supports realistic browsing in Kelibia and Tunis.
- [ ] AI guardrails (single-shot + max 1 follow-up + JSON output + fallback) are enforced.
- [ ] Booking pay/commission rules and reviews are present and functional.
