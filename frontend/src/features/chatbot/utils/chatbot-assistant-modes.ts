/**
 * chatbot-assistant-modes.ts
 *
 * Deterministic utility to detect the primary assistant mode for a conversation.
 * Combines signals from flow state, outcome state, page context, and history.
 *
 * No React, no side-effects. Pure. Testable.
 */

import { ChatbotMessage } from '../types/chatbot.types';
import { ChatbotContextPayload } from '../types/chatbot-intents.types';
import { ChatbotFlowState } from '../types/chatbot-flows.types';
import { ChatbotFlowOutcomeState } from '../types/chatbot-flow-outcomes.types';
import {
  ChatbotAssistantModeKey,
  ChatbotAssistantModeState,
  ChatbotAssistantModeContext,
  NULL_MODE_STATE,
} from '../types/chatbot-assistant-modes.types';

// ─────────────────────────────────────────────────────────────────────────────
// Mode mapping helpers
// ─────────────────────────────────────────────────────────────────────────────

const MODE_METADATA: Record<ChatbotAssistantModeKey, { label: string; description: string; icon: string }> = {
  DISCOVERY_ASSISTANT: {
    label: 'Discovery Assistant',
    description: 'Find your perfect rental.',
    icon: 'fa-magnifying-glass',
  },
  BOOKING_ASSISTANT: {
    label: 'Booking Assistant',
    description: 'Help with your active bookings.',
    icon: 'fa-calendar-check',
  },
  HOST_ASSISTANT: {
    label: 'Host Assistant',
    description: 'Manage requests and listings.',
    icon: 'fa-house-signal',
  },
  GENERAL_ASSISTANT: {
    label: 'General Assistant',
    description: 'How can I help you today?',
    icon: 'fa-robot',
  },
};

function createModeState(
  mode: ChatbotAssistantModeKey,
  confidence: number,
  source: ChatbotAssistantModeState['source'],
): ChatbotAssistantModeState {
  const meta = MODE_METADATA[mode];
  return {
    mode,
    label: meta.label,
    description: meta.description,
    icon: meta.icon,
    confidence,
    source,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Core detection
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Detects assistant mode using a hierarchical priority model.
 */
export function detectAssistantMode(
  messages: ChatbotMessage[],
  flowState: ChatbotFlowState,
  flowOutcome: ChatbotFlowOutcomeState,
  pageContext?: ChatbotContextPayload | null,
): ChatbotAssistantModeState {
  // Safe default: General
  if (!messages) return NULL_MODE_STATE;

  try {
    // 1. ACTIVE FLOW (Strongest signal: user is mid-action)
    if (flowState?.hasActiveFlow && flowState.flow) {
      if (flowState.flow === 'LISTING_DISCOVERY_FLOW') {
        return createModeState('DISCOVERY_ASSISTANT', 1.0, 'active_flow');
      }
      if (flowState.flow === 'BOOKING_HELP_FLOW') {
        return createModeState('BOOKING_ASSISTANT', 1.0, 'active_flow');
      }
      if (flowState.flow === 'HOST_REQUESTS_FLOW') {
        return createModeState('HOST_ASSISTANT', 1.0, 'active_flow');
      }
    }

    // 2. TERMINAL OUTCOME (Strong signal: user just finished something)
    if (flowOutcome && flowOutcome.kind !== 'NO_MEANINGFUL_OUTCOME' && flowOutcome.kind !== 'ACTIVE') {
      if (flowOutcome.flow === 'LISTING_DISCOVERY_FLOW') {
        return createModeState('DISCOVERY_ASSISTANT', 0.9, 'action_result');
      }
      if (flowOutcome.flow === 'BOOKING_HELP_FLOW') {
        return createModeState('BOOKING_ASSISTANT', 0.9, 'action_result');
      }
      if (flowOutcome.flow === 'HOST_REQUESTS_FLOW') {
        return createModeState('HOST_ASSISTANT', 0.9, 'action_result');
      }
    }

    // 3. CONVERSATION HISTORY (Recent intent signal)
    // We check the last assistant message for tool-backed intent.
    // LIMIT: only consider it a strong pivot if it happened recently (last 5 messages)
    // to avoid an old search from months ago sticking to the current mode.
    const recentMessages = messages.slice(-5);
    const lastAssistantMsg = [...recentMessages].reverse().find(m => m.role === 'assistant');
    const lastToolName = lastAssistantMsg?.metadata?.toolName;

    if (lastToolName) {
      if (lastToolName === 'search_listings' || lastToolName === 'get_listing_details') {
        return createModeState('DISCOVERY_ASSISTANT', 0.8, 'conversation_history');
      }
      if (['get_my_bookings', 'get_booking_details', 'cancel_my_booking_if_allowed'].includes(lastToolName)) {
        return createModeState('BOOKING_ASSISTANT', 0.8, 'conversation_history');
      }
      if (['get_host_booking_requests', 'get_host_listings', 'get_host_booking_details'].includes(lastToolName)) {
        return createModeState('HOST_ASSISTANT', 0.8, 'conversation_history');
      }
    }

    // 4. PAGE CONTEXT (Strong bias for fresh or silent conversations)
    if (pageContext) {
      if (pageContext.pageType === 'search' || pageContext.pageType === 'listing' || pageContext.listingId) {
        return createModeState('DISCOVERY_ASSISTANT', 0.7, 'page_context');
      }
      if (pageContext.pageType === 'booking' || pageContext.bookingId) {
        return createModeState('BOOKING_ASSISTANT', 0.7, 'page_context');
      }
      if (pageContext.pageType === 'host-dashboard') {
        return createModeState('HOST_ASSISTANT', 0.7, 'page_context');
      }
    }

    return NULL_MODE_STATE;
  } catch (err) {
    console.warn('detectAssistantMode: failed silently', err);
    return NULL_MODE_STATE;
  }
}

/**
 * Lightweight summary extract for display helpers
 */
export function getAssistantModeSummary(state: ChatbotAssistantModeState) {
  return {
    mode: state.mode,
    label: state.label,
    description: state.description,
    icon: state.icon,
  };
}
