# RentAI — Mobile API Contract

> **Version**: 1.0 · **Date**: June 2026  
> **Audience**: Mobile app developers (React Native / Flutter / Swift / Kotlin)  
> **Base URL**: `http://localhost:3001/api` (dev) · set via `BACKEND_PUBLIC_URL` in production  
> **Interactive docs**: `{BACKEND_PUBLIC_URL}/api/docs` (Swagger UI)

---

## How to read this document

Every endpoint is described with:
- The HTTP method and path
- Whether a `Bearer` token is required
- The exact request shape
- An example success response (already unwrapped from the envelope)
- An example error response
- Mobile-specific notes

All successful responses are wrapped by the server:
```json
{
  "success": true,
  "data": { ... },
  "timestamp": "2026-06-01T12:00:00.000Z"
}
```
Mobile code must read `.data` to get the payload.

All errors follow:
```json
{
  "success": false,
  "error": {
    "code": "UNAUTHORIZED",
    "message": "Invalid credentials"
  },
  "timestamp": "...",
  "requestId": "uuid-for-support"
}
```

---

## 1. Auth

### 1.1 Register

**POST** `/api/auth/register`  
Auth: ❌ not required  
Rate limit: 5 per minute

**Request body**
```json
{
  "name": "Rami Lengliz",
  "email": "rami@example.com",
  "password": "SecurePass123"
}
```
Either `email` or `phone` must be provided (not both required). `phone` format: `+21698XXXXXX`.

**Success (201)**
```json
{
  "accessToken": "eyJhbGci...",
  "refreshToken": "eyJhbGci...",
  "user": {
    "id": "uuid",
    "name": "Rami Lengliz",
    "email": "rami@example.com",
    "phone": null,
    "isHost": false,
    "roles": ["user"],
    "avatarUrl": null,
    "verifiedEmail": false,
    "verifiedPhone": false
  }
}
```

**Error (400)** — validation failure
```json
{
  "error": { "code": "VALIDATION_ERROR", "message": "email must be an email" }
}
```

**Mobile notes**
- Store `accessToken` and `refreshToken` in secure storage (Keychain on iOS, EncryptedSharedPreferences on Android).
- `accessToken` expires in 15 minutes. Use the refresh endpoint before it expires.
- `verifiedEmail` / `verifiedPhone` will be `false` until the user verifies. The app can prompt them but this does not block login.

---

### 1.2 Login

**POST** `/api/auth/login`  
Auth: ❌  
Rate limit: 5 per minute

**Request body**
```json
{
  "emailOrPhone": "rami@example.com",
  "password": "SecurePass123"
}
```
`emailOrPhone` accepts email OR phone number (`+216...`).

**Success (200)** — same shape as register response

**Error (401)**
```json
{
  "error": { "code": "UNAUTHORIZED", "message": "Invalid credentials" }
}
```

**Error (401)** — OAuth-only account
```json
{
  "error": { "code": "UNAUTHORIZED", "message": "This account uses Google Sign-In. Please log in with Google." }
}
```

---

### 1.3 Refresh Token

**POST** `/api/auth/refresh`  
Auth: requires `refreshToken` as Bearer token (not the access token)  
Rate limit: none

**Request header**
```
Authorization: Bearer <refreshToken>
```
No body needed.

**Success (200)**
```json
{
  "accessToken": "eyJhbGci...",
  "refreshToken": "eyJhbGci..."
}
```

**Error (401)** — token expired or revoked
```json
{
  "error": { "code": "UNAUTHORIZED", "message": "Invalid refresh token" }
}
```

**Mobile strategy**
1. All API calls attach `Authorization: Bearer <accessToken>`.
2. On any `401` response, call `POST /api/auth/refresh` with the stored `refreshToken`.
3. On refresh success: store new tokens, retry the original request.
4. On refresh failure (401): clear stored tokens, redirect user to the login screen.
5. Use a single in-flight queue to avoid thundering-herd (multiple parallel calls all trying to refresh at once).

---

### 1.4 Logout

**POST** `/api/auth/logout`  
Auth: ❌ (idempotent — safe even with expired token)  
Rate limit: 20 per minute

**Request body**
```json
{ "refreshToken": "eyJhbGci..." }
```

**Success (200)** — empty data

**Mobile notes**
- Call this when user explicitly logs out to revoke the refresh token server-side.
- Also clear all stored tokens locally.
- `POST /api/auth/logout-all` (requires valid access token) revokes every session for the user — useful for "log out all devices" feature.

---

### 1.5 Get Current User

**GET** `/api/users/me`  
Auth: ✅ Bearer

**Success (200)**
```json
{
  "id": "uuid",
  "name": "Rami Lengliz",
  "email": "rami@example.com",
  "phone": null,
  "isHost": false,
  "roles": ["user"],
  "avatarUrl": "https://res.cloudinary.com/.../avatar.jpg",
  "verifiedEmail": true,
  "verifiedPhone": false,
  "ratingAvg": "4.50",
  "ratingCount": 12,
  "homeLat": 36.85,
  "homeLng": 10.17,
  "homeCityName": "Tunis",
  "createdAt": "2026-02-01T10:00:00.000Z"
}
```

---

### 1.6 Google OAuth (Web redirect flow)

> **Note**: This is a browser redirect flow. For mobile, implement Google Sign-In natively using the Google Identity SDK, then send the `idToken` to a backend endpoint (future work). The current web redirect flow is not suitable for native mobile apps.

---

## 2. Home Screen

### 2.1 Nearby Categories

**GET** `/api/categories/nearby`  
Auth: ❌  

**Query params**
| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `lat` | float | required | User latitude |
| `lng` | float | required | User longitude |
| `radiusKm` | float | 10 | Search radius |

**Example request**
```
GET /api/categories/nearby?lat=36.8578&lng=11.092&radiusKm=10
```

**Success (200)**
```json
[
  {
    "id": "uuid",
    "name": "Stays",
    "slug": "stays",
    "icon": "🏠",
    "listingCount": 24
  },
  {
    "id": "uuid",
    "name": "Beach Gear",
    "slug": "beach-gear",
    "icon": "🏖",
    "listingCount": 8
  }
]
```

**Mobile notes**
- Request user location permission before calling this.
- `listingCount` shows how many listings are within the radius — use this to hide empty categories.
- If location permission is denied, fall back to `GET /api/categories` for the full list without counts.

---

### 2.2 All Categories (fallback — no location)

**GET** `/api/categories`  
Auth: ❌

**Success (200)**
```json
[
  { "id": "uuid", "name": "Stays", "slug": "stays", "icon": "🏠" },
  { "id": "uuid", "name": "Mobility", "slug": "mobility", "icon": "🚗" }
]
```

---

### 2.3 Featured / Recent Listings

**GET** `/api/listings`  
Auth: ❌

**Query params** — use these for the home feed:
```
?sortBy=date&limit=10&page=1
```

See Section 3 for the full filter reference.

---

## 3. Search & Listings

### 3.1 Listing Search

**GET** `/api/listings`  
Auth: ❌

**Query params**

| Param | Type | Description |
|-------|------|-------------|
| `q` | string | Keyword search (title + description) |
| `category` | UUID | Filter by category ID |
| `categorySlug` | string | Filter by slug: `stays`, `mobility`, `sports-facilities`, `beach-gear` |
| `minPrice` | number | Min price per day (TND) |
| `maxPrice` | number | Max price per day (TND) |
| `lat` | float | Latitude for proximity search |
| `lng` | float | Longitude for proximity search |
| `radiusKm` | float | Default 10, max 60 |
| `availableFrom` | YYYY-MM-DD | Available from date |
| `availableTo` | YYYY-MM-DD | Available to date |
| `bookingType` | `DAILY`\|`SLOT` | Filter by booking type |
| `sortBy` | `distance`\|`price_asc`\|`price_desc`\|`date` | Sort order |
| `page` | int | Default 1 |
| `limit` | int | Default 20, max 200 |

**Example request**
```
GET /api/listings?categorySlug=stays&maxPrice=200&lat=36.85&lng=10.17&radiusKm=15&sortBy=distance&page=1&limit=20
```

**Success (200)**
```json
[
  {
    "id": "uuid",
    "title": "Beach Villa Kelibia",
    "description": "...",
    "pricePerDay": "180.00",
    "address": "Route de la Plage, Kelibia",
    "images": ["/uploads/listings/uuid/photo.jpg"],
    "absoluteImages": ["http://localhost:3001/uploads/listings/uuid/photo.jpg"],
    "bookingType": "DAILY",
    "ratingAvg": 4.5,
    "distance": 2340.5,
    "category": { "id": "uuid", "name": "Stays", "slug": "stays", "icon": "🏠" },
    "host": { "id": "uuid", "name": "Ahmed", "ratingAvg": "4.80" }
  }
]
```

**Mobile notes**
- Use `absoluteImages` for displaying images. `images` may contain relative paths in dev.
- `distance` is in metres (only present when `lat`/`lng` are supplied).
- The response is a plain array (no pagination envelope). Use `page` / `limit` for next pages.

---

### 3.2 Map Search (all visible listings, no radius filter)

**GET** `/api/listings`  
Auth: ❌

Supply `lat` + `lng` without `radiusKm` (or set `radiusKm=0`) to get all listings sorted by distance:
```
GET /api/listings?lat=36.85&lng=10.17&sortBy=distance&limit=50
```

Each result includes a `location` GeoJSON point when PostGIS is active:
```json
{ "type": "Point", "coordinates": [10.17, 36.85] }
```
Use `location.coordinates[1]` (lat) and `location.coordinates[0]` (lng) to place pins on the map.

---

### 3.3 Listing Detail

**GET** `/api/listings/:id`  
Auth: ❌

**Success (200)**
```json
{
  "id": "uuid",
  "title": "Beach Villa Kelibia",
  "description": "Beautiful villa 50m from the beach...",
  "pricePerDay": "180.00",
  "address": "Route de la Plage, Kelibia",
  "images": ["/uploads/listings/uuid/photo1.jpg"],
  "absoluteImages": ["http://localhost:3001/uploads/listings/uuid/photo1.jpg"],
  "bookingType": "DAILY",
  "minNights": 2,
  "guestsCapacity": 6,
  "bedrooms": 3,
  "rules": "No parties. Check-out by 11am.",
  "cancellationPolicy": "MODERATE",
  "ratingAvg": 4.5,
  "isActive": true,
  "category": { "id": "uuid", "name": "Stays", "slug": "stays" },
  "host": {
    "id": "uuid",
    "name": "Ahmed Ben Ali",
    "email": "ahmed@example.com",
    "avatarUrl": "https://res.cloudinary.com/.../avatar.jpg",
    "isHost": true,
    "ratingAvg": "4.80",
    "ratingCount": 42,
    "idVerifiedAt": "2026-03-01T00:00:00.000Z"
  },
  "reviews": [
    {
      "id": "uuid",
      "rating": 5,
      "comment": "Perfect stay!",
      "authorName": "Sarra",
      "createdAt": "2026-05-01T00:00:00.000Z"
    }
  ],
  "createdAt": "2026-02-15T00:00:00.000Z"
}
```

**Mobile notes**
- `host.idVerifiedAt` not null → show "Verified Host" badge.
- `cancellationPolicy` values: `FLEXIBLE`, `MODERATE`, `STRICT`.
- `absoluteImages` is always safe to use for `<Image>` components.

---

### 3.4 Listing Availability (SLOT bookings)

**GET** `/api/listings/:id/available-slots`  
Auth: ❌  
Query: `?date=YYYY-MM-DD`

Returns booked time ranges for a given day. Use to build a time-slot picker.

```json
[
  { "startTime": "09:00", "endTime": "11:00" }
]
```

---

## 4. Host: Listing Management

### 4.1 Become a Host

**POST** `/api/users/me/become-host`  
Auth: ✅ Bearer

**Request body**
```json
{ "acceptTerms": true }
```
`acceptTerms` must be `true` (boolean). The user must have at least one verified contact channel (email or phone).

**Success (200)** — updated user object with `isHost: true`

**Error (400)**
```json
{ "error": { "code": "VALIDATION_ERROR", "message": "You must accept the host terms to continue" } }
```

---

### 4.2 Create Listing

**POST** `/api/listings`  
Auth: ✅ Bearer (must be host)  
Content-Type: `multipart/form-data`

**Form fields**

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `title` | string | ✅ | 5–255 chars |
| `description` | string | ✅ | 20–5000 chars |
| `categoryId` | UUID | ✅ | From `/api/categories` |
| `pricePerDay` | number | ✅ | TND, e.g. 150 |
| `address` | string | ✅ | Human-readable |
| `latitude` | float | ✅ | For map placement |
| `longitude` | float | ✅ | For map placement |
| `bookingType` | `DAILY`\|`SLOT` | ✅ | |
| `minNights` | int | | DAILY only |
| `guestsCapacity` | int | | |
| `bedrooms` | int | | |
| `rules` | string | | |
| `cancellationPolicy` | string | | `FLEXIBLE`\|`MODERATE`\|`STRICT` |
| `images` | File[] | ✅ | 1–5 files, JPEG/PNG, max 5MB each |

**Success (201)**
```json
{
  "listing": { "id": "uuid", "title": "...", "images": [...], "absoluteImages": [...] },
  "mlSuggestions": { "suggestedCategory": "stays", "suggestedPrice": 165 }
}
```

---

### 4.3 Upload Avatar

**POST** `/api/users/me/avatar`  
Auth: ✅ Bearer  
Content-Type: `multipart/form-data`

Field: `avatar` — JPEG / PNG / WebP, max 4 MB.

**Success (200)** — updated user with `avatarUrl`

---

### 4.4 Edit Listing

**PATCH** `/api/listings/:id`  
Auth: ✅ Bearer (host or admin)  
Content-Type: `multipart/form-data`

Send only the fields you want to change. `images` field adds new images; `imagesToRemove` (JSON array of URLs) removes existing ones.

---

### 4.5 My Listings (host)

**GET** `/api/listings/mine`  
Auth: ✅ Bearer (host)

Returns all listings owned by the current host, including draft/inactive ones.

---

### 4.6 Delete / Hide Listing

**DELETE** `/api/listings/:id`  
Auth: ✅ Bearer (host or admin)

Host: soft-deletes (sets `isActive: false`). Admin: hard-deletes.

---

## 5. Booking Flow

### 5.1 Create Booking Request

**POST** `/api/bookings`  
Auth: ✅ Bearer  
Rate limit: 10 per minute

**Request body — DAILY booking**
```json
{
  "listingId": "uuid",
  "startDate": "2026-07-10",
  "endDate": "2026-07-15",
  "message": "Looking forward to the stay!"
}
```

**Request body — SLOT booking**
```json
{
  "listingId": "uuid",
  "startDate": "2026-07-10",
  "endDate": "2026-07-10",
  "startTime": "10:00",
  "endTime": "12:00"
}
```

**Success (201)**
```json
{
  "id": "uuid",
  "listingId": "uuid",
  "renterId": "uuid",
  "hostId": "uuid",
  "startDate": "2026-07-10T00:00:00.000Z",
  "endDate": "2026-07-15T00:00:00.000Z",
  "totalPrice": "900.00",
  "commission": "90.00",
  "status": "pending",
  "displayStatus": "pending",
  "paid": false,
  "conversationId": "uuid",
  "actions": {
    "canPay": false,
    "canCancel": true,
    "canReview": false,
    "canConfirm": false,
    "canReject": false,
    "canMessageHost": true
  },
  "createdAt": "2026-06-01T10:00:00.000Z"
}
```

**Error (409)** — dates not available
```json
{ "error": { "code": "CONFLICT", "message": "This listing is not available for the selected dates" } }
```

---

### 5.2 My Bookings

**GET** `/api/bookings/me`  
Auth: ✅ Bearer

Returns all bookings where the caller is the renter OR the host, newest first.

Each booking includes `displayStatus` and `actions` (see below).

---

### 5.3 Booking Detail

**GET** `/api/bookings/:id`  
Auth: ✅ Bearer

**Success (200)** — includes `displayStatus`, `actions`, `conversationId`, and full listing/host/renter data.

### 5.4 Booking Status Reference

| Internal DB status | `displayStatus` | Meaning |
|---|---|---|
| `pending` | `pending` | Waiting for host response |
| `confirmed` | `accepted` | Host accepted, renter must pay |
| `paid` | `accepted` | Renter paid (internal milestone) |
| `completed` | `completed` | Rental finished |
| `cancelled` | `canceled` | Cancelled by renter or host |
| `rejected` | `rejected` | Host declined |

### 5.5 Mobile Action Flags

Every booking response includes an `actions` object. Use these to decide which buttons to show:

| Flag | Who can act | Condition |
|------|-------------|-----------|
| `canPay` | Renter | status = `confirmed` and not yet paid |
| `canCancel` | Renter or Host | status is `pending`, `confirmed`, or `paid` |
| `canReview` | Renter | status = `completed` |
| `canConfirm` | Host | status = `pending` |
| `canReject` | Host | status = `pending` |
| `canMessageHost` | Either | booking is not terminal (not rejected/cancelled/completed) |

These are hints for the UI — the server enforces the same rules on the mutation endpoint.

---

### 5.6 Host: Confirm Booking

**PATCH** `/api/bookings/:id/confirm`  
Auth: ✅ Bearer (host only)

No body. Returns updated booking with `displayStatus: "accepted"`.

---

### 5.7 Host: Reject Booking

**PATCH** `/api/bookings/:id/reject`  
Auth: ✅ Bearer (host only)

No body. Returns updated booking with `displayStatus: "rejected"`.

---

### 5.8 Pay Booking (simulated)

**POST** `/api/bookings/:id/pay`  
Auth: ✅ Bearer

> ⚠️ **SIMULATED** — No real payment gateway. This is a demo/prototype flow only. Do not display this as a real payment to end users.

**Request body**
```json
{ "paymentMethod": "WALLET" }
```
`paymentMethod` options: `WALLET` (deducts from user's wallet balance), `SIMULATED` (always succeeds).

**Success (200)** — booking `displayStatus` stays `"accepted"`, `paid: true` internally.

---

### 5.9 Cancel Booking

**PATCH** `/api/bookings/:id/cancel`  
Auth: ✅ Bearer (renter or host)

No body. Returns updated booking with `displayStatus: "canceled"`.

---

### 5.10 Complete Booking

**PATCH** `/api/bookings/:id/complete`  
Auth: ✅ Bearer

No body. Transitions `paid → completed`. Triggers payout ledger entries.

---

## 6. Wallet / Payment (Simulated)

> ⚠️ **ALL PAYMENT FEATURES ARE SIMULATED** — No real money moves. This is a demo prototype. Clearly label these features as simulation in any UI shown to users.

### 6.1 Wallet Balance

**GET** `/api/wallet/balance`  
Auth: ✅ Bearer

```json
{ "balance": "250.00", "currency": "TND" }
```

### 6.2 Top-up (Simulated)

**POST** `/api/wallet/topup`  
Auth: ✅ Bearer

```json
{ "amount": 100 }
```

Returns updated wallet balance. No real payment gateway is triggered.

### 6.3 Transaction History

**GET** `/api/wallet/transactions`  
Auth: ✅ Bearer

Returns a list of ledger entries for the current user.

---

## 7. Reviews

### 7.1 Create Review

**POST** `/api/reviews`  
Auth: ✅ Bearer

```json
{
  "bookingId": "uuid",
  "rating": 5,
  "comment": "Wonderful place, highly recommended!"
}
```

**Rules**:
- One review per booking (409 if already submitted).
- Booking must be in `completed` status.
- Rating 1–5 (integer).

**Success (201)**
```json
{
  "id": "uuid",
  "bookingId": "uuid",
  "rating": 5,
  "comment": "Wonderful place!",
  "authorId": "uuid",
  "createdAt": "2026-06-01T10:00:00.000Z"
}
```

---

### 7.2 Listing Reviews

Reviews are included in the listing detail response (`GET /api/listings/:id`) under the `reviews` array.

**GET** `/api/reviews/listing/:listingId`  
Auth: ❌

Returns paginated reviews for a listing.

---

## 8. Chat / Messaging

### 8.1 Conversation List

**GET** `/api/chat/conversations`  
Auth: ✅ Bearer

```json
[
  {
    "id": "uuid",
    "listingId": "uuid",
    "bookingId": "uuid",
    "lastMessage": { "content": "See you Sunday!", "createdAt": "..." },
    "unreadCount": 2,
    "otherUser": { "id": "uuid", "name": "Ahmed", "avatarUrl": "..." }
  }
]
```

### 8.2 Message History

**GET** `/api/chat/conversations/:id/messages`  
Auth: ✅ Bearer  
Query: `?page=1&limit=50`

```json
[
  {
    "id": "uuid",
    "conversationId": "uuid",
    "senderId": "uuid",
    "content": "Is the villa available for July?",
    "createdAt": "2026-06-01T09:00:00.000Z",
    "readAt": null
  }
]
```

### 8.3 Send Message (REST fallback)

**POST** `/api/chat/conversations/:id/messages`  
Auth: ✅ Bearer

```json
{ "content": "Hello! Is the listing still available?" }
```

### 8.4 WebSocket Connection (real-time)

**Namespace**: `/chat`  
**Transport**: Socket.IO (supports WebSocket + HTTP long-polling fallback)  
**Library**: `socket.io-client` (JS/TS), `socket.io-client` Swift, `socket.io-client-java`

**Connection (JavaScript example)**
```javascript
import { io } from 'socket.io-client';

const socket = io('http://localhost:3001/chat', {
  auth: { token: accessToken },  // JWT access token
  transports: ['websocket', 'polling'],
});

socket.on('connect', () => console.log('Connected'));
socket.on('connected', ({ userId, socketId }) => { /* confirm auth */ });
socket.on('error', ({ message }) => console.error(message));
```

**Subscribe to a conversation**
```javascript
socket.emit('joinConversation', { conversationId: 'uuid' });
```

**Send a message**
```javascript
socket.emit('sendMessage', {
  conversationId: 'uuid',
  content: 'Hello!',
});
socket.on('messageSent', (message) => { /* optimistic UI update */ });
socket.on('newMessage', (message) => { /* incoming from other user */ });
```

**Typing indicator**
```javascript
socket.emit('typing', { conversationId: 'uuid', isTyping: true });
socket.on('userTyping', ({ userId, isTyping }) => { /* show/hide typing bubble */ });
```

**Mark as read**
```javascript
socket.emit('markAsRead', { messageIds: ['uuid1', 'uuid2'] });
socket.on('markedAsRead', ({ messageIds }) => { /* update UI */ });
```

**Mobile notes**
- Re-authenticate and reconnect after the app returns from background. Socket.IO handles automatic reconnect but the JWT may have expired.
- Use `transports: ['websocket']` for performance on stable connections; include `'polling'` as fallback for restricted networks (hotel Wi-Fi, etc.).
- CORS on the WebSocket server is controlled by the same `CORS_ORIGINS` env var as the REST API.

---

## 9. Notifications

### 9.1 List Notifications

**GET** `/api/notifications`  
Auth: ✅ Bearer  
Query: `?unread=1` to get only unread

```json
[
  {
    "id": "uuid",
    "kind": "BOOKING_REQUESTED",
    "title": "New booking request",
    "body": "Beach Villa · 10 Jul → 15 Jul",
    "link": "/host/bookings",
    "payload": { "bookingId": "uuid" },
    "readAt": null,
    "createdAt": "2026-06-01T10:00:00.000Z"
  }
]
```

### 9.2 Unread Count

**GET** `/api/notifications/unread-count`  
Auth: ✅ Bearer

```json
{ "count": 3 }
```

Poll this endpoint every 30–60 seconds for badge updates. Push notifications (FCM/APNS) are planned for a future release.

### 9.3 Mark as Read

**POST** `/api/notifications/:id/read`  
Auth: ✅ Bearer

**POST** `/api/notifications/read-all`  
Auth: ✅ Bearer

### 9.4 Notification Kinds Reference

| Kind | Trigger | Link destination |
|------|---------|-----------------|
| `BOOKING_REQUESTED` | New booking on host's listing | `/host/bookings` |
| `BOOKING_CONFIRMED` | Host accepted renter's booking | `/client/bookings/:id` |
| `BOOKING_REJECTED` | Host rejected | `/client/bookings/:id` |
| `BOOKING_PAID` | Renter paid | `/host/bookings/:id` |
| `DISPUTE_RESOLVED` | Dispute outcome | `/bookings/:id` |

---

## 10. AI Features

### 10.1 AI Search

**POST** `/api/ai/search`  
Auth: ❌  
Rate limit: 40 per minute

**Request body — first call**
```json
{
  "query": "villa near the beach for a family of 4, under 200 TND",
  "lat": 36.8578,
  "lng": 11.092,
  "radiusKm": 10,
  "availableCategorySlugs": ["stays", "beach-gear"],
  "followUpUsed": false,
  "followUpAnswer": ""
}
```

**Response — FOLLOW_UP mode** (AI needs one clarification)
```json
{
  "mode": "FOLLOW_UP",
  "followUp": {
    "question": "Which dates are you planning to stay?",
    "field": "dates",
    "options": ["This weekend", "Next week", "This month"]
  },
  "filters": { "q": "villa", "maxPrice": 200, "categorySlug": "stays" },
  "chips": [
    { "key": "q", "label": "villa" },
    { "key": "price", "label": "Up to 200 TND" }
  ],
  "results": []
}
```

**Second call** (after user answers the follow-up)
```json
{
  "query": "villa near the beach for a family of 4, under 200 TND",
  "lat": 36.8578,
  "lng": 11.092,
  "radiusKm": 10,
  "availableCategorySlugs": ["stays"],
  "followUpUsed": true,
  "followUpAnswer": "This weekend"
}
```

**Response — RESULT mode**
```json
{
  "mode": "RESULT",
  "followUp": null,
  "filters": {
    "q": "villa",
    "categorySlug": "stays",
    "maxPrice": 200,
    "availableFrom": "2026-06-07",
    "availableTo": "2026-06-09",
    "sortBy": "distance",
    "radiusKm": 10
  },
  "chips": [
    { "key": "q", "label": "villa" },
    { "key": "price", "label": "Up to 200 TND" },
    { "key": "dates", "label": "Jun 7 – Jun 9" }
  ],
  "results": [
    {
      "id": "uuid",
      "title": "Seaside Villa Kelibia",
      "pricePerDay": "175.00",
      "address": "Kelibia",
      "images": [...],
      "absoluteImages": [...],
      "category": "stays"
    }
  ]
}
```

**Mobile notes**
- `followUpUsed` can only be `true` once. The server forces `RESULT` mode on the second call regardless of AI output.
- `chips` are filter badges to display (e.g. "villa", "Under 200 TND"). Each chip has a `key` (field name) and `label` (display text).
- If the AI call fails, the server falls back to keyword search and still returns `mode: "RESULT"` with whatever listings match `query` as a keyword.

---

### 10.2 AI Listing Assistant

**POST** `/api/ai/generate`  
Auth: ✅ Bearer  

Generates a complete title + description from raw details:
```json
{
  "category": "stays",
  "address": "Kelibia, Tunisia",
  "pricePerDay": 150,
  "amenities": ["pool", "wifi", "parking"],
  "bedrooms": 3
}
```

**POST** `/api/ai/enhance-description`  
Auth: ✅ Bearer

Improves an existing description.

**POST** `/api/ai/generate-titles`  
Auth: ✅ Bearer

Returns 3 alternative listing titles.

**POST** `/api/ai/price-suggestion`  
Auth: ✅ Bearer

Returns a recommended price based on comparable listings nearby.

---

## 11. Error Handling

### Standard error response

```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "endDate must be after startDate",
    "details": [ ... ]
  },
  "timestamp": "2026-06-01T12:00:00.000Z",
  "requestId": "3f2504e0-..."
}
```

`details` is only populated in development (`NODE_ENV !== production`).

### Error codes

| Code | HTTP | When |
|------|------|------|
| `VALIDATION_ERROR` | 400 | DTO validation failed |
| `UNAUTHORIZED` | 401 | Missing or invalid token |
| `FORBIDDEN` | 403 | Authenticated but insufficient role |
| `NOT_FOUND` | 404 | Resource does not exist |
| `CONFLICT` | 409 | Duplicate or state conflict (e.g., dates taken) |
| `RATE_LIMITED` | 429 | Too many requests |
| `INTERNAL_ERROR` | 5xx | Server error (report `requestId` to support) |

### Mobile 401 strategy

1. Receive 401 on any API call.
2. Call `POST /api/auth/refresh` with stored `refreshToken` as Bearer.
3. Success → store new tokens, retry original call.
4. Failure (401 on refresh) → clear tokens, navigate to login screen.

---

## 12. Files & Images

### Upload rules

| Field | Limit |
|-------|-------|
| Listing images | Max 5 files, 5 MB each, JPEG/PNG |
| Avatar | Max 1 file, 4 MB, JPEG/PNG/WebP |
| Upload endpoint | `multipart/form-data` |

### Image URL strategy

Listing images are returned in **two fields**:

| Field | Value | Use for |
|-------|-------|---------|
| `images` | May be relative (`/uploads/...`) or absolute (`https://res.cloudinary.com/...`) | Web frontend (same origin) |
| `absoluteImages` | Always absolute URL | **Mobile app** |

**Always use `absoluteImages`** in the mobile app. In development, local uploads are served from `http://localhost:3001/uploads/...`. In production with Cloudinary, both fields will contain the same HTTPS URL.

**Example**
```javascript
// Mobile — always safe
const imageUrl = listing.absoluteImages[0];

// Optional: Cloudinary resize for mobile bandwidth
// Replace /upload/ with /upload/w_400,f_auto,q_auto/
const thumb = imageUrl.includes('res.cloudinary.com')
  ? imageUrl.replace('/upload/', '/upload/w_400,f_auto,q_auto/')
  : imageUrl;
```

### Avatar URLs

User `avatarUrl` is already absolute (Cloudinary or full local URL). Use directly.

---

## 13. Known Limitations (Demo / Prototype)

These features exist but are **not production-ready**. Do not present them as real to users:

| Feature | Status | Notes |
|---------|--------|-------|
| Payments | ⚠️ Simulated | No real payment gateway. All charges are demo only. |
| Email/phone verification | ⚠️ Stubbed | `POST /api/auth/verify` always succeeds. No real OTP check in dev. |
| ML price suggestions | ⚠️ Heuristics | Not a real ML model. Rule-based keyword matching. |
| Cloudinary | ⚠️ Optional | Falls back to local disk if credentials not set. |
| Push notifications | ❌ Not yet built | Notification polling only (`GET /api/notifications`). FCM/APNS planned. |
| Google OAuth for mobile | ❌ Not yet built | Browser redirect only. Native SDK integration planned. |

---

## 14. Development Quick-start

```bash
# 1. Start DB + backend + frontend
npm run dev:all

# 2. Verify backend is up
curl http://localhost:3001/api/health

# 3. Open Swagger
open http://localhost:3001/api/docs

# 4. Create a test user
curl -X POST http://localhost:3001/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"name":"Test User","email":"test@example.com","password":"Test123!"}'

# 5. Promote to host+admin
node scripts/promote-user.mjs test@example.com
```

---

*Generated during Phase 2 of the mobile-readiness audit — June 2026.*
