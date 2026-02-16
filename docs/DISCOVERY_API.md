# Discovery API - Quick Reference

Copy-paste friendly curl commands for testing the discovery endpoints.

---

## 1. Nearby Categories (Kelibia, Tunisia)

Get categories with active listings within 10km radius.

```bash
curl "http://localhost:3000/api/categories/nearby?lat=36.8578&lng=11.092&radiusKm=10&includeEmpty=false"
```

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "name": "Sports Equipment",
      "slug": "sports-equipment",
      "icon": "fa-football",
      "count": 15
    }
  ],
  "timestamp": "2026-02-16T20:27:06.496Z"
}
```

---

## 2. AI Search - Direct Result

Natural language search that returns results immediately.

```bash
curl -X POST "http://localhost:3000/api/ai/search" \
  -H "Content-Type: application/json" \
  -d '{
    "query": "villa for 3 days starting tomorrow under 250 TND",
    "lat": 36.8578,
    "lng": 11.092,
    "radiusKm": 10
  }'
```

**Response:**
```json
{
  "mode": "RESULT",
  "filters": {
    "q": "villa",
    "categorySlug": "accommodation",
    "maxPrice": 250,
    "availableFrom": "2026-02-17",
    "availableTo": "2026-02-19",
    "sortBy": "distance",
    "radiusKm": 10
  },
  "chips": [
    { "key": "q", "label": "villa" },
    { "key": "category", "label": "Accommodation" },
    { "key": "price", "label": "Up to 250 TND" }
  ],
  "followUp": null,
  "results": [ /* listing objects */ ]
}
```

---

## 3. AI Search - Follow-Up Flow

### Step 1: Initial query (may trigger follow-up)

```bash
curl -X POST "http://localhost:3000/api/ai/search" \
  -H "Content-Type: application/json" \
  -d '{
    "query": "villa near beach under 250",
    "lat": 36.8578,
    "lng": 11.092,
    "radiusKm": 10
  }'
```

**Response (FOLLOW_UP mode):**
```json
{
  "mode": "FOLLOW_UP",
  "followUp": {
    "question": "Which dates do you need?",
    "field": "dates",
    "options": ["Today", "Tomorrow", "This weekend"]
  },
  "filters": {
    "q": "villa",
    "categorySlug": "accommodation",
    "maxPrice": 250
  },
  "chips": [ /* ... */ ],
  "results": []
}
```

### Step 2: Answer follow-up (always returns RESULT)

```bash
curl -X POST "http://localhost:3000/api/ai/search" \
  -H "Content-Type: application/json" \
  -d '{
    "query": "villa near beach under 250",
    "lat": 36.8578,
    "lng": 11.092,
    "radiusKm": 10,
    "followUpUsed": true,
    "followUpAnswer": "tomorrow"
  }'
```

**Response (RESULT mode):**
```json
{
  "mode": "RESULT",
  "filters": { /* complete filters */ },
  "chips": [ /* ... */ ],
  "followUp": null,
  "results": [ /* listing objects */ ]
}
```

---

## PowerShell Equivalents

### Categories
```powershell
Invoke-WebRequest -Uri "http://localhost:3000/api/categories/nearby?lat=36.8578&lng=11.092&radiusKm=10" -UseBasicParsing | Select-Object -ExpandProperty Content
```

### AI Search
```powershell
$body = @{
  query = "villa near beach under 250"
  lat = 36.8578
  lng = 11.092
  radiusKm = 10
} | ConvertTo-Json

Invoke-WebRequest -Uri "http://localhost:3000/api/ai/search" -Method POST -Body $body -ContentType "application/json" -UseBasicParsing | Select-Object -ExpandProperty Content
```

### AI Search with Follow-Up
```powershell
$body = @{
  query = "villa near beach under 250"
  lat = 36.8578
  lng = 11.092
  radiusKm = 10
  followUpUsed = $true
  followUpAnswer = "tomorrow"
} | ConvertTo-Json

Invoke-WebRequest -Uri "http://localhost:3000/api/ai/search" -Method POST -Body $body -ContentType "application/json" -UseBasicParsing | Select-Object -ExpandProperty Content
```

---

## Notes

- **Kelibia Coordinates:** `lat=36.8578, lng=11.092`
- **Max Radius:** 50km
- **Max Follow-Ups:** 1 per search session
- **Stable Keys:** All responses include `mode`, `filters`, `chips`, `followUp`, `results`
