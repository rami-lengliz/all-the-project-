# Ledger v1 — Financial Audit Trail

The Wallet Ledger is an **append-only** record of every financial event on the platform. It makes money flows auditable and idempotent, so no funds can be "lost" in transit between services.

---

## Rules

| Rule | Detail |
|---|---|
| **Append-only** | Entries are never deleted or updated (except `status`) |
| **Idempotent** | Calling `postCapture` twice for the same PI+Booking creates at most 3 entries |
| **Atomic** | Payment capture + ledger posting happens inside one Prisma `$transaction` |
| **Reversible** | Refund → original entries set to `REVERSED`, new `REFUND` entries created |
| **Currency** | `TND` default, stored on each row |

---

## Entry Types

| Type | Direction | Amount | When |
|---|---|---|---|
| `RENT_PAID` | CREDIT | Full booking total | On capture |
| `COMMISSION` | DEBIT | `total × commissionRate` | On capture |
| `HOST_PAYOUT_DUE` | CREDIT | `total × (1 − commissionRate)` | On capture |
| `REFUND` | Opposite of original | Same amount | On refund (per reversed entry) |
| `ADJUSTMENT` | Either | Custom | Manual admin ops |

---

## Example Math (commission = 10%)

```
Booking total:  300.00 TND
Commission:      30.00 TND (10%)
Host payout:    270.00 TND (90%)

Capture creates 3 entries:
  RENT_PAID    CREDIT  300.00
  COMMISSION   DEBIT    30.00
  HOST_PAYOUT_DUE CREDIT 270.00

Refund creates 3 more entries (originals REVERSED):
  REFUND       DEBIT   300.00  ← negates RENT_PAID
  REFUND       CREDIT   30.00  ← negates COMMISSION
  REFUND       DEBIT   270.00  ← negates HOST_PAYOUT_DUE
```

After a full refund the platform's net for that booking is **zero**.

---

## Status Values

| Status | Meaning |
|---|---|
| `POSTED` | Active, counts toward balances |
| `REVERSED` | Cancelled by a refund — excluded from balance queries |

---

## Admin Endpoints

All endpoints require `ADMIN` role.

### Summary

```bash
GET /api/admin/ledger/summary?from=2026-01-01&to=2026-12-31
Authorization: Bearer <admin_token>
```

Response:
```json
{
  "success": true,
  "data": {
    "gross": "9000.00",
    "commission": "900.00",
    "hostNet": "8100.00",
    "refunds": "300.00",
    "refundCount": 3,
    "currency": "TND",
    "entryCount": 9
  }
}
```

### Host Balance

```bash
GET /api/admin/hosts/<hostId>/balance
Authorization: Bearer <admin_token>
```

Response:
```json
{
  "success": true,
  "data": {
    "balance": "270.00",
    "currency": "TND",
    "lastEntries": [...]
  }
}
```

Balance = sum of all `HOST_PAYOUT_DUE CREDIT` minus `HOST_PAYOUT_DUE DEBIT` entries with `status = POSTED`.  
After a refund the reversed originals are `REVERSED` (excluded), so balance correctly drops.

### Booking Ledger

```bash
GET /api/admin/bookings/<bookingId>/ledger
Authorization: Bearer <admin_token>
```

Returns all entries for that booking ordered by `createdAt ASC`.

---

## Idempotency

`postCapture(paymentIntentId, bookingId, ...)` looks for an existing `RENT_PAID` entry with `status=POSTED` for the same PI+Booking pair. If found, it returns the existing entries and does nothing.

`postRefund(paymentIntentId, bookingId)` checks if all capture entries are already `REVERSED`. If so, it returns immediately.

---

## Reversal Strategy

On refund, for each capture entry (RENT_PAID, COMMISSION, HOST_PAYOUT_DUE):
1. A new `REFUND` entry is created with the **opposite `direction`** and the **same `amount`**.
2. The original entry's `status` is set to `REVERSED`.
3. The original entry's `reversedEntryId` is set to the new reversal entry's `id`.

This creates a clean double-entry-style trail where every reversal is linked to its original.
