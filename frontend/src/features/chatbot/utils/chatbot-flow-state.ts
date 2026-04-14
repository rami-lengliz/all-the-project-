/**
 * chatbot-flow-state.ts
 *
 * Pure utility to detect the current guided-flow state from a conversation's
 * message history.
 *
 * No React, no side-effects. Crash-safe. Deterministic.
 *
 * Exports:
 *  - detectFlowState(messages, pageContext?)
 *  - getCurrentFlowBranch(flowState)
 *  - getFlowProgressSummary(flowState)
 *  - NULL_FLOW_STATE
 */

import { ChatbotMessage } from '../types/chatbot.types';
import { ChatbotContextPayload } from '../types/chatbot-intents.types';
import {
  ChatbotFlowBranch,
  ChatbotFlowContext,
  ChatbotFlowKey,
  ChatbotFlowState,
  ChatbotFlowStep,
} from '../types/chatbot-flows.types';
import { detectLastActionableResult } from './chatbot-actionable-results';
import { detectPendingConfirmation, BLOCKED_STATUSES } from './chatbot-resume-utils';

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

export const NULL_FLOW_STATE: ChatbotFlowState = {
  flow: 'NONE',
  step: 'NONE',
  branch: 'NONE',
  progressSummary: '',
  bannerLabel: '',
  hasActiveFlow: false,
  context: {},
  isRecovery: false,
};

// ─────────────────────────────────────────────────────────────────────────────
// Internal helpers
// ─────────────────────────────────────────────────────────────────────────────

/** Check if the last assistant tool result is a blocked status */
function detectBlockedStatus(messages: ChatbotMessage[]): string | null {
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];
    if (msg.role !== 'assistant') continue;
    const result = msg.metadata?.toolResult;
    if (!result) continue;
    if (BLOCKED_STATUSES.has(result.status)) return result.status as string;
    // Only stop on success — confirmation_required is transparent
    if (result.status === 'success') break;
  }
  return null;
}

/**
 * Determine whether a search result was empty.
 * Safe: returns false for any output shape that doesn't clearly indicate empty.
 */
function isEmptySearchResult(output: any): boolean {
  if (output == null) return false;
  if (Array.isArray(output)) return output.length === 0;
  if (Array.isArray(output?.data)) return output.data.length === 0;
  for (const key of ['listings', 'results', 'items']) {
    if (Array.isArray(output?.[key])) return output[key].length === 0;
  }
  return false;
}

// ─────────────────────────────────────────────────────────────────────────────
// Flow classification
// ─────────────────────────────────────────────────────────────────────────────

function classifyListingDiscovery(
  messages: ChatbotMessage[],
  context: ChatbotFlowContext,
): ChatbotFlowState | null {
  const last = detectLastActionableResult(messages);
  if (!last) return null;

  const isListingCategory =
    last.category === 'listing_search_results' || last.category === 'listing_details';

  if (!isListingCategory) return null;

  if (last.category === 'listing_search_results') {
    const empty = isEmptySearchResult(last.output);
    return {
      flow: 'LISTING_DISCOVERY_FLOW',
      step: empty ? 'SEARCH_EMPTY' : 'SEARCH_RESULTS_SHOWN',
      branch: empty ? 'DISCOVERY_SEARCH_EMPTY' : 'DISCOVERY_SEARCH_HAS_RESULTS',
      progressSummary: empty
        ? 'Search returned no results'
        : 'Searched listings' + (last.primaryTitle ? ` · found "${last.primaryTitle}"` : ''),
      bannerLabel: empty
        ? 'No listings found — let\'s try something else'
        : 'You\'re exploring listings',
      hasActiveFlow: true,
      context: {
        ...context,
        searchWasEmpty: empty,
        detectedListingId: last.primaryId,
        detectedListingTitle: last.primaryTitle,
      },
      isRecovery: empty,
    };
  }

  // listing_details
  return {
    flow: 'LISTING_DISCOVERY_FLOW',
    step: 'LISTING_DETAILS_VIEWED',
    branch: last.primaryId
      ? 'DISCOVERY_DETAILS_WITH_ID'
      : 'DISCOVERY_DETAILS_NO_ID',
    progressSummary: `Searched · viewed ${last.primaryTitle ?? 'listing details'}`,
    bannerLabel: 'You\'re viewing a listing',
    hasActiveFlow: true,
    context: {
      ...context,
      detectedListingId: last.primaryId,
      detectedListingTitle: last.primaryTitle,
    },
    isRecovery: false,
  };
}

function classifyBookingHelp(
  messages: ChatbotMessage[],
  context: ChatbotFlowContext,
): ChatbotFlowState | null {
  // ── Highest priority: pending confirmation overrides any booking category ──
  const pending = detectPendingConfirmation(messages);
  if (pending) {
    return {
      flow: 'BOOKING_HELP_FLOW',
      step: 'BOOKING_CONFIRMATION_PENDING',
      branch: pending.isExpired
        ? 'BOOKING_CONFIRMATION_EXPIRED'
        : 'BOOKING_CONFIRMATION_LIVE',
      progressSummary: `Booking help · confirmation ${pending.isExpired ? 'expired' : 'pending'}`,
      bannerLabel: pending.isExpired
        ? 'Your confirmation has expired'
        : 'You have a pending action to confirm',
      hasActiveFlow: true,
      context: {
        ...context,
        hasPendingConfirmation: true,
        pendingConfirmationToken: pending.token,
        pendingConfirmationAction: pending.actionName,
        pendingConfirmationExpired: pending.isExpired,
      },
      isRecovery: pending.isExpired,
    };
  }

  // ── Actionable result classification (only reached when no pending confirmation) ──
  const last = detectLastActionableResult(messages);
  if (!last) return null;

  const isBookingCategory =
    last.category === 'booking_list' ||
    last.category === 'booking_details' ||
    last.category === 'mutation_success';

  if (!isBookingCategory) return null;

  if (last.category === 'mutation_success') {
    return {
      flow: 'BOOKING_HELP_FLOW',
      step: 'BOOKING_MUTATION_COMPLETED',
      branch: 'BOOKING_MUTATION_DONE',
      progressSummary: 'Booking action completed',
      bannerLabel: 'Your request was submitted',
      hasActiveFlow: true,
      context,
      isRecovery: false,
    };
  }

  if (last.category === 'booking_details') {
    return {
      flow: 'BOOKING_HELP_FLOW',
      step: 'BOOKING_DETAILS_VIEWED',
      branch: 'BOOKING_DETAILS_ACTIVE',
      progressSummary: 'Viewed booking details',
      bannerLabel: "You're reviewing your booking",
      hasActiveFlow: true,
      context: {
        ...context,
        detectedBookingId: last.primaryId,
      },
      isRecovery: false,
    };
  }

  // booking_list — correctly branch on whether items exist
  return {
    flow: 'BOOKING_HELP_FLOW',
    step: 'BOOKING_LIST_VIEWED',
    // Empty booking list is not a mutation-done state — it's just an empty list.
    // Use BOOKING_LIST_HAS_ITEMS when items are present; fall back to a safe
    // default branch (also BOOKING_LIST_HAS_ITEMS) so the next-step logic
    // gives meaningful "browse more" chips rather than post-mutation recovery.
    branch: 'BOOKING_LIST_HAS_ITEMS',
    progressSummary: last.hasItems ? 'Viewed booking list' : 'No active bookings found',
    bannerLabel: last.hasItems ? "You're managing your bookings" : 'No active bookings',
    hasActiveFlow: true,
    context: {
      ...context,
      detectedBookingId: last.primaryId,
    },
    isRecovery: false,
  };
}

function classifyHostRequests(
  messages: ChatbotMessage[],
  context: ChatbotFlowContext,
): ChatbotFlowState | null {
  const last = detectLastActionableResult(messages);
  if (!last) return null;

  const isHostCategory =
    last.category === 'host_booking_requests' || last.category === 'host_listings';

  if (!isHostCategory) return null;

  if (last.category === 'host_listings') {
    return {
      flow: 'HOST_REQUESTS_FLOW',
      step: 'HOST_LISTINGS_VIEWED',
      branch: 'HOST_LISTINGS_ACTIVE',
      progressSummary: 'Viewed host listings',
      bannerLabel: 'You\'re managing your listings',
      hasActiveFlow: true,
      context,
      isRecovery: false,
    };
  }

  // host_booking_requests
  return {
    flow: 'HOST_REQUESTS_FLOW',
    step: 'HOST_REQUESTS_VIEWED',
    branch: last.hasItems ? 'HOST_REQUESTS_HAS_ITEMS' : 'HOST_REQUESTS_EMPTY',
    progressSummary: last.hasItems
      ? 'Viewed pending booking requests'
      : 'No pending booking requests',
    bannerLabel: last.hasItems
      ? 'You\'re reviewing booking requests'
      : 'No pending requests at this time',
    hasActiveFlow: true,
    context,
    isRecovery: !last.hasItems,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Detect the current guided-flow state from message history.
 *
 * Priority order:
 *  1. Pending confirmation → BOOKING_HELP_FLOW (highest signal)
 *  2. Blocked/cooldown/restricted → recovery state within best-guess flow
 *  3. Last actionable result → classify into flow
 *  4. No signal → NULL_FLOW_STATE
 *
 * Never throws. Returns NULL_FLOW_STATE for empty/malformed input.
 */
export function detectFlowState(
  messages: ChatbotMessage[],
  pageContext?: ChatbotContextPayload | null,
): ChatbotFlowState {
  if (!messages || messages.length === 0) return NULL_FLOW_STATE;

  try {
    const baseContext: ChatbotFlowContext = {};

    // ── 1. Blocked state ───────────────────────────────────────────────────
    const blockedStatus = detectBlockedStatus(messages);

    // ── 2. Try each flow classifier ────────────────────────────────────────
    // Note: pending confirmation is handled inside classifyBookingHelp;
    // it overrides weaker booking categories there.
    const booking = classifyBookingHelp(messages, baseContext);
    const listing = classifyListingDiscovery(messages, baseContext);
    const host = classifyHostRequests(messages, baseContext);

    // ── 3. Select highest-priority match ──────────────────────────────────
    // Pending confirmation beats everything
    if (booking?.step === 'BOOKING_CONFIRMATION_PENDING') {
      if (blockedStatus) {
        return {
          ...booking,
          isRecovery: true,
          context: { ...booking.context, isBlocked: true, blockedStatus },
        };
      }
      return booking;
    }

    // Blocked flow: find the most recent flow hint and apply recovery branch
    if (blockedStatus) {
      const baseFlow = listing ?? booking ?? host ?? NULL_FLOW_STATE;
      const recoverBranch: ChatbotFlowBranch =
        baseFlow.flow === 'LISTING_DISCOVERY_FLOW'
          ? 'DISCOVERY_BLOCKED'
          : baseFlow.flow === 'BOOKING_HELP_FLOW'
          ? 'BOOKING_BLOCKED'
          : baseFlow.flow === 'HOST_REQUESTS_FLOW'
          ? 'HOST_BLOCKED'
          : 'NONE';
      return {
        flow: baseFlow.flow === 'NONE' ? 'LISTING_DISCOVERY_FLOW' : baseFlow.flow,
        step: 'BLOCKED',
        branch: recoverBranch,
        progressSummary: 'Action blocked — showing safe alternatives',
        bannerLabel: 'Let\'s try a different approach',
        hasActiveFlow: true,
        context: { ...baseFlow.context, isBlocked: true, blockedStatus },
        isRecovery: true,
      };
    }

    // Normal flow priority: listing > booking > host
    // Rationale: listing discovery is the most common renter flow entry.
    // Booking help adds a signal only when no listing signal is present.
    return listing ?? booking ?? host ?? NULL_FLOW_STATE;
  } catch {
    return NULL_FLOW_STATE;
  }
}

/**
 * Returns the current branch of a flow state.
 * Utility for consumers that only need the branch.
 */
export function getCurrentFlowBranch(flowState: ChatbotFlowState): ChatbotFlowBranch {
  return flowState.branch;
}

/**
 * Returns a user-facing progress summary string.
 * Returns an empty string for inactive flows.
 */
export function getFlowProgressSummary(flowState: ChatbotFlowState): string {
  return flowState.progressSummary;
}
