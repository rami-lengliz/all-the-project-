# RentAI — Runbook

> A new developer can follow this document and have the project running in < 5 minutes.

---

## Prerequisites

| Requirement | Version | Check |
|-------------|---------|-------|
| Node.js | ≥ 18 | `node -v` |
| npm | ≥ 9 | `npm -v` |
| Docker Desktop | running | `docker ps` |

---

## 1. Clone & Install

```bash
git clone <repo-url>
cd all-the-project-

# Backend dependencies
npm install

# Frontend dependencies
cd frontend && npm install && cd ..
```

---

## 2. Environment Variables

```bash
# Copy the example and fill in values
cp .env.example .env
```

Minimum required values in `.env`:

```env
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/rental_platform"
JWT_SECRET="change-me-in-production"
JWT_REFRESH_SECRET="change-me-refresh-in-production"
OPENAI_API_KEY=""   # optional — leave empty to use fallback keyword search
```

---

## 3. The "One-Shot" Local Dev Flow

For local development, we use a fresh database state every time to prevent migration drift and guarantee the demo data is intact.

```bash
# 1. Start Postgres in the background
docker-compose up -d postgres

# Wait ~5s for Postgres to be ready, then:

# 2. Reset database & apply schema
npx prisma migrate reset --force

# 3. Seed the database with demo scenarios
npm run seed

# 4. Start both Backend & Frontend concurrently
npm run dev:all
```

> **Note on `prisma migrate deploy`:** 
> Do NOT use `prisma migrate deploy` in local development. `deploy` is strictly for **production environments** where you cannot drop data. Locally, always use `reset` (which runs `dev` safely) so your Prisma Client and database state never drift.

---

**Expected Seed Output (save the IDs):**
```
  ╔══════════════════════════════════════════════════════╗
  ║       DEMO SEED — Copy for curl / Swagger tests      ║
  ╠══════════════════════════════════════════════════════╣
  ║  DAILY listing : <uuid>                              ║
  ║  Blocked dates : YYYY-MM-DD → YYYY-MM-DD (confirmed) ║
  ║  SLOT listing  : <uuid>                              ║
  ║  Blocked slot  : 10:00–12:00 on YYYY-MM-DD           ║
  ║  RenterA login : user6@example.com / password123     ║
  ║  Host login    : user1@example.com / password123     ║
  ╚══════════════════════════════════════════════════════╝
```

---

## 4. URLs

| Service | URL |
|---------|-----|
| **API base** | http://localhost:3000/api |
| **Swagger UI** | http://localhost:3000/api/docs |
| **Frontend** | http://localhost:3001 |
| **DB browser** | `npx prisma studio` → http://localhost:5555 |
| **AI search logs** | http://localhost:3000/api/ai/admin/search-logs |

---

## 5. Proof Curls

> These 3 commands prove the core features work. Run them after the server is up.

### 5.1 — Categories Nearby

```bash
curl -s "http://localhost:3000/api/categories/nearby?lat=36.8578&lng=11.092&radiusKm=50" \
  | python -m json.tool
```

**Expected:** `{ "success": true, "data": [ { "id", "slug", "name", "count" }, ... ] }` sorted by count descending.

---

### 5.2 — AI Search → RESULT (direct)

Forces a RESULT response by setting `followUpUsed: true` (prevents the clarification question):

```bash
curl -s -X POST http://localhost:3000/api/ai/search \
  -H "Content-Type: application/json" \
  -d '{
    "query": "villa with pool near the beach",
    "lat": 36.8578,
    "lng": 11.092,
    "radiusKm": 50,
    "followUpUsed": true
  }' \
  | python -m json.tool
```

**Expected:** `{ "mode": "RESULT", "filters": { ... }, "chips": [...], "results": [...] }`

---

### 5.3 — AI Search → FOLLOW_UP then RESULT

**Step 1** — First call (may get FOLLOW_UP asking for clarification):

```bash
curl -s -X POST http://localhost:3000/api/ai/search \
  -H "Content-Type: application/json" \
  -d '{
    "query": "tennis court",
    "lat": 36.8578,
    "lng": 11.092,
    "radiusKm": 50,
    "followUpUsed": false
  }' \
  | python -m json.tool
```

**Expected:** `{ "mode": "FOLLOW_UP", "followUp": { "question": "...", "field": "..." }, "results": [] }`

**Step 2** — Second call, passing your answer via `followUpAnswer` and `followUpUsed: true`:

```bash
curl -s -X POST http://localhost:3000/api/ai/search \
  -H "Content-Type: application/json" \
  -d '{
    "query": "tennis court",
    "lat": 36.8578,
    "lng": 11.092,
    "radiusKm": 50,
    "followUpUsed": true,
    "followUpAnswer": "Tomorrow afternoon"
  }' \
  | python -m json.tool
```

**Expected:** `{ "mode": "RESULT", "filters": { ... }, "results": [...] }`

---

### 5.4 — SLOT Conflict Demo _(bonus)_

Replace `SLOT_ID` and `SLOT_DATE` with the values printed during seed.

```bash
# 1. Check available slots — 10:00 slot should be MISSING (confirmed booking blocks it)
curl -s "http://localhost:3000/api/listings/SLOT_ID/available-slots?date=SLOT_DATE" \
  | python -m json.tool

# 2. Get a token for renterB (user7)
TOKEN=$(curl -s -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"user7@example.com","password":"password123"}' \
  | python -c "import sys,json; print(json.load(sys.stdin)['accessToken'])")

# 3. Try to book the blocked slot — should get 409 Conflict
curl -s -X POST http://localhost:3000/api/bookings \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d "{\"listingId\":\"SLOT_ID\",\"startDate\":\"SLOT_DATE\",\"endDate\":\"SLOT_DATE\",\"startTime\":\"10:00\",\"endTime\":\"12:00\"}" \
  | python -m json.tool
# Expected: 409 — "This time slot is not available"
```

---

## 6. Run E2E Tests

```bash
# DB must be running
docker-compose up -d postgres

# All 44 tests (~30s)
npx jest --config test/jest-e2e.json --forceExit

# Individual suites
npx jest --config test/jest-e2e.json "categories-nearby" --forceExit
npx jest --config test/jest-e2e.json "ai-search-guardrails" --forceExit
npx jest --config test/jest-e2e.json "booking-conflict" --forceExit
npx jest --config test/jest-e2e.json "slot-booking-conflict" --forceExit
```

---

## 7. Seed Credentials

| Email | Password | Role |
|-------|----------|------|
| user1@example.com | password123 | admin + host |
| user2@example.com | password123 | host |
| user3@example.com | password123 | host |
| user6@example.com | password123 | renter (demo renterA) |
| user7@example.com | password123 | renter (demo renterB) |

---

## Troubleshooting

| Problem | Fix |
|---------|-----|
| `Can't reach database server at localhost:5432` | `docker-compose up -d postgres` |
| `Port 3000 already in use` | `npx kill-port 3000` |
| `aiSearchLog does not exist on PrismaService` | `npx prisma generate` |
| Seed fails with FK constraint | `npx prisma migrate reset --force` then `npm run seed` |
| Migration drift error | `npx prisma migrate deploy` to apply pending migrations |
