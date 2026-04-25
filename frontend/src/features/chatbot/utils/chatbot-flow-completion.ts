/**
 * chatbot-flow-completion.ts
 *
 * Post-flow action generation — produces next-step intent sets that are
 * specific to each outcome kind rather than simply reusing in-flow next steps.
 *
 * No React, no side-effects. Pure. Testable.
 *
 * Exports:
 *  - getPostFlowActions(outcome, pageContext?)
 *  - getCompletionActions(outcome, pageContext?)
 *  - getInterruptionRecoveryActions(outcome, pageContext?)
 */

import { ChatbotContextPayload, ChatbotSuggestionIntent } from '../types/chatbot-intents.types';
import {
  ChatbotFlowOutcomeState,
  ChatbotPostFlowAction,
} from '../types/chatbot-flow-outcomes.types';
import { resolveIntent, resolveIntents } from './chatbot-intents';
import { getRecoverySuggestions } from './chatbot-suggestion-priorities';

// ─────────────────────────────────────────────────────────────────────────────
// Internal helpers
// ─────────────────────────────────────────────────────────────────────────────

const EMPTY_ACTIONS: ChatbotPostFlowAction = {
  primaryIntents: [],
  fallbackIntents: [],
};

// ─────────────────────────────────────────────────────────────────────────────
// Completion action sets (COMPLETED_SUCCESS, COMPLETED_EMPTY)
// ─────────────────────────────────────────────────────────────────────────────

function completionActions(
  outcome: ChatbotFlowOutcomeState,
  _pageContext?: ChatbotContextPayload | null,
): ChatbotPostFlowAction {
  const bookingCtx = outcome.detectedBookingId
    ? { bookingId: outcome.detectedBookingId }
    : {};
  // Note: listingCtx intentionally unused here — completion actions are
  // booking/help-centric, not listing-centric.

  switch (outcome.kind) {
    // ── Mutation confirmed by user (e.g. booking help submitted) ──────
    case 'COMPLETED_SUCCESS':
      return {
        primaryIntents: resolveIntents([
          // Offer to review the affected booking if we have an ID
          ...(outcome.detectedBookingId
            ? [{ key: 'GET_BOOKING_DETAILS' as const, kind: 'next_step' as const, priority: 1, context: bookingCtx }]
            : [{ key: 'SHOW_MY_BOOKINGS' as const, kind: 'next_step' as const, priority: 1 }]),
          { key: 'SEARCH_LISTINGS', kind: 'next_step', priority: 2 },
          { key: 'HELP_CENTER_SEARCH', kind: 'next_step', priority: 3 },
        ]),
        fallbackIntents: [],
      };

    // ── Search/host-list returned empty ─────────────────────────────
    case 'COMPLETED_EMPTY': {
      const isHostEmpty = outcome.flow === 'HOST_REQUESTS_FLOW';
      if (isHostEmpty) {
        return {
          primaryIntents: resolveIntents([
            { key: 'GET_HOST_LISTINGS', kind: 'recovery', priority: 1 },
            { key: 'HELP_CENTER_SEARCH', kind: 'recovery', priority: 2 },
          ]),
          fallbackIntents: [],
        };
      }
      // Listing search empty: primary = widen search (most useful first)
      return {
        primaryIntents: resolveIntents([
          { key: 'SEARCH_LISTINGS', kind: 'recovery', priority: 1 },
          { key: 'HELP_CENTER_SEARCH', kind: 'recovery', priority: 2 },
          { key: 'SHOW_MY_BOOKINGS', kind: 'recovery', priority: 3 },
        ]),
        fallbackIntents: [],
      };
    }

    default:
      return EMPTY_ACTIONS;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Interruption recovery action sets (INTERRUPTED_BLOCKED, INTERRUPTED_COOLDOWN)
// ─────────────────────────────────────────────────────────────────────────────

function interruptionRecoveryActions(
  outcome: ChatbotFlowOutcomeState,
  _pageContext?: ChatbotContextPayload | null,
): ChatbotPostFlowAction {
  // Always forward the real blocked status so getRecoverySuggestions can
  // return a status-appropriate safe chip set. Never hardcode 'rate_limited'.
  const status = outcome.blockedStatus ?? 'execution_error';

  // Primary: safe read-only intents appropriate for this specific blocked status
  const safeIntents = getRecoverySuggestions(status);

  switch (outcome.kind) {
    case 'INTERRUPTED_COOLDOWN':
      return {
        primaryIntents: safeIntents,
        // Fallback: help center only — distinct from the primary set to avoid
        // presenting the same chip twice if safeIntents includes help_center.
        fallbackIntents: resolveIntents([
          { key: 'SHOW_MY_BOOKINGS', kind: 'recovery', priority: 1 },
        ]),
      };

    case 'INTERRUPTED_BLOCKED':
      return {
        primaryIntents: safeIntents,
        // Fallback: show bookings as an always-safe, always-available option.
        // Uses SHOW_MY_BOOKINGS (a confirmed intent key) not RECOVERY_BOOKINGS_SAFE
        // which may not exist in the intent registry.
        fallbackIntents: resolveIntents([
          { key: 'SHOW_MY_BOOKINGS', kind: 'recovery', priority: 1 },
        ]),
      };

    default:
      return EMPTY_ACTIONS;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Pending / expired confirmation action sets
// ─────────────────────────────────────────────────────────────────────────────

function pendingConfirmationActions(
  outcome: ChatbotFlowOutcomeState,
): ChatbotPostFlowAction {
  // Live confirmation: no chips from this utility — ChatbotConfirmationCard
  // owns the confirm button; we only surface a safe fallback.
  if (outcome.kind === 'PENDING_CONFIRMATION') {
    return {
      primaryIntents: [],
      fallbackIntents: resolveIntents([
        { key: 'SHOW_MY_BOOKINGS', kind: 'recovery', priority: 1 },
        { key: 'RECOVERY_SEARCH_SAFE', kind: 'recovery', priority: 2 },
      ]),
    };
  }

  // Expired confirmation: regenerate a safe path — NOT replaying the action
  if (outcome.kind === 'EXPIRED_CONFIRMATION') {
    const bookingCtx = outcome.detectedBookingId
      ? { bookingId: outcome.detectedBookingId }
      : {};
    return {
      primaryIntents: [
        ...(outcome.detectedBookingId
          ? [resolveIntent('GET_BOOKING_DETAILS', 'recovery', {
              context: bookingCtx,
              priority: 1,
              id: `postflow_regen_booking_${outcome.detectedBookingId}`,
            })]
          : []),
        resolveIntent('SHOW_MY_BOOKINGS', 'recovery', {
          priority: 2,
          id: 'postflow_back_to_bookings',
        }),
      ],
      fallbackIntents: resolveIntents([
        { key: 'RECOVERY_SEARCH_SAFE', kind: 'recovery', priority: 3 },
      ]),
    };
  }

  return EMPTY_ACTIONS;
}

// ─────────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Returns post-flow actions for any outcome kind.
 * ACTIVE states get an empty set — they should use in-flow
 * next steps from getFlowNextIntents instead.
 */
export function getPostFlowActions(
  outcome: ChatbotFlowOutcomeState,
  pageContext?: ChatbotContextPayload | null,
): ChatbotPostFlowAction {
  if (!outcome || outcome.kind === 'NO_MEANINGFUL_OUTCOME') return EMPTY_ACTIONS;
  if (outcome.kind === 'ACTIVE' || outcome.kind === 'RECOVERY_READY') return EMPTY_ACTIONS;

  switch (outcome.kind) {
    case 'COMPLETED_SUCCESS':
    case 'COMPLETED_EMPTY':
      return completionActions(outcome, pageContext);

    case 'INTERRUPTED_BLOCKED':
    case 'INTERRUPTED_COOLDOWN':
      return interruptionRecoveryActions(outcome, pageContext);

    case 'PENDING_CONFIRMATION':
    case 'EXPIRED_CONFIRMATION':
      return pendingConfirmationActions(outcome);

    default:
      return EMPTY_ACTIONS;
  }
}

/**
 * Convenience: primary completion chips only.
 */
export function getCompletionActions(
  outcome: ChatbotFlowOutcomeState,
  pageContext?: ChatbotContextPayload | null,
): ChatbotSuggestionIntent[] {
  return getPostFlowActions(outcome, pageContext).primaryIntents;
}

/**
 * Convenience: interruption recovery chips (the PRIMARY read-only safe set).
 *
 * Note: this returns primaryIntents, not fallbackIntents. For interrupted
 * outcomes, primaryIntents IS the recovery set (produced by getRecoverySuggestions).
 * fallbackIntents contains secondary fallbacks for when primaryIntents is empty.
 */
export function getInterruptionRecoveryActions(
  outcome: ChatbotFlowOutcomeState,
  pageContext?: ChatbotContextPayload | null,
): ChatbotSuggestionIntent[] {
  return getPostFlowActions(outcome, pageContext).primaryIntents;
}
