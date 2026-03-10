# RentAI — Demo Script

**Duration:** 5–8 minutes  
**URLs:** `FRONTEND_URL=http://localhost:3000` · `SWAGGER_URL=http://localhost:3000/api/docs`  
**Prep:** `npm run dev:all` running, seed applied (`npm run seed`), browser at `FRONTEND_URL`.

---

## 1 · Location-Aware Categories (~1 min)

**URL:** `FRONTEND_URL/demo/categories`

> "The platform knows where you are. Categories are derived in real-time from active listings nearby — not hardcoded. Watch how switching city changes everything."

- Page loads → **Kelibia** selected by default → note the categories shown (Sports, Accommodation …)
- Click **Tunis** → list refreshes → different categories and counts appear
- Point out the **"X categories near …"** counter and the active location pill

---

## 2 · Radius Changes the List (~1 min)

**URL:** `FRONTEND_URL/demo/categories` (stay on this page)

> "The radius is a live filter. Tighten it and you lose categories. Open it wide and more appear — because more listings fall inside the circle."

- With Kelibia selected, click **5 km** → list shrinks (e.g. 4 categories)
- Click **50 km** → list grows (e.g. 7 categories)
- Point out listing counts per category badge updating accordingly

---

## 3 · AI Search — Direct RESULT (~1.5 min)

**URL:** `FRONTEND_URL/demo/ai-search`

> "Natural language goes in, structured filters come out. The AI extracts intent — property type, price ceiling, location — and runs a geospatial query against the database."

- Click example **"villa near beach under 300"**
- Wait for response (~5 s)
- Point out:
  - **RESULT** mode badge (green)
  - **Extracted filters chips** (`q`, `radius`, `priceMax` …)
  - **Result cards** with price/category/location
- Expand **🔧 Last request payload** → show `followUpUsed: false`

---

## 4 · AI Search — FOLLOW_UP then RESULT (~1.5 min)

**URL:** `FRONTEND_URL/demo/ai-search`

> "When the query is ambiguous, the AI asks one clarifying question instead of guessing. Only one — we prevent infinite loops on the client."

- Click **Reset**, type **"tennis court"** → press Enter
- If **FOLLOW_UP** mode appears:
  - Read the question aloud (e.g. "When do you need it?")
  - Click one of the option buttons (e.g. "Tomorrow afternoon")
  - Wait → mode changes to **RESULT**
  - Point out the result list now filtered by the answer
- If backend goes straight to RESULT (high-confidence path): show **"villa avec piscine à Kelibia"** preset which may trigger FOLLOW_UP, or explain this is the fallback
- Stress: **no second follow-up is ever asked** (client guard fires)

---

## 5 · Booking Request → Accept → Calendar Blocks (~1.5 min)

**URL:** `SWAGGER_URL`

> "The full rental loop: a renter requests a booking, the host accepts, and the dates are immediately blocked — preventing any double-booking."

**Step A — Create booking (as renter)**
```
POST /api/auth/login  { email: user6@example.com, password: password123 }
→ copy accessToken → Authorize in Swagger
POST /api/bookings  { listingId: <DAILY_ID>, startDate: <tomorrow>, endDate: <+2 days> }
→ status: PENDING
```

**Step B — Accept (as host)**
```
POST /api/auth/login  { email: user1@example.com, password: password123 }
→ copy accessToken → Authorize
PATCH /api/bookings/<bookingId>/status  { status: CONFIRMED }
→ status: CONFIRMED
```

**Step C — Verify dates blocked**
```
GET /api/listings/<DAILY_ID>  → availableDates no longer include those dates
```
> "The calendar reflects the confirmation instantly — a renter trying to book the same window would be rejected."

---

## 6 · SLOT Conflict — 409 Blocked (~1 min)

**URL:** `SWAGGER_URL`  
**Prep:** Use the `SLOT_ID` and `SLOT_DATE` printed during seed.

> "For hourly and slot-based rentals, we prevent double-booking at the slot level. An already-confirmed 10:00–12:00 slot cannot be re-booked."

```
GET /api/listings/<SLOT_ID>/available-slots?date=<SLOT_DATE>
→ 10:00 slot is MISSING (already confirmed booking blocks it)

POST /api/auth/login  { email: user7@example.com, password: password123 }
→ Authorize

POST /api/bookings  { listingId: SLOT_ID, startDate: SLOT_DATE, endDate: SLOT_DATE,
                      startTime: "10:00", endTime: "12:00" }
→ 409 Conflict: "This time slot is not available"
```
> "This is enforced at the database level — not just the UI — so concurrent requests cannot race through."

---

## Closing (~15 s)

> "AI-powered search, real-time geospatial categories, and conflict-safe bookings — all on a single stack. Thank you."

---

*Seed credentials: host `user1@example.com / password123` · renterA `user6@example.com` · renterB `user7@example.com`*
