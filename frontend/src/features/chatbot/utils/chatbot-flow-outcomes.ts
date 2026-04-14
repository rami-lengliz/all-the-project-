/**
 * chatbot-flow-outcomes.ts
 *
 * Pure utility to detect the outcome of a guided flow.
 * No React, no side-effects. Crash-safe. Deterministic.
 *
 * Exports:
 *  - detectFlowOutcome(flowState, messages, pageContext?)
 *  - isFlowComplete(flowOutcome)
 *  - getFlowOutcomeSummary(flowOutcome)
 */

import { ChatbotMessage } from '../types/chatbot.types';
import { ChatbotContextPayload } from '../types/chatbot-intents.types';
import { ChatbotFlowState } from '../types/chatbot-flows.types';
import {
  ChatbotFlowCompletionStatus,
  ChatbotFlowOutcomeKind,
  ChatbotFlowOutcomeState,
  ChatbotFlowOutcomeSummary,
  NULL_OUTCOME_STATE,
} from '../types/chatbot-flow-outcomes.types';

// ─────────────────────────────────────────────────────────────────────────────
// Internal helpers
// ─────────────────────────────────────────────────────────────────────────────

function completionStatusFor(kind: ChatbotFlowOutcomeKind): ChatbotFlowCompletionStatus {
  switch (kind) {
    case 'COMPLETED_SUCCESS':
    case 'COMPLETED_EMPTY':
      return 'complete';
    case 'INTERRUPTED_BLOCKED':
    case 'INTERRUPTED_COOLDOWN':
    // Expired confirmation is semantically an interruption, not a pending state.
    // The live confirmation is 'pending'; the expired one is an error the user
    // must recover from — treated as interrupted for panel/card routing.
    case 'EXPIRED_CONFIRMATION':
      return 'interrupted';
    case 'PENDING_CONFIRMATION':
      return 'pending';
    case 'ACTIVE':
    case 'RECOVERY_READY':
      return 'active';
    default:
      return 'none';
  }
}

/**
 * Determines whether an outcome kind should trigger showing an outcome card.
 *
 * ACTIVE and NO_MEANINGFUL_OUTCOME: flow card / recovery card already handle these.
 * RECOVERY_READY: recovery card handles this.
 * PENDING_CONFIRMATION: ResumeCard / ChatbotConfirmationCard owns this UX.
 *   Having showOutcomeCard=true for live pending confirmation would cause the
 *   panel to render the outcome card AND the resume card simultaneously.
 */
function shouldShowOutcomeCard(kind: ChatbotFlowOutcomeKind): boolean {
  return (
    kind !== 'ACTIVE' &&
    kind !== 'NO_MEANINGFUL_OUTCOME' &&
    kind !== 'RECOVERY_READY' &&
    kind !== 'PENDING_CONFIRMATION'  // ResumeCard / ConfirmationCard owns this UX
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Branch → outcome classifiers
// ─────────────────────────────────────────────────────────────────────────────

function classifyListingDiscoveryOutcome(
  flowState: ChatbotFlowState,
): Pick<ChatbotFlowOutcomeState, 'kind' | 'headline' | 'subtext'> {
  const { branch, context } = flowState;

  // Blocked/recovery is handled at the top-level in detectFlowOutcome
  switch (branch) {
    case 'DISCOVERY_SEARCH_HAS_RESULTS':
      // Results shown → still ACTIVE; user needs to act on them
      return {
        kind: 'ACTIVE',
        headline: "You're exploring listings",
        subtext: 'View details or refine your search.',
      };

    case 'DISCOVERY_SEARCH_EMPTY':
      // No results → meaningful stopping point with recovery
      return {
        kind: 'COMPLETED_EMPTY',
        headline: 'No listings matched your search',
        subtext: 'Try a different location, date range, or category.',
      };

    case 'DISCOVERY_DETAILS_WITH_ID':
    case 'DISCOVERY_DETAILS_NO_ID':
      // Details viewed → checkpoint, but not terminal (user may book)
      return {
        kind: 'ACTIVE',
        headline: "You're reviewing a listing",
        subtext: context.detectedListingTitle
          ? `Currently viewing: ${context.detectedListingTitle}`
          : 'See similar listings or ask for booking help.',
      };

    case 'DISCOVERY_BLOCKED':
      // Handled upstream — should not reach here in normal path
      return {
        kind: 'INTERRUPTED_BLOCKED',
        headline: 'Search was stopped',
        subtext: 'A restriction was applied. Try a safer action.',
      };

    default:
      return { kind: 'ACTIVE', headline: "You're exploring listings", subtext: '' };
  }
}

function classifyBookingHelpOutcome(
  flowState: ChatbotFlowState,
): Pick<ChatbotFlowOutcomeState, 'kind' | 'headline' | 'subtext'> {
  const { branch, context } = flowState;

  switch (branch) {
    case 'BOOKING_LIST_HAS_ITEMS':
      return {
        kind: 'ACTIVE',
        headline: "You're managing your bookings",
        subtext: 'View a booking for more details or support.',
      };

    case 'BOOKING_DETAILS_ACTIVE':
      return {
        kind: 'ACTIVE',
        headline: "You're reviewing your booking",
        subtext: 'Contact your host, request help, or cancel if needed.',
      };

    case 'BOOKING_CONFIRMATION_LIVE':
      return {
        kind: 'PENDING_CONFIRMATION',
        headline: 'Waiting for your confirmation',
        subtext: 'Review and confirm or dismiss the pending action.',
      };

    case 'BOOKING_CONFIRMATION_EXPIRED':
      return {
        kind: 'EXPIRED_CONFIRMATION',
        headline: 'Your confirmation window has closed',
        subtext:
          'The action can no longer be confirmed. View your booking details to start again.',
      };

    case 'BOOKING_MUTATION_DONE':
      // Mutation succeeded → strongest completion signal in booking flow
      return {
        kind: 'COMPLETED_SUCCESS',
        headline: 'Your request was submitted',
        subtext:
          'Your booking action was processed. Check your bookings for the latest status.',
      };

    case 'BOOKING_BLOCKED':
      // Handled upstream but keep as defensive case
      return {
        kind: context.blockedStatus === 'cooldown_active'
          ? 'INTERRUPTED_COOLDOWN'
          : 'INTERRUPTED_BLOCKED',
        headline: 'Action could not be completed',
        subtext: 'A restriction is active. Try a read-only action in the meantime.',
      };

    default:
      return { kind: 'ACTIVE', headline: "You're managing your bookings", subtext: '' };
  }
}

function classifyHostRequestsOutcome(
  flowState: ChatbotFlowState,
): Pick<ChatbotFlowOutcomeState, 'kind' | 'headline' | 'subtext'> {
  const { branch } = flowState;

  switch (branch) {
    case 'HOST_REQUESTS_HAS_ITEMS':
      return {
        kind: 'ACTIVE',
        headline: "You're reviewing booking requests",
        subtext: 'Review individual requests or check your listings.',
      };

    case 'HOST_LISTINGS_ACTIVE':
      return {
        kind: 'ACTIVE',
        headline: "You're managing your listings",
        subtext: 'Check booking requests or review a specific listing.',
      };

    case 'HOST_REQUESTS_EMPTY':
      return {
        kind: 'COMPLETED_EMPTY',
        headline: 'No pending booking requests',
        subtext: 'There are no new requests at this time. Check again later.',
      };

    case 'HOST_BLOCKED':
      return {
        kind: 'INTERRUPTED_BLOCKED',
        headline: 'Host action blocked',
        subtext: 'A restriction is currently active. Try browsing your listings.',
      };

    default:
      return { kind: 'ACTIVE', headline: "You're managing your host dashboard", subtext: '' };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Derive the outcome state for a conversation from the current flow state
 * and raw message history.
 *
 * Priority order (same as flow detection, to stay coherent):
 *  1. No active flow → NO_MEANINGFUL_OUTCOME
 *  2. Pending confirmation (live or expired) → PENDING / EXPIRED_CONFIRMATION
 *  3. Blocked/cooldown → INTERRUPTED_BLOCKED / INTERRUPTED_COOLDOWN
 *  4. Branch-level outcome
 *
 * Never throws. Returns NULL_OUTCOME_STATE for empty/malformed input.
 */
export function detectFlowOutcome(
  flowState: ChatbotFlowState,
  _messages: ChatbotMessage[],
  _pageContext?: ChatbotContextPayload | null,
): ChatbotFlowOutcomeState {
  if (!flowState || !flowState.hasActiveFlow) return NULL_OUTCOME_STATE;

  try {
    const { flow, branch, context, step } = flowState;

    // ── 1. Pending confirmation (live) ───────────────────
    // Key on BOTH step and branch so that stale step values don't miss this.
    // branch === BOOKING_CONFIRMATION_LIVE is the authoritative signal from
    // detectFlowState; step === BOOKING_CONFIRMATION_PENDING is a coarser version.
    const isLiveConfirmation =
      (step === 'BOOKING_CONFIRMATION_PENDING' || branch === 'BOOKING_CONFIRMATION_LIVE') &&
      !context.pendingConfirmationExpired;

    if (isLiveConfirmation) {
      return {
        flow,
        kind: 'PENDING_CONFIRMATION',
        completionStatus: 'pending',
        headline: 'Waiting for your confirmation',
        subtext: 'Review and confirm or dismiss the pending action.',
        // showOutcomeCard=false: ResumeCard / ChatbotConfirmationCard owns live confirmation UX.
        // Having this true would cause DuplicateCard rendering.
        showOutcomeCard: false,
        flowBranch: branch,
        pendingConfirmationToken: context.pendingConfirmationToken,
        pendingConfirmationAction: context.pendingConfirmationAction,
      };
    }

    // ── 2. Expired confirmation ────────────────────────────────────────────
    if (branch === 'BOOKING_CONFIRMATION_EXPIRED') {
      return {
        flow,
        kind: 'EXPIRED_CONFIRMATION',
        completionStatus: completionStatusFor('EXPIRED_CONFIRMATION'),
        headline: 'Your confirmation window has closed',
        subtext:
          'The action can no longer be confirmed. View your booking to regenerate a safe path.',
        showOutcomeCard: true,
        flowBranch: branch,
        detectedBookingId: context.detectedBookingId,
      };
    }

    // ── 3. Blocked / cooldown ──────────────────────────────────────────────
    if (step === 'BLOCKED' && context.isBlocked) {
      const kind: ChatbotFlowOutcomeKind =
        context.blockedStatus === 'cooldown_active'
          ? 'INTERRUPTED_COOLDOWN'
          : 'INTERRUPTED_BLOCKED';
      const headline =
        kind === 'INTERRUPTED_COOLDOWN'
          ? 'You\'re in a cooldown period'
          : 'This action is currently restricted';
      const subtext =
        kind === 'INTERRUPTED_COOLDOWN'
          ? 'Wait a moment, then try again. In the meantime, browse listings or check the help center.'
          : 'A trust or policy restriction is active. Use read-only options for now.';
      return {
        flow,
        kind,
        completionStatus: 'interrupted',
        headline,
        subtext,
        showOutcomeCard: true,
        flowBranch: branch,
        blockedStatus: context.blockedStatus,
        detectedBookingId: context.detectedBookingId,
        detectedListingId: context.detectedListingId,
      };
    }

    // ── 4. Branch-level outcome classification ────────────────────────────
    let classified: Pick<ChatbotFlowOutcomeState, 'kind' | 'headline' | 'subtext'>;
    switch (flow) {
      case 'LISTING_DISCOVERY_FLOW':
        classified = classifyListingDiscoveryOutcome(flowState);
        break;
      case 'BOOKING_HELP_FLOW':
        classified = classifyBookingHelpOutcome(flowState);
        break;
      case 'HOST_REQUESTS_FLOW':
        classified = classifyHostRequestsOutcome(flowState);
        break;
      default:
        return NULL_OUTCOME_STATE;
    }

    const completionStatus = completionStatusFor(classified.kind);

    return {
      flow,
      kind: classified.kind,
      completionStatus,
      headline: classified.headline,
      subtext: classified.subtext,
      showOutcomeCard: shouldShowOutcomeCard(classified.kind),
      flowBranch: branch,
      blockedStatus: context.blockedStatus,
      detectedBookingId: context.detectedBookingId,
      detectedListingId: context.detectedListingId,
      pendingConfirmationToken: context.pendingConfirmationToken,
      pendingConfirmationAction: context.pendingConfirmationAction,
    };
  } catch {
    return NULL_OUTCOME_STATE;
  }
}

/**
 * Returns true if the outcome represents a terminal resolution
 * (success, empty, or expired — not interrupted and not pending).
 */
export function isFlowComplete(outcome: ChatbotFlowOutcomeState): boolean {
  return (
    outcome.kind === 'COMPLETED_SUCCESS' || outcome.kind === 'COMPLETED_EMPTY'
  );
}

/**
 * Returns a lightweight summary of an outcome for display.
 */
export function getFlowOutcomeSummary(
  outcome: ChatbotFlowOutcomeState,
): ChatbotFlowOutcomeSummary {
  return {
    kind: outcome.kind,
    headline: outcome.headline,
    subtext: outcome.subtext,
  };
}
