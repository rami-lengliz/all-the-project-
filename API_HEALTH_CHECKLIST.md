# RentAI — API Health Checklist

> Run in order. Stop at the first failure.  
> Set `$TOKEN` once (step 2), reuse everywhere.

---

## Step 1 · Server is up

```bash
curl http://localhost:3000/api/health
```
✅ Good: `{"status":"ok"}`  
❌ Bad: `curl: (7) Failed to connect` → backend not started

---

## Step 2 · Auth works — get token

```powershell
$TOKEN = (curl -s -X POST http://localhost:3000/api/auth/login `
  -H "Content-Type: application/json" `
  -d '{"email":"user1@example.com","password":"password123"}' `
  | ConvertFrom-Json).data.accessToken
echo $TOKEN
```
✅ Good: long JWT string printed  
❌ Bad: `null` or `401` → check seed ran, check email/password

---

## Step 3 · Categories load

```bash
curl http://localhost:3000/api/categories
```
✅ Good: JSON array with `stays`, `sports-facilities`, `mobility`, `beach-gear`  
❌ Bad: empty array `[]` → seed not run

---

## Step 4 · Listings near Kelibia

```bash
curl "http://localhost:3000/api/listings?lat=36.8578&lng=11.092&radiusKm=30&limit=5"
```
✅ Good: `data` array with 5+ listings, each has `pricePerDay` and `address`  
❌ Bad: empty → PostGIS query broken or seed failed

---

## Step 5 · AI Price Suggestion — happy path

```powershell
curl -s -X POST http://localhost:3000/api/ai/price-suggestion `
  -H "Authorization: Bearer $TOKEN" `
  -H "Content-Type: application/json" `
  -d '{"city":"Kelibia","category":"accommodation","unit":"per_night","lat":36.8497,"lng":11.1047,"radiusKm":20,"propertyType":"villa","distanceToSeaKm":0.2,"capacity":8}'
```
✅ Good:
```json
{
  "recommended": 380,
  "range": { "min": 290, "max": 490 },
  "confidence": "high",
  "compsUsed": 12,
  "explanation": ["...", "...", "..."],
  "logId": "..."
}
```
❌ Bad: `compsUsed: 0` with `confidence: low` → 24 Kelibia comps not seeded  
❌ Bad: `401` → token expired or not set  
❌ Bad: `500` → check backend logs

---

## Step 6 · AI Price Suggestion — fallback

```powershell
curl -s -X POST http://localhost:3000/api/ai/price-suggestion `
  -H "Authorization: Bearer $TOKEN" `
  -H "Content-Type: application/json" `
  -d '{"city":"BirMcherga","category":"accommodation","unit":"per_night"}'
```
✅ Good: `"confidence":"low"`, `"compsUsed":0`, `"recommended":150`  
❌ Bad: `500` → guardrail or baseline lookup broken

---

## Step 7 · Swagger docs up

```bash
curl -s http://localhost:3000/api/docs-json | findstr '"title"'
```
✅ Good: `"title": "RentAI API"`  
❌ Bad: `404` → Swagger not mounted

---

## Step 8 · Frontend loads

Open: `http://localhost:3001`

✅ Good: RentAI landing page visible with categories  
❌ Bad: blank/error → `cd frontend && npm run dev`

---

## Quick pass/fail table

| # | Endpoint | Expected | Pass? |
|---|---|---|---|
| 1 | `GET /api/health` | `status: ok` | |
| 2 | `POST /api/auth/login` | JWT token | |
| 3 | `GET /api/categories` | 4 categories | |
| 4 | `GET /api/listings?lat=…` | 5+ listings | |
| 5 | `POST /api/ai/price-suggestion` (Kelibia) | confidence high, comps ≥ 10 | |
| 6 | `POST /api/ai/price-suggestion` (BirMcherga) | confidence low, comps = 0 | |
| 7 | `GET /api/docs-json` | title: RentAI API | |
| 8 | `http://localhost:3001` | frontend loads | |
