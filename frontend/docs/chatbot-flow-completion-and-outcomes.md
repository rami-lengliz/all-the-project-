# Chatbot Flow Completion & Outcomes

## 1. Problem Being Solved

The previous chatbot UX had no concept of *resolution*. Every state was treated as "still going" — the same suggestion chips kept appearing regardless of whether the user had already completed what they came to do, hit a dead end, or was blocked mid-action.

This made the chatbot feel endless, repetitive, and purposeless.

This layer introduces **explicit flow outcomes** — clear resolution points where the chatbot gives meaningful next-step guidance based on what *actually happened* in the conversation, not just what tool was called last.

---

## 2. Outcome Model Design

### Files

```
features/chatbot/
├── types/
│   └── chatbot-flow-outcomes.types.ts   ← Outcome kinds, state, summary, post-flow actions
├── utils/
│   ├── chatbot-flow-outcomes.ts          ← detectFlowOutcome(), isFlowComplete(), getFlowOutcomeSummary()
│   └── chatbot-flow-completion.ts        ← getPostFlowActions(), getCompletionActions(), getInterruptionRecoveryActions()
└── components/
    ├── ChatbotFlowOutcomeCard.tsx        ← Orchestrator (no logic, pure routing)
    ├── ChatbotFlowCompletionCard.tsx     ← Rendered for complete outcomes (success/empty)
    └── ChatbotFlowInterruptionCard.tsx   ← Rendered for interrupted outcomes (blocked/cooldown/expired)
```

### Key types

| Type | Purpose |
|------|---------|
| `ChatbotFlowOutcomeKind` | 9 named outcome states (ACTIVE, COMPLETED_SUCCESS, COMPLETED_EMPTY, INTERRUPTED_BLOCKED, INTERRUPTED_COOLDOWN, PENDING_CONFIRMATION, EXPIRED_CONFIRMATION, RECOVERY_READY, NO_MEANINGFUL_OUTCOME) |
| `ChatbotFlowCompletionStatus` | Coarse 5-way routing key used by the panel: `complete`, `interrupted`, `pending`, `active`, `none` |
| `ChatbotFlowOutcomeState` | Full outcome state including headline, subtext, showOutcomeCard flag, flow context |
| `ChatbotFlowOutcomeSummary` | Lightweight extract for components that only need display text |
| `ChatbotPostFlowAction` | Primary + fallback intent sets produced after an outcome |
| `NULL_OUTCOME_STATE` | Safe default for inactive/malformed flows |

> **Important:** All outcome types are explicitly marked as frontend UX constructs. `COMPLETED_SUCCESS` means the chatbot reached a logical UX resolution point — it does NOT mean the backend operation is finalized or authoritative.

---

## 3. Completion, Interruption, and Pending Rules

### Detection priority (matches flow-state priority)

1. **No active flow** → `NO_MEANINGFUL_OUTCOME`
2. **Live pending confirmation** → `PENDING_CONFIRMATION`
3. **Expired confirmation** → `EXPIRED_CONFIRMATION`
4. **Blocked / cooldown** → `INTERRUPTED_BLOCKED` or `INTERRUPTED_COOLDOWN`
5. **Branch-level classification** per flow

### LISTING_DISCOVERY_FLOW

| Branch | Outcome | Rationale |
|--------|---------|-----------|
| `DISCOVERY_SEARCH_HAS_RESULTS` | `ACTIVE` | User needs to act on results; not a stopping point |
| `DISCOVERY_SEARCH_EMPTY` | `COMPLETED_EMPTY` | Meaningful checkpoint — search finished with no results |
| `DISCOVERY_DETAILS_WITH_ID` | `ACTIVE` | Details viewed → user may still book or contact host |
| `DISCOVERY_DETAILS_NO_ID` | `ACTIVE` | Same rationale |
| `DISCOVERY_BLOCKED` | `INTERRUPTED_BLOCKED` | Via top-level blocked detection |

### BOOKING_HELP_FLOW

| Branch | Outcome | Rationale |
|--------|---------|-----------|
| `BOOKING_LIST_HAS_ITEMS` | `ACTIVE` | User is browsing, not done |
| `BOOKING_DETAILS_ACTIVE` | `ACTIVE` | Details reviewed → more actions available |
| `BOOKING_CONFIRMATION_LIVE` | `PENDING_CONFIRMATION` | Must confirm or dismiss before proceeding |
| `BOOKING_CONFIRMATION_EXPIRED` | `EXPIRED_CONFIRMATION` | Window closed; action cannot be replayed |
| `BOOKING_MUTATION_DONE` | `COMPLETED_SUCCESS` | Strongest resolution signal in booking flow |
| `BOOKING_BLOCKED` | `INTERRUPTED_BLOCKED` or `INTERRUPTED_COOLDOWN` | Via top-level blocked detection |

### HOST_REQUESTS_FLOW

| Branch | Outcome | Rationale |
|--------|---------|-----------|
| `HOST_REQUESTS_HAS_ITEMS` | `ACTIVE` | Items to review; not done |
| `HOST_LISTINGS_ACTIVE` | `ACTIVE` | Listing review in progress |
| `HOST_REQUESTS_EMPTY` | `COMPLETED_EMPTY` | No requests exists — logical stop |
| `HOST_BLOCKED` | `INTERRUPTED_BLOCKED` | Via top-level blocked detection |

### Key rules

- **`ACTIVE` states never show an outcome card** — the flow card handles them
- **`RECOVERY_READY` states never show an outcome card** — the recovery card handles them
- **`PENDING_CONFIRMATION` has `showOutcomeCard=false`** — the existing `ChatbotConfirmationCard` / `ResumeCard` already owns that UX. Setting it to `true` would cause the panel to render two simultaneous confirmation surfaces, a silent duplicate-card bug.
- **`EXPIRED_CONFIRMATION` has `completionStatus='interrupted'`** — it is semantically an interruption (the user must recover), not a pending state (which implies waiting for user action). The live confirmation is pending; the expired one is a resolved-but-failed event.
- Terminal states (`COMPLETED_SUCCESS`, `COMPLETED_EMPTY`) hoist an outcome card and suppress the flow card

---

## 4. Post-Flow Action Strategy

Post-flow actions differ fundamentally from in-flow next-step chips. They represent "what now that you're done?" rather than "what's the next step in the current task?"

### Action sets per outcome kind

| Outcome | Primary chips | Fallback chips |
|---------|--------------|----------------|
| `COMPLETED_SUCCESS` | View affected booking (if ID present) or show all bookings; search listings; help center | — |
| `COMPLETED_EMPTY` (listing) | Widen search (priority 1); help center; show bookings | — |
| `COMPLETED_EMPTY` (host) | View host listings (priority 1); help center | — |
| `INTERRUPTED_BLOCKED` | `getRecoverySuggestions(blockedStatus)` (read-only, real status forwarded) | Show bookings |
| `INTERRUPTED_COOLDOWN` | Same safe read-only set (with actual `cooldown_active` status) | Show bookings |
| `PENDING_CONFIRMATION` | *(none — confirmation card owns confirm button)* | Show bookings; safe search |
| `EXPIRED_CONFIRMATION` | View affected booking (priority 1 if ID known); show all bookings | Safe search |
| `ACTIVE` | *(none — uses in-flow chips from `getFlowNextIntents`)* | — |
| `NO_MEANINGFUL_OUTCOME` | *(none)* | — |

### Invariants enforced

- **No `CANCEL_BOOKING` in any recovery or post-interruption set**
- **No in-flow next-step chips reused in post-flow completion sets** — they are separate functions  
- **Expired confirmation never replays the original action** — it only offers regeneration paths
- **`blockedStatus` is always forwarded** — `getRecoverySuggestions` is called with the real status, not hardcoded `'rate_limited'`

---

## 5. UI Integration

### Card rendering decision tree (chat view)

```
ChatbotPanel — chat view
├── ChatbotResumeCard           ← first-open only; high-priority resume (pending confirmation, listing)
│   HIDDEN once user sends first message
│
├── (if NOT showResumeCard)
│   ├── ChatbotFlowCard         ← ACTIVE flow states only
│   │     completionStatus === 'active'
│   │
│   ├── ChatbotFlowRecoveryCard ← RECOVERY_READY only (empty search within active flow)
│   │     outcome.kind === 'RECOVERY_READY'
│   │
│   └── ChatbotFlowOutcomeCard  ← all non-active, non-live-confirmation outcomes
│         outcome.showOutcomeCard === true
│         ├── ChatbotFlowCompletionCard  ← complete states (success/empty)
│         └── ChatbotFlowInterruptionCard ← interrupted states (blocked/cooldown/expired)
│
├── ChatbotMessageList
├── [Entry suggestions]         ← only when messages.length === 0
└── ChatbotComposer
```

### Mutual exclusion guarantees

- **FlowCard** renders only when `completionStatus === 'active'` — never during interruption or completion
- **RecoveryCard** renders only when `outcome.kind === 'RECOVERY_READY'` — which is currently emitted for states not yet classified as a terminal outcome
- **OutcomeCard** renders only when `showOutcomeCard === true`, which excludes `ACTIVE`, `RECOVERY_READY`, `NO_MEANINGFUL_OUTCOME`, and `PENDING_CONFIRMATION`
- **ResumeCard** hides itself after the user sends their first message in a session; thereafter outcome/flow cards take over

---

## 6. Relationship with Flow, Continuity, and Resume Layers

| Signal | ResumeCard | FlowCard | RecoveryCard | OutcomeCard |
|--------|------------|----------|--------------|-------------|
| Active flow, results present | ❌¹ | ✅ | ❌ | ❌ |
| Active flow, empty search | ❌¹ | ❌ | ❌ | ✅ (COMPLETED_EMPTY) |
| Mutation succeeded | ❌¹ | ❌ | ❌ | ✅ (COMPLETED_SUCCESS) |
| Live pending confirmation | ✅ (first open) | ❌ | ❌ | ❌² |
| Expired confirmation | ✅ (first open) | ❌ | ❌ | ✅ (EXPIRED_CONFIRMATION) |
| Blocked/cooldown | ❌¹ | ❌ | ❌ | ✅ (INTERRUPTED_*) |
| No active flow | ❌ | ❌ | ❌ | ❌ |

¹ After first message sent; ResumeCard is dismissed.  
² `PENDING_CONFIRMATION` has `showOutcomeCard=false` — not `true`. The orchestrator would skip it anyway, but having it false at the state level avoids surprises if the orchestrator guard is ever changed.

**None of these layers modify each other.** They all read from the same message history independently. The panel coordinates which to show based on pre-computed state.

---

## 7. Testing Summary (`ChatbotFlowOutcomes.test.ts`)

8 describe groups, 50+ assertions:

| Group | Key assertions |
|-------|---------------|
| LISTING_DISCOVERY_FLOW | Search with results → ACTIVE; empty → COMPLETED_EMPTY; details → ACTIVE; blocked → INTERRUPTED_BLOCKED |
| BOOKING_HELP_FLOW | Mutation done → COMPLETED_SUCCESS; live confirmation → PENDING_CONFIRMATION; expired → EXPIRED_CONFIRMATION; blocked → INTERRUPTED; pending overrides booking list |
| HOST_REQUESTS_FLOW | Requests with items → ACTIVE; empty → COMPLETED_EMPTY; blocked → INTERRUPTED_BLOCKED |
| Cross-cutting | No flow → NULL; user messages → NO_MEANINGFUL_OUTCOME; null metadata safe; RECOVERY_READY hides card; no "undefined" in text |
| isFlowComplete | Only COMPLETED_SUCCESS and COMPLETED_EMPTY return true |
| getFlowOutcomeSummary | Mirrors outcome state |
| Post-flow actions | ACTIVE → empty; COMPLETED_SUCCESS → booking chips; empty → search chips; interrupted → read-only only; expired → no replay; pending → no primary chips; all text clean |
| Continuity coexistence | Both services derived from same messages; agree on PENDING, BLOCKED states; serve different UX surfaces for COMPLETED_EMPTY |

---

## 8. Future Extension Notes

- **New outcome kinds**: add to `ChatbotFlowOutcomeKind` union, add a case in `completionStatusFor()` and `shouldShowOutcomeCard()`, add branch classifier in the relevant flow function
- **New flows**: add a classifier function following the `classifyXxxOutcome` pattern and a case in `detectFlowOutcome`'s switch
- **Outcome persistence**: if backend adds session-level flow state, pass it through `ChatbotFlowOutcomeState.context` — current types already have the right shape
- **Outcome analytics**: `ChatbotFlowOutcomeState` is a clean serializable record — surface it to an analytics hook in `ChatbotPanel` without changing component structure
- **I18n**: all headline/subtext strings are defined in `chatbot-flow-outcomes.ts` as object literals — wrap with `t()` when ready
- **Confident success variant**: if backend adds a `transactionId` or `bookingId` in mutation success responses, use that to produce an even richer `COMPLETED_SUCCESS` state (e.g. "Your booking #123 was cancelled") — the context already has `detectedBookingId` plumbed through

---

## 9. Audit Findings & Fixes (2026-04-11)

Six bugs found and fixed after initial implementation.

### Bug 1 — `PENDING_CONFIRMATION` had `showOutcomeCard=true`
**Problem:** Returning `showOutcomeCard=true` for a live pending confirmation meant the panel condition `outcome.showOutcomeCard` would be `true`. While `ChatbotFlowOutcomeCard` has an explicit skip for `PENDING_CONFIRMATION`, relying on two layers of defence for one invariant is fragile — if the orchestrator guard is ever relaxed, both the `ResumeCard` and the `OutcomeCard` would render simultaneously for the same pending action.

**Fix:** `shouldShowOutcomeCard` now returns `false` for `PENDING_CONFIRMATION`. Documented with an explanatory comment. The state still carries `completionStatus: 'pending'` which is used by the panel to hide the `FlowCard` — that routing is unaffected.

### Bug 2 — `EXPIRED_CONFIRMATION` had `completionStatus='pending'`
**Problem:** Expired confirmation was grouped with live pending confirmation under `completionStatus='pending'`. Semantically, a live confirmation is pending (the user must act); an expired confirmation is an interruption (the action is gone, the user must recover). Routing both to `'pending'` made the `FlowCard` correctly hidden but the UI description internally inconsistent.

**Fix:** `EXPIRED_CONFIRMATION` now maps to `completionStatus='interrupted'` in `completionStatusFor()`. It is handled by `ChatbotFlowInterruptionCard` (which already has an `EXPIRED_CONFIRMATION` style entry in `KIND_STYLE`). The rendering was already correct; only the status value was wrong.

### Bug 3 — Live confirmation guard only checked `step`, not `branch`
**Problem:** The top-level pending confirmation check was `step === 'BOOKING_CONFIRMATION_PENDING'`. If a future flow-state change causes `step` to differ from `branch`, the priority check could fall through to the branch classifier and return `PENDING_CONFIRMATION` with `showOutcomeCard` incorrectly calculated.

**Fix:** The guard now checks `step === 'BOOKING_CONFIRMATION_PENDING' || branch === 'BOOKING_CONFIRMATION_LIVE'`. Both independently identify a live confirmation and both produce `showOutcomeCard=false`.

### Bug 4 — `INTERRUPTED_BLOCKED` fallback used `RECOVERY_BOOKINGS_SAFE` (unverified intent key)
**Problem:** `interruptionRecoveryActions` called `resolveIntents([{ key: 'RECOVERY_BOOKINGS_SAFE', ... }])`. This key was inferred rather than verified against the intent registry. A missing key silently produces an empty/broken chip.

**Fix:** Changed to `SHOW_MY_BOOKINGS` — a confirmed, tested intent key already used throughout the chip system.

### Bug 5 — `INTERRUPTED_COOLDOWN` fallback duplicated `HELP_CENTER_SEARCH` from primary set
**Problem:** `getRecoverySuggestions` typically returns a help-center chip as part of the safe set. The fallback was also `HELP_CENTER_SEARCH`, creating a potential duplicate if primary was empty.

**Fix:** Cooldown fallback changed to `SHOW_MY_BOOKINGS` — meaningfully different from the safe-search primary set.

### Bug 6 — `getInterruptionRecoveryActions` returned `fallbackIntents` instead of `primaryIntents`
**Problem:** The function's docstring said "interruption/recovery chips" but it returned `fallbackIntents` — the secondary fallback set. Any caller using this function to display recovery chips would get only the secondary fallback, missing the primary safe recovery alternatives.

**Fix:** `getInterruptionRecoveryActions` now returns `primaryIntents`. A clarifying comment explains why: for interrupted outcomes, `primaryIntents` IS the recovery set produced by `getRecoverySuggestions`.

### New audit regression tests (8 new describe groups, 30+ new assertions)

| Test group | Key assertion |
|---|---|
| `AUDIT: no-results listing completion chips ordering` | `SEARCH_LISTINGS` is priority-1 chip, not help center |
| `AUDIT: host empty completion chips` | `GET_HOST_LISTINGS` is first, `SEARCH_LISTINGS` absent |
| `AUDIT: expired confirmation with detectedBookingId` | `GET_BOOKING_DETAILS` is first chip when ID available; no mutation replay |
| `AUDIT: INTERRUPTED_COOLDOWN chips` | Cooldown → `INTERRUPTED_COOLDOWN` (not BLOCKED); `getInterruptionRecoveryActions` returns primary set |
| `AUDIT: PENDING_CONFIRMATION no outcome card` | `showOutcomeCard=false`; duplicate surface prevented; safe fallback chips only |
| `AUDIT: outcome never marks ACTIVE as completed` | 6 sub-cases; all return `kind=ACTIVE`, `isFlowComplete=false` |
| `AUDIT: malformed metadata crash safety` | null metadata, missing toolResult, null output, empty array |
| `showOutcomeCard routing` (updated) | `PENDING_CONFIRMATION` → false; `EXPIRED_CONFIRMATION` → interrupted+true |
