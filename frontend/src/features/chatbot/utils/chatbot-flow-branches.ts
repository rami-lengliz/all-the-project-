/**
 * chatbot-flow-branches.ts
 *
 * Flow-aware next-step and recovery intent generation.
 * Replaces the flat actionable-result → intent mapping with branch-aware logic.
 *
 * No React, no side-effects. Pure. Testable.
 *
 * Exports:
 *  - getFlowNextIntents(flowState, context?)
 *  - getFlowRecoveryIntents(flowState, context?)
 */

import { ChatbotContextPayload, ChatbotSuggestionIntent } from '../types/chatbot-intents.types';
import {
  ChatbotFlowBranch,
  ChatbotFlowNextAction,
  ChatbotFlowState,
} from '../types/chatbot-flows.types';
import { resolveIntent, resolveIntents } from './chatbot-intents';
import { getRecoverySuggestions } from './chatbot-suggestion-priorities';

// ─────────────────────────────────────────────────────────────────────────────
// Branch → next intent maps
// ─────────────────────────────────────────────────────────────────────────────

function listingDiscoveryBranchIntents(
  branch: ChatbotFlowBranch,
  ctx: ChatbotFlowState['context'],
  pageContext?: ChatbotContextPayload | null,
): ChatbotSuggestionIntent[] {
  const listingCtx: Partial<ChatbotContextPayload> = {
    listingId: ctx.detectedListingId,
    listingTitle: ctx.detectedListingTitle,
  };

  switch (branch) {
    case 'DISCOVERY_SEARCH_HAS_RESULTS':
      return [
        // Step 2 of guided flow: dive into first result
        ...(ctx.detectedListingId
          ? [resolveIntent('GET_LISTING_DETAILS', 'next_step', {
              context: listingCtx,
              priority: 1,
              id: `flow_detail_${ctx.detectedListingId}`,
            })]
          : []),
        resolveIntent('SEARCH_LISTINGS', 'next_step', {
          priority: 2,
          id: 'flow_refine_search',
        }),
        resolveIntent('SHOW_MY_BOOKINGS', 'next_step', {
          priority: 3,
          id: 'flow_see_bookings',
        }),
      ];

    case 'DISCOVERY_SEARCH_EMPTY':
      // Recovery branch for empty search — widen / change approach
      return [
        resolveIntent('SEARCH_LISTINGS', 'recovery', {
          priority: 1,
          id: 'flow_empty_widen_search',
        }),
        resolveIntent('HELP_CENTER_SEARCH', 'recovery', {
          priority: 2,
          id: 'flow_empty_help',
        }),
        resolveIntent('SHOW_MY_BOOKINGS', 'recovery', {
          priority: 3,
          id: 'flow_empty_bookings',
        }),
      ];

    case 'DISCOVERY_DETAILS_WITH_ID':
      // Step 3 of guided flow: contact host or find similar
      return [
        resolveIntent('CONTACT_HOST_HELP', 'next_step', {
          context: { listingId: ctx.detectedListingId },
          priority: 1,
          id: `flow_contact_host_${ctx.detectedListingId}`,
        }),
        resolveIntent('SEARCH_LISTINGS_IN_CONTEXT', 'next_step', {
          context: listingCtx,
          priority: 2,
          id: `flow_similar_${ctx.detectedListingId}`,
        }),
        resolveIntent('EXPLAIN_PRICING', 'next_step', {
          priority: 3,
          id: 'flow_pricing',
        }),
      ];

    case 'DISCOVERY_DETAILS_NO_ID':
      return [
        resolveIntent('SEARCH_LISTINGS', 'next_step', {
          priority: 1,
          id: 'flow_search_again',
        }),
        resolveIntent('EXPLAIN_PRICING', 'next_step', {
          priority: 2,
          id: 'flow_pricing_no_id',
        }),
      ];

    // DISCOVERY_BLOCKED is handled upstream in getFlowNextAction
    // and never reaches this switch in normal flow — kept as defensive fallthrough.
    case 'DISCOVERY_BLOCKED':
    default:
      return resolveIntents([
        { key: 'SEARCH_LISTINGS', kind: 'next_step', priority: 1 },
        { key: 'SHOW_MY_BOOKINGS', kind: 'next_step', priority: 2 },
      ]);
  }
}

function bookingHelpBranchIntents(
  branch: ChatbotFlowBranch,
  ctx: ChatbotFlowState['context'],
): ChatbotSuggestionIntent[] {
  const bookingCtx: Partial<ChatbotContextPayload> = ctx.detectedBookingId
    ? { bookingId: ctx.detectedBookingId }
    : {};

  switch (branch) {
    case 'BOOKING_LIST_HAS_ITEMS':
      return [
        // Step 2: dive into booking details
        ...(ctx.detectedBookingId
          ? [resolveIntent('GET_BOOKING_DETAILS', 'next_step', {
              context: bookingCtx,
              priority: 1,
              id: `flow_bk_detail_${ctx.detectedBookingId}`,
            })]
          : []),
        resolveIntent('EXPLAIN_CANCELLATION_POLICY', 'next_step', {
          priority: 2,
          id: 'flow_cancel_policy',
        }),
        resolveIntent('SEARCH_LISTINGS', 'next_step', {
          priority: 3,
          id: 'flow_browse_more',
        }),
      ];

    case 'BOOKING_DETAILS_ACTIVE':
      // Step 3: contact host → request help → cancel
      return [
        resolveIntent('CONTACT_HOST_HELP', 'next_step', {
          context: bookingCtx,
          priority: 1,
          id: 'flow_contact_host',
        }),
        resolveIntent('REQUEST_BOOKING_HELP', 'next_step', {
          context: bookingCtx,
          priority: 2,
          id: 'flow_request_help',
        }),
        resolveIntent('CANCEL_BOOKING', 'next_step', {
          context: bookingCtx,
          priority: 3,
          id: 'flow_cancel_booking',
        }),
      ];

    case 'BOOKING_CONFIRMATION_LIVE':
      // Confirmation is live — no next-step chips; the ConfirmationCard handles it
      return [];

    case 'BOOKING_CONFIRMATION_EXPIRED':
      // Expired: suggest safe recovery, not re-triggering the same action
      return [
        resolveIntent('GET_BOOKING_DETAILS', 'recovery', {
          context: bookingCtx,
          priority: 1,
          id: 'flow_rebook_detail',
        }),
        resolveIntent('SHOW_MY_BOOKINGS', 'recovery', {
          priority: 2,
          id: 'flow_back_to_bookings',
        }),
      ];

    case 'BOOKING_MUTATION_DONE':
      // Post-mutation: safe next steps
      return resolveIntents([
        { key: 'RECOVERY_SEARCH_SAFE', kind: 'next_step', priority: 1 },
        { key: 'SHOW_MY_BOOKINGS', kind: 'next_step', priority: 2 },
      ]);

    case 'BOOKING_BLOCKED':
      return getRecoverySuggestions('rate_limited');

    default:
      return resolveIntents([
        { key: 'SHOW_MY_BOOKINGS', kind: 'next_step', priority: 1 },
        { key: 'SEARCH_LISTINGS', kind: 'next_step', priority: 2 },
      ]);
  }
}

function hostRequestsBranchIntents(
  branch: ChatbotFlowBranch,
): ChatbotSuggestionIntent[] {
  switch (branch) {
    case 'HOST_REQUESTS_HAS_ITEMS':
      return resolveIntents([
        { key: 'GET_HOST_LISTINGS', kind: 'next_step', priority: 1 },
        { key: 'HELP_CENTER_SEARCH', kind: 'next_step', priority: 2 },
      ]);

    case 'HOST_REQUESTS_EMPTY':
      // Empty requests: suggest reading listings and getting help — no mutations
      return resolveIntents([
        { key: 'GET_HOST_LISTINGS', kind: 'recovery', priority: 1 },
        { key: 'HELP_CENTER_SEARCH', kind: 'recovery', priority: 2 },
      ]);

    case 'HOST_LISTINGS_ACTIVE':
      return resolveIntents([
        { key: 'GET_HOST_BOOKING_REQUESTS', kind: 'next_step', priority: 1 },
        { key: 'HELP_CENTER_SEARCH', kind: 'next_step', priority: 2 },
      ]);

    // HOST_BLOCKED is handled upstream in getFlowNextAction
    case 'HOST_BLOCKED':
    default:
      return resolveIntents([
        { key: 'GET_HOST_BOOKING_REQUESTS', kind: 'next_step', priority: 1 },
        { key: 'GET_HOST_LISTINGS', kind: 'next_step', priority: 2 },
      ]);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Returns flow-aware next-step and recovery intents for a given flow state.
 *
 * - nextIntents: shown as suggestion chips after a successful result
 * - recoveryIntents: shown when the flow is blocked or in a dead-end branch
 *
 * No mutation intent is ever included in recoveryIntents.
 */
export function getFlowNextAction(
  flowState: ChatbotFlowState,
  pageContext?: ChatbotContextPayload | null,
): ChatbotFlowNextAction {
  const { flow, branch, context, isRecovery } = flowState;

  if (!flowState.hasActiveFlow) {
    return { nextIntents: [], recoveryIntents: [] };
  }

  // Blocked: route through getRecoverySuggestions with the ACTUAL blocked status.
  // Never hardcode 'rate_limited' — trust_restricted and too_many_failed_confirmations
  // have different semantic meaning and may produce different recovery sets.
  if (isRecovery && context.isBlocked) {
    const recoveryIntents = getRecoverySuggestions(
      context.blockedStatus ?? 'execution_error',
    );
    return { nextIntents: [], recoveryIntents };
  }

  // Empty search: recovery branch (same UX as blocked but with search-specific copy)
  if (branch === 'DISCOVERY_SEARCH_EMPTY' || branch === 'HOST_REQUESTS_EMPTY') {
    const nextIntents = flow === 'LISTING_DISCOVERY_FLOW'
      ? listingDiscoveryBranchIntents(branch, context, pageContext)
      : hostRequestsBranchIntents(branch);
    return { nextIntents, recoveryIntents: [] };
  }

  // Expired confirmation: recovery only — regenerate context, don't replay action
  if (branch === 'BOOKING_CONFIRMATION_EXPIRED') {
    return {
      nextIntents: [],
      recoveryIntents: bookingHelpBranchIntents(branch, context),
    };
  }

  // Live confirmation: no chips (ChatbotConfirmationCard owns this UX)
  if (branch === 'BOOKING_CONFIRMATION_LIVE') {
    return { nextIntents: [], recoveryIntents: [] };
  }

  // Normal branches: route by flow
  let nextIntents: ChatbotSuggestionIntent[] = [];
  switch (flow) {
    case 'LISTING_DISCOVERY_FLOW':
      nextIntents = listingDiscoveryBranchIntents(branch, context, pageContext);
      break;
    case 'BOOKING_HELP_FLOW':
      nextIntents = bookingHelpBranchIntents(branch, context);
      break;
    case 'HOST_REQUESTS_FLOW':
      nextIntents = hostRequestsBranchIntents(branch);
      break;
    default:
      nextIntents = [];
  }

  return { nextIntents, recoveryIntents: [] };
}

// Named convenience exports matching the spec requirement naming
export const getFlowNextIntents = (
  flowState: ChatbotFlowState,
  context?: ChatbotContextPayload | null,
): ChatbotSuggestionIntent[] => getFlowNextAction(flowState, context).nextIntents;

export const getFlowRecoveryIntents = (
  flowState: ChatbotFlowState,
  context?: ChatbotContextPayload | null,
): ChatbotSuggestionIntent[] => getFlowNextAction(flowState, context).recoveryIntents;
