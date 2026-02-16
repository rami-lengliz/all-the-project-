# API Contract - RentAI Platform

**Version:** 1.0  
**Base URL:** `http://localhost:3000`  
**Swagger Docs:** `http://localhost:3000/api/docs`

---

## Table of Contents

1. [Authentication](#authentication)
2. [Users](#users)
3. [Categories](#categories)
4. [Listings](#listings)
5. [Bookings](#bookings)
6. [Reviews](#reviews)
7. [Payments](#payments)
8. [AI Services](#ai-services)
9. [Admin](#admin)
10. [Common Patterns](#common-patterns)

---

## Authentication

**Base Path:** `/api/auth`

### Register
```
POST /api/auth/register
```
**Public:** ✅  
**Request Body:**
```json
{
  "email": "user@example.com",
  "password": "SecurePass123!",
  "firstName": "John",
  "lastName": "Doe",
  "phoneNumber": "+21612345678"
}
```
**Response:** `201 Created`
```json
{
  "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": "uuid",
    "email": "user@example.com",
    "firstName": "John",
    "lastName": "Doe"
  }
}
```

### Login
```
POST /api/auth/login
```
**Public:** ✅  
**Request Body:**
```json
{
  "email": "user@example.com",
  "password": "SecurePass123!"
}
```
**Response:** `200 OK` (same as register)

### Get Profile
```
GET /api/auth/profile
```
**Auth Required:** 🔒 Bearer Token

---

## Users

**Base Path:** `/api/users`

### Get Current User
```
GET /api/users/me
```
**Auth Required:** 🔒

### Update Profile
```
PATCH /api/users/me
```
**Auth Required:** 🔒  
**Request Body:**
```json
{
  "firstName": "Jane",
  "phoneNumber": "+21698765432",
  "bio": "Passionate about sharing resources"
}
```

### Become Host
```
POST /api/users/become-host
```
**Auth Required:** 🔒  
**Requirements:**
- Email verified
- Phone verified
- Terms accepted

**Response:** `200 OK`
```json
{
  "message": "Successfully became a host",
  "user": { /* updated user object */ }
}
```

### Upload Avatar
```
POST /api/users/me/avatar
```
**Auth Required:** 🔒  
**Content-Type:** `multipart/form-data`  
**Form Field:** `avatar` (image file)

---

## Categories

**Base Path:** `/api/categories`

### List All Categories
```
GET /api/categories
```
**Public:** ✅  
**Response:**
```json
[
  {
    "id": "uuid",
    "name": "Sports Equipment",
    "slug": "sports-equipment",
    "icon": "fa-football"
  }
]
```

### Get Nearby Categories
```
GET /api/categories/nearby
```
**Public:** ✅  
**Query Parameters:**
- `lat` (required): Latitude (-90 to 90)
- `lng` (required): Longitude (-180 to 180)
- `radiusKm` (optional): Radius in km (0-50, default: 10)
- `includeEmpty` (optional): Include categories with 0 listings (default: false)

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "name": "Sports Equipment",
      "slug": "sports-equipment",
      "icon": "fa-football",
      "count": 15
    }
  ],
  "timestamp": "2026-02-16T20:27:06.496Z"
}
```

### Get Category by ID
```
GET /api/categories/:id
```
**Public:** ✅

### Create Category
```
POST /api/categories
```
**Auth Required:** 🔒 Admin Only

### Update Category
```
PATCH /api/categories/:id
```
**Auth Required:** 🔒 Admin Only

### Delete Category
```
DELETE /api/categories/:id
```
**Auth Required:** 🔒 Admin Only

---

## Listings

**Base Path:** `/api/listings`

### List Listings (with filters)
```
GET /api/listings
```
**Public:** ✅  
**Query Parameters:**
- `search`: Keyword search
- `categorySlug`: Filter by category
- `minPrice`: Minimum price
- `maxPrice`: Maximum price
- `bookingType`: `DAILY` | `SLOT`
- `latitude`: User latitude (for distance sorting)
- `longitude`: User longitude
- `radius`: Search radius in km
- `sortBy`: `distance` | `date` | `price_asc` | `price_desc`

**Response:**
```json
[
  {
    "id": "uuid",
    "title": "Professional Tennis Court",
    "description": "...",
    "pricePerDay": 150,
    "pricePerSlot": 25,
    "bookingType": "SLOT",
    "category": { "name": "Sports Facilities", "slug": "sports-facilities" },
    "location": {
      "type": "Point",
      "coordinates": [11.092, 36.8578]
    },
    "images": ["/uploads/listings/uuid/image1.jpg"],
    "isActive": true,
    "host": {
      "id": "uuid",
      "firstName": "John",
      "lastName": "Doe"
    }
  }
]
```

### Get Listing by ID
```
GET /api/listings/:id
```
**Public:** ✅

### Create Listing
```
POST /api/listings
```
**Auth Required:** 🔒 Host Only  
**Content-Type:** `multipart/form-data`  
**Form Fields:**
- `title`: string (required)
- `description`: string (required)
- `categoryId`: uuid (required)
- `pricePerDay`: number (optional)
- `pricePerSlot`: number (optional)
- `bookingType`: `DAILY` | `SLOT` (required)
- `address`: string (required)
- `latitude`: number (required)
- `longitude`: number (required)
- `images`: file[] (optional, max 10)

### Update Listing
```
PATCH /api/listings/:id
```
**Auth Required:** 🔒 Owner Only

### Delete Listing
```
DELETE /api/listings/:id
```
**Auth Required:** 🔒 Owner Only

### Get My Listings
```
GET /api/listings/my-listings
```
**Auth Required:** 🔒 Host Only

---

## Bookings

**Base Path:** `/api/bookings`

### Create Booking
```
POST /api/bookings
```
**Auth Required:** 🔒  
**Request Body:**
```json
{
  "listingId": "uuid",
  "startDate": "2026-02-20",
  "endDate": "2026-02-22",
  "slotStart": "09:00",
  "slotEnd": "11:00",
  "totalPrice": 300,
  "message": "Looking forward to using your facility"
}
```

**Response:** `201 Created`
```json
{
  "id": "uuid",
  "status": "PENDING",
  "startDate": "2026-02-20",
  "endDate": "2026-02-22",
  "totalPrice": 300,
  "listing": { /* listing object */ },
  "renter": { /* user object */ }
}
```

### Get My Bookings
```
GET /api/bookings/my-bookings
```
**Auth Required:** 🔒  
**Query Parameters:**
- `role`: `renter` | `host` (default: renter)
- `status`: `PENDING` | `CONFIRMED` | `CANCELLED` | `COMPLETED`

### Get Booking by ID
```
GET /api/bookings/:id
```
**Auth Required:** 🔒 Owner/Host Only

### Update Booking Status
```
PATCH /api/bookings/:id/status
```
**Auth Required:** 🔒 Host Only  
**Request Body:**
```json
{
  "status": "CONFIRMED"
}
```

### Cancel Booking
```
POST /api/bookings/:id/cancel
```
**Auth Required:** 🔒 Renter/Host

---

## Reviews

**Base Path:** `/api/reviews`

### Create Review
```
POST /api/reviews
```
**Auth Required:** 🔒  
**Request Body:**
```json
{
  "listingId": "uuid",
  "bookingId": "uuid",
  "rating": 5,
  "comment": "Excellent facility, highly recommend!"
}
```

**Validation:**
- `rating`: 1-5 (integer)
- Must have completed booking
- One review per booking

### Get Reviews for Listing
```
GET /api/reviews/listing/:listingId
```
**Public:** ✅

### Get My Reviews
```
GET /api/reviews/my-reviews
```
**Auth Required:** 🔒

### Update Review
```
PATCH /api/reviews/:id
```
**Auth Required:** 🔒 Owner Only

### Delete Review
```
DELETE /api/reviews/:id
```
**Auth Required:** 🔒 Owner Only

---

## Payments

**Base Path:** `/api/payments`

### Create Payment Intent
```
POST /api/payments/create-intent
```
**Auth Required:** 🔒  
**Request Body:**
```json
{
  "bookingId": "uuid",
  "amount": 300
}
```

**Response:**
```json
{
  "clientSecret": "pi_xxx_secret_xxx",
  "paymentIntentId": "pi_xxx"
}
```

### Confirm Payment
```
POST /api/payments/confirm
```
**Auth Required:** 🔒  
**Request Body:**
```json
{
  "paymentIntentId": "pi_xxx",
  "bookingId": "uuid"
}
```

### Get Payment History
```
GET /api/payments/history
```
**Auth Required:** 🔒

---

## AI Services

**Base Path:** `/api/ai`

### AI Search
```
POST /api/ai/search
```
**Public:** ✅  
**Request Body:**
```json
{
  "query": "villa near beach under 250",
  "lat": 36.8578,
  "lng": 11.092,
  "radiusKm": 10,
  "availableCategorySlugs": ["accommodation"],
  "followUpUsed": false,
  "followUpAnswer": null
}
```

**Response (FOLLOW_UP mode):**
```json
{
  "mode": "FOLLOW_UP",
  "followUp": {
    "question": "Which dates do you need?",
    "field": "dates",
    "options": ["Today", "Tomorrow", "This weekend"]
  },
  "filters": { /* partial filters */ },
  "chips": [ /* UI chips */ ],
  "results": []
}
```

**Response (RESULT mode):**
```json
{
  "mode": "RESULT",
  "filters": {
    "q": "villa",
    "categorySlug": "accommodation",
    "maxPrice": 250,
    "sortBy": "distance",
    "radiusKm": 10
  },
  "chips": [ /* UI chips */ ],
  "followUp": null,
  "results": [ /* listing objects */ ]
}
```

**Rules:**
- Max 1 follow-up per search session
- If `followUpUsed=true`, always returns RESULT mode
- All responses have stable keys: `mode`, `filters`, `chips`, `followUp`, `results`

### Generate Listing Content
```
POST /api/ai/generate
```
**Auth Required:** 🔒 Host Only  
**Request Body:**
```json
{
  "category": "sports-facilities",
  "keyFeatures": ["tennis court", "night lighting", "equipment rental"],
  "location": "Kelibia"
}
```

**Response:**
```json
{
  "title": "Professional Tennis Court with Night Lighting",
  "description": "Experience top-tier tennis...",
  "highlights": [
    "Professional-grade surface",
    "Night lighting available",
    "Equipment rental included"
  ]
}
```

### Enhance Description
```
POST /api/ai/enhance-description
```
**Auth Required:** 🔒 Host Only

### Generate Titles
```
POST /api/ai/generate-titles
```
**Auth Required:** 🔒 Host Only

---

## Admin

**Base Path:** `/api/admin`

### Get Dashboard Stats
```
GET /api/admin/stats
```
**Auth Required:** 🔒 Admin Only

### List All Users
```
GET /api/admin/users
```
**Auth Required:** 🔒 Admin Only

### Suspend User
```
POST /api/admin/users/:id/suspend
```
**Auth Required:** 🔒 Admin Only

### Approve Listing
```
POST /api/admin/listings/:id/approve
```
**Auth Required:** 🔒 Admin Only

---

## Common Patterns

### Response Wrapper
Most endpoints return responses wrapped in:
```json
{
  "success": true,
  "data": { /* actual data */ },
  "timestamp": "2026-02-16T20:27:06.496Z"
}
```

### Error Response
```json
{
  "statusCode": 400,
  "message": "Validation failed",
  "error": "Bad Request",
  "timestamp": "2026-02-16T20:27:06.496Z"
}
```

### Pagination
For paginated endpoints:
```
GET /api/listings?page=1&limit=20
```

**Response:**
```json
{
  "data": [ /* items */ ],
  "meta": {
    "total": 150,
    "page": 1,
    "limit": 20,
    "totalPages": 8
  }
}
```

### Authentication
Protected endpoints require JWT Bearer token:
```
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

### File Uploads
Use `multipart/form-data` with appropriate field names.

**Supported formats:**
- Images: `.jpg`, `.jpeg`, `.png`, `.webp`
- Max size: 5MB per file
- Max files: 10 per request (listings)

### Validation Rules

**Email:**
- Valid email format
- Unique in system

**Password:**
- Min 8 characters
- At least 1 uppercase, 1 lowercase, 1 number

**Phone:**
- International format recommended: `+21612345678`

**Coordinates:**
- Latitude: -90 to 90
- Longitude: -180 to 180

**Prices:**
- Min: 0
- Currency: TND (Tunisian Dinar)

**Dates:**
- Format: `YYYY-MM-DD`
- Time slots: `HH:mm` (24-hour format)

---

## Status Codes

- `200 OK` - Success
- `201 Created` - Resource created
- `204 No Content` - Success, no response body
- `400 Bad Request` - Validation error
- `401 Unauthorized` - Missing/invalid token
- `403 Forbidden` - Insufficient permissions
- `404 Not Found` - Resource not found
- `409 Conflict` - Duplicate resource
- `500 Internal Server Error` - Server error

---

## Rate Limiting

- **Public endpoints:** 100 requests/15min per IP
- **Authenticated endpoints:** 1000 requests/15min per user
- **AI endpoints:** 20 requests/15min per user

---

## Webhooks

### Payment Success
```
POST <your-webhook-url>
```
**Payload:**
```json
{
  "event": "payment.success",
  "bookingId": "uuid",
  "amount": 300,
  "timestamp": "2026-02-16T20:27:06.496Z"
}
```

---

## Testing

**Swagger UI:** `http://localhost:3000/api/docs`  
**Test Credentials:**
- Email: `user1@test.com`
- Password: `password123`

**Test Location (Kelibia, Tunisia):**
- Latitude: `36.8578`
- Longitude: `11.092`

---

## Changelog

### v1.0 (2026-02-16)
- Initial API contract
- All core endpoints documented
- AI search with follow-up support
- Location-aware categories
- Complete authentication flow
