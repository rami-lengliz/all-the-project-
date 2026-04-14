# RentAI — Known Limitations (MVP)

This document is an honest record of what the current MVP does not do, and why. These are deliberate scope decisions, not bugs.

---

## 1. MVP Scope vs. Later Features

| Feature | Status | Notes |
|---|---|---|
| Multi-currency | ❌ Not included | All prices in TND. Currency conversion planned for v2. |
| Host verification / ID check | ❌ Not included | Hosts are trusted on sign-up. KYC/ID planned for v2. |
| Renter reviews before first booking | ❌ Not included | Reviews only available after a completed booking. |
| Push / email notifications | ❌ Not included | No email/SMS on booking events in MVP. In-app messages only. |
| Map-based search | ⚠️ Partial | Map view exists but does not support drawing a custom area. |
| Pagination on AI results | ❌ Not included | AI search returns up to 20 results. Cursor pagination planned. |
| Host calendar sync (iCal / Google) | ❌ Not included | Manual date blocking only. External calendar sync planned for v2. |
| Recurring / subscription rentals | ❌ Not included | Single-period bookings only. |
| Multi-photo upload reordering | ❌ Not included | Upload order is preserved; drag-to-reorder not implemented. |
| In-app dispute resolution | ❌ Not included | Disputes handled off-platform in MVP. |

---

## 2. AI Search Limitations

### Single follow-up maximum
The AI may ask **at most one** clarifying question per search session. If the first response is a `FOLLOW_UP`, the second call forces `RESULT` mode regardless of the query — preventing infinite clarification loops. This means some ambiguous queries may return broader results than ideal.

### Best-effort intent parsing
The AI extracts filters (price ceiling, category, location, date) on a best-effort basis using GPT. Queries with:
- heavy slang or non-standard abbreviations
- mixed language (Arabic + French + English in the same phrase)
- contradictory constraints ("cheap 5-star villa")

…may produce incomplete or partially correct filters.

### Fallback behavior when OpenAI is unavailable
If `OPENAI_API_KEY` is missing or the OpenAI API returns an error, the backend falls back to a **broad keyword search** against listing titles and descriptions. Results will be less precise and the `FOLLOW_UP` mode will never trigger. The `RESULT` badge will still appear but filters will be minimal.

### No semantic ranking
Results are ranked by **geospatial proximity**, not by relevance score or user preferences. Two equally close listings that match different intents will appear in arbitrary order.

---

## 3. Calendar & Booking Limitations

### Pending bookings do not hold dates
A `PENDING` booking does **not** block the calendar. Only `CONFIRMED` bookings prevent new overlapping reservations. This means two renters can send overlapping requests simultaneously; whichever the host confirms first wins, and the other is rejected automatically.

**This is a deliberate MVP trade-off.** A "soft hold" / time-limited reservation option is planned for v2.

### Slot bookings block at 1-hour granularity
Slot-based listings use 1-hour slots with an optional buffer. Half-hour or custom-duration slots are not supported in the MVP schema.

### No automatic booking expiry
Pending bookings do not expire automatically. Hosts must manually reject or confirm them. Auto-expiry after N hours is planned.

### No cancellation window enforcement
The platform records cancellations but does not enforce a cancellation policy (e.g., "72 h before arrival"). Any cancellation at any time is accepted. Policy enforcement is planned for v2.

---

## 4. Payment Limitations

Payment processing is **optional / not enforced** in the MVP:

- The `paid` flag on a booking is set manually (or by a future payment integration).
- No real-money transaction occurs through the platform in the MVP.
- Stripe / Konnect integration is architecturally stubbed (the `paymentIntent` model exists in the schema) but the payment flow is not wired to the UI.
- **Hosts and renters agree on payment off-platform** (bank transfer, cash) until v2.

> The commission field (`booking.commission`) is stored at 10% of the total price for reporting purposes, but is not collected automatically.

---

## 5. Privacy Notes

### Location is approximate, not exact
Listing coordinates are stored with full precision internally but **displayed on the public map at ~500 m radius jitter**. The exact address is only revealed to a renter after a booking is confirmed.

### No exact home pin publicly visible
Listings of type `Accommodation` do not expose a precise GPS pin on the public listing page or map. The pin is randomised within the listing's neighbourhood to protect host privacy.

### Phone numbers are never publicly shown
Phone numbers collected at registration are used only for internal identity verification. They are not displayed to other users in any UI screen.

### AI search logs
Queries submitted to the AI search are stored in `aiSearchLog` for analytics and debugging. Stored data includes: query text, lat/lng, extracted filters, and timestamp. No user identity is stored with the log in the MVP.

---

*This document should be updated at the start of each sprint to reflect closed limitations and newly accepted scope constraints.*
