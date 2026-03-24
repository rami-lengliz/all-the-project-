# RentAI — Pre-Demo Checklist

Run through this top to bottom **~15 minutes before** the demo. Tick every box.

---

## 0. Data Reset

```bash
cd all-the-project-
npm run seed:demo
```

- [ ] Seed output ends with `✅  Demo seed completed successfully!`
- [ ] Note the printed **SLOT_DATE** (D+7) for use in steps 6–7

---

## 1. URLs Reachable

| URL | Expected | ✓ |
|---|---|---|
| `http://localhost:3000` | Frontend loads, no blank screen | ☐ |
| `http://localhost:3000/demo/categories` | "Location-Aware Categories" page | ☐ |
| `http://localhost:3000/demo/ai-search` | "AI Search" page with example buttons | ☐ |
| `http://localhost:3000/api/health` | `{"success":true}` | ☐ |
| `http://localhost:3000/api/docs` | Swagger UI loads | ☐ |

---

## 2. Location-Aware Categories

- [ ] Go to `/demo/categories` → **Kelibia** is selected by default
- [ ] Note the category list (e.g. Sports Facilities, Accommodation …)
- [ ] Click **Tunis** → list changes to different categories / different counts
- [ ] Click **5 km** radius → category count drops
- [ ] Click **50 km** radius → category count grows
- [ ] Click **10 km** (restore default for demo)

---

## 3. AI Search — Direct RESULT

- [ ] Go to `/demo/ai-search`
- [ ] Click **"villa near beach under 300"** example
- [ ] Mode badge shows **RESULT** (green)
- [ ] At least 2 chips visible (e.g. `Q`, `RADIUS`)
- [ ] Result cards show title + price + category

---

## 4. AI Search — FOLLOW_UP then RESULT

- [ ] Click **Reset**
- [ ] Type a query likely to trigger FOLLOW_UP (e.g. `tennis court`)
- [ ] Press **Search**
- [ ] **If FOLLOW_UP appears:**
  - [ ] Read question aloud
  - [ ] Click one option (or type a free-text answer → Send)
  - [ ] Mode changes to **RESULT** with filtered listings
- [ ] **If RESULT appears directly:** acceptable — note it for the panel

---

## 5. Max 1 Follow-Up Enforced

- [ ] After receiving any RESULT, confirm mode badge stays **RESULT**
- [ ] No second FOLLOW_UP appears in the same session
- [ ] Debug panel (`🔧 Last request payload`) shows `"followUpUsed": true` on the second call

---

## 6. Booking Conflict — DAILY

All calls via Swagger (`/api/docs`). Use `host.kelibia@rentai.tn / password123`.

- [ ] `POST /api/auth/login` → copy `accessToken` → click **Authorize**
- [ ] `POST /api/bookings` with:
  ```json
  {
    "listingId": "b1000001-0000-4000-8000-000000000001",
    "startDate": "<DAILY_START from seed>",
    "endDate":   "<DAILY_END from seed>"
  }
  ```
  → Response is `409 Conflict` (dates already blocked by confirmed booking)

---

## 7. Booking Conflict — SLOT

- [ ] `GET /api/listings/b2000001-0000-4000-8000-000000000001/available-slots?date=<SLOT_DATE>`
  → **10:00 slot is absent** from the list
- [ ] Login as `renter.b@rentai.tn / password123` → Authorize
- [ ] `POST /api/bookings` with:
  ```json
  {
    "listingId": "b2000001-0000-4000-8000-000000000001",
    "startDate": "<SLOT_DATE>",
    "endDate":   "<SLOT_DATE>",
    "startTime": "10:00",
    "endTime":   "12:00"
  }
  ```
  → Response is **`409 Conflict: "This time slot is not available"`**

---

## 8. Final Smoke

- [ ] No browser console errors on any demo page
- [ ] Loading skeletons appear and resolve (not frozen)
- [ ] Reset button clears AI search state cleanly
- [ ] Presentation screen resolution set (1080p or projector mode)
- [ ] Tab order pre-set: `categories` → `ai-search` → `swagger`

---

**All boxes checked → demo is ready. 🟢**



