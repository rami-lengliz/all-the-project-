# Week — Availability & Booking Conflict Proof

This document proves that the system natively prevents double-bookings for both `DAILY` and `SLOT` listings by utilizing atomic PostgreSQL Transactions and Row-Level Locks.

## 1. Overview & Locked Rules

- **Only** `confirmed`, `paid`, and `completed` bookings ever block availability.
- A `pending`, `cancelled` or `rejected` booking **never** blocks a slot/date.
- **Concurrency & Races:** To prevent double-confirmations when no conflicting rows exist yet, the `confirm` handler serializes concurrent requests:
  1. It locks the booking row (`FOR UPDATE`).
  2. It locks the listing row (`FOR UPDATE`) to act as a listing-level mutex.
  3. It runs the availability check and updates the status within the same isolated `$transaction`.
- **DAILY date rules:** Date overlap boundaries are strictly `startDate` inclusive and `endDate` exclusive. Meaning: overlapping exists only if `NOT (existingEnd <= newStart OR existingStart >= newEnd)`.
- **SLOT time rules:** Instead of checking dates alone, the system utilizes the native Postgres `OVERLAPS` operator (`("startTime"::time, "endTime"::time) OVERLAPS (...)`) locking overlapping timespans.

## 2. Key Code Pointers

- **Source of Truth for Blocking Statuses:**
   File: `src/common/constants/booking-status.constants.ts`
   ```typescript
   export const BLOCKING_BOOKING_STATUSES = ['confirmed', 'paid', 'completed'] as const;
   ```

- **Transaction-safe Availability Check for SLOT bookings:**
   Method: `AvailabilityService.checkSlotAvailabilityWithLock`
   File: `src/common/utils/availability.service.ts`
   ```typescript
   // Atomic check using standard listing and status locks
   const statusClause = Prisma.join([...BLOCKING_BOOKING_STATUSES]);

   const conflicts = await tx.$queryRaw<Array<{ id: string }>>`
     SELECT id FROM bookings
     WHERE "listingId"::text = ${listingId}
       AND "startDate" = ${dateStr}::date
       AND status::text IN (${statusClause})
       AND ("startTime"::time, "endTime"::time) OVERLAPS (${startTime}::time, ${endTime}::time)
     FOR UPDATE
   `;
   ```

- **The Accept / Confirm Handler:**
  Method: `BookingsService.confirm`
  File: `src/modules/bookings/bookings.service.ts`
  The handler opens a transaction block (`await this.prisma.$transaction(async (tx) => { ... })`), verifies the business logic, and executes the locking checks *before* saving the new `confirmed` status.

## 3. E2E Test Coverage

### DAILY Conflicts (`test/booking-conflict.e2e-spec.ts`)
1. Proves Renter A can create a pending booking.
2. Proves Renter B can create an overlapping pending booking (Pending does not block).
3. Proves Host successfully confirms Renter A's booking.
4. Proves a NEW overlapping POST from Renter B is forcefully rejected with `409 Conflict`.
5. Proves Host attempting to confirm Renter B's previously pending overlapping booking is forcefully rejected with `409 Conflict`.

### SLOT Conflicts (`test/slot-booking-conflict.e2e-spec.ts`)
1. Generates `GET /available-slots`, noting 10:00 available.
2. Books 10:00–12:00, host confirms.
3. Proves `GET /available-slots` hides 10:00.
4. Proves new POST to 10:00–12:00 fails (`409 Conflict`).
5. **Step 9 — Concurrency Proof:** The E2E specifically fires two completely overlapping `PATCH /api/bookings/:id/confirm` requests to the exact same millisecond. 
   - Outcome: `[200, 409]`. Only one request successfully commits. The other safely bounces.

## 4. Sample Outputs

**Attempting to accept a conflicting SLOT booking concurrently:**
```json
// HTTP 409 Conflict
{
  "message": "Cannot confirm: Another booking overlaps with this slot",
  "error": "Conflict",
  "statusCode": 409
}
```

## 5. Verification Runbook (60 Seconds)

To verify the test suite on your machine:
```bash
# 1. Start the DB instance
> docker compose up -d postgres

# 2. Run the DAILY availability tests
> npm run test:e2e test/booking-conflict.e2e-spec.ts

# 3. Run the SLOT concurrency and availability tests
> npm run test:e2e test/slot-booking-conflict.e2e-spec.ts
```

All suites will pass cleanly without leaking connections or leaving artifacts in the DB.
