# RentAI — E2E Test Plan: Booking / Chat / Availability Blocking

> **Estimated time:** ~15 minutes for full API run · ~20 minutes with UI steps  
> **Prereqs:** seed ran (IDs printed in console), backend + frontend running

---

## Setup — Tokens & IDs

```powershell
$BASE = "http://localhost:3000/api"

# Renter token (user6)
$RENTER = (curl -s -X POST "$BASE/auth/login" `
  -H "Content-Type: application/json" `
  -d '{"email":"user6@example.com","password":"password123"}' `
  | ConvertFrom-Json).data.accessToken

# Host token (user1)
$HOST = (curl -s -X POST "$BASE/auth/login" `
  -H "Content-Type: application/json" `
  -d '{"email":"user1@example.com","password":"password123"}' `
  | ConvertFrom-Json).data.accessToken

# Pick the DEMO DAILY listing (printed after npm run seed — or grab first stays listing)
$LISTING_ID = "PASTE_DAILY_LISTING_UUID_HERE"

# Dates: use D+60 to avoid conflict with the seeded D+30 booking
$START = (Get-Date).AddDays(60).ToString("yyyy-MM-dd")
$END   = (Get-Date).AddDays(63).ToString("yyyy-MM-dd")
echo "Testing $START → $END"
```

---

## PHASE 1 — Create Booking Request

### API

```powershell
$BOOKING = curl -s -X POST "$BASE/bookings" `
  -H "Authorization: Bearer $RENTER" `
  -H "Content-Type: application/json" `
  -d "{`"listingId`":`"$LISTING_ID`",`"startDate`":`"$START`",`"endDate`":`"$END`"}" `
  | python -m json.tool
echo $BOOKING
$BOOKING_ID = ($BOOKING | ConvertFrom-Json).data.id
echo "BookingId: $BOOKING_ID"
```

**Verify:**

- [ ] HTTP `201`
- [ ] `data.status` = `"pending"`
- [ ] `data.listingId` = `$LISTING_ID`
- [ ] `data.renterId` = user6's ID
- [ ] `data.totalPrice` > 0 (price × nights calculated)
- [ ] `data.paid` = `false`

### UI

- [ ] Open `http://localhost:3001` as **Renter (user6@example.com)**
- [ ] Find the demo villa listing in `/listings` or search "villa Kelibia"
- [ ] Click **Request to Book**
- [ ] Select dates D+60 → D+63
- [ ] Click **Confirm Request**
- [ ] ✅ Toast: "Booking request sent!"
- [ ] ✅ Redirected to `/bookings` — new row shows status `Pending`

---

## PHASE 2 — Conversation Created Automatically

### API

```powershell
# List conversations for the renter
curl -s "$BASE/conversations" `
  -H "Authorization: Bearer $RENTER" | python -m json.tool
```

**Verify:**

- [ ] At least one conversation returned
- [ ] `data[0].bookingId` = `$BOOKING_ID`
- [ ] `data[0].listingId` = `$LISTING_ID`
- [ ] `data[0].renterId` = user6's ID
- [ ] `data[0].hostId`   = user1's ID

```powershell
$CONV_ID = (curl -s "$BASE/conversations" `
  -H "Authorization: Bearer $RENTER" | ConvertFrom-Json).data[0].id
echo "ConvId: $CONV_ID"
```

### UI

- [ ] Open `http://localhost:3001/messages` as Renter
- [ ] ✅ Conversation with the villa host appears in the inbox
- [ ] ✅ Clicking it opens the chat thread

---

## PHASE 3 — BOOKING_CARD Renders in Chat (not raw JSON)

### UI (required — no API equivalent)

- [ ] Open the conversation created in Phase 2
- [ ] ✅ At the top of the thread (or as a pinned card): a **booking summary card** renders showing:
  - Listing title
  - Check-in / check-out dates
  - Total price
  - Status badge: `Pending`
- [ ] ✅ The card is NOT raw JSON text dumped into the chat bubble
- [ ] ✅ Card is readable on mobile (resize browser to 375 px wide)

### API verification (content check)

```powershell
# Fetch messages in conversation — first message should be a booking card event
curl -s "$BASE/conversations/$CONV_ID/messages" `
  -H "Authorization: Bearer $RENTER" | python -m json.tool
```

- [ ] `data[0].type` = `"BOOKING_CARD"` (or check your message type enum)
- [ ] `data[0].content` contains `listingTitle` or structured booking payload

---

## PHASE 4 — Host Accepts Booking

### API

```powershell
curl -s -X PATCH "$BASE/bookings/$BOOKING_ID/confirm" `
  -H "Authorization: Bearer $HOST" | python -m json.tool
```

**Verify:**

- [ ] HTTP `200`
- [ ] `data.status` = `"confirmed"`

### UI

- [ ] Log in as **Host (user1@example.com)**
- [ ] Open `http://localhost:3001/host/bookings`
- [ ] Find the pending booking row — click **Accept**
- [ ] ✅ Status changes to `Confirmed` in real time
- [ ] ✅ Renter's booking page also updates (check `/bookings` as renter)

---

## PHASE 5 — Availability Blocked After Confirm

### API — check available dates

```powershell
curl -s "$BASE/listings/$LISTING_ID/availability?startDate=$START&endDate=$END" `
  -H "Authorization: Bearer $RENTER" | python -m json.tool
```

**Verify:**

- [ ] D+60 → D+63 are marked **unavailable** / blocked
- [ ] Response does NOT include those dates as open slots

### API — check listing bookings endpoint (if present)

```powershell
curl -s "$BASE/listings/$LISTING_ID/bookings" `
  -H "Authorization: Bearer $HOST" | python -m json.tool
```

- [ ] Confirmed booking appears in the list for those dates

### UI

- [ ] Open the listing page as a guest / new renter
- [ ] Click **Book** → open the date picker
- [ ] ✅ D+60 → D+63 are **greyed out / disabled** in the calendar
- [ ] ✅ Clicking those dates shows a "not available" message

---

## PHASE 6 — Conflicting Booking is Rejected

### API — attempt overlapping booking (same listing, overlapping dates)

```powershell
# Use dates that overlap with the confirmed booking (D+61 → D+64)
$CONFLICT_START = (Get-Date).AddDays(61).ToString("yyyy-MM-dd")
$CONFLICT_END   = (Get-Date).AddDays(64).ToString("yyyy-MM-dd")

curl -s -X POST "$BASE/bookings" `
  -H "Authorization: Bearer $RENTER" `
  -H "Content-Type: application/json" `
  -d "{`"listingId`":`"$LISTING_ID`",`"startDate`":`"$CONFLICT_START`",`"endDate`":`"$CONFLICT_END`"}" `
  | python -m json.tool
```

**Verify:**

- [ ] HTTP `409` Conflict (or `400` Bad Request)
- [ ] `message` contains "not available", "conflict", or "already booked"
- [ ] **No** new booking row created in DB

### API — attempt booking with exact same dates

```powershell
curl -s -X POST "$BASE/bookings" `
  -H "Authorization: Bearer $RENTER" `
  -H "Content-Type: application/json" `
  -d "{`"listingId`":`"$LISTING_ID`",`"startDate`":`"$START`",`"endDate`":`"$END`"}" `
  | python -m json.tool
```

- [ ] HTTP `409` or `400`
- [ ] Error body is human-readable (not a raw Prisma exception)

### UI

- [ ] Open the listing as a different renter account (user7@example.com)
- [ ] Attempt to book D+61 → D+64
- [ ] ✅ "Not available for those dates" error shown in the UI
- [ ] ✅ No confirmation step reached

---

## PHASE 7 — Seeded Conflict Demo (quick sanity)

The seed already creates a confirmed D+30 → D+33 booking. Test that it blocks correctly:

```powershell
$DEMO_START = (Get-Date).AddDays(31).ToString("yyyy-MM-dd")
$DEMO_END   = (Get-Date).AddDays(32).ToString("yyyy-MM-dd")

curl -s -X POST "$BASE/bookings" `
  -H "Authorization: Bearer $RENTER" `
  -H "Content-Type: application/json" `
  -d "{`"listingId`":`"$LISTING_ID`",`"startDate`":`"$DEMO_START`",`"endDate`":`"$DEMO_END`"}" `
  | python -m json.tool
```

- [ ] HTTP `409` — seeded conflict correctly blocks new bookings
- [ ] No new booking created

---

## Pass / Fail Summary

| Phase | What is tested | API | UI |
|---|---|---|---|
| P1 | Booking created, status = pending | | |
| P2 | Conversation auto-created with correct IDs | | |
| P3 | BOOKING_CARD renders (not raw JSON) | — | |
| P4 | Host confirms → status = confirmed | | |
| P5 | Dates blocked in availability check | | |
| P5b | Calendar greys out confirmed dates | — | |
| P6 | Overlapping booking rejected (409) | | |
| P6b | UI shows "not available" error | — | |
| P7 | Seeded D+30 demo conflict still blocks | | — |

> `—` = no meaningful API/UI equivalent for that column; skip.

---

## Quick Seed Reference

After `npm run seed`, the console prints:
```
║  DAILY listing : <uuid>  ║
║  Blocked dates : YYYY-MM-DD → YYYY-MM-DD  ║
║  SLOT listing  : <uuid>  ║
║  Blocked slot  : 10:00–12:00 on YYYY-MM-DD ║
║  RenterA login : user6@example.com / password123  ║
║  Host login    : user1@example.com / password123  ║
```

Copy the DAILY listing UUID into `$LISTING_ID` above.
