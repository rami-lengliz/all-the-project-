# Chatbot Assistant Modes

## 1. Problem Being Solved

As the chatbot gained more capabilities (discovery, booking help, host management), it started to feel like a generic "one-size-fits-all" interface. Regardless of whether the user was browsing for a vacation or managing their host dashboard, the initial suggestions and framing were the same.

**Assistant Modes** add a product-intelligence layer that specializes the chatbot's persona, entry points, and visual framing based on what the user is *currently doing*.

---

## 2. Assistant Mode Model

### Files
```
features/chatbot/
├── types/
│   └── chatbot-assistant-modes.types.ts  ← Mode keys, states, metadata
├── utils/
│   ├── chatbot-assistant-modes.ts         ← detectAssistantMode() implementation
│   └── chatbot-mode-priorities.ts        ← Mode-aware suggestion sets
└── components/
    └── ChatbotAssistantModeCard.tsx      ← Lightweight framing header
```

### Supported Modes

| Mode | Domain | Primary Focus |
|------|--------|---------------|
| `DISCOVERY_ASSISTANT` | Browsing | Searching listings, refining filters, inspecting details |
| `BOOKING_ASSISTANT` | Guest / Post-Booking | Checking status, requesting help, cancellation guidance |
| `HOST_ASSISTANT` | Host / Managing | Reviewing requests, managing host listings |
| `GENERAL_ASSISTANT` | Help / All | General product help, safe fallback |

---

## 3. Detection Strategy (Hierarchical Priority)

Assistant mode is detected deterministically from five primary signals, in order of strength:

1.  **Active Flow State** (1.0 confidence): If the user is mid-task (e.g. `BOOKING_HELP_FLOW`), the assistant *must* be in the corresponding mode.
2.  **Terminal Outcome State** (0.9 confidence): If the user just completed a task, the assistant remains in that mode to provide relevant follow-up.
3.  **Conversation History** (0.8 confidence): **History outranks static page context.** If the user is on a listing page but recently called host-specific tools, the assistant pivots to `HOST_ASSISTANT`.
    *   *Recency Limit:* Only the last 5 messages are checked. This prevents a month-old search from "sticking" to the current mode.
4.  **Page Context** (0.7 confidence): Only used if no active flow, outcome, or recent conversation history exists. Provides the "seed" mode for brand new sessions.
5.  **Default** (0.0 confidence): Fallback to `GENERAL_ASSISTANT`.

---

## 4. Mode-Aware Suggestions

### Entry Suggestions
`getModeEntrySuggestions()` replaces the generic `getEntrySuggestions()`. It ensures that Discovery users see "Search Listings" first, while Booking users see "My Bookings" and help-related intents.

### Quick Start Intents
`getModeQuickStarts()` provides abbreviated actionable intents (1-2 chips) often shown in the mode framing banner or header areas.

---

## 5. UI Implementation

### ChatbotAssistantModeCard
A lightweight banner at the top of the chat view. It provides:
-   **Mode label**: e.g. "Booking Assistant"
-   **Description**: e.g. "Help with your active bookings."
-   **Visual indicator**: color-coded icon (Blue for Discovery, Emerald for Booking, Purple for Host) with an identity pulse.

#### Task-Aware Compactness
When a task is in progress (Active Flow, Resume Card, or Outcome card), the Mode Card automatically switches to **compact mode**:
-   Hides the description.
-   Reduces font size.
-   Hides the identity pulse.
-   Minimizes padding.

This ensures the Mode Card acts as a "breadcrumb" for the persona without competing for attention with the specific task cards.

---

## 6. Mode Pivoting Rules

The assistant is designed to be **fluid**, not a rigid silo.

-   **Deterministic pivoting**: As soon as the user triggers a tool from a different domain, the `flowState` or `conversationHistory` detection will flip the mode instantly.
-   **No sticky state**: If a user finishes a host task and then moves to search listings, the `pageContext` signal will naturally take over once the host flow outcome is no longer current.
-   **Safe overlaps**: Suggestions from other domains are still technically accessible through the help system; assistant modes only change *prioritization* and *framing*.

---

## 7. Extensions

-   **Mode-aware Framing Copy**: The same tool result or flow status can be "framed" with different introductory text based on the mode.
-   **Persona-specific Greeting**: `isEmpty` greetings can be mode-aware.
-   **Analytics**: Each message can be tagged with the active `assistantMode` to track domain-specific engagement.
-   **Specific tool result summaries**: `getFlowOutcomeSummary()` could be extended to accept `mode` to produce different headlines (e.g. "Booking Cancelled" in Booking mode vs "Action Complete" in General mode).

---

## 8. Testing Summary (`ChatbotAssistantModes.test.ts`)

-   **Priority tests**: Verified that `active_flow` correctly overrides everything.
-   **Pivoting tests**: Verified that recent `conversation_history` correctly overrides static `page_context` (fixing sticky-page bugs).
-   **Recency tests**: Verified that tool calls older than 5 messages are ignored in favor of page context.
-   **Suggestion tests**: Verified that guest modes (Discovery/Booking) provide exit paths to each other.
-   **Robustness tests**: Verified that malformed metadata or null messages do not crash detection.
