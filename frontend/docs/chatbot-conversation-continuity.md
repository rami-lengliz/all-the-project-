# Chatbot Conversation Continuity

## 1. Problem Being Solved

The chatbot was stateless from the user's perspective — every session felt disposable.
Opening the panel defaulted to the most recent conversation with no resume context,
suggestion chips started from scratch, and pending confirmation actions from a previous
session were invisible.

This document describes the **Conversation Continuity Layer** that makes the chatbot
feel like an assistant users can return to: resumable, labelled, and context-aware.

---

## 2. File Structure

```
features/chatbot/
├── types/
│   └── chatbot-continuity.types.ts     ← NEW: ChatbotResumeState, ChatbotResumeKind, ChatbotConversationLabel
├── utils/
│   ├── chatbot-conversation-labels.ts  ← NEW: deriveConversationLabel, formatRelativeTime
│   └── chatbot-resume-utils.ts         ← NEW: detectResumeState, isHighPriorityResume
├── components/
│   ├── ChatbotConversationList.tsx      ← NEW: conversation list with resume states
│   ├── ChatbotConversationListItem.tsx  ← NEW: accessible item with 3 visual states
│   ├── ChatbotResumeCard.tsx            ← NEW: "continue where you left off" card
│   └── ChatbotPanel.tsx                 ← UPDATED: two-view layout + continuity integration
└── hooks/
    └── useChatbot.ts                    ← UPDATED: useChatbotMultiMessages, staleTime
```

---

## 3. Conversation Label Strategy (`chatbot-conversation-labels.ts`)

Labels are derived deterministically from available data in priority order:

| Priority | Source | Example |
|----------|--------|---------|
| 1 | `conversation.title` (backend-provided) | "Searching for villas" |
| 2 | Last actionable result category + primaryTitle | "Listing details: Mountain Tent" |
| 3 | Last user message snippet (≤ 40 chars) | "I need a car near Tunis…" |
| 4 | Generic fallback | "New conversation" |

**Rules:**
- Raw IDs are never shown
- Raw JSON is never shown
- Snippets are truncated to 40 chars with `…`
- `formatRelativeTime()` converts ISO timestamps to "Just now" / "2h ago" / "3d ago"

---

## 4. Resume State Detection (`chatbot-resume-utils.ts`)

`detectResumeState(messages)` scans the conversation history and classifies the resume state.

### `ChatbotResumeKind` values

| Kind | Meaning |
|------|---------|
| `pending_confirmation` | A confirmation_required result is present and not consumed by a subsequent success |
| `listing_search` | Last actionable result was a listing search |
| `listing_details` | Last actionable result was listing details |
| `booking_flow` | Last actionable result was booking list or booking details |
| `host_operations` | Last actionable result was host requests or host listings |
| `help_flow` | Last actionable result was a help center answer |
| `after_blocked` | Last adjacent event was a blocked/cooldown status |
| `none` | No meaningful resumable state |

### Detection priority
1. **Pending confirmation** — highest priority; checks that the token has not been consumed by a later mutation success
2. **Actionable result** — uses `detectLastActionableResult()` from the intent layer
3. **Blocked state** — only the immediately preceding blocked events; historical ones are ignored
4. **None** — conversation exists but is not worth surfacing as resumable

### Safe invariants
- Never throws; returns `{ kind: 'none', isResumable: false }` on empty or malformed input
- Expired confirmations are still surfaced but marked in the summary
- Consumed confirmations (followed by mutation success) are not shown
- `suggestedNextIntents` are always typed intents — no inline string-building

---

## 5. "Continue Where You Left Off" UX

### `ChatbotResumeCard`
Shown at the top of the chat view when `isHighPriorityResume(activeResumeState)` is true
(i.e. `pending_confirmation`, `listing_search`, `listing_details`, or `booking_flow`).

**Pending confirmation path:**
- Rendered using the existing `ChatbotConfirmationCard` (backend-controlled flow)
- Shows expiration state if token is expired
- No action fires without explicit user click
- Backend validates the token on confirm — frontend never trusts it as valid

**Standard resume path:**
- Shows the resume summary string (e.g. "Continue your listing search: Blue Kayak")
- Shows up to 3 structured intent chips from `resumeState.suggestedNextIntents`
- Chips are disabled while `isPending`

---

## 6. Conversation List UX

`ChatbotConversationList` shows conversations sorted by `updatedAt` (most recent first).

Each `ChatbotConversationListItem` has three distinct visual states:

| State | Visual cue | Condition |
|-------|-----------|-----------|
| Pending confirmation | Yellow badge + "⚡ Action pending" | `resumeKind === 'pending_confirmation'` |
| Resumable | Blue badge + "▸ Resumable · 2h ago" | `isResumable && kind !== 'after_blocked'` |
| Neutral | Grey badge + timestamp | Otherwise |

The selected conversation is highlighted in blue.
A "New conversation" CTA is always at the top.
Empty state shows a helpful prompt to start the first conversation.

---

## 7. Panel Two-View Layout

`ChatbotPanel` now supports two views toggled via a header button:

- **`chat`** — the conversation thread, resume card (if applicable), suggestions, composer
- **`conversations`** — the conversation list with resume indicators

Selecting a conversation in list view switches back to `chat` view automatically.
Sending a message from the composer or tapping a suggestion while in `conversations` view also auto-switches to `chat`.

---

## 8. Multi-Conversation Message Loading

`useChatbotMultiMessages(ids)` loads messages for up to 3 recent conversations in parallel
using individual React Query queries. Each is cached independently with `staleTime: 30s`.

This allows the conversation list to display accurate resume states without loading
full history for every conversation on every render.

The active conversation's messages are loaded separately via `useChatbotMessages` and
are not double-fetched.

---

## 9. Page Context + Continuity Integration

When the chatbot opens from a page with `pageContext`:
- If `messages.length === 0` (new session) → entry suggestions are derived from `pageContext` via the existing intent layer
- If messages exist → the resume card takes precedence for high-priority states
- The panel never auto-switches to unrelated old conversations
- The user must explicitly tap the conversation list to switch

---

## 10. Graceful Fallback Strategy

| Missing backend field | Frontend fallback |
|---|---|
| `conversation.title` | Derived from actionable result or message snippet |
| Resumable state flag | Derived from message history via `detectResumeState` |
| Confirmation summary endpoint | Token and actionName extracted from last `confirmation_required` message |
| Rich conversation metadata | Not shown; no fake data invented |

All derivations are safe: they return clean defaults on malformed input and never expose raw IDs or JSON.

---

## 11. Component / Utility Boundaries

| Layer | Responsibility |
|-------|---------------|
| `chatbot-conversation-labels.ts` | Deriving safe labels; relative time formatting |
| `chatbot-resume-utils.ts` | Resume kind detection; priority classification |
| `ChatbotConversationList` | Rendering the conversation list — consumes derived labels + resume states |
| `ChatbotConversationListItem` | Single item rendering — presentation only |
| `ChatbotResumeCard` | Resume card — delegates confirmation to `ChatbotConfirmationCard` |
| `ChatbotPanel` | Orchestration — two-view layout, parallel loading, resume card visibility |

Components are presentation-only. All detection logic lives in pure utilities.

---

## 12. Testing Summary (`ChatbotConversationContinuity.test.ts`)

4 test groups, 25+ assertions:

| Group | Key Assertions |
|-------|---------------|
| `deriveConversationLabel` | Priority order correct; raw ID never shown; long messages truncated; empty fallback; JSON content safe |
| `formatRelativeTime` | Just now / minutes / hours / days / invalid input |
| `detectResumeState` | All resume kinds detected correctly; pending_confirmation highest priority; consumed confirmations ignored; expired confirmations shown; blocked state gives recovery-only intents; crash-safe on malformed metadata; no "undefined" in messages |
| `isHighPriorityResume` | Correct kinds trigger card; `none` and `after_blocked` do not |

---

## 14. Audit Findings & Fixes (2026-04-11)

Six issues were identified and fixed after the initial implementation:

### Bug 1 — Stale token leak in `detectPendingConfirmation`
**Problem:** The backward scan used `continue` when a `confirmation_required` message had no `confirmationToken`. This allowed the scan to fall through to an *older* message that did have a token, surfacing a stale (and invalid) confirmation as live.

**Fix:** Change `continue` to `break` on a tokenless `confirmation_required`. The newest (chronological) confirmation event is always the authoritative one; searching deeper for an older token is wrong. The backend will reject it anyway, but the UX must not show it.

### Bug 2 — Blocked state hidden behind `confirmation_required`
**Problem:** `detectLastBlockedStatus` broke on the first non-blocked assistant result. A `confirmation_required` status (neither blocked nor a clean success) immediately after a blocked status caused the blocked state to become invisible.

**Fix:** Changed the break condition to fire only on `status === 'success'`. `confirmation_required` is now transparent to blocked-state scanning.

### Bug 3 — Rules of Hooks violation in `useChatbotMultiMessages`
**Problem:** `useQuery` was called inside a `.map()` loop. React requires hooks to be called unconditionally, in the same order, on every render. This crashes in Strict Mode and produces runtime warnings everywhere.

**Fix:** Replaced with three unconditional, fixed-slot `useQuery` calls (`q0`, `q1`, `q2`), each controlled by an `enabled` flag. The hook now handles 0–3 IDs without any conditional hook call.

### Bug 4 — Stale resume card after user sends a message
**Problem:** `showResumeCard` was gated only on `messages.length > 0` and `isHighPriorityResume`. Once a conversation had a resumable state, the resume card was permanently visible — even after the user sent a new message in the current session, making the resume card a redundant distraction.

**Fix:** Added `sessionBaseMessageCountRef` (a `useRef`) that captures the message count at conversation-selection time. The card is only shown while `messages.length === sessionBaseMessageCountRef.current`, i.e. while no new messages have been sent in this session. As soon as the user sends one message, the count grows and the card disappears.

### Bug 5 — `ChatbotConversationList` re-derived resume state per render
**Problem:** `detectResumeState` and `deriveConversationLabel` were called inline inside the list's render map, running expensive O(n) message scans on every render cycle for every conversation in the list.

**Fix:** Moved all derivation upstream into `ChatbotPanel.conversationListItems` (a `useMemo`). `ChatbotConversationList` now accepts pre-computed `ConversationDisplayData[]` and is purely presentational.

### Bug 6 — Whitespace/punctuation-only messages produced ugly labels
**Problem:** A user message of `"   "` or `"..."` passed the old `length > 0` guard and became the conversation label.

**Fix:** Added `isMeaningfulSnippet()` — a check that the snippet contains at least 3 word characters (`\w`). Snippets failing this test are skipped, falling through to the next priority level (or the fallback).

### New tests added
- `detectPendingConfirmation — stale token safety` (3 assertions)
- `detectResumeState — blocked visible through confirmation_required` (1 assertion)
- `deriveConversationLabel — whitespace and punctuation safety` (3 assertions)
- `detectResumeState — cooldown and trust_restricted recovery` (3 assertions)
- `BLOCKED_STATUSES export` (1 assertion)

- **Backend `title` field**: already consumed when present — no migration needed
- **Backend `resumeState` API**: if added, replace `detectResumeState()` call with API result; `ChatbotResumeState` shape is already compatible
- **Pagination**: `useChatbotMultiMessages` can be extended to lazy-load older conversations on scroll
- **Conversation search/filter**: add a search input to `ChatbotConversationList` filtering by `label.text`
- **More visual resume states**: add `host_operations` and `help_flow` to `isHighPriorityResume` if the product warrants it
- **i18n**: all user-facing strings (`CATEGORY_RESUME_SUMMARY`, label fallbacks) are centrally defined — wrap with `t()` when ready
