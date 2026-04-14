# Chatbot Branching Guided Flows

## 1. Problem Being Solved

The previous chatbot UX suggested next chips reactively — based only on the last tool result. There was no concept of *where the user was* in a multi-step product task, no notion of different paths through the same feature, and no structured recovery when a path hit a dead end.

This layer evolves the chatbot from "what might be useful after this result?" into "guide the user through a real product task with explicit branches, progress, and recovery."

---

## 2. Flow Model Design

### Files

```
features/chatbot/
├── types/
│   └── chatbot-flows.types.ts          ← Flow model (keys, steps, branches, state, context)
├── utils/
│   ├── chatbot-flow-state.ts           ← detectFlowState(), getCurrentFlowBranch(), getFlowProgressSummary()
│   └── chatbot-flow-branches.ts        ← getFlowNextIntents(), getFlowRecoveryIntents(), getFlowNextAction()
└── components/
    ├── ChatbotFlowCard.tsx             ← Live flow banner + branch-aware next chips
    └── ChatbotFlowRecoveryCard.tsx     ← Recovery banner for blocked/dead-end states
```

### Key types

| Type | Purpose |
|------|---------|
| `ChatbotFlowKey` | Named flow: `LISTING_DISCOVERY_FLOW`, `BOOKING_HELP_FLOW`, `HOST_REQUESTS_FLOW`, `NONE` |
| `ChatbotFlowStep` | Discrete step within a flow: `SEARCH_RESULTS_SHOWN`, `LISTING_DETAILS_VIEWED`, `BOOKING_CONFIRMATION_PENDING`, etc. |
| `ChatbotFlowBranch` | Named path decision: `DISCOVERY_SEARCH_HAS_RESULTS`, `BOOKING_CONFIRMATION_LIVE`, etc. |
| `ChatbotFlowState` | Complete detected state: flow + step + branch + summary + banner + context + isRecovery |
| `ChatbotFlowContext` | Safe derived context: detected listing/booking IDs, pending confirmation info, blocked status |
| `ChatbotFlowNextAction` | Resolved next + recovery intents for a flow state |

---

## 3. Flow Detection Strategy (`chatbot-flow-state.ts`)

`detectFlowState(messages, pageContext?)` scans the conversation and returns the highest-confidence flow state.

### Priority order

1. **Pending confirmation** → `BOOKING_HELP_FLOW / BOOKING_CONFIRMATION_PENDING` (highest signal; overrides weaker listing/host branches)
2. **Blocked/cooldown/trust-restricted** → wraps the most recent active flow in a `BLOCKED` step + recovery branch
3. **Last actionable result** → classified into listing, booking, or host flow
4. **No signal** → `NULL_FLOW_STATE` (hasActiveFlow = false)

### Classifier functions (internal)

| Function | Produces |
|----------|---------|
| `classifyListingDiscovery` | `LISTING_DISCOVERY_FLOW` states |
| `classifyBookingHelp` | `BOOKING_HELP_FLOW` states (includes confirmation detection) |
| `classifyHostRequests` | `HOST_REQUESTS_FLOW` states |

Each is crash-safe and returns `null` if no evidence supports that flow.

### Empty vs results detection

`isEmptySearchResult(output)` handles all known backend output shapes:
- `[]` root
- `{ data: [] }` paginated
- `{ listings/results/items: [] }` named

---

## 4. Branch Definitions (`chatbot-flow-branches.ts`)

### LISTING_DISCOVERY_FLOW

| Branch | Trigger | Next chips include |
|--------|---------|-------------------|
| `DISCOVERY_SEARCH_HAS_RESULTS` | search returned ≥ 1 result | GET_LISTING_DETAILS (if id), SEARCH_LISTINGS, SHOW_MY_BOOKINGS |
| `DISCOVERY_SEARCH_EMPTY` | search returned 0 results | SEARCH_LISTINGS (widen), HELP_CENTER_SEARCH |
| `DISCOVERY_DETAILS_WITH_ID` | listing details with known ID | CONTACT_HOST_HELP, SEARCH_LISTINGS_IN_CONTEXT, EXPLAIN_PRICING |
| `DISCOVERY_DETAILS_NO_ID` | listing details, no id | SEARCH_LISTINGS, EXPLAIN_PRICING |
| `DISCOVERY_BLOCKED` | rate limited / cooldown during discovery | safe read-only recovery only |

### BOOKING_HELP_FLOW

| Branch | Trigger | Chips |
|--------|---------|-------|
| `BOOKING_LIST_HAS_ITEMS` | booking list with items | GET_BOOKING_DETAILS (if id), EXPLAIN_CANCELLATION_POLICY |
| `BOOKING_DETAILS_ACTIVE` | booking details viewed | CONTACT_HOST_HELP, REQUEST_BOOKING_HELP, CANCEL_BOOKING |
| `BOOKING_CONFIRMATION_LIVE` | active confirmation pending | **no chips** — ConfirmationCard owns the UX |
| `BOOKING_CONFIRMATION_EXPIRED` | expired confirmation | recovery: GET_BOOKING_DETAILS, SHOW_MY_BOOKINGS |
| `BOOKING_MUTATION_DONE` | mutation succeeded | RECOVERY_SEARCH_SAFE, SHOW_MY_BOOKINGS |
| `BOOKING_BLOCKED` | rate limited during booking | safe recovery only |

### HOST_REQUESTS_FLOW

| Branch | Trigger | Chips |
|--------|---------|-------|
| `HOST_REQUESTS_HAS_ITEMS` | requests returned | GET_HOST_LISTINGS, HELP_CENTER_SEARCH |
| `HOST_REQUESTS_EMPTY` | no pending requests | GET_HOST_LISTINGS, HELP_CENTER_SEARCH |
| `HOST_LISTINGS_ACTIVE` | host listings returned | GET_HOST_BOOKING_REQUESTS, HELP_CENTER_SEARCH |
| `HOST_BLOCKED` | trust restricted | safe recovery only |

---

## 5. Recovery Path Strategy

Recovery states are surfaces where the user is stuck. The system never repeats blocked actions.

### Recovery intent rules

- **Blocked/cooldown** → `RECOVERY_SEARCH_SAFE`, `RECOVERY_HELP_SAFE` (read-only)
- **Trust-restricted** → same safe read-only set
- **Empty search** → `SEARCH_LISTINGS` (widen search), `HELP_CENTER_SEARCH`
- **Expired confirmation** → `GET_BOOKING_DETAILS`, `SHOW_MY_BOOKINGS` (regenerate context)
- **No mutation intent ever appears in a recovery set**

The `getFlowRecoveryIntents` function delegates to `getRecoverySuggestions` for blocked states (reusing the existing utility) and produces branch-specific recovery sets for structural dead ends.

---

## 6. UI Integration

### Component stack (chat view)

```
┌────────────────────────────────────────────────────────────────┐
│  ChatbotResumeCard   ← high-priority: pending confirmation     │
│                        or other high-priority resume state     │
├────────────────────────────────────────────────────────────────┤
│  ChatbotFlowCard     ← live flow: banner + branch-aware chips  │
│                        hidden when ResumeCard is visible       │
├────────────────────────────────────────────────────────────────┤
│  ChatbotFlowRecovery ← blocked/empty/expired: amber card       │
│  Card                   hidden when ResumeCard is visible      │
├────────────────────────────────────────────────────────────────┤
│  ChatbotMessageList  ← full conversation thread                │
├────────────────────────────────────────────────────────────────┤
│  [Entry suggestions] ← only when messages.length === 0        │
├────────────────────────────────────────────────────────────────┤
│  ChatbotComposer                                               │
└────────────────────────────────────────────────────────────────┘
```

### Guard conditions

- `ChatbotFlowCard` → renders only if `hasActiveFlow && !isRecovery && branch !== 'BOOKING_CONFIRMATION_LIVE' && !showResumeCard`
- `ChatbotFlowRecoveryCard` → renders only if `isRecovery || branch === 'DISCOVERY_SEARCH_EMPTY'`
- Both are hidden when `showResumeCard` is true (resume card takes precedence)

### `ChatbotPanel` computes `activeFlowState` via:
```ts
const activeFlowState = useMemo(
  () => detectFlowState(messages, pageContext),
  [messages, pageContext],
);
```

Components receive the pre-computed state and are purely presentational.

---

## 7. Relationship with Continuity / Resume UX

| Signal | Resume Card | Flow Card | Recovery Card |
|--------|------------|-----------|---------------|
| Pending confirmation (live) | ✅ shows | ❌ hidden | ❌ hidden |
| Pending confirmation (expired) | ✅ shows | ❌ hidden | ❌ hidden |
| Active listing flow | ❌ hidden¹ | ✅ shows | ❌ hidden |
| Blocked/cooldown | ❌ hidden¹ | ❌ hidden | ✅ shows |
| Empty search | ❌ hidden¹ | ❌ hidden | ✅ shows |
| No active flow | ❌ | ❌ | ❌ |

¹ Resume card is only shown on first open (before user sends a message). After first send, the flow card takes over.

Both systems derive from the same message history. They never overwrite each other's logic — the Panel chooses which to show based on `showResumeCard` (which self-dismisses on first send).

---

## 8. Page Context as a Helper

`pageContext` is passed to `detectFlowState` and forwarded to branch intents. It can bias chip generation (e.g. listing page → suggests details for that listing) but:

- It **never overrides conversation evidence** — if the conversation clearly shows booking history, `BOOKING_HELP_FLOW` will be selected regardless of page type
- It is always optional — all functions degrade cleanly to `null` context
- It never invents access or permissions

---

## 9. Testing Summary (`ChatbotFlowState.test.ts`)

6 describe groups, 35+ assertions:

| Group | Key Assertions |
|-------|---------------|
| LISTING_DISCOVERY_FLOW | All branches detected; empty search → recovery; progress summary non-empty |
| BOOKING_HELP_FLOW | Confirmation live vs expired; blocked; mutation done; booking details |
| HOST_REQUESTS_FLOW | Requests with/without items; listings; blocked host |
| Cross-cutting | Pending confirmation beats listing; null metadata safe; pure-user-message = NONE; unknown tool = NONE; blocked-with-no-prior-flow = safe recovery |
| getFlowNextIntents | Branch changes nextIntents; confirmation = 0 chips; recovery = no mutations; message quality |
| Continuity coexistence | Both systems derived from same messages; pending confirmation: both agree; blocked: both agree |

---

## 11. Audit Findings & Fixes (2026-04-11)

Six bugs found and fixed after initial implementation.

### Bug 1 — `classifyBookingHelp` ran `detectLastActionableResult` before the pending-confirmation check
**Problem:** The function called `detectLastActionableResult(messages)` at the top, then immediately checked `detectPendingConfirmation`. When a pending confirmation existed, `last` was computed but never used — a redundant O(n) backwards scan on every invocation.

**Fix:** Moved `detectLastActionableResult` call to *after* the `detectPendingConfirmation` early-return. The variable is now only computed when actually needed.

### Bug 2 — Empty booking list incorrectly mapped to `BOOKING_MUTATION_DONE` branch
**Problem:** The branch logic was `last.hasItems ? 'BOOKING_LIST_HAS_ITEMS' : 'BOOKING_MUTATION_DONE'`. An empty `get_my_bookings` result (user has no current bookings) was classified as `BOOKING_MUTATION_DONE`, which produced post-mutation chips ("Your action was submitted") — completely wrong context for a user who simply has no bookings yet.

**Fix:** Empty booking lists now use `BOOKING_LIST_HAS_ITEMS` branch unconditionally. The `bannerLabel` and `progressSummary` are adjusted to reflect the empty state ("No active bookings"), but the next-step chip set remains the useful booking-management set rather than post-mutation recovery.

### Bug 3 — Blocked branches hardcoded to `'rate_limited'` regardless of actual status
**Problem:** `DISCOVERY_BLOCKED`, `BOOKING_BLOCKED`, and `HOST_BLOCKED` cases in the branch helpers all called `getRecoverySuggestions('rate_limited')`. The actual `blockedStatus` in `context` (e.g. `trust_restricted`, `too_many_failed_confirmations`) was completely ignored by the branch-level functions.

**Fix:** Blocked branches are now handled exclusively upstream in `getFlowNextAction` which calls `getRecoverySuggestions(context.blockedStatus ?? 'execution_error')`. The branch-level switch cases for `DISCOVERY_BLOCKED` and `HOST_BLOCKED` are retained as defensive fallthrough to the default (they are unreachable in the normal path) with a comment explaining why. `BOOKING_BLOCKED` was similarly removed from `bookingHelpBranchIntents` and routed through `getFlowNextAction`.

### Bug 4 — `useMemo` in `ChatbotFlowCard` and `ChatbotFlowRecoveryCard` used unstable object references as deps
**Problem:** Both components included `flowState.context` (an object) in their dependency arrays. Since `detectFlowState` returns a new object on every `messages` render, `flowState.context` is always a new reference even when the content doesn't change. The memoisation was effectively a no-op.

**Fix:**
- `ChatbotFlowCard`: deps changed to `[flow, branch, context.detectedListingId, context.detectedBookingId, pageContext]` — the only `context` fields that affect which chips are generated.
- `ChatbotFlowRecoveryCard`: deps changed to `[branch, flowState.flow, context.blockedStatus, context.detectedBookingId, pageContext]` — the fields that drive both the copy and the chip set.

### Bug 5 — `ChatbotFlowRecoveryCard` checked `isBlocked` before `isExpiredConfirmation`
**Problem:** The text-derivation logic checked `isBlocked` first when determining which header/subtext to show. If a confirmation happened to expire while the user was also in a blocked state, the card showed the generic "action is restricted" message instead of the more specific and actionable "your confirmation has expired" message — hiding the real next step from the user.

**Fix:** The check order is now: `isExpiredConfirmation → isEmptySearch → isBlocked → fallback`. Additionally, a code comment explains *why* this order is important.

### Bug 6 — `HOST_REQUESTS_EMPTY` chips were mixed `next_step`/`recovery` kind inconsistently
**Problem:** `GET_HOST_LISTINGS` had `kind: 'next_step'` and `HELP_CENTER_SEARCH` had `kind: 'recovery'` in the same branch. This inconsistent chip kind means one chip renders as a normal next-step and one as a recovery chip, making the visual hierarchy confusing since both serve the same UX purpose (recovery from empty state).

**Fix:** Both chips now use `kind: 'recovery'` in the `HOST_REQUESTS_EMPTY` branch, consistent with how `DISCOVERY_SEARCH_EMPTY` handles its chips.

### New audit regression tests (7 describe groups, 18 new assertions)

| Test group | Key assertion |
|---|---|
| `AUDIT: empty booking list branch` | Empty `get_my_bookings` → not `BOOKING_MUTATION_DONE`; chips include cancellation policy |
| `AUDIT: blocked status correctly forwarded` | `trust_restricted`/`cooldown_active`/`too_many_failed_confirmations` all stored in context correctly |
| `AUDIT: page context must not force wrong flow` | Booking page context + listing conversation → LISTING_DISCOVERY_FLOW |
| `AUDIT: help_answer category must not produce any flow` | `search_help_center` → `hasActiveFlow: false` |
| `AUDIT: HOST_REQUESTS_EMPTY recovery mutation-free` | Empty host requests → no mutation intents |
| `AUDIT: no-results search recovery mutation-free` | Empty search → no mutation intents |
| `AUDIT: HOST_BLOCKED recovery` | HOST_BLOCKED → read-only recovery set |
| `AUDIT: mixed noisy conversation` | User messages between tool calls don't affect classification; error-status tool results skip to prior valid result |

- **Add new flows**: create a new classifier function following the `classifyXxx` pattern and call it in `detectFlowState` at the right priority position
- **New branch**: add the branch to `ChatbotFlowBranch` type, add a case in the relevant switch in `chatbot-flow-branches.ts`
- **Backend-powered flow hints**: if backend adds `conversation.activeFlow`, pass it through `ChatbotFlowContext` — current types already have the right shape
- **I18n**: all banner/summary strings are defined inside `chatbot-flow-state.ts` as string literals — wrap with `t()` when ready
- **Flow step transitions**: the current model detects *current* step from the conversation; future enhancement could also detect *all steps traversed* to build a fuller progress breadcrumb
- **A/B testing chip variants**: `ChatbotFlowCard` already accepts `pageContext`; chips can be filtered by page without touching utility logic
