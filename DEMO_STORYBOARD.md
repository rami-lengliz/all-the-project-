# RentAI — Demo Storyboard (1 Page Script)

This is your exact flow for presenting the project seamlessly in under 5 minutes.

---

## 💻 0. Setup (Before presenting)

Run this quickly to ensure a fresh, perfect state:
```bash
docker-compose up -d postgres
npx prisma migrate reset --force
npm run seed
npm run start:dev
```
*→ Keep the console open — the seed script prints exactly which IDs and dates you need for the conflict demo.*

---

## 📍 1. Location-Aware Home Page (Categories + Counts)

**Goal:** Show that categories change dynamically based on the user's location and radius via PostGIS.

1. Open **Swagger** (`http://localhost:3000/api/docs`).
2. Go to `GET /api/categories/nearby`.
3. Enter **Kelibia** coordinates:
   - `lat`: 36.8578
   - `lng`: 11.092
   - `radiusKm`: 50
   - **Click Execute.**
   - *→ Show the response: Categories have high counts (e.g., 20+ listings).*
4. Change to **Tunis** coordinates:
   - `lat`: 36.8065
   - `lng`: 10.1815
   - **Click Execute.**
   - *→ Show the response: The counts drastically change (e.g., exactly 15 listings) proving the spatial query works instantly.*

---

## 🤖 2. The "AI Search" Magic

**Goal:** Show that RentAI understands messy human language and converts it into pure, executable filters and chips.

### Part A: Direct Result
1. Go to `POST /api/ai/search`.
2. Enter Request Body:
   ```json
   {
     "query": "I need a villa with a pool in Kelibia under 250",
     "lat": 36.8578,
     "lng": 11.092,
     "radiusKm": 50,
     "followUpUsed": true
   }
   ```
   - *→ Highlight the `mode: "RESULT"`. Show how it perfectly extracted `categorySlug: "accommodation"`, `maxPrice: 250`, and created clean UI `chips`.*

### Part B: The Conversational Follow-Up
1. Enter a vague query:
   ```json
   {
     "query": "I want to rent a tennis court",
     "lat": 36.8578,
     "lng": 11.092,
     "followUpUsed": false
   }
   ```
   - *→ Highlight `mode: "FOLLOW_UP"`. The AI stops and asks: "When would you like to book the court?"*
2. Simulate the user answering:
   ```json
   {
     "query": "I want to rent a tennis court",
     "lat": 36.8578,
     "lng": 11.092,
     "followUpUsed": true,
     "followUpAnswer": "Tomorrow afternoon"
   }
   ```
   - *→ Highlight `mode: "RESULT"`. The AI merged the original intent with the follow-up answer to define the exact date.*

---

## 🛡️ 3. The "No Double Booking" Guarantee

**Goal:** Show that the system physically prevents double bookings at the database level.

### The Problem (`SLOT` booking conflict)
1. In Swagger, go to `POST /api/auth/login` and login as the demo renter:
   - `email`: `user7@example.com` | `password`: `password123`
   - *Copy the `accessToken` and put it in the Swagger Authorize button (top right).*
2. Go to `POST /api/bookings`.
3. Try to book the slot that is *already confirmed* by someone else (Get ID/Date from your seed console output):
   ```json
   {
     "listingId": "PUT_SLOT_ID_HERE",
     "startDate": "PUT_DATE_HERE",
     "endDate": "PUT_DATE_HERE",
     "startTime": "10:00",
     "endTime": "12:00"
   }
   ```
4. **Click Execute.**
5. *→ BOOM. `409 Conflict`. Show the error message: "This time slot is not available."* You have prevented a scheduling nightmare.

---
**🎉 End of Demo!**
