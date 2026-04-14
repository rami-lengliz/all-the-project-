import React, { useMemo } from 'react';
import { ChatbotFlowState } from '../types/chatbot-flows.types';
import { ChatbotSuggestions } from './ChatbotSuggestions';
import { intentsToSuggestions } from '../utils/chatbot-suggestion-priorities';
import { getFlowRecoveryIntents } from '../utils/chatbot-flow-branches';
import { ChatbotContextPayload } from '../types/chatbot-intents.types';

interface ChatbotFlowRecoveryCardProps {
  flowState: ChatbotFlowState;
  isPending: boolean;
  onSuggestionSelect: (message: string) => void;
  pageContext?: ChatbotContextPayload | null;
}

/**
 * Shown for recovery/blocked/dead-end flow states.
 *
 * Render conditions (ordered by priority):
 *   1. hasActiveFlow must be true
 *   2. isRecovery must be true OR branch is DISCOVERY_SEARCH_EMPTY
 *
 * Text priority (mutually exclusive checks in correct order):
 *   1. Expired confirmation (check before isBlocked to surface correct message
 *      when both conditions happen to be true simultaneously)
 *   2. Empty search
 *   3. Blocked/cooldown/restricted
 *   4. Generic dead-end fallback
 */
export function ChatbotFlowRecoveryCard({
  flowState,
  isPending,
  onSuggestionSelect,
  pageContext,
}: ChatbotFlowRecoveryCardProps) {
  const { isRecovery, hasActiveFlow, branch, context } = flowState;

  // Guard: only render when we genuinely have a recovery state
  if (!hasActiveFlow) return null;
  if (!isRecovery && branch !== 'DISCOVERY_SEARCH_EMPTY') return null;

  const isExpiredConfirmation = branch === 'BOOKING_CONFIRMATION_EXPIRED';
  const isEmptySearch = branch === 'DISCOVERY_SEARCH_EMPTY';
  const isBlocked = !!context.isBlocked;

  // ── Text derivation — check isExpiredConfirmation FIRST ──────────────────
  // Reason: an expired confirmation can coexist with isBlocked=true when
  // the user also triggered a rate-limit. The expired-confirmation message
  // is more actionable and specific.
  const headerText = isExpiredConfirmation
    ? 'Your confirmation has expired'
    : isEmptySearch
    ? 'No listings found — try a different search'
    : isBlocked
    ? "Let's try a safer option"
    : 'This path hit a dead end';

  const subText = isExpiredConfirmation
    ? 'The confirmation window has closed. View booking details to try again.'
    : isEmptySearch
    ? 'Try widening your search, changing dates, or browsing a different category.'
    : isBlocked
    ? (context.blockedStatus === 'cooldown_active'
        ? "You're in a cooldown period. Browse listings in the meantime."
        : 'This action is restricted. Here are some safe alternatives.')
    : 'Here are some things you can still do.';

  const recoveryChips = useMemo(
    () => intentsToSuggestions(getFlowRecoveryIntents(flowState, pageContext)),
    // flowState.branch and flowState.context together fully determine the output.
    // Spreading context keys avoids capturing the object reference which changes
    // every render, defeating memoisation.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [branch, flowState.flow, context.blockedStatus, context.detectedBookingId, pageContext],
  );

  return (
    <div
      role="status"
      aria-label={headerText}
      className="mx-4 mt-3 mb-1 bg-gradient-to-br from-amber-50 to-orange-50 border border-amber-100 rounded-xl p-3 shadow-sm"
    >
      <div className="flex items-start gap-2 mb-2">
        <div className="w-6 h-6 bg-amber-100 text-amber-600 rounded-md flex items-center justify-center shrink-0 mt-0.5">
          <i className="fa-solid fa-triangle-exclamation text-[10px]" />
        </div>
        <div>
          <p className="text-xs font-semibold text-amber-800">{headerText}</p>
          <p className="text-[11px] text-amber-700 mt-0.5">{subText}</p>
        </div>
      </div>

      {recoveryChips.length > 0 && (
        <ChatbotSuggestions
          suggestions={recoveryChips}
          onSelect={onSuggestionSelect}
          disabled={isPending}
        />
      )}
    </div>
  );
}
