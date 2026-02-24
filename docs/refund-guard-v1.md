# Refund Guardrail v1

## Design Decision: Block, Don't Allow Negative Balance

The refund guardrail **blocks** the refund when the host's payout for the same booking has already been marked `PAID`.

**Why block instead of allow (negative balance)?**  
Allowing a refund after payout would mean:
1. Renter receives money back
2. Host has already received payout
3. Platform is now short `payout.amount` — a **silent platform loss**

The hard requirement says "Refund must not silently create platform loss." Blocking with an explicit error code forces the admin to make a **conscious decision** to reconcile — they can either:
- Claw back the host payout separately, then reissue the refund
- Absorb the loss manually and close the case

---

## Refund Lifecycle

```
authorized ──capture──► captured ──refund──► refunded
                                    │
                          (guardrail here)
                                    │
                            HOST_PAYOUT exists?
                             ├─ YES → 400 REFUND_AFTER_PAYOUT_NOT_ALLOWED
                             └─ NO  → proceed normally
```

### Safe Path (no payout yet)
```
capture() → HOST_PAYOUT_DUE (CREDIT) +balance
refund()  → HOST_PAYOUT_DUE (REVERSED) − balance
            REFUND entries (POSTED)
```

### Blocked Path (payout already paid)
```
capture()         → HOST_PAYOUT_DUE (CREDIT) +balance
POST /payouts     → Payout PENDING + PayoutItems
PATCH /mark-paid  → HOST_PAYOUT (DEBIT) − balance
POST /refund      → 400 REFUND_AFTER_PAYOUT_NOT_ALLOWED ← guard fires here
```

---

## Error Code

| Code | HTTP | When |
|---|---|---|
| `REFUND_AFTER_PAYOUT_NOT_ALLOWED` | 400 | A `HOST_PAYOUT` ledger entry with `status=POSTED` already exists for this booking |

Error response body:
```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "{\"code\":\"REFUND_AFTER_PAYOUT_NOT_ALLOWED\",\"message\":\"Cannot refund: the host payout...\",\"payoutLedgerEntryId\":\"...\",\"bookingId\":\"...\"}"
  }
}
```

---

## Admin Reconciliation Flow

If a refund after payout is needed, the admin must:

1. **Cancel or claw-back the payout** (outside this system, e.g. contact bank)
2. **Optionally** create an `ADJUSTMENT` ledger entry to negate the `HOST_PAYOUT` DEBIT
3. Then retry the refund — it will succeed once no `HOST_PAYOUT POSTED` entry exists for that booking

> This is intentionally left as a manual process to force explicit audit oversight.

---

## Example curl

```bash
# Attempt to refund a booking that was already paid out
curl -X POST https://api.example.com/api/payments/booking/{bookingId}/refund \
  -H "Authorization: Bearer {hostToken}"

# → 400 Bad Request
# {
#   "error": {
#     "code": "VALIDATION_ERROR",
#     "message": "{\"code\":\"REFUND_AFTER_PAYOUT_NOT_ALLOWED\",...}"
#   }
# }
```

---

## What Is NOT Blocked

- Refund **before** payout is marked PAID — works as before
- Refund on a booking with only a `PENDING` payout — **also blocked**  
  (the `HOST_PAYOUT` ledger entry is only created on `mark-paid`, so a `PENDING` payout alone won't block the refund)

> If you want to also block on `PENDING` payout, query `payout_items` instead. Current design was chosen to be minimally invasive.
