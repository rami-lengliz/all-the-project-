# API Contract v1 — RentEverything

All responses use wrapper: `{ success: boolean, data: <payload>, timestamp: string }`

## Prefix Strategy

- **No global prefix** in `main.ts`
- All controllers use `@Controller('api/...')` → actual paths start with `/api/`
- Frontend axios `baseURL = http://localhost:3000/api` → calls like `api.post('/auth/login')` resolve to `POST /api/auth/login`
- Swagger UI: `http://localhost:3000/api/docs`

---

## Auth

| Method | Path | Auth | Throttle | Request Body | Response `data` |
|--------|------|------|----------|-------------|-----------------|
| POST | `/api/auth/register` | Public | 5/min | `{ name, email, password }` | `{ user, accessToken, refreshToken }` |
| POST | `/api/auth/login` | Public | 5/min | `{ emailOrPhone, password }` | `{ user, accessToken, refreshToken }` |
| POST | `/api/auth/refresh` | Public | — | `{ refreshToken }` | `{ accessToken, refreshToken }` |
| POST | `/api/auth/verify` | Public | — | `{ type, token }` | verification result |

## Users

| Method | Path | Auth | Request Body | Response `data` |
|--------|------|------|-------------|-----------------|
| GET | `/api/users/me` | Bearer | — | `User` object |
| PATCH | `/api/users/me` | Bearer | partial user | updated `User` |
| POST | `/api/users/me/become-host` | Bearer | `{ acceptTerms }` | updated `User` (isHost=true) |

## Listings

| Method | Path | Auth | Throttle | Request Body | Response `data` |
|--------|------|------|----------|-------------|-----------------|
| GET | `/api/listings` | Public | — | query: lat, lng, radiusKm, q, category, minPrice, maxPrice, page, limit, sortBy | `{ items, total, page, limit }` |
| GET | `/api/listings/mine` | Bearer+Host | — | — | `Listing[]` (all statuses) |
| POST | `/api/listings` | Bearer+Host | 5/min | multipart: title, description, categoryId, pricePerDay, address, latitude, longitude, rules?, images | `{ listing, mlSuggestions? }` |
| GET | `/api/listings/:id` | Public | — | — | `Listing` with host, category |
| PATCH | `/api/listings/:id` | Bearer | — | multipart: partial listing + images | updated `Listing` |
| DELETE | `/api/listings/:id` | Bearer+Host | — | — | soft-delete confirmation |

### Listing Status Flow

```
DRAFT → PENDING_REVIEW → ACTIVE ↔ SUSPENDED
```

- New listings default to `PENDING_REVIEW`
- Only `ACTIVE` listings appear in public search (`GET /api/listings`)
- `GET /api/listings/mine` returns all host listings regardless of status

## Bookings

| Method | Path | Auth | Throttle | Request Body | Response `data` |
|--------|------|------|----------|-------------|-----------------|
| POST | `/api/bookings` | Bearer | 10/min | `{ listingId, startDate, endDate, startTime?, endTime? }` | `Booking` with snapshots |
| GET | `/api/bookings/me` | Bearer | — | — | `Booking[]` |
| GET | `/api/bookings/:id` | Bearer | — | — | `Booking` |
| PATCH | `/api/bookings/:id/confirm` | Bearer+Host | — | — | `Booking` (status=confirmed) |
| PATCH | `/api/bookings/:id/reject` | Bearer+Host | — | — | `Booking` (status=rejected) |
| POST | `/api/bookings/:id/pay` | Bearer | — | `{ method, details }` | `Booking` (paid=true) |
| PATCH | `/api/bookings/:id/cancel` | Bearer | — | — | `Booking` (status=cancelled) |

### Booking Snapshots

On creation, each booking stores immutable snapshot fields:
- `snapshotTitle` — listing title at booking time
- `snapshotPricePerDay` — price at booking time
- `snapshotCommissionRate` — platform commission rate
- `snapshotCurrency` — always `"TND"`

These never change after creation, even if the listing is later edited.

## Admin

| Method | Path | Auth | Request Body | Response `data` |
|--------|------|------|-------------|-----------------|
| GET | `/api/admin/users` | Bearer+ADMIN | — | `User[]` |
| GET | `/api/admin/listings` | Bearer+ADMIN | — | `Listing[]` (all statuses) |
| POST | `/api/admin/flag` | Bearer+ADMIN | `{ listingId, reason }` | `{ message, listingId }` |
| PATCH | `/api/admin/listings/:id/approve` | Bearer+ADMIN | — | updated `Listing` (status=ACTIVE) |
| PATCH | `/api/admin/listings/:id/suspend` | Bearer+ADMIN | — | updated `Listing` (status=SUSPENDED) |
| GET | `/api/admin/logs` | Bearer+ADMIN | query: limit? | `AdminLog[]` |

## Categories

| Method | Path | Auth | Response `data` |
|--------|------|------|-----------------|
| GET | `/api/categories` | Public | `Category[]` |
| GET | `/api/categories/nearby` | Public (query: lat, lng, radiusKm) | `{ id, name, slug, count }[]` |

## Other Endpoints

| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| GET | `/api/health` | Public | Health check |
| POST | `/api/reviews` | Bearer | Create review |
| GET | `/api/reviews/listing/:id` | Public | Get listing reviews |
| POST | `/api/ai/search` | Public | AI-powered search |

---

## Verification Commands

```bash
# 1. PENDING listing not in public search
curl -s http://localhost:3000/api/listings | jq '.data.items[] | select(.status == "PENDING_REVIEW")' 
# Expected: empty (no PENDING_REVIEW listings in public results)

# 2. Admin approves listing
curl -s -X PATCH http://localhost:3000/api/admin/listings/<ID>/approve \
  -H "Authorization: Bearer <ADMIN_TOKEN>" | jq '.data.status'
# Expected: "ACTIVE"

# 3. Approved listing now in public search
curl -s "http://localhost:3000/api/listings?lat=36.8&lng=10.1&radiusKm=50" \
  | jq '.data.items[] | select(.id == "<ID>")'
# Expected: listing object

# 4. Admin suspends listing
curl -s -X PATCH http://localhost:3000/api/admin/listings/<ID>/suspend \
  -H "Authorization: Bearer <ADMIN_TOKEN>" | jq '.data.status'
# Expected: "SUSPENDED"
```
