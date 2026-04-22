# RentAI — Production Notes

> Fill in this file **the first time you deploy** and keep it updated.
> Never commit real secrets — this file contains references, not values.

---

## 🌐 Live URLs

| Resource | URL |
|----------|-----|
| **API Base** | _(fill in after deployment)_ |
| **Swagger UI** | `<API_BASE>/api/docs` |
| **Frontend** | _(fill in after deployment)_ |
| **DB Admin** | _(Render/Railway dashboard)_ |

---

## 🏗️ Hosting Provider

| Layer | Provider | Plan |
|-------|----------|------|
| **Backend API** | _(Render / Railway / Fly.io)_ | Free / Starter |
| **Database** | _(Render Postgres / Railway Postgres / Supabase)_ | Free / Starter |
| **Frontend** | _(Vercel / Netlify)_ | Hobby |

---

## 🔑 Required Environment Variables (Backend)

Set these in your hosting provider dashboard. **Never commit real values to git.**

```env
DATABASE_URL=postgresql://user:pass@host:5432/db?sslmode=require
JWT_SECRET=<strong-random-secret>
REFRESH_TOKEN_SECRET=<strong-random-secret>
NODE_ENV=production
PORT=3000
APP_URL=https://<your-api-domain>

# Comma-separated list of allowed frontend origins for CORS
ALLOWED_ORIGINS=https://<your-frontend-domain>

# Optional — leave empty to use fallback keyword search
OPENAI_API_KEY=
```

---

## 🗄️ Database Setup

### 1. Enable PostGIS (one-time, on fresh managed DB)

Run this in your DB console (psql / Railway shell / Supabase SQL editor):

```sql
CREATE EXTENSION IF NOT EXISTS postgis;
```

### 2. Run Migrations (on each deploy)

Railway/Render build command (or start command):

```bash
npx prisma migrate deploy && node dist/main
```

Or as separate commands:
```bash
# Build command
npm run build && npx prisma migrate deploy

# Start command
node dist/main
```

### 3. Seed Demo Data (one-time or after reset)

```bash
# If you have shell access (Railway CLI / Render Shell)
npm run seed
```

Or via the protected seed endpoint _(if implemented)_:
```bash
curl -X POST https://<API_BASE>/api/admin/seed \
  -H "x-admin-secret: <ADMIN_SEED_SECRET>"
```

---

## ✅ Production Health Verification

Run these after deployment to confirm everything works:

### 1. Health Endpoint

```bash
curl https://<API_BASE>/api/health | python -m json.tool
```

**Expected:**
```json
{
  "status": "ok",
  "db": true,
  "postgis": true,
  "uptime": 12,
  "version": "1.0.0",
  "env": "production",
  "timestamp": "..."
}
```

If `db: false` → check `DATABASE_URL` env var  
If `postgis: false` → run `CREATE EXTENSION IF NOT EXISTS postgis;` in the DB

### 2. Categories Nearby (PostGIS smoke test)

```bash
curl "https://<API_BASE>/api/categories/nearby?lat=36.847&lng=11.093&radiusKm=10" \
  | python -m json.tool
```

**Expected:** Array of categories with `count`, sorted by count descending.

### 3. AI Search — Force RESULT

```bash
curl -s -X POST https://<API_BASE>/api/ai/search \
  -H "Content-Type: application/json" \
  -d '{"query":"villa near beach","followUpUsed":true}' \
  | python -m json.tool
```

**Expected:** `{ "mode": "RESULT", "filters": {...}, "chips": [...], "results": [...] }`

### 4. AI Search — FOLLOW_UP guardrail

```bash
curl -s -X POST https://<API_BASE>/api/ai/search \
  -H "Content-Type: application/json" \
  -d '{"query":"something","followUpUsed":false}' \
  | python -m json.tool
```

**Expected:** Either FOLLOW_UP (with `followUp.question`) or RESULT — **never a crash**.

### 5. Swagger UI

Open in browser: `https://<API_BASE>/api/docs`  
Must load without auth. Try the **health** endpoint directly from Swagger.

---

## 🔄 How to Reset Demo Data (Production)

```bash
# Via Railway/Render shell:
npx prisma migrate reset --force && npm run seed

# Or (faster, no schema re-apply):
npx prisma db execute --stdin <<'SQL'
TRUNCATE bookings, listings, categories, users CASCADE;
SQL
npm run seed
```

> ⚠️ This destroys ALL data. Only run before a demo.

---

## 🐞 Known Production Differences vs Local

| Issue | Status | Notes |
|-------|--------|-------|
| SSL required for managed DB | Expected | Use `?sslmode=require` in DATABASE_URL |
| PostGIS not installed by default | Check `/api/health` | Run `CREATE EXTENSION IF NOT EXISTS postgis;` |
| OPENAI_API_KEY not set | Fallback active | keyword search still works |
| `mlService: false` in old health output | Fixed | Removed in health v2 |

---

## 🔒 Production Booking Conflict Validation

### Design Rules (Single Source of Truth)

| Status | Blocks availability? |
|--------|---------------------|
| `confirmed` | ✅ Yes |
| `paid` | ✅ Yes |
| `completed` | ✅ Yes |
| `pending` | ❌ No — can still be cancelled |
| `cancelled` | ❌ No |
| `rejected` | ❌ No |

**Implementation:** All 4 availability checks share `BLOCKING_BOOKING_STATUSES = ['confirmed','paid','completed']` from `src/common/constants/booking-status.constants.ts`.

---

### DAILY Booking Conflict — Reproduction Steps

Replace `<API_BASE>`, `DAILY_LISTING_ID`, and `DATE_RANGE` with values from seed output.

```bash
# Step 1 — Register renterA and get token
TOKEN_A=$(curl -s -X POST https://<API_BASE>/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"user6@example.com","password":"password123"}' \
  | python -c "import sys,json; d=json.load(sys.stdin); print(d.get('data',d).get('accessToken',''))")

# Step 2 — Register renterB and get token
TOKEN_B=$(curl -s -X POST https://<API_BASE>/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"user7@example.com","password":"password123"}' \
  | python -c "import sys,json; d=json.load(sys.stdin); print(d.get('data',d).get('accessToken',''))")

# Step 3 — Host token (user1)
TOKEN_HOST=$(curl -s -X POST https://<API_BASE>/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"user1@example.com","password":"password123"}' \
  | python -c "import sys,json; d=json.load(sys.stdin); print(d.get('data',d).get('accessToken',''))")

# Step 4 — Renter A creates a DAILY booking
BOOKING_A=$(curl -s -X POST https://<API_BASE>/api/bookings \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN_A" \
  -d "{\"listingId\":\"DAILY_LISTING_ID\",\"startDate\":\"2026-06-01\",\"endDate\":\"2026-06-04\"}" \
  | python -c "import sys,json; d=json.load(sys.stdin); print(d.get('data',d).get('id',''))")
echo "Booking A: $BOOKING_A"

# Step 5 — Host confirms Renter A booking
curl -s -X PATCH "https://<API_BASE>/api/bookings/$BOOKING_A/confirm" \
  -H "Authorization: Bearer $TOKEN_HOST" | python -m json.tool
# Expected: {"status":"confirmed","displayStatus":"accepted"}

# Step 6 — Renter B tries overlapping booking → MUST get 409
curl -s -X POST https://<API_BASE>/api/bookings \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN_B" \
  -d '{"listingId":"DAILY_LISTING_ID","startDate":"2026-06-02","endDate":"2026-06-05"}' \
  | python -m json.tool
# ✅ Expected: HTTP 409 — "This listing is not available for the selected dates"

# Step 7 — Pending booking (no confirm) does NOT block
curl -s -X POST https://<API_BASE>/api/bookings \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN_B" \
  -d '{"listingId":"DAILY_LISTING_ID","startDate":"2026-07-01","endDate":"2026-07-03"}' \
  | python -m json.tool
# ✅ Expected: HTTP 201 (pending bookings never block)
```

---

### SLOT Booking Conflict — Reproduction Steps

```bash
# Step 1 — Renter A books 10:00–12:00 (use SLOT listing ID from seed output)
SLOT_BOOKING=$(curl -s -X POST https://<API_BASE>/api/bookings \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN_A" \
  -d "{\"listingId\":\"SLOT_LISTING_ID\",\"startDate\":\"SLOT_DATE\",\"endDate\":\"SLOT_DATE\",\"startTime\":\"10:00\",\"endTime\":\"12:00\"}" \
  | python -c "import sys,json; d=json.load(sys.stdin); print(d.get('data',d).get('id',''))")

# Step 2 — Host confirms
curl -s -X PATCH "https://<API_BASE>/api/bookings/$SLOT_BOOKING/confirm" \
  -H "Authorization: Bearer $TOKEN_HOST" | python -m json.tool
# Expected: {"status":"confirmed","displayStatus":"accepted"}

# Step 3 — Verify 10:00 slot is now UNAVAILABLE
curl -s "https://<API_BASE>/api/listings/SLOT_LISTING_ID/available-slots?date=SLOT_DATE" \
  | python -m json.tool
# Expected: slot 10:00-12:00 missing OR has available:false

# Step 4 — Renter B tries exact same slot → MUST get 409
curl -s -X POST https://<API_BASE>/api/bookings \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN_B" \
  -d "{\"listingId\":\"SLOT_LISTING_ID\",\"startDate\":\"SLOT_DATE\",\"endDate\":\"SLOT_DATE\",\"startTime\":\"10:00\",\"endTime\":\"12:00\"}" \
  | python -m json.tool
# ✅ Expected: HTTP 409 — "This time slot is not available"

# Step 5 — Renter B tries PARTIAL overlap (11:00–13:00) → also 409
curl -s -X POST https://<API_BASE>/api/bookings \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN_B" \
  -d "{\"listingId\":\"SLOT_LISTING_ID\",\"startDate\":\"SLOT_DATE\",\"endDate\":\"SLOT_DATE\",\"startTime\":\"11:00\",\"endTime\":\"13:00\"}" \
  | python -m json.tool
# ✅ Expected: HTTP 409

# Step 6 — Renter B tries NON-overlapping slot (16:00–18:00) → 201 OK
curl -s -X POST https://<API_BASE>/api/bookings \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN_B" \
  -d "{\"listingId\":\"SLOT_LISTING_ID\",\"startDate\":\"SLOT_DATE\",\"endDate\":\"SLOT_DATE\",\"startTime\":\"16:00\",\"endTime\":\"18:00\"}" \
  | python -m json.tool
# ✅ Expected: HTTP 201
```

---

### Audit Findings — Why Each Decision is Production-Safe

| Concern | Implementation | Status |
|---------|---------------|--------|
| Status enum casing | Raw SQL uses `'confirmed'::\"BookingStatus\"` — matches Postgres enum exactly | ✅ |
| Column quoting | `"listingId"`, `"startDate"`, `"endDate"` quoted in raw SQL to match camelCase Prisma naming | ✅ |
| DAILY timezone | `normalizeDate()` sets `setHours(0,0,0,0)` — date-only, no TZ offset risk | ✅ |
| SLOT timezone | `date.toISOString().substring(0,10)` → `dateStr::date` — bypasses Prisma `@db.Time` Date object TZ issue | ✅ |
| SLOT time comparison | Uses Postgres `OVERLAPS` operator — server-side, no JS time parsing | ✅ |
| SLOT display TZ | `toHHmm()` uses `getUTCHours()/getUTCMinutes()` — UTC-safe for `@db.Time` serialization | ✅ |
| Race condition (DAILY) | `FOR UPDATE` row lock in transaction — concurrent confirms blocked | ✅ |
| Race condition (SLOT) | Pre-transaction `checkSlotAvailability` + re-check during confirm | ✅ |

---

## 📝 Notes

_(Add any deployment-specific notes here as you discover them)_

---

## 🌐 CORS Configuration & Verification

### How It Works

CORS is configured in `src/main.ts` via an **env-based origin allowlist** — no wildcard `*` in production.

```typescript
// Configuration reads ALLOWED_ORIGINS env var (comma-separated).
// Requests with no origin (curl, Postman, same-host Swagger) always pass through.
app.enableCors({
  origin: (origin, callback) => {
    if (!origin) return callback(null, true);           // curl / Postman / Swagger
    if (allowedOrigins.includes(origin)) ...;           // allowlisted frontend
    callback(new Error(`CORS: origin '${origin}' not allowed`));
  },
  methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true,
});
```

### Environment Variable Setup

| Environment | `ALLOWED_ORIGINS` value | `configuration.ts` default |
|-------------|------------------------|---------------------------|
| Local dev | _(not set)_ | `http://localhost:3001, http://localhost:3000` |
| Production | `https://your-frontend.vercel.app` | N/A — must be set |
| Multi-domain | `https://frontend.app,https://www.frontend.app` | N/A |

Set in your hosting dashboard (Render / Railway environment variables):
```
ALLOWED_ORIGINS=https://rentai-frontend.vercel.app
```

For multiple domains (comma-separated, no spaces):
```
ALLOWED_ORIGINS=https://rentai-frontend.vercel.app,https://www.rentai.app
```

---

### ✅ Preflight Verification (curl)

Run these **before** opening the browser to confirm OPTIONS requests return correct headers:

```bash
# 1. Preflight for POST /api/ai/search
curl -s -X OPTIONS https://<API_BASE>/api/ai/search \
  -H "Origin: https://your-frontend.vercel.app" \
  -H "Access-Control-Request-Method: POST" \
  -H "Access-Control-Request-Headers: Content-Type,Authorization" \
  -v 2>&1 | grep -E "< (HTTP|Access-Control|Vary)"

# Expected response headers:
# < HTTP/2 204
# < access-control-allow-origin: https://your-frontend.vercel.app
# < access-control-allow-methods: GET,POST,PATCH,PUT,DELETE,OPTIONS
# < access-control-allow-headers: Content-Type,Authorization
# < access-control-allow-credentials: true

# 2. Preflight for GET /api/categories/nearby
curl -s -X OPTIONS "https://<API_BASE>/api/categories/nearby" \
  -H "Origin: https://your-frontend.vercel.app" \
  -H "Access-Control-Request-Method: GET" \
  -v 2>&1 | grep -E "< (HTTP|Access-Control|Vary)"

# Both must return 204 with the correct Access-Control-Allow-Origin header.
```

---

### ✅ Browser Verification (DevTools Console)

Open your deployed frontend URL, open **DevTools → Console**, and run:

```javascript
// Test 1: categories/nearby (no auth needed)
fetch('https://<API_BASE>/api/categories/nearby?lat=36.847&lng=11.093&radiusKm=10')
  .then(r => r.json())
  .then(d => console.log('categories ✅', d.data?.length, 'results'))
  .catch(e => console.error('CORS blocked ❌', e));

// Test 2: AI search (no auth needed)
fetch('https://<API_BASE>/api/ai/search', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ query: 'villa near beach', followUpUsed: true })
})
  .then(r => r.json())
  .then(d => console.log('AI search ✅ mode:', d.data?.mode, 'chips:', d.data?.chips?.length))
  .catch(e => console.error('CORS blocked ❌', e));
```

**If you see:** `CORS blocked ❌ TypeError: Failed to fetch`  
→ The frontend origin is not in `ALLOWED_ORIGINS`. Add it and redeploy.

**If you see:** `categories ✅ N results` and `AI search ✅ mode: RESULT`  
→ CORS is working correctly. ✅

---

### Troubleshooting

| Symptom | Cause | Fix |
|---------|-------|-----|
| `Access to fetch blocked by CORS policy` | Frontend origin not in allowlist | Add to `ALLOWED_ORIGINS` env var |
| `No 'Access-Control-Allow-Origin' header` | Server returning 500 before CORS headers set | Check `/api/health` — DB might be down |
| Swagger UI can't execute requests | Swagger is same-host (no cross-origin) | This is normal — Swagger never has CORS issues |
| `credentials: true` + wildcard error | Cannot use `*` with `credentials:true` | Already handled — we use explicit origin list |
| Localhost works, production blocked | `ALLOWED_ORIGINS` not set in prod env | Set the env var in hosting dashboard |
 
 ---
+
+## 🛡️ Chatbot Trust & Safety Guardrails
+
+The AI Assistant in production is protected by multiple deterministic safety layers to prevent abuse and ensure financial integrity.
+
+### 1. Multi-Layer Rate Limiting
+| Limit Type | Action Key | Default Limit | Purpose |
+|------------|------------|---------------|---------|
+| **Messages** | `chatbot_message_requests` | 10 per min | Prevents LLM cost spikes / spam |
+| **Proposals**| `chatbot_mutation_proposals`| 3 per min | Limits tool usage requiring confirmation |
+| **Confirmations**| `chatbot_action_confirmations`| 3 per min | Prevents brute-forcing action tokens |
+| **Failures** | `chatbot_failed_confirmations` | 5 per 30m | Triggers cooldown on token abuse |
+
+### 2. Incident Logging (Abuse Detection)
+Every blocked action or rate-limit breach is recorded in the `AbuseIncident` system (visible to admins).
+- **High Severity**: Token replay attempts, cross-user confirmation attempts.
+- **Medium Severity**: Policy breaches (attempting restricted tools).
+- **Low Severity**: Rate limit triggers.
+
+### 3. Tool Governance (Confirmation Tokens)
+All mutations (Booking cancellation, Help requests) use a **Two-Phase Commit** pattern:
+1. **Propose**: Assistant calls tool → Backend generates `confirmationToken` (stored in cache/DB).
+2. **Confirm**: UI sends `POST /api/chatbot/confirm` with token → Backend validats token + user + context.
+
+---
+
+## ✅ Chatbot Health Verification
+
+### 1. Chatbot Health
+```bash
+curl https://<API_BASE>/api/chatbot/health | python -m json.tool
+```
+**Expected:** `orchestrator: ok`, `llm: online`, `governance: ok`.
+
+### 2. Rate Limit Verification
+Rapidly send 11 messages to a conversation.
+**Expected:** HTTP 429 after 10th message. Body: `{ "status": "RATE_LIMITED", ... }`.
+
+### 3. Confirmation Token Expiry
+Wait 30 minutes after an assistant proposes a cancellation. Try to confirm.
+**Expected:** HTTP 400. Body: `{ "message": "Confirmation failed: TOKEN_EXPIRED" }`.
+
+*Last Updated: 2026-04-19 by Assistant v2*
+
