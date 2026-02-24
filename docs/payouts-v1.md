# Payouts v1 — Documentation

Payouts represent real money transfers from the platform to hosts. They are fully ledger-backed and auditable.

---

## Concepts

| Term | Meaning |
|---|---|
| **Host Balance** | Sum of all POSTED `HOST_PAYOUT_DUE` CREDIT entries minus DEBIT entries for a host |
| **Payout** | Admin-initiated transfer of a specific amount to a host |
| **PayoutItem** | Links a `Payout` to a specific `LedgerEntry` (`HOST_PAYOUT_DUE`). UNIQUE — one ledger entry can only be in one payout |
| **HOST_PAYOUT** | Ledger entry created when a payout is marked PAID. Direction=DEBIT. Reduces host balance. |
| **Dispute Freeze** | When a booking's `disputeStatus=OPEN`, its `HOST_PAYOUT_DUE` entries are excluded from payout selection |

---

## Flow

```
capture() → HOST_PAYOUT_DUE CREDIT (+balance)
POST /api/admin/hosts/:id/payouts → Payout(PENDING) + PayoutItems
PATCH /api/admin/payouts/:id/mark-paid → Payout(PAID) + HOST_PAYOUT DEBIT (−balance)
```

---

## Rules

| Rule | Detail |
|---|---|
| **Amount validation** | `amount ≤ available balance` |
| **Eligible entries** | `HOST_PAYOUT_DUE`, `POSTED`, not in any `PayoutItem`, booking not in OPEN dispute |
| **FIFO selection** | Oldest eligible entries picked first |
| **No double-pay** | `PayoutItem.ledgerEntryId` is UNIQUE — a ledger entry can only appear once |
| **Idempotency** | Calling mark-paid twice returns the existing PAID payout unchanged |
| **Atomicity** | mark-paid creates the `HOST_PAYOUT` ledger entry in the same transaction |

---

## Enums

### PayoutStatus
| Value | Description |
|---|---|
| `PENDING` | Created, not yet transferred |
| `PAID` | Transferred to host |
| `CANCELLED` | Cancelled without payment |

### DisputeStatus (on Booking)
| Value | Description |
|---|---|
| `NONE` | No dispute (default) |
| `OPEN` | Active dispute — entries frozen |
| `RESOLVED` | Dispute resolved — entries unfrozen |

---

## API Reference

All endpoints require `Authorization: Bearer <admin_token>`.

### List Payouts
```bash
GET /api/admin/payouts?status=PENDING&page=1&limit=50
```

### Get Host Balance
```bash
GET /api/admin/hosts/{hostId}/balance
```
Response:
```json
{ "success": true, "data": { "balance": "450.00", "currency": "TND", "lastEntries": [...] } }
```

### Create Payout
```bash
POST /api/admin/hosts/{hostId}/payouts
Content-Type: application/json

{
  "amount": 450.00,
  "method": "bank_transfer",
  "reference": "WIRE-2026-001",
  "notes": "March payout"
}
```
Response:
```json
{
  "success": true,
  "data": {
    "payout": { "id": "...", "status": "PENDING", "amount": "450.00", ... },
    "itemsCount": 1,
    "coveredAmount": "450.00"
  }
}
```

### Mark Payout Paid
```bash
PATCH /api/admin/payouts/{payoutId}/mark-paid
Content-Type: application/json

{
  "method": "bank_transfer",
  "reference": "WIRE-2026-001"
}
```
Response: updated `Payout` with `status: "PAID"` and `paidAt`.

### Open Dispute on Booking
```bash
PATCH /api/admin/bookings/{bookingId}/dispute/open
```

### Resolve Dispute on Booking
```bash
PATCH /api/admin/bookings/{bookingId}/dispute/resolve
```

---

## Double-Pay Prevention

The `payout_items.ledgerEntryId` column has a `UNIQUE` index. If you attempt to create two payouts that include the same `HOST_PAYOUT_DUE` ledger entry, the second `createMany` call will fail at the database level.

Additionally, the `createPayout` query filters out entries that already have a `PayoutItem`:

```sql
WHERE payoutItem IS NULL
```

---

## Balance Accounting

```
host_balance = 
  SUM(HOST_PAYOUT_DUE CREDIT POSTED)
  - SUM(HOST_PAYOUT_DUE DEBIT POSTED)   -- reversed by refunds
  - SUM(HOST_PAYOUT DEBIT POSTED)        -- paid out via payout
```
