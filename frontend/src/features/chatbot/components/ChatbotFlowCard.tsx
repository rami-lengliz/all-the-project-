import React, { useMemo } from 'react';
import { ChatbotFlowState } from '../types/chatbot-flows.types';
import { ChatbotSuggestions } from './ChatbotSuggestions';
import { intentsToSuggestions } from '../utils/chatbot-suggestion-priorities';
import { getFlowNextIntents } from '../utils/chatbot-flow-branches';
import { ChatbotContextPayload } from '../types/chatbot-intents.types';

interface ChatbotFlowCardProps {
  flowState: ChatbotFlowState;
  isPending: boolean;
  onSuggestionSelect: (message: string) => void;
  pageContext?: ChatbotContextPayload | null;
}

/** Icon and color per flow key */
const FLOW_ICONS: Record<string, string> = {
  LISTING_DISCOVERY_FLOW: 'fa-magnifying-glass-location',
  BOOKING_HELP_FLOW: 'fa-calendar-check',
  HOST_REQUESTS_FLOW: 'fa-store',
};

const FLOW_COLORS: Record<string, { bg: string; icon: string; text: string }> = {
  LISTING_DISCOVERY_FLOW: { bg: 'from-blue-50 to-indigo-50', icon: 'bg-blue-100 text-blue-600', text: 'text-blue-800' },
  BOOKING_HELP_FLOW: { bg: 'from-emerald-50 to-teal-50', icon: 'bg-emerald-100 text-emerald-600', text: 'text-emerald-800' },
  HOST_REQUESTS_FLOW: { bg: 'from-violet-50 to-purple-50', icon: 'bg-violet-100 text-violet-600', text: 'text-violet-800' },
};

export function ChatbotFlowCard({
  flowState,
  isPending,
  onSuggestionSelect,
  pageContext,
}: ChatbotFlowCardProps) {
  const { flow, branch, isRecovery, hasActiveFlow, bannerLabel, progressSummary, context } = flowState;

  // Guard 1: no active flow or unclassified
  if (!hasActiveFlow || flow === 'NONE') return null;
  // Guard 2: recovery state — ChatbotFlowRecoveryCard owns that UX
  if (isRecovery) return null;
  // Guard 3: live confirmation — ChatbotConfirmationCard / ResumeCard owns that UX
  if (branch === 'BOOKING_CONFIRMATION_LIVE') return null;

  const colors = FLOW_COLORS[flow] ?? FLOW_COLORS.LISTING_DISCOVERY_FLOW;
  const icon = FLOW_ICONS[flow] ?? 'fa-robot';

  // Stable primitive deps prevent stale memoisation:
  // context.detectedListingId and detectedBookingId are the only context fields
  // that change which chips are produced for a given branch.
  const nextChips = useMemo(
    () => intentsToSuggestions(getFlowNextIntents(flowState, pageContext)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [flow, branch, context.detectedListingId, context.detectedBookingId, pageContext],
  );

  return (
    <div
      role="status"
      aria-label={bannerLabel}
      className={`mx-4 mt-3 mb-1 bg-gradient-to-br ${colors.bg} border border-white rounded-xl p-3 shadow-sm`}
    >
      {/* Banner */}
      <div className="flex items-center gap-2 mb-2">
        <div className={`w-6 h-6 ${colors.icon} rounded-md flex items-center justify-center shrink-0`}>
          <i className={`fa-solid ${icon} text-[10px]`} />
        </div>
        <div className="flex-1 min-w-0">
          <p className={`text-xs font-semibold ${colors.text} truncate`}>{bannerLabel}</p>
          {progressSummary && (
            <p className="text-[10px] text-slate-500 mt-0.5 truncate">{progressSummary}</p>
          )}
        </div>
      </div>

      {/* Next-step chips */}
      {nextChips.length > 0 && (
        <ChatbotSuggestions
          suggestions={nextChips}
          onSelect={onSuggestionSelect}
          disabled={isPending}
        />
      )}
    </div>
  );
}
