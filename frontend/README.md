# RentEverything — Frontend (Next.js)

This folder contains the **web frontend** for RentEverything (RentAI), built to support:
- **All-in-one rentals** (stays, sports facilities, mobility, items, etc.)
- **Location-first discovery** (Facebook Marketplace-style nearby browsing)
- **Minimum steps UX** (fast actions, clear screens)
- **AI-powered flows** (AI Search, AI Listing Assistant, AI Price suggestion)
- **Booking + Pay + Commission** product rules
- **Reviews** after completed/confirmed bookings
- **Chat per booking** (realtime + persisted)

---

## Tech stack (locked)

- **Next.js + TypeScript** (Pages Router)
- **TailwindCSS**
- **TanStack React Query** (API data fetching/caching)
- **React Hook Form + Zod** (forms + validation)
- **Leaflet / React-Leaflet** (maps — optional in MVP)
- Realtime chat client: **Socket.IO** (used for booking chat)

---

## Quick start

### 1) Install dependencies
```bash
cd frontend
npm install
```

### 2) Create env file
Create `frontend/.env.local`:
```env
NEXT_PUBLIC_API_URL=http://localhost:3000
NEXT_PUBLIC_DEFAULT_RADIUS_KM=10
```

### 3) Run the frontend
```bash
npm run dev
```

Frontend runs on:
- `http://localhost:3001` (recommended)

> If Next.js starts on `3000`, change it to `3001` to avoid collision with the backend API.

---

## Scripts

```bash
npm run dev        # run locally
npm run build      # production build
npm run start      # run production build locally
npm run lint       # lint checks
```

---

## Required backend services (expected)

The frontend expects the backend to provide:
- Auth (JWT access + refresh)
- Listings CRUD + media URLs
- Nearby listing search (lat/lng + radiusKm)
- Location-aware categories (computed from supply in radius)
- Booking lifecycle (request → accept → pay → confirm → complete)
- Chat per booking (realtime Socket.IO + stored messages)
- Availability calendar:
  - Stays: date ranges
  - Facilities: fixed slots (recommended)
- AI endpoints:
  - AI Search (single-shot + max 1 follow-up) returning **structured JSON filters**
  - AI Listing Assistant suggestions
  - AI Price range suggestion (min/max)

---

## Routing map (Pages Router)

This project uses `src/pages/*`.

Typical pages (may evolve as features align):
- `src/pages/index.tsx` — Home (location detect + categories in radius + nearby feed)
- `src/pages/search.tsx` — **AI Search** (single-shot + optional 1 follow-up)
- `src/pages/listings/[id].tsx` — Listing details + calendar/slot selection + booking request
- `src/pages/booking/*` — Booking request flow + status + payment entry + chat (MVP core)
- `src/pages/client/*` — Renter dashboard (my bookings, requests, messages)
- `src/pages/host/*` — Provider dashboard (my listings, booking requests, calendar)
- `src/pages/auth/*` — Login/Register
- `src/pages/admin/*` — Basic moderation/reporting (MVP-light)

---

## Key UX rules (non-negotiable)

### 1) Minimum steps per action
- **Search → listing → request** should be as few clicks as possible
- Provider listing creation should be optimized by **AI suggestions** (less typing)

### 2) Location-first
- On first visit, ask for geolocation permission once
- If denied: show a **manual location selector**
- Always allow changing radius/location quickly

### 3) Booking rules
- Booking is considered **confirmed only after payment**
- Confirmed booking blocks dates/slots (conflict prevention)
- Reviews are enabled after completion/confirmed criteria

### 4) AI guardrails
- AI Search returns **validated JSON** (schema-checked)
- **Max 1 follow-up** question
- Always show “What I understood” chips so users can trust and edit

---

## Data fetching conventions (React Query)

- Use React Query for all server state (lists, details, bookings, messages).
- Use stable query keys, e.g.:
  - `['listings', { lat, lng, radiusKm, categoryId }]`
  - `['listing', listingId]`
  - `['booking', bookingId]`
  - `['categories', { lat, lng, radiusKm }]`

Suggested structure:
- `src/lib/api/*` — API client functions (typed)
- `src/lib/queryKeys.ts` — shared query keys
- `src/lib/schemas/*` — Zod schemas for API responses and AI JSON outputs

---

## Realtime chat (Socket.IO)

Chat is tied to a booking.
Frontend requirements:
- Connect to Socket.IO server (backend)
- Subscribe to booking room (e.g., `booking:{id}`)
- Persist messages through API and/or server emits
- Only booking participants can access chat

---

## AI Search UX (MVP)

AI Search must:
1) Accept a natural-language prompt
2) Return structured filters JSON
3) Show chips:
   - category, location/radius, price, dates/slots, capacity (if relevant)
4) Ask **at most one** follow-up only if critical info missing (e.g., dates)

Fallback:
- If AI fails, normal filtering/search still works

---

## Media (photos)

MVP can start with returned image URLs.
Recommended production setup:
- Cloudinary for uploads + optimization + CDN

Frontend should:
- Validate file count/size
- Upload and store returned URLs
- Render gallery on listing page

---

## Deployment (recommended)

- Deploy frontend to **Vercel**
- Set env vars in Vercel:
  - `NEXT_PUBLIC_API_URL` → your backend URL

---

## Troubleshooting

### API calls failing
- Check `NEXT_PUBLIC_API_URL`
- Ensure backend runs on `http://localhost:3000`
- Check CORS enabled on backend

### Location not working
- Use HTTPS in production for geolocation
- Add fallback city selection in UI

### Calendar/slots conflicts
- Frontend must rely on backend availability checks
- Never block availability client-side without backend confirmation

---

## Contributing rules

- Small PRs (one purpose per PR)
- No hard-coded location/category data in UI (fetch from API)
- Keep changes aligned with the MVP docs:
  - Must/Later scope
  - Definition of Done per feature
  - AI guardrails
