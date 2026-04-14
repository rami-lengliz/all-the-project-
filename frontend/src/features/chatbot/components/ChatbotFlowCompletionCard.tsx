import React, { useMemo } from 'react';
import { ChatbotFlowOutcomeState } from '../types/chatbot-flow-outcomes.types';
import { ChatbotContextPayload } from '../types/chatbot-intents.types';
import { ChatbotSuggestions } from './ChatbotSuggestions';
import { intentsToSuggestions } from '../utils/chatbot-suggestion-priorities';
import { getCompletionActions } from '../utils/chatbot-flow-completion';

interface ChatbotFlowCompletionCardProps {
  outcome: ChatbotFlowOutcomeState;
  isPending: boolean;
  onSuggestionSelect: (message: string) => void;
  pageContext?: ChatbotContextPayload | null;
}

// Per-kind icon and color
const KIND_STYLE: Record<string, { icon: string; bg: string; iconCls: string; textCls: string; labelCls: string }> = {
  COMPLETED_SUCCESS: {
    icon: 'fa-circle-check',
    bg: 'from-emerald-50 to-green-50',
    iconCls: 'bg-emerald-100 text-emerald-600',
    textCls: 'text-emerald-800',
    labelCls: 'text-emerald-700',
  },
  COMPLETED_EMPTY: {
    icon: 'fa-magnifying-glass',
    bg: 'from-slate-50 to-zinc-50',
    iconCls: 'bg-slate-100 text-slate-500',
    textCls: 'text-slate-700',
    labelCls: 'text-slate-500',
  },
};

/**
 * Shown when a flow reaches a successful or empty completion state.
 * Post-flow chip set is distinct from in-flow next-step chips.
 */
export function ChatbotFlowCompletionCard({
  outcome,
  isPending,
  onSuggestionSelect,
  pageContext,
}: ChatbotFlowCompletionCardProps) {
  if (outcome.kind !== 'COMPLETED_SUCCESS' && outcome.kind !== 'COMPLETED_EMPTY') return null;
  if (!outcome.showOutcomeCard) return null;

  const style = KIND_STYLE[outcome.kind] ?? KIND_STYLE.COMPLETED_EMPTY;

  const chips = useMemo(
    () => intentsToSuggestions(getCompletionActions(outcome, pageContext)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [outcome.kind, outcome.flow, outcome.detectedBookingId, outcome.detectedListingId, pageContext],
  );

  return (
    <div
      role="status"
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
            <p className={`text-[11px] ${style.labelCls} mt-0.5`}>{outcome.subtext}</p>
          )}
        </div>
      </div>
      {chips.length > 0 && (
        <ChatbotSuggestions
          suggestions={chips}
          onSelect={onSuggestionSelect}
          disabled={isPending}
        />
      )}
    </div>
  );
}
