# RentAI — Listing Discovery Checklist

> Run immediately after publishing a listing (continue from `UI_TEST_CREATE_LISTING.md` Block 8).  
> Assumes listing was published in **Kelibia** at **lat: 36.8497, lng: 11.1047**, price **450 TND**.

Set `$TOKEN` and `$ID` once:
```powershell
$TOKEN = (curl -s -X POST http://localhost:3000/api/auth/login `
  -H "Content-Type: application/json" `
  -d '{"email":"user1@example.com","password":"password123"}' `
  | ConvertFrom-Json).data.accessToken

# Grab the ID of the most recently created listing:
$ID = (curl -s "http://localhost:3000/api/listings?limit=1&sort=newest" `
  -H "Authorization: Bearer $TOKEN" | ConvertFrom-Json).data[0].id
echo $ID
```

---

## C1 · Listing exists by ID

**Endpoint:** `GET /api/listings/:id`

```powershell
curl -s "http://localhost:3000/api/listings/$ID" | python -m json.tool
```

- [ ] HTTP `200`
- [ ] `data.id` matches `$ID`
- [ ] `data.pricePerDay` = `450` (final chosen price)
- [ ] `data.status` = `"ACTIVE"`
- [ ] `data.address` contains `"Kelibia"`

---

## C2 · Listing appears in host dashboard

**UI page:** `http://localhost:3001/host/listings`

- [ ] New listing title visible in the list
- [ ] Price shows `450 TND`
- [ ] Status badge = `Active`

---

## C3 · Listing found by geo-radius search

**Endpoint:** `GET /api/listings?lat=…&lng=…&radiusKm=…`

```powershell
curl -s "http://localhost:3000/api/listings?lat=36.8497&lng=11.1047&radiusKm=10&limit=20" `
  | python -m json.tool | findstr "id"
```

- [ ] Response array contains `$ID`
- [ ] `total` or item count increased by 1 vs pre-publish
- [ ] Distance of the result is ≤ 10 km from query point

---

## C4 · Listing excluded outside radius

```powershell
# Use a point far away (Sfax, ~300 km)
curl -s "http://localhost:3000/api/listings?lat=34.74&lng=10.76&radiusKm=10&limit=20" `
  | python -m json.tool | findstr "$ID"
```

- [ ] `$ID` is **NOT** in the results (geo filter working)

---

## C5 · Category filter works

```powershell
# Filter by stays category
$CAT = (curl -s "http://localhost:3000/api/categories" | ConvertFrom-Json).data `
  | Where-Object { $_.slug -eq "stays" } | Select-Object -First 1
curl -s "http://localhost:3000/api/listings?categoryId=$($CAT.id)&lat=36.8497&lng=11.1047&radiusKm=10" `
  | python -m json.tool | findstr '"id"'
```

- [ ] `$ID` appears in results
- [ ] All results have `category.slug = "stays"`

---

## C6 · Categories nearby count (if endpoint exists)

**Endpoint:** `GET /api/categories/nearby?lat=…&lng=…&radiusKm=…`

```powershell
curl -s "http://localhost:3000/api/categories/nearby?lat=36.8497&lng=11.1047&radiusKm=10" `
  | python -m json.tool
```

- [ ] `stays` entry exists
- [ ] `count` for stays is **≥ 25** (24 seeded + 1 just published)
- [ ] Other categories (`sports-facilities`, `mobility`) still show correct counts

---

## C7 · Public search (AI search, if enabled)

**Endpoint:** `POST /api/ai/search`

```powershell
curl -s -X POST "http://localhost:3000/api/ai/search" `
  -H "Content-Type: application/json" `
  -d '{"query":"villa beachfront Kelibia","lat":36.8497,"lng":11.1047,"radiusKm":15}' `
  | python -m json.tool | findstr '"id"'
```

- [ ] `$ID` appears in results (or top 5)
- [ ] Response includes `title`, `pricePerDay`, `distance`

---

## Pass / Fail

| Check | Endpoint / Page | Pass | Fail |
|---|---|---|---|
| C1 · Listing by ID | `GET /api/listings/:id` | | |
| C2 · Host dashboard | `/host/listings` | | |
| C3 · Found in geo-radius | `GET /api/listings?lat&lng&radiusKm=10` | | |
| C4 · Excluded outside radius | `GET /api/listings?lat=Sfax&radiusKm=10` | | |
| C5 · Category filter | `GET /api/listings?categoryId=stays` | | |
| C6 · Nearby count ≥ 25 | `GET /api/categories/nearby` | | |
| C7 · AI search finds it | `POST /api/ai/search` | | |
