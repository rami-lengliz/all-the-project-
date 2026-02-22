# RentAI — Demo Storyboard (5-minute script)

> Run this in order. Each step flows into the next naturally.

---

## ⚙️ Pre-demo Setup (~2 min)

```bash
docker-compose up -d postgres
npx prisma migrate reset --force
npm run seed          # prints DAILY_ID, SLOT_ID, SLOT_DATE — save these
npm run start:dev
```

Open **Swagger** → `http://localhost:3000/api/docs`

---

## 📍 Scene 1 — Location-Aware Categories (~60s)

**Talking point:** *"Our homepage instantly knows what's available near you. Watch how the categories and counts change with location."*

**In Swagger → `GET /api/categories/nearby`**

**Call 1 — Kelibia (coastal area)**
```
lat: 36.8578  lng: 11.092  radiusKm: 50
```
→ Point out the response: categories appear **sorted by listing count DESC**. Show the top 2–3 (accommodation, sports-facilities, mobility).

**Call 2 — Tunis (urban area, same radius)**
```
lat: 36.8065  lng: 10.1815  radiusKm: 50
```
→ The **counts change**. Kelibia ≠ Tunis. This proves PostGIS spatial filtering is live.

**Call 3 — Kelibia, smaller radius**
```
lat: 36.8578  lng: 11.092  radiusKm: 5
```
→ Some categories **drop off completely**. Radius filtering is working.

---

## 🤖 Scene 2 — AI Search (RESULT mode) (~60s)

**Talking point:** *"Our search understands natural language. It converts messy user text into precise filters and UI chips — with no manual form filling."*

**In Swagger → `POST /api/ai/search`**

```json
{
  "query": "villa in kelibia under 250",
  "lat": 36.8578,
  "lng": 11.092,
  "radiusKm": 50,
  "followUpUsed": false
}
```

Point out the response structure:
- `"mode": "RESULT"` → AI went straight to results (query was clear enough)
- `"filters"` → `{ categorySlug: "accommodation", maxPrice: 250 }` — extracted automatically
- `"chips"` → ready-made UI tags like `"Villa"`, `"Under 250 TND"` that the frontend shows as dismissible filter badges
- `"results"` → actual matching listings from your seed data

---

## 💬 Scene 3 — AI Search (FOLLOW_UP → RESULT) (~75s)

**Talking point:** *"When the query is ambiguous, we don't guess — we ask one smart clarifying question, just like a real agent would."*

**Step 1 — vague first query**
```json
{
  "query": "football pitch in kelibia tomorrow",
  "lat": 36.8578,
  "lng": 11.092,
  "radiusKm": 50,
  "followUpUsed": false
}
```
→ Show `"mode": "FOLLOW_UP"`. AI detected a SLOT-based enquiry and needs to confirm the time. `followUp.question` reads naturally.

**Step 2 — user answers, API returns results**
```json
{
  "query": "football pitch in kelibia tomorrow",
  "lat": 36.8578,
  "lng": 11.092,
  "radiusKm": 50,
  "followUpUsed": true,
  "followUpAnswer": "In the afternoon around 3pm"
}
```
→ `"mode": "RESULT"`. The AI merged the original intent + the answer into a precise filter set. Point out `filters.availableFrom` or `filters.bookingType: "SLOT"`.

---

## 🛡️ Scene 4 — No Double Booking (Slot Conflict) (~60s)

**Talking point:** *"The system enforces booking integrity at the database level — not just the UI. Let me prove it."*

**Step 1 — login as renterB (user7)**

In Swagger → `POST /api/auth/login`:
```json
{ "emailOrPhone": "user7@example.com", "password": "password123" }
```
Copy the `accessToken` → click **Authorize** (top right) → paste it.

**Step 2 — try to book an already-confirmed slot**

From the seed console output, grab `SLOT_ID` and `SLOT_DATE`.

In Swagger → `POST /api/bookings`:
```json
{
  "listingId": "SLOT_ID",
  "startDate": "SLOT_DATE",
  "endDate": "SLOT_DATE",
  "startTime": "10:00",
  "endTime": "12:00"
}
```

→ **`409 Conflict`** — *"This time slot is not available."*

The slot is blocked because renterA already has a `confirmed` booking at 10:00–12:00. The system uses a PostgreSQL `OVERLAPS` check at query time — impossible to bypass.

---

## 🎉 Done!

Total time: **~4 minutes**. Three distinct value propositions demonstrated live, with zero mocking or prepared screenshots.
