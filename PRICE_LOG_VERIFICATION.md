# RentAI — PriceSuggestionLog Verification Checklist

> **Purpose:** Confirm every AI price suggestion writes a log row, the row is linked to the listing after publish, and all fields required for PFE analysis are populated.

---

## Setup

```powershell
$BASE  = "http://localhost:3000/api"
$TOKEN = (curl -s -X POST "$BASE/auth/login" `
  -H "Content-Type: application/json" `
  -d '{"email":"user1@example.com","password":"password123"}' `
  | ConvertFrom-Json).data.accessToken
```

> The logs endpoint requires a valid JWT (any authenticated user — host or admin).

---

## L1 · Log row created per suggestion

**Endpoint:** `GET /api/ai/price-suggestion/logs?limit=1`

### Step 1 — fire a suggestion

```powershell
curl -s -X POST "$BASE/ai/price-suggestion" `
  -H "Authorization: Bearer $TOKEN" `
  -H "Content-Type: application/json" `
  -d '{"city":"Kelibia","category":"accommodation","unit":"per_night","lat":36.8497,"lng":11.1047,"radiusKm":20}' `
  | python -m json.tool
```

Note the `logId` from the response.

### Step 2 — confirm row exists

```powershell
curl -s "$BASE/ai/price-suggestion/logs?limit=1" `
  -H "Authorization: Bearer $TOKEN" `
  | python -m json.tool
```

**Must verify:**

- [ ] HTTP `200`
- [ ] `data` is a non-empty array
- [ ] `data[0].id` matches the `logId` from the suggestion response
- [ ] `data[0].createdAt` is within the last 60 seconds

---

## L2 · Core suggestion fields present

Check `data[0]` from the logs endpoint:

| Field | Must be | Example |
|---|---|---|
| `city` | `"Kelibia"` | matches request |
| `categorySlug` | `"stays"` or `"accommodation"` | resolved DB slug |
| `unit` | `"per_night"` | matches request |
| `recommended` | number > 0 | `380` |
| `rangeMin` | number ≥ 5 | `290` |
| `rangeMax` | number > `rangeMin` | `490` |
| `confidence` | `"high"` \| `"medium"` \| `"low"` | `"high"` |
| `compsCity` | integer ≥ 0 | `18` |
| `compsNational` | integer ≥ 0 | `0` |

- [ ] All fields above are non-null
- [ ] `recommended` is within `[rangeMin, rangeMax]`
- [ ] `rangeMax / rangeMin` ≤ 3.5 (guardrail applied)

---

## L3 · Input/Output JSON snapshots captured

```powershell
# The logs endpoint returns scalar fields only (inputJson/outputJson excluded for payload size)
# To inspect JSON snapshots, use Prisma Studio or the raw query below (see L6)
```

**Must verify via Prisma Studio / raw query:**

- [ ] `inputJson` is non-null — contains `city`, `category`, `unit`, and any passed attributes
- [ ] `outputJson` is non-null — contains `recommended`, `range`, `explanation[3]`, `compsUsed`
- [ ] Neither field is `{}` or `null`

---

## L4 · listingId linked after publish

This is set by the `PATCH /api/ai/price-suggestion/log/:id` call that fires after listing creation.

### Trigger — publish a listing

Follow `UI_TEST_CREATE_LISTING.md` Phase 8, then immediately check:

```powershell
# Replace LOG_ID with the logId you noted in L1
$LOG_ID = "PASTE_LOG_ID_HERE"

curl -s "$BASE/ai/price-suggestion/logs?limit=5" `
  -H "Authorization: Bearer $TOKEN" `
  | python -m json.tool | findstr -i "listingId\|finalPrice\|overridden"
```

**Must verify:**

- [ ] `data[0].listingId` — non-null UUID (linked to the published listing)
- [ ] `data[0].finalPrice` — equals the price the host chose at publish (e.g. `450`)
- [ ] `data[0].overridden` — `true` if host edited the AI price, `false` if accepted as-is
- [ ] `data[0].recommended` — still shows the original AI suggestion (e.g. `380`)

---

## L5 · Fallback row still logged (cold start)

Even when `compsUsed = 0`, a log row must be written:

```powershell
curl -s -X POST "$BASE/ai/price-suggestion" `
  -H "Authorization: Bearer $TOKEN" `
  -H "Content-Type: application/json" `
  -d '{"city":"BirMcherga","category":"accommodation","unit":"per_night"}' `
  | python -m json.tool
```

Then check logs:

```powershell
curl -s "$BASE/ai/price-suggestion/logs?limit=1" `
  -H "Authorization: Bearer $TOKEN" | python -m json.tool
```

- [ ] Row exists with `city = "BirMcherga"`
- [ ] `compsCity = 0`, `compsNational = 0`
- [ ] `confidence = "low"`
- [ ] `recommended = 150` (baseline)
- [ ] `listingId = null` (not published)

---

## L6 · Prisma Studio (if no admin endpoint / deeper inspection)

```bash
npx prisma studio
```

Open `http://localhost:5555` → select table `ai_price_suggestion_logs`.

**Columns to verify in the table view:**

| Column | PFE analysis use |
|---|---|
| `id` | Correlation with listing |
| `createdAt` | Timestamp analysis |
| `city` | Geographic distribution |
| `categorySlug` | Category breakdown |
| `unit` | Unit-level accuracy |
| `recommended` | Baseline suggestion |
| `rangeMin` / `rangeMax` | Range accuracy |
| `confidence` | Model reliability tracking |
| `compsCity` | Local data availability |
| `compsNational` | Fallback frequency |
| `finalPrice` | Override detection |
| `overridden` | `true` when `|finalPrice - recommended| > 0.01` |
| `listingId` | Linked after publish |

---

## L7 · Raw Prisma query (terminal — temporary, safe)

Use only locally. Do NOT expose this in production.

Create a throwaway script `scripts/check-price-logs.mjs`:

```javascript
// scripts/check-price-logs.mjs
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

const rows = await prisma.priceSuggestionLog.findMany({
  orderBy: { createdAt: 'desc' },
  take: 5,
  select: {
    id: true, createdAt: true,
    city: true, categorySlug: true, unit: true,
    recommended: true, rangeMin: true, rangeMax: true,
    confidence: true, compsCity: true, compsNational: true,
    finalPrice: true, overridden: true, listingId: true,
  },
});

console.table(rows);
await prisma.$disconnect();
```

```bash
node scripts/check-price-logs.mjs
```

Expected output (example):
```
┌─────────┬──────────────────────┬──────────┬─────────────┬──────────────┬─────────────┬──────────┬───────────┬──────────┬────────────┬──────────────┬───────────┬──────────┬──────┐
│ (index) │ createdAt            │ city     │ categorySlug│ recommended  │ confidence  │ compsCity│compsNation│ finalPrice│ overridden  │ listingId    │ ...       │
├─────────┼──────────────────────┼──────────┼─────────────┼──────────────┼─────────────┼──────────┼───────────┼──────────┼────────────┼──────────────┼───────────┤
│    0    │ 2026-04-12T...       │ Kelibia  │ stays       │ 380          │ high        │ 18       │ 0         │ 450      │ true        │ b3f2a1c4-... │ ...       │
│    1    │ 2026-04-12T...       │ BirMcherga│ stays      │ 150          │ low         │ 0        │ 0         │ null     │ null        │ null         │ ...       │
└─────────┴──────────────────────┴──────────┴─────────────┴──────────────┴─────────────┴──────────┴───────────┴──────────┴────────────┴──────────────┴───────────┘
```

---

## Pass / Fail Summary

| # | Check | Pass | Fail |
|---|---|---|---|
| L1 | Log row created per suggestion, `id` matches `logId` | | |
| L2 | All scalar fields populated and valid | | |
| L3 | `inputJson` and `outputJson` non-null (Prisma Studio) | | |
| L4 | After publish: `listingId` linked, `finalPrice` set, `overridden` correct | | |
| L5 | Fallback row written even with `compsUsed = 0` | | |
| L6 | Prisma Studio shows correct column values | | |
| L7 | Raw script prints sensible `console.table` output | | |

---

## Fields required for PFE analysis

These must be non-null in every published-listing log row:

```
recommended     ← what the AI suggested
finalPrice      ← what the host chose
overridden      ← true/false comparison metric
confidence      ← model reliability label
compsCity       ← local data availability
compsNational   ← fallback frequency
rangeMin/Max    ← range accuracy
city            ← geographic breakdown
categorySlug    ← category breakdown
listingId       ← join to listings table
```
