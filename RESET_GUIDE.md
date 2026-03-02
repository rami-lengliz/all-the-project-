# RentAI — Demo Reset Guide (Week 3)

> **Purpose:** Safely reset demo data in production without touching the DB manually.
> **Strategy:** CLI seed command (Option A) — triggered from hosting dashboard or locally.

---

## 🚀 Reset Demo Data

### Locally
```bash
# From project root
npm run seed:demo
```

### On Render / Railway (production)

In **Render** → Your Service → **Shell** (or "Run Command"):
```bash
npm run seed:demo
```

In **Railway** → Project → **Service** → Terminal:
```bash
npm run seed:demo
```

> ✅ This wipes all existing data and re-seeds a clean, consistent demo state.

---

## 🎯 What the Seed Creates

| Item | Count |
|---|---|
| Users (host + renter + admin) | 11 |
| Kelibia listings | ~32 |
| Tunis listings | ~30 |
| **Demo DAILY listing** (fixed ID) | 1 |
| **Demo SLOT listing** (fixed ID) | 1 |
| General bookings (mixed statuses) | ~25 |
| Demo conflict bookings (DAILY + SLOT) | 4 |
| Chat conversations | 5 |
| Chat messages | 40+ |
| Reviews | Up to 5 |

---

## 🔑 Fixed Demo IDs (stable across every reset)

After each seed, `demo-ids.json` is written to the project root. But these key IDs **never change**:

| Resource | ID |
|---|---|
| **DAILY conflict listing** | `b1000001-0000-4000-8000-000000000001` |
| **SLOT conflict listing** | `b2000001-0000-4000-8000-000000000001` |
| Admin user | `a3000001-0000-4000-8000-000000000005` |
| Host A (Mohamed) | `a1000001-0000-4000-8000-000000000001` |
| Renter A (Fadi) | `a2000001-0000-4000-8000-000000000003` |
| Renter B (Amine) | `a2000002-0000-4000-8000-000000000004` |

---

## 🔐 Demo Credentials

| Role | Email | Password |
|---|---|---|
| **Admin** | `admin@rentai.tn` | `password123` |
| **Host A** | `host.kelibia@rentai.tn` | `password123` |
| **Host B** | `host.tunis@rentai.tn` | `password123` |
| **Renter A** | `renter.a@rentai.tn` | `password123` |
| **Renter B** | `renter.b@rentai.tn` | `password123` |

---

## 🧪 Verification Curl Commands

### 1. Categories — Kelibia (should show beach + mobility + sports)
```bash
curl -s "http://localhost:3000/api/categories/nearby?lat=36.8578&lng=11.092&radiusKm=15" | python -m json.tool
```

### 2. Categories — Tunis (different set from Kelibia)
```bash
curl -s "http://localhost:3000/api/categories/nearby?lat=36.8065&lng=10.1815&radiusKm=15" | python -m json.tool
```

### 3. AI Search — RESULT mode
```bash
curl -s -X POST http://localhost:3000/api/ai/search \
  -H "Content-Type: application/json" \
  -d '{"query":"villa avec piscine","lat":36.8578,"lng":11.092,"radiusKm":20,"followUpUsed":true}' \
  | python -m json.tool
```

### 4. AI Search — FOLLOW_UP mode
```bash
curl -s -X POST http://localhost:3000/api/ai/search \
  -H "Content-Type: application/json" \
  -d '{"query":"quelque chose pas cher","lat":36.8578,"lng":11.092,"radiusKm":10}' \
  | python -m json.tool
```

### 5. Available slots — SLOT listing (10:00–12:00 must be ABSENT)
```bash
# Replace YYYY-MM-DD with today + 7 days
SLOT_DATE=$(date -d "+7 days" +%Y-%m-%d)
curl -s "http://localhost:3000/api/listings/b2000001-0000-4000-8000-000000000001/available-slots?date=$SLOT_DATE" \
  | python -m json.tool
# ✅ Expected: 10:00 slot is MISSING (blocked by confirmed booking)
```

### 6. Login and get JWT token
```bash
curl -s -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"renter.a@rentai.tn","password":"password123"}' \
  | python -m json.tool
```

---

## ✅ End-of-Reset Checklist

After running `npm run seed:demo`, verify:

- [ ] `categories/nearby` returns different results for Kelibia vs Tunis
- [ ] AI search returns results on seeded Kelibia data
- [ ] Slot check on `b2000001-...` shows 10:00–12:00 blocked
- [ ] DAILY listing `b1000001-...` has D+30→D+33 confirmed
- [ ] `demo-ids.json` was written to project root
- [ ] Login works with `admin@rentai.tn / password123`

---

## 🔄 Known Production Differences

| Local | Production |
|---|---|
| `ts-node` runs directly | May need compiled `dist/` or `ts-node` available |
| Seed prints to terminal | Seed prints to hosting logs |
| `demo-ids.json` in project root | May write to ephemeral storage — check logs for IDs |

> **Tip:** After seeding in production, **always check the logs** for the printed summary box with IDs and dates.

---

## 🛑 When to Reset

- Before any demo / jury presentation
- After a debugging session that dirtied the data
- When starting a new test cycle
