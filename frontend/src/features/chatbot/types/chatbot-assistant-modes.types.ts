/**
 * chatbot-assistant-modes.types.ts
 *
 * Specialization layer for the chatbot.
 * Each mode represents a "persona" or "mode of operation" tailored to a specific user task domain.
 */

import { ChatbotFlowKey } from './chatbot-flows.types';
import { ChatbotFlowOutcomeKind } from './chatbot-flow-outcomes.types';

export type ChatbotAssistantModeKey =
  | 'DISCOVERY_ASSISTANT'
  | 'BOOKING_ASSISTANT'
  | 'HOST_ASSISTANT'
  | 'GENERAL_ASSISTANT';

export interface ChatbotAssistantModeState {
  mode: ChatbotAssistantModeKey;
  label: string;
  description: string;
  icon: string;
  // Strength of the signal that triggered this mode (0-1)
  // Used for debugging or subtle UI feedback if needed
  confidence: number;
  // What triggered this mode?
  source: 'page_context' | 'active_flow' | 'conversation_history' | 'action_result' | 'default';
}

export interface ChatbotAssistantModeContext {
  activeFlow?: ChatbotFlowKey;
  lastOutcomeKind?: ChatbotFlowOutcomeKind;
  hasPendingConfirmation: boolean;
  detectedBookingId?: string;
  detectedListingId?: string;
}

export const NULL_MODE_STATE: ChatbotAssistantModeState = {
  mode: 'GENERAL_ASSISTANT',
  label: 'General Assistant',
  description: 'How can I help you today?',
  icon: 'fa-robot',
  confidence: 0,
  source: 'default',
};
