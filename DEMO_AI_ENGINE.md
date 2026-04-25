# AI Engine v1 — Demo Guide

> **Audience:** supervisor / examiner who wants to run the demo from scratch.
> Every command below is copy-paste ready. Replace `$TOKEN` after the login step.

---

## 1. Prerequisites

| Requirement | Version |
|-------------|---------|
| Node.js | ≥ 20 |
| PostgreSQL + PostGIS | 15 + PostGIS 3 |
| npm | ≥ 9 |

PostGIS must be enabled in your database:
```sql
CREATE EXTENSION IF NOT EXISTS postgis;
```

---

## 2. Environment variables

Copy `.env.example` → `.env` and fill in the three AI lines:

```bash
# ── Pick ONE provider ──────────────────────────────────────────────
AI_PROVIDER=openai          # or: gemini

# OpenAI (when AI_PROVIDER=openai)
OPENAI_API_KEY=sk-...
AI_MODEL=gpt-4o-mini        # default

# Google Gemini (when AI_PROVIDER=gemini)
GEMINI_API_KEY=AIza...
GEMINI_MODEL=gemini-2.0-flash
# ──────────────────────────────────────────────────────────────────

# Required by every run (already in .env.example defaults)
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/rental_platform?schema=public
JWT_SECRET=your-super-secret-jwt-key-change-in-production
```

> **No AI key?** The system still works — numeric price ranges always come from
> comparables, not the AI. Only the explanation bullets fall back to heuristic text.

---

## 3. Start the API

```bash
# First run ever — reset DB, apply migrations, seed 24 Kelibia listings
npm run reset:demo

# Start the backend (port 3001 by default)
npm run start:dev

# Swagger UI (verify all endpoints are alive)
open http://localhost:3001/api/docs
```

---

## 4. Get a JWT token

```bash
TOKEN=$(curl -s -X POST http://localhost:3001/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"host@rentai.tn","password":"Host1234!"}' \
  | jq -r '.data.accessToken // .accessToken')

echo $TOKEN   # should be a long JWT string
```

---

## 5. Demo A — `/api/categories/nearby` (PostGIS radius effect)

### 5 km → fewer categories
```bash
curl -s "http://localhost:3001/api/categories/nearby?lat=36.8578&lng=11.0920&radiusKm=5" \
  | jq '.data | map({slug, count})'
```

### 20 km → more categories, higher counts
```bash
curl -s "http://localhost:3001/api/categories/nearby?lat=36.8578&lng=11.0920&radiusKm=20" \
  | jq '.data | map({slug, count})'
```

**Expected:** 20 km response has more rows and larger `count` values than 5 km.
`slug` is always one of: `stays` · `sports-facilities` · `mobility` · `beach-gear`.

---

## 6. Demo B — `/api/ai/search` returning RESULT

```bash
curl -s -X POST http://localhost:3001/api/ai/search \
  -H "Content-Type: application/json" \
  -d '{
    "query":        "villa near beach Kelibia, max 300 TND",
    "lat":          36.8578,
    "lng":          11.0920,
    "radiusKm":     25,
    "followUpUsed": true
  }' | jq '{mode, followUp, chips: [.chips[]|{key,label}], resultsCount: (.results|length)}'
```

**Expected:**
```json
{
  "mode":         "RESULT",
  "followUp":     null,
  "chips":        [{"key":"q","label":"villa"}, {"key":"category","label":"Stays"}, {"key":"price","label":"Up to 300 TND"}],
  "resultsCount": 3
}
```

`followUpUsed: true` is the safe demo flag — guarantees RESULT every time.

---

## 7. Demo C — `/api/ai/search` FOLLOW_UP → RESULT

### Call 1 — vague query → FOLLOW_UP
```bash
curl -s -X POST http://localhost:3001/api/ai/search \
  -H "Content-Type: application/json" \
  -d '{
    "query":        "terrain de football ce week-end à Kélibia",
    "lat":          36.8578,
    "lng":          11.0920,
    "radiusKm":     20,
    "followUpUsed": false
  }' | jq '{mode, question: .followUp.question, field: .followUp.field, results: (.results|length)}'
```

**Expected:**
```json
{
  "mode":     "FOLLOW_UP",
  "question": "Pour quelles dates exactement avez-vous besoin du terrain ?",
  "field":    "dates",
  "results":  0
}
```

### Call 2 — answer provided → RESULT (Guardrail 1)
```bash
curl -s -X POST http://localhost:3001/api/ai/search \
  -H "Content-Type: application/json" \
  -d '{
    "query":          "terrain de football ce week-end à Kélibia",
    "lat":            36.8578,
    "lng":            11.0920,
    "radiusKm":       20,
    "followUpUsed":   true,
    "followUpAnswer": "Ce samedi 19 avril"
  }' | jq '{mode, followUp, chips: [.chips[]|{key,label}], resultsCount: (.results|length)}'
```

**Expected:**
```json
{
  "mode":         "RESULT",
  "followUp":     null,
  "chips":        [{"key":"category","label":"sports-facilities"}],
  "resultsCount": 1
}
```

> **Guardrail:** `followUpUsed: true` makes a second `FOLLOW_UP` physically impossible.

---

## 8. Demo D — `/api/ai/price-suggestion` (comparables-first)

### Case 1 — Beachfront villa (high price)
```bash
curl -s -X POST http://localhost:3001/api/ai/price-suggestion \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "city":            "Kelibia",
    "category":        "accommodation",
    "unit":            "per_night",
    "lat":             36.8497,
    "lng":             11.1047,
    "radiusKm":        25,
    "propertyType":    "villa",
    "distanceToSeaKm": 0.2,
    "capacity":        8
  }' | jq '{recommended, rangeMin: .range.min, rangeMax: .range.max, compsUsed, confidence, explanation}'
```

### Case 2 — Inland house (low price)
```bash
curl -s -X POST http://localhost:3001/api/ai/price-suggestion \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "city":            "Kelibia",
    "category":        "accommodation",
    "unit":            "per_night",
    "lat":             36.8301,
    "lng":             11.0801,
    "radiusKm":        25,
    "propertyType":    "house",
    "distanceToSeaKm": 6.0,
    "capacity":        4
  }' | jq '{recommended, rangeMin: .range.min, rangeMax: .range.max, compsUsed, confidence, explanation}'
```

**The proof — ranges must not overlap:**

| | Villa (nearBeach) | House (inland) |
|-|-------------------|----------------|
| `recommended` | ≈ **420 TND** | ≈ **128 TND** |
| `range` | 317 – 492 | 95 – 180 |
| `compsUsed` | ≥ 8 | ≥ 8 |
| `confidence` | `"high"` | `"medium"` |

> **`House rangeMax (180) < Villa rangeMin (317)`** — non-overlapping ranges prove
> that pricing is driven by real comparable listings, not LLM guessing.

---

## 9. Reset before every demo run

```bash
npm run reset:demo
```

What it does: `prisma migrate reset --force` → `prisma generate` → seed 24 Kelibia listings.

---

## 10. Run the automated test suite

```bash
npm run test:golden          # 10 golden queries, mocked AI, ~30 s
npm run test:category-guard  # category whitelist guardrail, mocked AI, ~20 s
npm run test:e2e             # all E2E suites combined
```
