import React, { useMemo } from 'react';
import { ChatbotFlowOutcomeState } from '../types/chatbot-flow-outcomes.types';
import { ChatbotContextPayload } from '../types/chatbot-intents.types';
import { ChatbotSuggestions } from './ChatbotSuggestions';
import { intentsToSuggestions } from '../utils/chatbot-suggestion-priorities';
import { getPostFlowActions } from '../utils/chatbot-flow-completion';

interface ChatbotFlowInterruptionCardProps {
  outcome: ChatbotFlowOutcomeState;
  isPending: boolean;
  onSuggestionSelect: (message: string) => void;
  pageContext?: ChatbotContextPayload | null;
}

const KIND_STYLE: Record<string, { icon: string; bg: string; iconCls: string; textCls: string; subtextCls: string }> = {
  INTERRUPTED_BLOCKED: {
    icon: 'fa-ban',
    bg: 'from-red-50 to-rose-50',
    iconCls: 'bg-red-100 text-red-500',
    textCls: 'text-red-800',
    subtextCls: 'text-red-700',
  },
  INTERRUPTED_COOLDOWN: {
    icon: 'fa-clock',
    bg: 'from-amber-50 to-yellow-50',
    iconCls: 'bg-amber-100 text-amber-600',
    textCls: 'text-amber-800',
    subtextCls: 'text-amber-700',
  },
  EXPIRED_CONFIRMATION: {
    icon: 'fa-hourglass-end',
    bg: 'from-orange-50 to-amber-50',
    iconCls: 'bg-orange-100 text-orange-500',
    textCls: 'text-orange-800',
    subtextCls: 'text-orange-700',
  },
};

const INTERRUPTION_KINDS = new Set([
  'INTERRUPTED_BLOCKED',
  'INTERRUPTED_COOLDOWN',
  'EXPIRED_CONFIRMATION',
]);

/**
 * Shown when a flow is interrupted (blocked, cooldown, expired confirmation).
 * Recovery chips come from getPostFlowActions — not from in-flow logic.
 * No mutation intents appear here.
 */
export function ChatbotFlowInterruptionCard({
  outcome,
  isPending,
  onSuggestionSelect,
  pageContext,
}: ChatbotFlowInterruptionCardProps) {
  if (!INTERRUPTION_KINDS.has(outcome.kind)) return null;
  if (!outcome.showOutcomeCard) return null;

  const style = KIND_STYLE[outcome.kind] ?? KIND_STYLE.INTERRUPTED_BLOCKED;

  const { primaryIntents, fallbackIntents } = useMemo(
    () => getPostFlowActions(outcome, pageContext),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [outcome.kind, outcome.blockedStatus, outcome.detectedBookingId, pageContext],
  );

  const primaryChips = useMemo(
    () => intentsToSuggestions(primaryIntents),
    [primaryIntents],
  );
  const fallbackChips = useMemo(
    () => intentsToSuggestions(fallbackIntents),
    [fallbackIntents],
  );

  const allChips = primaryChips.length > 0 ? primaryChips : fallbackChips;

  return (
    <div
      role="alert"
      aria-label={outcome.headline}
      className={`mx-4 mt-3 mb-1 bg-gradient-to-br ${style.bg} border border-white rounded-xl p-3 shadow-sm`}
    >
      <div className="flex items-start gap-2 mb-2">
        <div className={`w-6 h-6 ${style.iconCls} rounded-md flex items-center justify-center shrink-0 mt-0.5`}>
          <i className={`fa-solid ${style.icon} text-[10px]`} />
        </div>
        <div className="flex-1 min-w-0">
          <p className={`text-xs font-semibold ${style.textCls} truncate`}>{outcome.headline}</p>
          {outcome.subtext && (
            <p className={`text-[11px] ${style.subtextCls} mt-0.5`}>{outcome.subtext}</p>
          )}
        </div>
      </div>
      {allChips.length > 0 && (
        <ChatbotSuggestions
          suggestions={allChips}
          onSelect={onSuggestionSelect}
          disabled={isPending}
        />
      )}
    </div>
  );
}
