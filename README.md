# RentEverything — All-in-One Rental Platform (PFE + Real Business MVP)

RentEverything is an **all-in-one rental marketplace** (houses/villas, scooters/vehicles, beach gear, sports facilities, and more) built as a **PFE project** with the goal of becoming a real business.

Two product pillars drive every decision:
1) **All-in-one rentals** (multi-category, location-aware supply)
2) **Extreme simplicity** (clear UI, minimum steps per action), powered by **AI**.

---

## What’s included in the MVP

### Core flows

**Renter**
1. App detects location (like Facebook Marketplace) or user chooses a city
2. User searches with **AI Search** (single-shot + optional 1 follow-up max)
3. User opens a listing, selects dates/slot (when relevant)
4. User submits a **Booking Request**
5. **Chat** opens inside that booking request
6. Host accepts/rejects
7. If accepted → renter pays → booking is confirmed → calendar blocks availability
8. After completion → renter can leave a **Review**

**Provider (Host)**
1. Creates a listing fast (minimal required fields)
2. Uses **AI Listing Assistant** (category guess, description, checklist)
3. Uses **AI Price suggestion** (min/max range)
4. Sets availability (stays = dates; facilities = slots)
5. Receives booking requests + chats
6. Accepts/rejects; if accepted, payment is required and availability is blocked

---

## Categories & scheduling types

RentEverything supports multiple “templates” (so users see only relevant fields):

### 1) Stays (houses/villas)
- Pricing: per day / per night
- Availability: **date range calendar**
- Conflict rule: once paid/confirmed, dates are blocked

### 2) Sports facilities (football/volleyball/pitches/courts)
- Pricing: per slot / per hour
- Availability: **slot calendar** (recommended)
- Conflict rule: once paid/confirmed, slots are blocked

### 3) Mobility (scooters/vehicles)
- Pricing: per day (MVP)
- Availability: simple available/unavailable or day-based (MVP)

### 4) Items (beach gear, tools, etc.)
- Pricing: per day or per item/day (MVP)
- Availability: simple available/unavailable (MVP)

> **Location-aware categories:** the Home page shows only categories that have supply **within the user’s radius**, with counts.

---

## AI features (MVP — required)

### 1) AI Search (Layla-style)
- Input: user text + location + radius (+ optional available categories in radius)
- Output: **structured JSON filters**
- Rule: **single-shot + optional 1 follow-up question (max 1)** only if critical info is missing
- UI: shows “What I understood” chips for trust & quick edits
- Fallback: if AI fails → normal filtering works

### 2) AI Listing Assistant
- Suggest category (with confidence)
- Generate/improve title + bullet description
- Generate missing-info checklist (optional score)
- **Never invent facts** (pool, sea view, etc.) unless provided by the host

### 3) AI Price suggestion
- Outputs a **range** (min/max) + short reason + confidence
- Host can apply or ignore
- Fallback: rule-based baseline range

---

## Product rules (kept in MVP)

### Booking + Pay + Commission (kept)
- Bookings have a lifecycle that includes payment confirmation
- Commission is applied platform-side (configurable percentage)
- Payment is required for a booking to be considered “confirmed”

### Reviews (kept)
- Reviews are allowed after completion (or after a confirmed booking)
- Basic moderation tools exist (admin can hide listings/users)

---

## Tech stack (locked)

### Backend
- **NestJS + TypeScript**
- **PostgreSQL 15 + PostGIS** (geo queries for nearby/radius)
- **Prisma** (ORM + migrations)
- **JWT auth** (access + refresh)
- **Socket.IO** (realtime chat)
- **Rate limiting** (Nest Throttler)
- **Swagger/OpenAPI** docs

### Frontend
- **Next.js + TypeScript** (Pages Router)
- TailwindCSS
- React Hook Form + Zod
- TanStack React Query
- Leaflet/React-Leaflet (maps optional)

### AI
- OpenAI API (or compatible LLM API)
- Optional local microservice (`ml-service/`) for experimentation (not required if AI runs inside Nest)

### Media (recommended)
- Cloudinary (preferred for production)  
  *(MVP can start with local uploads, then switch to Cloudinary.)*

---

## Repository structure

```
/
├─ src/                  # NestJS backend (API)
├─ prisma/               # Prisma schema + migrations (after TypeORM → Prisma migration)
├─ frontend/             # Next.js web app
├─ ml-service/           # Optional FastAPI microservice (experimental)
├─ docker-compose.yml    # Postgres + backend (+ optional ml-service)
├─ README.md
└─ ACCEPTANCE_CHECKLIST.md
```

---

## Environment variables

### Backend (`.env`)
Create `.env` from `.env.example` (recommended). Minimum:

- `PORT=3000`
- `DATABASE_URL=postgresql://postgres:postgres@localhost:5432/rental_platform?schema=public`
- `JWT_SECRET=...`
- `JWT_EXPIRES_IN=15m`
- `REFRESH_TOKEN_SECRET=...`
- `REFRESH_TOKEN_EXPIRES_IN=7d`
- `COMMISSION_PERCENTAGE=0.10`

AI:
- `OPENAI_API_KEY=...`
- `AI_MODEL=gpt-4.1-mini` (example)
- `AI_MAX_FOLLOWUPS=1`

Media (if Cloudinary):
- `CLOUDINARY_CLOUD_NAME=...`
- `CLOUDINARY_API_KEY=...`
- `CLOUDINARY_API_SECRET=...`

### Frontend (`frontend/.env.local`)
- `NEXT_PUBLIC_API_URL=http://localhost:3000`
- (Optional) `NEXT_PUBLIC_DEFAULT_RADIUS_KM=10`

---

## Local development (recommended)

### 1) Start database (Postgres + PostGIS)
```bash
docker compose up -d postgres
```

### 2) Backend setup
```bash
npm install
npx prisma generate
npx prisma migrate dev
npm run start:dev
```

Swagger:
- `http://localhost:3000/api`

### 3) Seed demo data
```bash
npm run seed
```

### 4) Frontend setup
```bash
cd frontend
npm install
npm run dev
```

Frontend:
- `http://localhost:3001` (recommended)  
If Next runs on 3000, change it to avoid collision with backend.

---

## Seed data (demo must never be empty)

Seed must include:
- Multi-city: **Kelibia + Tunis** (and optional Nabeul/Hammamet)
- 60–90 listings total (recommended)
- Availability seeded for stays + facilities
- Booking requests + chat messages
- At least one conflict demo: accept/paid booking blocks dates/slots; second request fails

---

## API design highlights (high level)

### Location-aware discovery
- Listings search supports radius filtering using PostGIS
- Categories endpoint returns only categories with supply within radius + counts

### Booking requests + chat
- Booking request created by renter
- Chat thread attached to each booking request
- Host accepts/rejects
- Payment confirms the booking
- Confirmed booking blocks availability

### Scheduling
- Stays: date-based availability
- Facilities: slot-based schedule & booking
- Items/mobility: basic availability flags (MVP)

---

## Acceptance criteria (Definition of Done — MVP)

### A) Location-first marketplace
- Real geolocation request + fallback city selection
- Radius control works
- Categories shown are derived from supply within radius (with counts)

### B) Booking + chat
- Booking request can be created
- Chat exists per booking (realtime + persisted)
- Correct permissions (only participants can view)
- Clear statuses displayed

### C) Payments + commission
- Booking can be paid
- Commission is applied (configurable)
- Booking is considered confirmed only after payment

### D) Calendar + conflict prevention
- Confirmed booking blocks dates/slots
- Double booking is prevented

### E) AI guardrails
- AI Search returns structured JSON filters
- **Max 1 follow-up question**
- “What I understood” chips shown
- Listing assistant + price suggestions are editable and never forced

### F) Reviews
- Review allowed after completion/confirmed booking
- Basic moderation exists (admin can hide listings/users)

---

## Notes / guardrails (important)
- AI does not directly modify business truth (availability/booking status). It proposes filters/suggestions only.
- Exact home addresses should not be exposed publicly; use area labels and approximate map pin.
- Keep PRs small; one feature per PR.

---

## Roadmap (post-MVP)
- External calendar sync
- Provider analytics dashboard
- More item templates
- In-app payments provider integration (if not already)
- Stronger admin tooling
- Mobile app

---

## License
UNLICENSED (PFE project — private business intent)
