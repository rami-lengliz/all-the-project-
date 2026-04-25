/**
 * Typed intent keys — one per distinct chatbot action. These correspond to
 * real backend tools or meaningful conversation intents. They do NOT grant
 * any permissions; the backend remains the authority.
 */
export type ChatbotIntentKey =
  // ── Read-only queries ──────────────────────────────────────────────────
  | 'SEARCH_LISTINGS'
  | 'SEARCH_LISTINGS_IN_CONTEXT'     // listing page: search similar to current
  | 'GET_LISTING_DETAILS'
  | 'SHOW_MY_BOOKINGS'
  | 'GET_BOOKING_DETAILS'
  | 'GET_HOST_LISTINGS'
  | 'GET_HOST_BOOKING_REQUESTS'
  | 'HELP_CENTER_SEARCH'
  | 'EXPLAIN_PRICING'
  | 'EXPLAIN_CANCELLATION_POLICY'
  // ── Contextual help / light mutations via confirmation flow ─────────────
  | 'CONTACT_HOST_HELP'
  | 'REQUEST_BOOKING_HELP'
  // ── Mutation (always goes through backend confirmation flow) ────────────
  | 'CANCEL_BOOKING'
  // ── Recovery / guidance after system states ─────────────────────────────
  | 'RECOVERY_SEARCH_SAFE'
  | 'RECOVERY_HELP_SAFE'
  | 'RECOVERY_BOOKINGS_SAFE'
  // ── Comparison / Decision Support ──────────────────────────────────────────
  | 'COMPARE_LISTINGS'
  | 'ADD_TO_COMPARISON'
  | 'REMOVE_FROM_COMPARISON'
  | 'CLEAR_COMPARISON'
  | 'HELP_ME_CHOOSE';

/**
 * The kind of suggestion — drives where it appears in the UI.
 *  - entry      : shown in the empty state as an opening move
 *  - next_step  : shown after a successful tool result (guided flow)
 *  - contextual : context-specific intent surfaced on page load
 *  - recovery   : shown after a blocked/cooldown/error state
 */
export type ChatbotSuggestionKind =
  | 'entry'
  | 'next_step'
  | 'contextual'
  | 'recovery';

/**
 * Page context passed by host pages into the chatbot panel.
 * This drives context-aware suggestions; it never bypasses backend auth.
 */
export interface ChatbotContextPayload {
  pageType: 'listing' | 'booking' | 'host-dashboard' | 'search' | 'help' | 'generic';
  listingId?: string;
  listingTitle?: string;
  bookingId?: string;
  searchQuery?: string;
  isHost?: boolean;
}

/**
 * A fully typed, intent-driven suggestion.
 * The `message` field is what gets submitted to the backend as a user message.
 * The `intent` field is purely for frontend tracking / logic routing.
 */
export interface ChatbotSuggestionIntent {
  /** Unique stable id — used as React key and for deduplication */
  id: string;
  /** Semantic intent key */
  intent: ChatbotIntentKey;
  /** Short human-readable chip label — must differ from `message` */
  label: string;
  /** Backend-bound user message text generated deterministically */
  message: string;
  /** FontAwesome icon class (e.g. 'fa-magnifying-glass') */
  icon?: string;
  /** Visual chip variant */
  variant?: 'default' | 'action' | 'info' | 'warning';
  /** Where in the UX this suggestion appears */
  kind: ChatbotSuggestionKind;
  /**
   * Priority rank — lower = higher priority.
   * Used by ranking utilities to sort contextual suggestions.
   */
  priority?: number;
  /**
   * Display-only hint that the intent may trigger a confirmation flow.
   * The backend always determines whether confirmation is required.
   */
  confirmationHint?: boolean;
  /** Optional structured context forwarded alongside the text message */
  contextPayload?: Partial<ChatbotContextPayload>;
}

/**
 * A detected actionable result extracted from the message history.
 * This replaces naive "last successful tool result" scanning.
 */
export interface ChatbotActionableResult {
  /** Backend tool that produced this result */
  toolName: string;
  /** Normalised category of the output — drives next-step selection */
  category:
    | 'listing_search_results'
    | 'listing_details'
    | 'booking_list'
    | 'booking_details'
    | 'host_booking_requests'
    | 'host_listings'
    | 'help_answer'
    | 'mutation_success'
    | 'unknown';
  /** Safe, normalised output payload extracted from the tool result */
  output: any;
  /** True if the output contains at least one usable item (not empty) */
  hasItems: boolean;
  /** First item id if available (e.g. listingId, bookingId) */
  primaryId?: string;
  /** First item title/name if available */
  primaryTitle?: string;
}

/**
 * State of an in-progress guided flow step.
 * Currently informational; can be used later to lock suggestions to a flow.
 */
export interface ChatbotGuidedFlowState {
  flowId: 'listing_discovery' | 'booking_management' | 'host_operations';
  step: number;
  /** Last actionable result that advanced the flow */
  lastResult: ChatbotActionableResult | null;
}
