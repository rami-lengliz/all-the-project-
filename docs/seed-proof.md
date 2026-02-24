# Seed Proof — Guaranteed Seed Data

After running `npm run seed`, the database contains the following guaranteed data.

## Test Accounts

| Email | Password | Roles | isHost |
|-------|----------|-------|--------|
| `user1@example.com` | `password123` | user, host, ADMIN | ✅ |
| `user2@example.com` | `password123` | user | ✅ (host) |
| `user3@example.com` | `password123` | user | ✅ (host) |
| `user4@example.com` | `password123` | user | ✅ (host) |
| `user5@example.com` | `password123` | user | ✅ (host) |
| `user6@example.com` | `password123` | user | ❌ (renter) |
| `user7@example.com` | `password123` | user | ❌ (renter) |
| `user8@example.com` | `password123` | user | ❌ (renter) |
| `user9@example.com` | `password123` | user | ❌ (renter) |
| `user10@example.com` | `password123` | user | ❌ (renter) |

## Listings

| Count | City | Status | Type |
|-------|------|--------|------|
| 20 | Kelibia | ACTIVE | DAILY |
| 15 | Tunis | ACTIVE | DAILY |
| 3 | Kelibia | ACTIVE | SLOT (sports) |
| 2 | Kelibia | ACTIVE | DAILY + SLOT (demo) |
| **1** | **Kelibia** | **PENDING_REVIEW** | **DAILY (user2)** |

**Total**: 41 listings (40 ACTIVE + 1 PENDING_REVIEW)

## Guaranteed Bookings

| Status | Paid | Renter | Has Snapshot |
|--------|------|--------|--------------|
| `pending` | ❌ | user6 | ✅ |
| `confirmed` | ❌ | user7 | ✅ |
| `paid` | ✅ | user8 | ✅ |
| `cancelled` | ❌ | user9 | ✅ |

Plus 6 additional general bookings and 2 demo conflict scenarios.

## Reviews

- 1 guaranteed review (rating: 5) linked to the `paid` booking
- Author: the booking's renter → target: the booking's host

## Categories

7 categories: Accommodation, Mobility, Water & Beach, Sports Facilities, Sports Equipment, Tools, Other

## Quick Login Commands

```bash
# Admin login
curl -s -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"emailOrPhone":"user1@example.com","password":"password123"}' | jq '.data.accessToken'

# Renter login
curl -s -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"emailOrPhone":"user6@example.com","password":"password123"}' | jq '.data.accessToken'
```
