import React, { useMemo } from 'react';

import { ChatbotResumeState } from '../types/chatbot-continuity.types';
import { ChatbotSuggestions } from './ChatbotSuggestions';
import { ChatbotConfirmationCard } from './ChatbotConfirmationCard';
import { intentsToSuggestions } from '../utils/chatbot-suggestion-priorities';

interface ChatbotResumeCardProps {
  conversationId: string;
  resumeState: ChatbotResumeState;
  onSuggestionSelect: (message: string) => void;
  isPending: boolean;
}

export function ChatbotResumeCard({
  conversationId,
  resumeState,
  onSuggestionSelect,
  isPending,
}: ChatbotResumeCardProps) {
  if (!resumeState.isResumable) return null;

  // ── Pending confirmation: highest priority — delegate to existing card ──
  if (
    resumeState.kind === 'pending_confirmation' &&
    resumeState.pendingConfirmationToken
  ) {
    return (
      <div className="mx-4 mt-3 mb-1">
        <div className="mb-2 flex items-center gap-1.5 text-amber-700">
          <i className="fa-solid fa-clock-rotate-left text-xs" />
          <span className="text-xs font-semibold">Pending action from last session</span>
        </div>
        <ChatbotConfirmationCard
          conversationId={conversationId}
          token={resumeState.pendingConfirmationToken}
          actionName={resumeState.pendingConfirmationAction ?? 'action'}
          summary={`Resume: ${resumeState.pendingConfirmationAction ?? 'Confirm previous action'}`}
          expiresAt={resumeState.pendingConfirmationExpiresAt}
        />
      </div>
    );
  }

  // ── Standard resumable result ──────────────────────────────────────────
  const suggestionChips = useMemo(
    () => intentsToSuggestions(resumeState.suggestedNextIntents),
    [resumeState.suggestedNextIntents],
  );

  return (
    <div className="mx-4 mt-3 mb-1 bg-gradient-to-br from-blue-50 to-indigo-50 border border-blue-100 rounded-xl p-3 shadow-sm">
      <div className="flex items-start gap-2 mb-2.5">
        <div className="w-7 h-7 bg-blue-100 rounded-lg flex items-center justify-center shrink-0 mt-0.5">
          <i className="fa-solid fa-rotate-right text-blue-600 text-[11px]" />
        </div>
        <div>
          <p className="text-xs font-semibold text-blue-800">Continue where you left off</p>
          <p className="text-[11px] text-blue-600 mt-0.5">{resumeState.summary}</p>
        </div>
      </div>

      {suggestionChips.length > 0 && (
        <ChatbotSuggestions
          suggestions={suggestionChips}
          onSelect={onSuggestionSelect}
          disabled={isPending}
        />
      )}
    </div>
  );
}
