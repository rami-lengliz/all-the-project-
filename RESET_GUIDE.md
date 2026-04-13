# RentAI — A→Z Demo Reset Checklist

> **Target:** Clean slate in < 5 minutes from any state.  
> **Root:** `all-the-project-/` (all commands run from here unless noted)

---

## 0 · Prerequisites

| Requirement | Check |
|---|---|
| Node 18+ | `node -v` |
| PostgreSQL + PostGIS running | `docker ps` or check Railway |
| `.env` has `DATABASE_URL` | `cat .env \| grep DATABASE` |
| Ports 3000 (backend) and 3001 (frontend) free | `netstat -ano \| findstr :3000` |

---

## 1 · (Optional) Update from Git

```bash
git fetch origin
git checkout feature/ai-price-suggestion
git pull
```

Skip if you are already on the correct branch and working locally.

---

## 2 · Install Dependencies

```bash
# Backend
npm install

# Frontend
cd frontend && npm install && cd ..
```

Skip if `node_modules` already exists and nothing has changed in `package.json`.

---

## 3 · Reset Database Schema

### Option A — Full schema reset (recommended before demos)

Drops all tables, re-applies every migration from scratch, then runs the seed.

```bash
npx prisma migrate reset --force
```

> ⚠️ This wipes **all data**. Do not run against production.

### Option B — Only apply new migrations (incremental)

Use when the DB already exists and you just added a migration (e.g. `PriceSuggestionLog`).

```bash
npx prisma migrate dev
```

You will be prompted for a migration name if there are schema changes pending.

### Option C — Deploy to production / Railway

```bash
npx prisma migrate deploy
npx prisma generate
```

---

## 4 · Generate Prisma Client

```bash
npx prisma generate
```

Always re-run after any schema change or after step 3.

---

## 5 · Run Seed

```bash
npm run seed
```

### Expected output (tail)

```
Creating categories...            ✓ 4 categories
Creating users...                 ✓ 10 users
Creating listings...              ✓ 38 general listings
Creating slot-based sports...     ✓ 3 sports listings
Creating PENDING_REVIEW listing...
Creating Kelibia accommodation comps (24 listings)...
  [1/24]  villa     Beachfront cap=8  price=421 TND/night
  ...
  [24/24] apartment Inland     cap=4  price=97  TND/night
  ✓ 24 Kelibia accommodation comps created
Creating demo scenarios...
  ✓ DAILY demo: <uuid>
  ✓ SLOT demo:  <uuid>
  ✓ Chat: 49 messages across 5 conversations
Seed completed successfully!
```

### Seeded credentials

| Role | Email | Password |
|---|---|---|
| Admin + Host | `user1@example.com` | `password123` |
| Host | `user2@example.com` | `password123` |
| Host | `user3@example.com` | `password123` |
| Renter A | `user6@example.com` | `password123` |
| Renter B | `user7@example.com` | `password123` |

---

## 6 · Start Backend

```bash
npm run start:dev
```

Wait for:
```
[NestApplication] Nest application successfully started
[Bootstrap] Server running on http://localhost:3000
```

---

## 7 · Start Frontend

Open a second terminal:

```bash
cd frontend
npm run dev
```

Wait for:
```
ready - started server on 0.0.0.0:3001
```

---

## 8 · Verify Swagger is Up

Open in browser:

```
http://localhost:3000/api/docs
```

You should see the RentAI Swagger UI with these sections:

- `AI` — contains `POST /ai/price-suggestion`, `PATCH /ai/price-suggestion/log/:id`, `GET /ai/price-suggestion/logs`
- `Listings`, `Bookings`, `Auth`, `Users`, `Admin`

Or via curl:

```bash
curl -s http://localhost:3000/api/docs-json | python -m json.tool | findstr '"title"'
# Expected: "title": "RentAI API"
```

---

## 9 · Smoke Tests

### 9a · Health check

```bash
curl http://localhost:3000/api/health
# Expected: {"status":"ok"}
```

### 9b · Login and get token

```bash
curl -s -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"user1@example.com\",\"password\":\"password123\"}" \
  | python -m json.tool
# Copy the accessToken value → TOKEN
```

PowerShell one-liner to capture token:
```powershell
$TOKEN = (curl -s -X POST http://localhost:3000/api/auth/login `
  -H "Content-Type: application/json" `
  -d '{"email":"user1@example.com","password":"password123"}' | ConvertFrom-Json).data.accessToken
echo $TOKEN
```

### 9c · AI Price Suggestion — beachfront villa (should return high confidence)

```bash
curl -s -X POST http://localhost:3000/api/ai/price-suggestion `
  -H "Authorization: Bearer $TOKEN" `
  -H "Content-Type: application/json" `
  -d "{`"city`":`"Kelibia`",`"category`":`"accommodation`",`"unit`":`"per_night`",`"lat`":36.8497,`"lng`":11.1047,`"radiusKm`":20,`"propertyType`":`"villa`",`"distanceToSeaKm`":0.2,`"capacity`":8}" | python -m json.tool
# Expected: confidence: high, compsUsed >= 10
```

### 9d · Fallback test — unknown city (should return confidence: low)

```bash
curl -s -X POST http://localhost:3000/api/ai/price-suggestion `
  -H "Authorization: Bearer $TOKEN" `
  -H "Content-Type: application/json" `
  -d "{`"city`":`"BirMcherga`",`"category`":`"accommodation`",`"unit`":`"per_night`"}" | python -m json.tool
# Expected: confidence: low, compsUsed: 0, recommended: 150
```

### 9e · Run all 10 scenarios at once

```bash
node scripts/run-price-scenarios.mjs
# Prints formatted table of all 10 scenario results
```

---

## 10 · Verify DB Listing Counts (optional)

Connect via Prisma Studio:

```bash
npx prisma studio
# Opens http://localhost:5555
```

Check `Listing` table — expected: **65+ active listings** (35 general + 3 sports + 24 Kelibia comps + 2 demo + 1 pending).

---

## Troubleshooting

### `Can't reach database server`
```bash
docker-compose up -d postgres
# Wait 5 s then retry
```

### `P3009 migrate found failed migrations`
```bash
npx prisma migrate reset --force
npm run seed
```

### `priceSuggestionLog does not exist`

Migration was not applied. Run:
```bash
npx prisma migrate deploy
npx prisma generate
```

### `ERROR: type "geography" does not exist` (PostGIS missing)
```bash
psql $env:DATABASE_URL -c "CREATE EXTENSION IF NOT EXISTS postgis;"
npm run seed
```

### Port already in use
```powershell
# Kill whatever is on port 3000:
Get-Process -Id (Get-NetTCPConnection -LocalPort 3000).OwningProcess | Stop-Process -Force
npm run start:dev
```

### Seed FK constraint error (incomplete previous seed)
```bash
npx prisma migrate reset --force
npm run seed
```

---

## Full Reset in One Block (copy-paste)

```powershell
# Run from: all-the-project-\
npx prisma migrate reset --force
npx prisma generate
npm run seed
Start-Process powershell { npm run start:dev }
Start-Sleep 5
Start-Process powershell { cd frontend; npm run dev }
Start-Sleep 5
Start-Process "http://localhost:3000/api/docs"
Start-Process "http://localhost:3001"
```

---

*Total reset time: ~40 s on local SSD — `migrate reset` ~10 s, `seed` ~25 s, servers ~5 s*
