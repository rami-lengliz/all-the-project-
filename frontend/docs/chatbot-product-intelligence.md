# Chatbot Product Intelligence Layer

## 1. Problem Being Solved

The previous chatbot UI was a safe message interface — it rendered structured
tool results and had basic suggestion chips — but suggestions were generated
by ad-hoc inline string-building scattered across components, and
"actionable result" detection was a naïve backward-scan for any successful
tool result.

This document describes the **Product Intelligence Layer** that upgrades the
chatbot from a safe chat UI to a guided product assistant with:

- A typed intent model with deterministic message generation
- Structured actionable-result detection (not naïve backward-scan)
- Context-aware suggestion prioritization by page
- A first real guided flow: search → listing details → host contact / help
- Recovery suggestions after blocked/cooldown/error states
- Clean utility/component separation with full test coverage

---

## 2. File Structure

```
features/chatbot/
├── types/
│   ├── chatbot.types.ts               (unchanged)
│   ├── chatbot-suggestions.types.ts   (legacy shape — bridges via adapter)
│   ├── chatbot-intents.types.ts       ← NEW: typed intent model
├── utils/
│   ├── chatbot-suggestions.ts         (legacy — still usable for pages not yet migrated)
│   ├── chatbot-intents.ts             ← NEW: intent registry + resolver + message builder
│   ├── chatbot-actionable-results.ts  ← NEW: structured result detection
│   └── chatbot-suggestion-priorities.ts ← NEW: ranking + guided flow + recovery
├── components/
│   ├── ChatbotPanel.tsx               (updated: uses new priorities layer)
│   ├── ChatbotMessageList.tsx         (updated: uses detectLastActionableResult)
│   ├── ChatbotSuggestions.tsx         (unchanged: presentation only)
│   ├── ChatbotMessageBubble.tsx       (unchanged)
│   ├── ChatbotConfirmationCard.tsx    (unchanged)
│   ├── ChatbotBlockedState.tsx        (unchanged)
│   └── ChatbotToolResultRenderer.tsx  (unchanged)
└── tests/
    ├── ChatbotComponents.test.tsx
    ├── ChatbotProductIntelligence.test.tsx
    └── ChatbotIntentLayer.test.ts     ← NEW: 50+ assertions
```

---

## 3. Intent Model Design (`chatbot-intents.types.ts`)

### `ChatbotIntentKey`
A union of typed string literals covering every meaningful chatbot action:

```
SEARCH_LISTINGS | SEARCH_LISTINGS_IN_CONTEXT | GET_LISTING_DETAILS |
SHOW_MY_BOOKINGS | GET_BOOKING_DETAILS | GET_HOST_LISTINGS |
GET_HOST_BOOKING_REQUESTS | HELP_CENTER_SEARCH | EXPLAIN_PRICING |
EXPLAIN_CANCELLATION_POLICY | CONTACT_HOST_HELP | REQUEST_BOOKING_HELP |
CANCEL_BOOKING | RECOVERY_SEARCH_SAFE | RECOVERY_HELP_SAFE | RECOVERY_BOOKINGS_SAFE
```

### `ChatbotSuggestionKind`
Where in the UI the suggestion appears:
- `entry` — empty state opening moves
- `contextual` — page-specific intents surfaced on load
- `next_step` — guided follow-up after a tool result
- `recovery` — shown after a blocked/error state

### `ChatbotSuggestionIntent`
Fully typed suggestion object carrying:
- `intent: ChatbotIntentKey`
- `kind: ChatbotSuggestionKind`
- `label` — short chip text (distinct from `message`)
- `message` — the exact text submitted to the backend
- `confirmationHint` — display-only flag for mutation actions
- `priority` — rank for sorting in prioritization layer
- `contextPayload` — structured UX metadata (listingId, bookingId, etc.)

### `ChatbotActionableResult`
Normalised detection result from message history:
- `category` — typed category enum (not raw tool name)
- `hasItems` — whether the output was non-empty
- `primaryId` / `primaryTitle` — first item reference for guided linking

---

## 4. Intent-to-Message Mapping (`chatbot-intents.ts`)

All string building lives in `buildIntentMessage()` — no component ever
concatenates a backend-bound string inline.

### Context Interpolation Rules

| Intent | With context | Without context |
|---|---|---|
| `GET_LISTING_DETAILS` | "Tell me more about listing {listingId}" | Base message |
| `CANCEL_BOOKING` | "I want to cancel booking {bookingId}" | Base message |
| `CONTACT_HOST_HELP` | "I need to contact the host about booking {bookingId}" | Base message |
| `SEARCH_LISTINGS_IN_CONTEXT` | "Find listings similar to "{listingTitle}"" | Base message |

`resolveIntent(key, kind, options)` produces a complete `ChatbotSuggestionIntent`
from a registry lookup + `buildIntentMessage()`.

---

## 5. Actionable-Result Detection (`chatbot-actionable-results.ts`)

Replaces the previous naïve backward-scan with `detectLastActionableResult(messages)`.

### What qualifies as "actionable"
- Role is `assistant`
- Has `metadata.toolName` in the known action map
- `metadata.toolResult.status === 'success'`
- `metadata.toolResult.output` is non-null

### What is excluded
- User messages
- `rate_limited`, `cooldown_active`, `policy_blocked`, `confirmation_required` statuses
- Unknown tool names
- Null or malformed metadata (safe fallback: returns null, never throws)

### Tool → Category Map

| Tool | Category |
|------|----------|
| `search_listings` | `listing_search_results` |
| `get_listing_details` | `listing_details` |
| `get_my_bookings` | `booking_list` |
| `get_booking_details` | `booking_details` |
| `get_host_booking_requests` | `host_booking_requests` |
| `get_host_listings` | `host_listings` |
| `search_help_center` | `help_answer` |
| `cancel_my_booking_if_allowed` / `request_booking_help` / `contact_host_about_booking` | `mutation_success` |

---

## 6. Prioritization Rules (`chatbot-suggestion-priorities.ts`)

### Entry Suggestions (empty state)

| Page | Priority 1 | Priority 2 | Priority 3 |
|------|-----------|-----------|-----------|
| `listing` | `GET_LISTING_DETAILS` (with listingId) | `SEARCH_LISTINGS_IN_CONTEXT` | `EXPLAIN_PRICING` |
| `booking` | `GET_BOOKING_DETAILS` (with bookingId) | `CONTACT_HOST_HELP` | `CANCEL_BOOKING` |
| `host-dashboard` | `GET_HOST_BOOKING_REQUESTS` | `GET_HOST_LISTINGS` | `HELP_CENTER_SEARCH` |
| `search` | `SEARCH_LISTINGS` | `SHOW_MY_BOOKINGS` | — |
| `help` | `HELP_CENTER_SEARCH` | `EXPLAIN_CANCELLATION_POLICY` | `EXPLAIN_PRICING` |
| `null/generic` | `SEARCH_LISTINGS` | `SHOW_MY_BOOKINGS` | `HELP_CENTER_SEARCH` |

### Next-Step Suggestions (guided flow)

| Result Category | Next Intents |
|---|---|
| `listing_search_results` | `GET_LISTING_DETAILS` (first item) → `SEARCH_LISTINGS` → `SHOW_MY_BOOKINGS` |
| `listing_details` | `CONTACT_HOST_HELP` → `SEARCH_LISTINGS_IN_CONTEXT` → `EXPLAIN_PRICING` |
| `booking_list` | `GET_BOOKING_DETAILS` (first item) → `EXPLAIN_CANCELLATION_POLICY` |
| `booking_details` | `CONTACT_HOST_HELP` → `REQUEST_BOOKING_HELP` → `CANCEL_BOOKING` |
| `mutation_success` | `RECOVERY_SEARCH_SAFE` → `SHOW_MY_BOOKINGS` |

---

## 7. First Guided Flow — Listing Discovery

```
1. User opens chatbot on a listing page
   → Entry: GET_LISTING_DETAILS (with listingId)

2. User taps "Listing details" chip
   → Backend returns listing details (structured card)
   → detectLastActionableResult → category: listing_details
   → getNextStepIntents → [CONTACT_HOST_HELP, SEARCH_LISTINGS_IN_CONTEXT, EXPLAIN_PRICING]

3. User taps "Find similar listings"
   → Backend returns search results (structured carousel)
   → getNextStepIntents → [GET_LISTING_DETAILS (first result), SEARCH_LISTINGS, SHOW_MY_BOOKINGS]

4. If user later triggers CANCEL_BOOKING:
   → Backend returns confirmation_required
   → ChatbotConfirmationCard shown (existing UI — unchanged)
   → On confirm: backend executes, returns mutation_success
   → getNextStepIntents → [RECOVERY_SEARCH_SAFE, SHOW_MY_BOOKINGS]
```

---

## 8. Recovery Suggestion Strategy

| Status | Recovery Intents |
|--------|-----------------|
| `rate_limited` | `RECOVERY_SEARCH_SAFE`, `RECOVERY_HELP_SAFE` |
| `cooldown_active` | `RECOVERY_SEARCH_SAFE`, `RECOVERY_HELP_SAFE` |
| `trust_restricted` / `suspicious_activity` | `RECOVERY_SEARCH_SAFE`, `RECOVERY_HELP_SAFE` |
| `policy_blocked` | `RECOVERY_BOOKINGS_SAFE`, `RECOVERY_SEARCH_SAFE` |
| `empty_results` | `SEARCH_LISTINGS`, `HELP_CENTER_SEARCH` |
| `execution_error` / unknown | All three RECOVERY_ intents |

Recovery intents are **always read-only**. Mutation intents (`CANCEL_BOOKING`,
`CONTACT_HOST_HELP`, `REQUEST_BOOKING_HELP`) are never surfaced after a blocked state.

---

## 9. Component / Utility Boundaries

| Layer | Responsibility |
|-------|---------------|
| `chatbot-intents.ts` | Registry, message building, resolving intents |
| `chatbot-actionable-results.ts` | Detecting + categorising the last useful tool result |
| `chatbot-suggestion-priorities.ts` | Selecting and ranking suggestions; bridges to legacy `ChatbotSuggestion` shape |
| `ChatbotPanel.tsx` | Consuming `getEntrySuggestions()` → `intentsToSuggestions()` |
| `ChatbotMessageList.tsx` | Consuming `detectLastActionableResult()` + `getNextStepIntents()` |
| `ChatbotSuggestions.tsx` | Rendering chips from legacy `ChatbotSuggestion[]` — presentation only |

**No string building happens inside JSX.** Components only consume already-resolved data.

---

## 10. Testing Summary (`ChatbotIntentLayer.test.ts`)

50+ assertions across 7 test groups:

| Group | Key Assertions |
|-------|---------------|
| `buildIntentMessage` | listingId / bookingId interpolation; no "undefined" in any output; all 16 intents return non-empty strings |
| `resolveIntent` | All required fields present; label ≠ message; confirmationHint set correctly |
| `detectLastActionableResult` | Null-safe; ignores blocked statuses; ignores unknown tools; returns correct category; finds LAST not first; handles empty output arrays; never crashes on malformed metadata |
| `getEntrySuggestions` | Listing context embeds listingId; booking context embeds bookingId; host-dashboard leads with requests; all pages produce unique ids and non-empty strings |
| `getNextStepIntents` | Guided flow step 2 (listing detail after search); step 3 (contact after details); booking drill-down; mutation recovery; never "undefined" in messages |
| `getRecoverySuggestions` | Rate-limited → no mutations; all statuses return at least one intent; unknown status safe |
| `intentsToSuggestions` | Field mapping correct; empty input safe |

---

## 11. Future Extension Notes

- **New tool**: add to `TOOL_CATEGORY_MAP` in `chatbot-actionable-results.ts` + case in `getNextStepIntents`
- **New intent**: add key to `ChatbotIntentKey`, entry in `INTENT_DEFINITIONS`, handle in `buildIntentMessage` if context-sensitive
- **New guided flow**: define as `ChatbotGuidedFlowState`, route through `getNextStepIntents` by category
- **Backend structured intents**: when the backend accepts structured intent payloads (not just text), add a `contextPayload` field to the `sendMessage` API call — the `ChatbotSuggestionIntent.contextPayload` is already populated
- **i18n**: all user-facing strings are in `INTENT_DEFINITIONS` — wrap with `t()` when ready
- **Recovery in message bubbles**: `ChatbotBlockedState` can be extended to call `getRecoverySuggestions(status)` and render chips inline beside the blocked notice
