# Chatbot Frontend Integration & Product Intelligence Layer

## 1. Architecture Overview

The chatbot frontend is a self-contained feature module at
`frontend/src/features/chatbot/`. It consumes the NestJS chatbot API and
renders structured, interactive UI — not a plain text box.

```
features/chatbot/
├── api/
│   └── chatbot.api.ts                 # Axios wrappers for all chatbot endpoints
├── hooks/
│   └── useChatbot.ts                  # React Query hooks (fetch, send, confirm)
├── components/
│   ├── ChatbotPanel.tsx               # Root panel — layout, context, wiring
│   ├── ChatbotMessageList.tsx         # Timeline + inline next-step suggestions
│   ├── ChatbotMessageBubble.tsx       # Role-aware bubble renderer
│   ├── ChatbotComposer.tsx            # Input/send with duplicate-click guard
│   ├── ChatbotSuggestions.tsx         # Quick-reply chip strip
│   ├── ChatbotToolResultRenderer.tsx  # Structured card renderer per tool
│   ├── ChatbotConfirmationCard.tsx    # Mutation confirmation UI
│   └── ChatbotBlockedState.tsx        # Rate-limit / trust / cooldown notices
├── types/
│   ├── chatbot.types.ts               # Core contracts (messages, responses)
│   └── chatbot-suggestions.types.ts  # Suggestion + PageContext interfaces
├── utils/
│   └── chatbot-suggestions.ts        # Pure logic: context → suggestions, tool → next steps
└── tests/
    ├── ChatbotComponents.test.tsx        # Component-level tests
    └── ChatbotProductIntelligence.test.tsx # Suggestion logic + chip interaction tests
```

---

## 2. Backend Endpoints Used

| Method | Path | Purpose |
|--------|------|---------|
| `POST` | `/chatbot/messages` | Send a user message |
| `GET`  | `/chatbot/conversations` | List conversations |
| `GET`  | `/chatbot/conversations/:id/messages` | Fetch message history |
| `POST` | `/chatbot/actions/confirm` | Execute a confirmed mutation |

All requests are authenticated via the shared `api` Axios instance
(`src/lib/api/http.ts`) which attaches the Bearer token from local storage.

---

## 3. Response Types Handled

| Backend Status | Frontend Rendering |
|---|---|
| `success` + tool result | `ChatbotToolResultRenderer` — structured card |
| `confirmation_required` | `ChatbotConfirmationCard` — action card with confirm/cancel |
| `rate_limited` | `ChatbotBlockedState` — orange notice, user-friendly wording |
| `cooldown_active` | `ChatbotBlockedState` — hourglass notice |
| `trust_restricted` / `suspicious_activity` | `ChatbotBlockedState` — lock notice |
| `policy_blocked` | `ChatbotBlockedState` — neutral denial notice |
| Plain assistant text | `ChatbotMessageBubble` — with whitespace-safe `whitespace-pre-wrap` |

---

## 4. Structured Result Rendering Strategy

`ChatbotToolResultRenderer` switches on `toolName` to produce semantic UI:

| Tool | Card Type |
|------|-----------|
| `search_listings`, `get_host_listings` | Horizontal scrollable listing card carousel |
| `get_my_bookings`, `get_host_booking_requests` | Vertical booking list with status badges |
| `get_listing_details` | Detail card with image, location, description, CTA |
| `search_help_center` | Help-article links |
| Unknown tools | Safe text extraction from `output.message` / `output.detail`; never raw JSON |

**No raw `JSON.stringify` output is ever rendered to the end user.**

---

## 5. Product Intelligence Layer — Suggestions & Action Chaining

### 5.1 Context-Aware Entry Points (`getSuggestionsForContext`)

When `ChatbotPanel` receives a `pageContext` prop, it computes a set of
entry-point suggestions for the empty state:

| `pageType` | Suggested actions |
|---|---|
| `listing` | View details, Check availability, Find similar, How to book |
| `booking` | View details, Contact host, Cancel, Cancellation policy |
| `host-dashboard` | Pending requests, My listings, Earnings, Host tips |
| `search` | Refine results, Search by category + base actions |
| `help` | Booking Qs, Payment help, Cancellation, Report issue |
| `generic` / `null` | Find to rent, My bookings, How does this work, My listings |

**Important**: context only pre-fills the *user message text*. The backend
receives this as a normal user message and enforces all permissions itself.
The frontend never fakes authorization or fabricates tool outputs.

#### Usage on a listing page:
```tsx
<ChatbotPanel
  pageContext={{ pageType: 'listing', listingId: listing.id, listingTitle: listing.title }}
/>
```

### 5.2 Action Chaining (`getNextStepSuggestions`)

After a successful tool result is rendered, `ChatbotMessageList` walks
backward through messages to find the last `assistant` message with a
`metadata.toolResult.status === 'success'` and calls
`getNextStepSuggestions(toolName, output)`.

The result is a small set of "What's next?" chips rendered below the messages.
Examples:

- After `search_listings` → "Refine results", "Show more", "Details: [first item]"
- After `get_listing_details` → "Find similar", "How to book", "Ask host a question"
- After `get_my_bookings` → "Details of first booking", "Cancellation policy"
- After `cancel_my_booking_if_allowed` → "Search for alternatives", "Refund timeline?"

Chips dispatch real user messages — no client-side state shortcuts.

---

## 6. Confirmation Flow UX

When the backend returns `confirmation_required`:

1. `ChatbotMessageBubble` detects `result.status === 'confirmation_required'`
2. Renders `ChatbotConfirmationCard` with the backend-provided `confirmationToken`
3. On "Confirm" click → `POST /chatbot/actions/confirm` with `{ conversationId, confirmationToken }`
4. Success → card becomes green "Action Completed" permanently
5. Consumed token → treated as success (idempotent, no crash)
6. Expired → shown deterministically from `expiresAt` field
7. Error → delegated to `ChatbotBlockedState` with stable reason code

**The frontend never executes mutations directly.** All confirmation logic
lives on the backend.

---

## 7. Blocked / Restricted State UX

`ChatbotBlockedState` translates backend reason codes to user-friendly text:

| Code | Title | Icon |
|------|-------|------|
| `rate_limited` | Rate Limit Exceeded | stopwatch |
| `cooldown_active` | Temporarily Resting | hourglass |
| `trust_restricted` / `suspicious_activity` | Action Restricted | lock |
| `policy_blocked` | Permission Denied | ban |

No internal details (security scores, event types, token values) are exposed.

---

## 8. Duplicate-Send / Duplicate-Confirm Protection

- `ChatbotComposer`: submit button is `disabled` while `isPending` is true
- `ChatbotConfirmationCard`: confirm and cancel buttons are `disabled={isPending}`
- React Query `isPending` flag prevents re-submission at the mutation level

---

## 9. Cache Synchronisation

| Action | Invalidations |
|--------|--------------|
| `sendMessage` success | `['chatbot','conversations']` + `['chatbot','messages', conversationId]` |
| `confirmAction` success | `['chatbot','messages', conversationId]` |

---

## 10. Context-Aware Entry — Integration Pattern

```tsx
// pages/listing/[id].tsx
import { ChatbotPanel } from '@/features/chatbot/components/ChatbotPanel';

export default function ListingPage({ listing }) {
  return (
    <>
      {/* existing listing UI */}
      <ChatbotPanel
        pageContext={{
          pageType: 'listing',
          listingId: listing.id,
          listingTitle: listing.title,
        }}
      />
    </>
  );
}
```

The `ChatbotPageContext` type is extensible — add new `pageType` values and
implement corresponding branches in `getSuggestionsForContext` without
modifying any other component.

---

## 11. Testing Summary

### `ChatbotComponents.test.tsx`
- `ChatbotBlockedState` — correct title/icon per status code
- `ChatbotToolResultRenderer` — listing cards render, safe fallback extracts `message`
- `ChatbotConfirmationCard` — calls `confirmAction` with token, shows success state

### `ChatbotProductIntelligence.test.tsx`
- `getSuggestionsForContext` — all page types produce valid suggestions with unique IDs and non-empty messages; listing/booking IDs are embedded correctly
- `getNextStepSuggestions` — covers all mapped tool names, empty outputs, unknown tools, and verifies no internal entity fields leak into chip messages
- `ChatbotSuggestions` — chip rendering, click → `onSelect` called with correct message, `disabled` blocks clicks, empty array renders nothing, visible chip label ≠ internal message text

---

## 12. Future Extension Notes

- **New tools**: add a case to `getNextStepSuggestions` and `ChatbotToolResultRenderer`
- **New page contexts**: add a `pageType` to `ChatbotPageContext` and a branch in `getSuggestionsForContext`
- **Guided flows**: multi-step flows (e.g., "book now") can be implemented by injecting sequential suggestion sets from post-result hooks — no backend changes needed
- **i18n**: labels and messages in `chatbot-suggestions.ts` are plain strings; wrap in `t()` when i18n is added
- **Personalisation**: once the backend exposes user bookings count / listing count in the session, `getSuggestionsForContext` can conditionally surface host vs renter flows
