# RentAI · 5 Must-Pass Tests — POST /api/ai/price-suggestion

> **Setup once** (PowerShell):
> ```powershell
> $BASE  = "http://localhost:3000/api"
> $TOKEN = (curl -s -X POST "$BASE/auth/login" `
>   -H "Content-Type: application/json" `
>   -d '{"email":"user1@example.com","password":"password123"}' `
>   | ConvertFrom-Json).data.accessToken
> ```

---

## T1 · Kelibia beachfront villa — high confidence

**Verifies:** comp pool seeded, sea-proximity multiplier fires, villa type applied.

```powershell
curl -s -X POST "$BASE/ai/price-suggestion" `
  -H "Authorization: Bearer $TOKEN" `
  -H "Content-Type: application/json" `
  -d '{
    "city": "Kelibia",
    "category": "accommodation",
    "unit": "per_night",
    "lat": 36.8497, "lng": 11.1047, "radiusKm": 20,
    "propertyType": "villa",
    "distanceToSeaKm": 0.2,
    "capacity": 8
  }' | python -m json.tool
```

**Must verify:**

| Field | Condition |
|---|---|
| `confidence` | `"high"` |
| `compsUsed` | ≥ 8 |
| `recommended` | ≥ 280 TND (sea + villa premium) |
| `range.min` | ≥ 200 TND |
| `range.max` | ≤ 2 000 TND (hard cap) |
| `recommended` | within `[range.min, range.max]` |
| `explanation` | array of exactly 3 non-empty strings |
| `logId` | non-null UUID string |
| HTTP status | `200` |

---

## T2 · Kelibia inland apartment — lower price than T1

**Verifies:** distance-to-sea penalty, apartment multiplier < villa.

```powershell
curl -s -X POST "$BASE/ai/price-suggestion" `
  -H "Authorization: Bearer $TOKEN" `
  -H "Content-Type: application/json" `
  -d '{
    "city": "Kelibia",
    "category": "accommodation",
    "unit": "per_night",
    "lat": 36.8301, "lng": 11.0801, "radiusKm": 20,
    "propertyType": "apartment",
    "distanceToSeaKm": 6.0,
    "capacity": 2
  }' | python -m json.tool
```

**Must verify:**

| Field | Condition |
|---|---|
| `recommended` | **strictly less than** T1 recommended |
| `confidence` | `"high"` or `"medium"` |
| `compsUsed` | ≥ 4 |
| `range.min` | ≥ 5 TND (floor guardrail) |
| `recommended` | within `[range.min, range.max]` |
| `explanation[0]` | non-empty string |

---

## T3 · Sports facility — per-session, category switch

**Verifies:** non-accommodation path, hard cap 300 TND, unit = `per_session`.

```powershell
curl -s -X POST "$BASE/ai/price-suggestion" `
  -H "Authorization: Bearer $TOKEN" `
  -H "Content-Type: application/json" `
  -d '{
    "city": "Tunis",
    "category": "sports_facility",
    "unit": "per_session",
    "lat": 36.8190, "lng": 10.1658, "radiusKm": 15,
    "capacity": 22
  }' | python -m json.tool
```

**Must verify:**

| Field | Condition |
|---|---|
| `unit` | `"per_session"` |
| `recommended` | ≤ 300 TND (hard cap) |
| `range.max` | ≤ 300 TND |
| `recommended` | within `[range.min, range.max]` |
| `explanation` | exactly 3 strings |
| HTTP status | `200` (never 500) |

---

## T4 · Vehicle — per-day, cap check

**Verifies:** vehicle category, hard cap = 1 000 TND, no accommodation multipliers.

```powershell
curl -s -X POST "$BASE/ai/price-suggestion" `
  -H "Authorization: Bearer $TOKEN" `
  -H "Content-Type: application/json" `
  -d '{
    "city": "Tunis",
    "category": "vehicle",
    "unit": "per_day",
    "lat": 36.8190, "lng": 10.1660, "radiusKm": 20,
    "capacity": 5
  }' | python -m json.tool
```

**Must verify:**

| Field | Condition |
|---|---|
| `recommended` | ≤ 1 000 TND |
| `range.max` | ≤ 1 000 TND |
| `unit` | `"per_day"` |
| `recommended` | within `[range.min, range.max]` |
| `range.max / range.min` | ≤ 3.5 (tightened range ratio) |

---

## T5 · Cold-start fallback — unknown city, zero comps

**Verifies:** guardrail fires, baseline returned, no 500, `compsUsed = 0`.

```powershell
curl -s -X POST "$BASE/ai/price-suggestion" `
  -H "Authorization: Bearer $TOKEN" `
  -H "Content-Type: application/json" `
  -d '{
    "city": "BirMcherga",
    "category": "accommodation",
    "unit": "per_night"
  }' | python -m json.tool
```

**Must verify:**

| Field | Condition |
|---|---|
| HTTP status | `200` — **never** `500` |
| `confidence` | `"low"` |
| `compsUsed` | `0` |
| `recommended` | `150` (baseline) |
| `range.min` | `80` |
| `range.max` | `220` |
| `explanation[2]` | mentions "baseline" or "no comparable" |
| `logId` | non-null (log row still written even for fallback) |

---

## Confirm log row was written

After any successful T1–T5 call, verify the log endpoint (admin only):

```powershell
curl -s "$BASE/ai/price-suggestion/logs?limit=1" `
  -H "Authorization: Bearer $TOKEN" `
  | python -m json.tool
```

**Must verify:**

| Field | Condition |
|---|---|
| HTTP status | `200` |
| `data[0].city` | matches city sent in the request |
| `data[0].recommended` | matches `recommended` from response |
| `data[0].confidence` | matches `confidence` from response |
| `data[0].listingId` | `null` (not linked yet — only linked after listing publish) |
| `data[0].finalPrice` | `null` (set only after PATCH from frontend) |

---

## Pass/Fail Summary Table

| Test | Key assertion | Pass? |
|---|---|---|
| T1 — beachfront villa | `confidence: high`, `compsUsed ≥ 8`, `recommended ≥ 280` | |
| T2 — inland apartment | `recommended < T1.recommended` | |
| T3 — sports facility | `recommended ≤ 300`, `unit: per_session` | |
| T4 — vehicle | `recommended ≤ 1000`, range ratio ≤ 3.5 | |
| T5 — fallback | `confidence: low`, `compsUsed: 0`, `recommended: 150` | |
| Log check | `data[0]` exists, `listingId: null` | |
