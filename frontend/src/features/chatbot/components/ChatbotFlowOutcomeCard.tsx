import React from 'react';
import { ChatbotFlowOutcomeState } from '../types/chatbot-flow-outcomes.types';
import { ChatbotContextPayload } from '../types/chatbot-intents.types';
import { ChatbotFlowCompletionCard } from './ChatbotFlowCompletionCard';
import { ChatbotFlowInterruptionCard } from './ChatbotFlowInterruptionCard';

interface ChatbotFlowOutcomeCardProps {
  outcome: ChatbotFlowOutcomeState;
  isPending: boolean;
  onSuggestionSelect: (message: string) => void;
  pageContext?: ChatbotContextPayload | null;
}

/**
 * Orchestrator: selects which outcome card to render based on completionStatus.
 *
 * Routing:
 *  complete    → ChatbotFlowCompletionCard
 *  interrupted → ChatbotFlowInterruptionCard  (includes expired confirmation)
 *  pending     → no card here; ChatbotConfirmationCard / ResumeCard handles live confirmations
 *  active      → no card; ChatbotFlowCard + ChatbotFlowRecoveryCard handle this
 *  none        → nothing rendered
 *
 * This component contains NO logic — it delegates entirely to child cards.
 * Each child self-guards on its own kind check.
 */
export function ChatbotFlowOutcomeCard({
  outcome,
  isPending,
  onSuggestionSelect,
  pageContext,
}: ChatbotFlowOutcomeCardProps) {
  if (!outcome.showOutcomeCard) return null;
  if (outcome.completionStatus === 'active' || outcome.completionStatus === 'none') return null;
  // Pending (live confirmation) is handled by existing ChatbotConfirmationCard / ResumeCard
  if (outcome.kind === 'PENDING_CONFIRMATION') return null;

  const sharedProps = { outcome, isPending, onSuggestionSelect, pageContext };

  return (
    <>
      {/* Completion (success/empty) */}
      <ChatbotFlowCompletionCard {...sharedProps} />
      {/* Interruption (blocked/cooldown/expired) */}
      <ChatbotFlowInterruptionCard {...sharedProps} />
    </>
  );
}
