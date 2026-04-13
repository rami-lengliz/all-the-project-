# AI Price Suggestion v1 (MVP Contract)

Endpoint: `POST /api/ai/price-suggestion`

Purpose: return a city-first price recommendation for a listing draft, with Tunisia fallback when local comps are insufficient.

All successful responses follow the project wrapper:
`{ success: true, data: <payload>, timestamp: <iso> }`

---

## Request Body

### Required fields

| Field | Type | Rules | Notes |
|---|---|---|---|
| `categorySlug` | string | enum: `stays`, `sports-facilities`, `mobility`, `beach-gear` | Category context |
| `pricingUnit` | string | enum: `PER_NIGHT`, `PER_DAY`, `PER_HOUR`, `PER_SLOT` | Unit by category |
| `city` | string | 1..80 chars | City-first anchor |

### Optional fields

| Field | Type | Rules | Notes |
|---|---|---|---|
| `lat` | number | `-90..90` | Send with `lng` for local radius comps |
| `lng` | number | `-180..180` | Send with `lat` |
| `radiusKm` | number | `1..50`, default `15` | Search radius for city comps |
| `listingType` | string | max 50 chars | Ex: `villa`, `apartment`, `football_pitch` |
| `capacity` | number | integer `>= 1` | Guests/players |
| `bedrooms` | number | integer `>= 0` | Mainly for stays |
| `amenities` | string[] | max 20 items | Ex: `["pool","sea_view","parking"]` |

Validation note:
- `lat` and `lng` must be provided together (both present or both omitted).

---

## Response Body (`data`)

| Field | Type | Rules |
|---|---|---|
| `recommended` | number | Suggested final price |
| `range` | object | `{ min: number, max: number }` |
| `currency` | string | MVP fixed: `TND` |
| `pricingUnit` | string | Echo from request |
| `confidence` | number | `0.00..1.00` |
| `explanation` | string[] | Exactly 3 short reasons |
| `compsUsed` | object | Comparable source summary |
| `compsUsed.city` | number | City comparables count |
| `compsUsed.national` | number | Tunisia fallback comparables count |
| `compsUsed.strategy` | string | `CITY_ONLY` \| `CITY_PLUS_NATIONAL` \| `BASELINE_FALLBACK` |

---

## Example 1: Kelibia Accommodation

### Request
```json
{
  "categorySlug": "stays",
  "pricingUnit": "PER_NIGHT",
  "city": "Kelibia",
  "lat": 36.8578,
  "lng": 11.092,
  "radiusKm": 15,
  "listingType": "villa",
  "capacity": 6,
  "bedrooms": 3,
  "amenities": ["pool", "sea_view", "parking"]
}
```

### Response (`data`)
```json
{
  "recommended": 245,
  "range": { "min": 210, "max": 280 },
  "currency": "TND",
  "pricingUnit": "PER_NIGHT",
  "confidence": 0.86,
  "explanation": [
    "Based on 14 similar stays in Kelibia.",
    "Villa type and 3-bedroom capacity trend above city median.",
    "Pool and sea-view amenities support an upper-mid range price."
  ],
  "compsUsed": {
    "city": 14,
    "national": 0,
    "strategy": "CITY_ONLY"
  }
}
```

---

## Example 2: Tunis Sports Facility

### Request
```json
{
  "categorySlug": "sports-facilities",
  "pricingUnit": "PER_HOUR",
  "city": "Tunis",
  "lat": 36.8065,
  "lng": 10.1815,
  "radiusKm": 20,
  "listingType": "football_pitch",
  "capacity": 10,
  "amenities": ["lights", "locker_room"]
}
```

### Response (`data`)
```json
{
  "recommended": 78,
  "range": { "min": 65, "max": 90 },
  "currency": "TND",
  "pricingUnit": "PER_HOUR",
  "confidence": 0.74,
  "explanation": [
    "Based on 6 similar facilities in Tunis.",
    "Evening-lighting facilities are priced above basic pitches.",
    "National fallback comps were blended to stabilize variance."
  ],
  "compsUsed": {
    "city": 6,
    "national": 19,
    "strategy": "CITY_PLUS_NATIONAL"
  }
}
```

---

## MVP Product Notes

- User never inputs price in early listing steps.
- Price suggestion is generated automatically on final review step.
- Manual override is allowed on final step before publish.
- If comparables are weak, system falls back to blended or baseline strategy with lower confidence.
