# RentEverything API — Postman Collection v4

Stateful, ordered, **rate-limit-aware** API test suite.

---

## ⚠️ Auth Throttle Note

The `/api/auth/*` endpoints are protected by a **5 request per 60-second** rate limiter.

The v4 collection is carefully designed to only make **2 auth calls** in the main path:

| Step | Auth call |
|---|---|
| Register | 1st call (returns tokens — no separate Login needed) |
| Re-login after become-host | 2nd call (required to get HOST-role JWT) |

**The critical design decision:** Register already returns `accessToken` + `refreshToken`. We skip the explicit Login step in the main path entirely. This keeps us at 2 calls/run, well below the 5/min limit.

> If you still see `429 Too Many Requests` on re-login, it means you ran the collection multiple times in quick succession. **Wait 60 seconds and re-run.** Use `--delay-request 500` (500ms between requests) to add natural spacing.

---

## Files

| File | Purpose |
|---|---|
| `postman_rent_everything_collection_v4.json` | Main stateful workflow — 11 folders, 21 requests |
| `postman_rent_everything_env_v4.json` | Environment — all variables auto-populated |

---

## Setup Before Running

All variables are auto-populated. The only pre-configuration needed:

| Variable | Action |
|---|---|
| `adminToken` | *Optional* — set to an admin JWT to run folder 10. Leave empty to skip. |

All other variables (`accessToken`, `refreshToken`, `userId`, `categoryId`, `listingId`, `bookingId`, `reviewId`, `conversationId`) are captured automatically from responses.

---

## Run Order

| # | Folder | Auth Required | Key Actions |
|---|---|---|---|
| 1 | **Auth** | None | **Register** (captures `accessToken`, `userId`). **Get Profile** (confirms token works). |
| 2 | **Host Setup** | USER token | **Become host** → **Re-login** (overwrites `accessToken` with HOST-role JWT). |
| 3 | **Categories** | None | List → Nearby (with geo params) → By ID. Captures `categoryId`. |
| 4 | **Listings** | HOST token | Create (form-data + `placeholder.png`) → Search → Mine → By ID. Captures `listingId`. |
| 5 | **Bookings** | USER/HOST | Create booking → List → Detail → Confirm. Captures `bookingId`. |
| 6 | **Payments** | USER | Authorize payment → Get payment status. |
| 7 | **Reviews** | USER | Create review → Get user reviews. |
| 8 | **Chat** | USER | Create conversation → List → Messages → Unread count. |
| 9 | **AI** | USER | AI search (accepts 503 if ML service offline). |
| 10 | **Admin Flow** | Admin JWT in `adminToken` | All skipped if `adminToken` is empty. |
| 11 | **Optional: Refresh & Profile** | USER | Token refresh, profile update, verify stub — moved here to avoid throttle. |

> **Conditional skips:** Every request that depends on a prior ID uses `pm.execution.skipRequest()` in its pre-request script. If an earlier step failed, downstream steps skip cleanly instead of erroring.

---

## Newman Commands

```bash
# Install Newman (once)
npm install -g newman

# Standard run — recommended command
newman run postman_rent_everything_collection_v4.json \
  -e postman_rent_everything_env_v4.json \
  --delay-request 500

# With HTML report
npm install -g newman-reporter-htmlextra
newman run postman_rent_everything_collection_v4.json \
  -e postman_rent_everything_env_v4.json \
  --delay-request 500 \
  --reporters cli,htmlextra \
  --reporter-htmlextra-export newman-report.html

# Run only the core happy path (folders 1–4)
newman run postman_rent_everything_collection_v4.json \
  -e postman_rent_everything_env_v4.json \
  --folder "1. Auth" \
  --folder "2. Host Setup" \
  --folder "3. Categories (read-only)" \
  --folder "4. Listings" \
  --delay-request 500
```

---

## How to Obtain an Admin Token

```powershell
node -e "
globalThis.fetch('http://localhost:3000/api/auth/login', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ emailOrPhone: 'admin@rent.test', password: 'admin123' })
}).then(r => r.json()).then(d => console.log(d.data.accessToken));
"
```

Then paste the token into `adminToken` in `postman_rent_everything_env_v4.json`.

---

## Expected Results

| Metric | Value |
|---|---|
| Total requests | 21 |
| Total assertions | 26 |
| Expected failures | 0 |
| Run time (500ms delay) | ~18s |
