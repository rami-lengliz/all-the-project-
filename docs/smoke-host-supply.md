# Smoke Test: Host Supply Creation (End-to-End)

Happy-path flow: **Login → Become Host → Create Listing → Admin Approves → Verify in Search**

---

## Prerequisites

- Backend running on `http://localhost:3000` with seeded database + migration applied
- Frontend running on `http://localhost:3001`
- A registered user account (e.g. `test@example.com` / `password123`)
- An admin account for moderation

---

## Steps

### 1. Login

```
POST /api/auth/login
Body: { "emailOrPhone": "test@example.com", "password": "password123" }
```

**Expected response:**
```json
{ "success": true, "data": { "user": { "id": "...", "isHost": false }, "accessToken": "<JWT>", "refreshToken": "<JWT>" } }
```

### 2. Become Host

```
POST /api/users/me/become-host
Headers: Authorization: Bearer <accessToken>
Body: { "acceptTerms": true }
```

**Expected**: `isHost` flips to `true`.

### 3. Create Listing

```
POST /api/listings
Headers: Authorization: Bearer <accessToken>, Content-Type: multipart/form-data
Body (form-data): title, description, categoryId, pricePerDay, address, latitude, longitude, images
```

**Expected**: Listing created with `status: "PENDING_REVIEW"`. Toast + redirect to `/host/listings`.

### 4. Verify NOT in Public Search (Moderation)

```
GET /api/listings
```

**Expected**: The new listing does NOT appear (status is `PENDING_REVIEW`, not `ACTIVE`).

### 5. Admin Approves Listing

```
PATCH /api/admin/listings/:id/approve
Headers: Authorization: Bearer <adminToken>
```

**Expected**: `status` changes to `"ACTIVE"`.

### 6. Verify in Host Listings

```
GET /api/listings/mine
Headers: Authorization: Bearer <accessToken>
```

**Expected**: Listing appears with `status: "ACTIVE"`.

### 7. Verify in Public Search

```
GET /api/listings?lat=36.8578&lng=11.0920&radiusKm=10
```

**Expected**: The listing now appears in results.

---

## Failure Scenarios

| Scenario | Expected |
|----------|----------|
| Submit without images | Error: "At least one image is required" |
| Submit without title | Error: "Title is required" |
| Non-host visits `/host/create` | Redirected to `/profile` |
| Non-admin calls approve | 403 Forbidden |
| Double-click submit | Button disabled ("Publishing...") |
| Listing not approved | Not visible in public search |
| Admin suspends listing | Removed from public search |
