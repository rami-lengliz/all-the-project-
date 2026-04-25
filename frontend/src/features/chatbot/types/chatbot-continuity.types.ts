/**
 * Continuity and resume-state types for the chatbot conversation experience.
 */

import { ChatbotSuggestionIntent } from './chatbot-intents.types';

/**
 * Classifies what kind of resumable state a conversation is in.
 *  - 'pending_confirmation' — highest priority: a confirmation card is still awaiting user action
 *  - 'listing_search'       — last actionable result was a listing search; user may want to continue
 *  - 'listing_details'      — user was looking at a specific listing
 *  - 'booking_flow'         — user was dealing with a booking (list or details)
 *  - 'host_operations'      — user was managing host side (requests / listings)
 *  - 'help_flow'            — user was browsing help content
 *  - 'after_blocked'        — last notable event was a blocked/cooldown state
 *  - 'none'                 — conversation exists but has no meaningful resume state
 */
export type ChatbotResumeKind =
  | 'pending_confirmation'
  | 'listing_search'
  | 'listing_details'
  | 'booking_flow'
  | 'host_operations'
  | 'help_flow'
  | 'after_blocked'
  | 'none';

/**
 * The resolved resume state for a single conversation,
 * derived entirely from its message history — no backend state faking.
 */
export interface ChatbotResumeState {
  kind: ChatbotResumeKind;
  /** Short user-facing summary of what to resume, e.g. "Continue searching villas" */
  summary: string;
  /** Structured intents the user can tap to resume — mapped through the intent system */
  suggestedNextIntents: ChatbotSuggestionIntent[];
  /**
   * Confirmation token if kind === 'pending_confirmation'.
   * Never trust this as valid; backend validates on confirm.
   */
  pendingConfirmationToken?: string;
  pendingConfirmationAction?: string;
  pendingConfirmationExpiresAt?: string;
  /** True if the resume state is meaningful enough to show a resume card */
  isResumable: boolean;
}

/**
 * A safe, derived label for a conversation.
 * Used in the conversation list; never exposes raw IDs or JSON.
 */
export interface ChatbotConversationLabel {
  text: string;
  /** Whether this is a backend-provided title (highest fidelity) vs derived */
  source: 'backend_title' | 'actionable_result' | 'message_snippet' | 'fallback';
}
