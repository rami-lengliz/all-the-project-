/**
 * chatbot-flows.types.ts
 *
 * Typed model for branching guided flows.
 * These are frontend UX constructs — they do NOT represent backend authority,
 * permission state, or backend conversation state.
 */

import { ChatbotSuggestionIntent } from './chatbot-intents.types';

// ─────────────────────────────────────────────────────────────────────────────
// Flow keys
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Identifies a named guided flow. Each flow groups related steps and branches.
 *  - LISTING_DISCOVERY_FLOW : search → view details → get help
 *  - BOOKING_HELP_FLOW       : view bookings → get help → confirm/cancel
 *  - HOST_REQUESTS_FLOW      : view requests → inspect → guidance
 *  - NONE                    : no active flow detected
 */
export type ChatbotFlowKey =
  | 'LISTING_DISCOVERY_FLOW'
  | 'BOOKING_HELP_FLOW'
  | 'HOST_REQUESTS_FLOW'
  | 'NONE';

// ─────────────────────────────────────────────────────────────────────────────
// Flow steps
// ─────────────────────────────────────────────────────────────────────────────

/**
 * A discrete, named step within a flow.
 * Steps are derived from the conversation history — they are not persisted
 * or pushed by the backend.
 */
export type ChatbotFlowStep =
  // Listing discovery steps
  | 'SEARCH_INITIATED'
  | 'SEARCH_RESULTS_SHOWN'
  | 'SEARCH_EMPTY'          // search returned no results
  | 'LISTING_DETAILS_VIEWED'
  | 'BOOKING_HELP_REQUESTED' // listing → "how do I book?" path
  // Booking help steps
  | 'BOOKING_LIST_VIEWED'
  | 'BOOKING_DETAILS_VIEWED'
  | 'BOOKING_SUPPORT_REQUESTED'
  | 'BOOKING_CONTACT_HOST_REQUESTED'
  | 'BOOKING_CONFIRMATION_PENDING' // mutation requires user confirmation
  | 'BOOKING_MUTATION_COMPLETED'  // mutation succeeded
  // Host steps
  | 'HOST_REQUESTS_VIEWED'
  | 'HOST_LISTINGS_VIEWED'
  // Cross-flow states
  | 'BLOCKED'               // rate limited / cooldown / trust restricted
  | 'NONE';                 // no recognized step

// ─────────────────────────────────────────────────────────────────────────────
// Flow branches
// ─────────────────────────────────────────────────────────────────────────────

/**
 * A branch is a named path decision within a flow.
 * Branches are deterministic: they depend on the detected step and result.
 */
export type ChatbotFlowBranch =
  // Listing discovery branches
  | 'DISCOVERY_SEARCH_HAS_RESULTS'
  | 'DISCOVERY_SEARCH_EMPTY'
  | 'DISCOVERY_DETAILS_WITH_ID'
  | 'DISCOVERY_DETAILS_NO_ID'
  | 'DISCOVERY_BLOCKED'
  // Booking help branches
  | 'BOOKING_LIST_HAS_ITEMS'
  | 'BOOKING_DETAILS_ACTIVE'
  | 'BOOKING_CONFIRMATION_LIVE'
  | 'BOOKING_CONFIRMATION_EXPIRED'
  | 'BOOKING_MUTATION_DONE'
  | 'BOOKING_BLOCKED'
  // Host branches
  | 'HOST_REQUESTS_HAS_ITEMS'
  | 'HOST_REQUESTS_EMPTY'
  | 'HOST_LISTINGS_ACTIVE'
  | 'HOST_BLOCKED'
  // No flow
  | 'NONE';

// ─────────────────────────────────────────────────────────────────────────────
// Flow context
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Structured context extracted from the flow — carries safe, derived values
 * from message history to inform next-step generation.
 * Never grants permissions. Never trusts stale data as current.
 */
export interface ChatbotFlowContext {
  /** Detected listing id from the most recent relevant tool result */
  detectedListingId?: string;
  detectedListingTitle?: string;
  /** Detected booking id from the most recent relevant tool result */
  detectedBookingId?: string;
  /** Whether the last search result set was empty */
  searchWasEmpty?: boolean;
  /** Whether a pending confirmation token exists */
  hasPendingConfirmation?: boolean;
  pendingConfirmationToken?: string;
  pendingConfirmationAction?: string;
  pendingConfirmationExpired?: boolean;
  /** Whether the flow is currently in a blocked/restricted state */
  isBlocked?: boolean;
  blockedStatus?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Full flow state
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The complete detected flow state for a conversation.
 * Derived from message history (and optionally page context).
 * This is a pure frontend UX construct.
 */
export interface ChatbotFlowState {
  flow: ChatbotFlowKey;
  step: ChatbotFlowStep;
  branch: ChatbotFlowBranch;
  /** User-facing progress summary string, e.g. "Exploring listings → Viewed details" */
  progressSummary: string;
  /** Short banner label for the flow card, e.g. "You're exploring listings" */
  bannerLabel: string;
  /** Whether a meaningful flow is active (false for NONE flows) */
  hasActiveFlow: boolean;
  /** Structured context derived from the messages */
  context: ChatbotFlowContext;
  /** Whether this flow is in a recovery/blocked state */
  isRecovery: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// Next action
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The resolved next action set for a given flow state.
 */
export interface ChatbotFlowNextAction {
  /** Primary intent chips to surface */
  nextIntents: ChatbotSuggestionIntent[];
  /** Recovery intents (only populated when flow is blocked/dead-end) */
  recoveryIntents: ChatbotSuggestionIntent[];
}
