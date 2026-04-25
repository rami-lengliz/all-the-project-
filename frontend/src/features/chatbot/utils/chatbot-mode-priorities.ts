/**
 * chatbot-mode-priorities.ts
 *
 * Mode-aware suggestion prioritization.
 * Enhances entry points and quick-starts based on the active assistant mode.
 *
 * No React, no side-effects. Pure. Testable.
 */

import { ChatbotContextPayload, ChatbotSuggestionIntent } from '../types/chatbot-intents.types';
import { ChatbotAssistantModeState } from '../types/chatbot-assistant-modes.types';
import { resolveIntents } from './chatbot-intents';
import { getEntrySuggestions } from './chatbot-suggestion-priorities';

/**
 * Returns prioritizing entry suggestions based on the assistant mode.
 * Falls back to legacy page-context logic if the mode is GENERAL_ASSISTANT.
 */
export function getModeEntrySuggestions(
  modeState: ChatbotAssistantModeState,
  pageContext?: ChatbotContextPayload | null,
): ChatbotSuggestionIntent[] {
  const { mode } = modeState;

  // 1. DISCOVERY_ASSISTANT: Search, detail, pricing
  if (mode === 'DISCOVERY_ASSISTANT') {
    return resolveIntents([
      {
        key: 'SEARCH_LISTINGS',
        kind: 'entry',
        priority: 1,
        context: pageContext?.listingTitle ? { listingTitle: pageContext.listingTitle } : undefined,
      },
      ...(pageContext?.listingId
        ? [{ key: 'GET_LISTING_DETAILS' as const, kind: 'entry' as const, priority: 2, context: { listingId: pageContext.listingId } }]
        : []),
      { key: 'EXPLAIN_PRICING', kind: 'entry', priority: 3 },
    ]);
  }

  // 2. BOOKING_ASSISTANT: My bookings, booking help, cancellation
  if (mode === 'BOOKING_ASSISTANT') {
    return resolveIntents([
      { key: 'SHOW_MY_BOOKINGS', kind: 'entry', priority: 1 },
      ...(pageContext?.bookingId
        ? [
            { key: 'GET_BOOKING_DETAILS' as const, kind: 'entry' as const, priority: 2, context: { bookingId: pageContext.bookingId } },
            { key: 'CONTACT_HOST_HELP' as const, kind: 'entry' as const, priority: 3, context: { bookingId: pageContext.bookingId } },
          ]
        : [{ key: 'REQUEST_BOOKING_HELP' as const, kind: 'entry' as const, priority: 2 }]),
      { key: 'EXPLAIN_CANCELLATION_POLICY', kind: 'entry', priority: 4 },
      { key: 'SEARCH_LISTINGS', kind: 'entry', priority: 5 },
    ]);
  }

  // 3. HOST_ASSISTANT: Host requests, listings, host help
  if (mode === 'HOST_ASSISTANT') {
    return resolveIntents([
      { key: 'GET_HOST_BOOKING_REQUESTS', kind: 'entry', priority: 1 },
      { key: 'GET_HOST_LISTINGS', kind: 'entry', priority: 2 },
      { key: 'HELP_CENTER_SEARCH', kind: 'entry', priority: 3 },
      { key: 'SHOW_MY_BOOKINGS', kind: 'entry', priority: 4 }, // Host may also be a guest
    ]);
  }

  // 4. GENERAL_ASSISTANT / Default: Fallback to existing page-context logic
  return getEntrySuggestions(pageContext ?? null);
}

/**
 * Quick-starts are shorter, more actionable intents often shown near the top
 * or in specialized mode framing cards.
 */
export function getModeQuickStarts(
  modeState: ChatbotAssistantModeState,
  pageContext?: ChatbotContextPayload | null,
): ChatbotSuggestionIntent[] {
  const { mode } = modeState;

  switch (mode) {
    case 'DISCOVERY_ASSISTANT':
      return resolveIntents([
        { key: 'SEARCH_LISTINGS', kind: 'next_step', priority: 1 },
        { key: 'HELP_CENTER_SEARCH', kind: 'next_step', priority: 2 },
      ]);
    case 'BOOKING_ASSISTANT':
      return resolveIntents([
        { key: 'SHOW_MY_BOOKINGS', kind: 'next_step', priority: 1 },
        { key: 'REQUEST_BOOKING_HELP', kind: 'next_step', priority: 2 },
      ]);
    case 'HOST_ASSISTANT':
      return resolveIntents([
        { key: 'GET_HOST_BOOKING_REQUESTS', kind: 'next_step', priority: 1 },
        { key: 'GET_HOST_LISTINGS', kind: 'next_step', priority: 2 },
      ]);
    default:
      return resolveIntents([
        { key: 'HELP_CENTER_SEARCH', kind: 'next_step', priority: 1 },
      ]);
  }
}
