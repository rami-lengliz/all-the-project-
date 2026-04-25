/**
 * ChatbotAssistantModes.test.ts
 *
 * Comprehensive test suite for assistant mode detection and prioritization.
 */

import { detectAssistantMode } from '../utils/chatbot-assistant-modes';
import { getModeEntrySuggestions, getModeQuickStarts } from '../utils/chatbot-mode-priorities';
import { ChatbotMessage } from '../types/chatbot.types';
import { ChatbotFlowState, NULL_FLOW_STATE } from '../types/chatbot-flows.types';
import { ChatbotFlowOutcomeState, NULL_OUTCOME_STATE } from '../types/chatbot-flow-outcomes.types';
import { ChatbotContextPayload } from '../types/chatbot-intents.types';

// ─────────────────────────────────────────────────────────────────────────────
// Test Helpers
// ─────────────────────────────────────────────────────────────────────────────

function makeAssistant(toolName: string, status: string = 'success'): ChatbotMessage {
  return {
    id: Math.random().toString(),
    role: 'assistant',
    content: '...',
    createdAt: new Date().toISOString(),
    metadata: { toolName, toolResult: { status, output: {} } },
  };
}

function makeFlowState(flow: any, hasActiveFlow: boolean = true): ChatbotFlowState {
  return { ...NULL_FLOW_STATE, flow, hasActiveFlow };
}

function makeOutcomeState(flow: any, kind: any): ChatbotFlowOutcomeState {
  return { ...NULL_OUTCOME_STATE, flow, kind };
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. Detection Tests
// ─────────────────────────────────────────────────────────────────────────────

describe('detectAssistantMode: prioritization logic', () => {
  it('prefers active flow over page context (flow priority)', () => {
    // Current page: search_listings (Discovery context)
    // Active flow: BOOKING_HELP_FLOW (Booking context)
    // Flow should win — assistant is helping with a specific task
    const pageContext: ChatbotContextPayload = { pageType: 'search', kind: 'search_listings' };
    const flowState = makeFlowState('BOOKING_HELP_FLOW');

    const state = detectAssistantMode([], flowState, NULL_OUTCOME_STATE, pageContext);
    expect(state.mode).toBe('BOOKING_ASSISTANT');
    expect(state.source).toBe('active_flow');
  });

  it('prefers recent conversation history over page context (pivoting priority)', () => {
    // Current page: search_listings (Discovery context)
    // History: user just asked about bookings (Booking context)
    // History should win so the mode "pivots" correctly
    const pageContext: ChatbotContextPayload = { pageType: 'search', kind: 'search_listings' };
    const messages = [makeAssistant('get_my_bookings')];

    const state = detectAssistantMode(messages, NULL_FLOW_STATE, NULL_OUTCOME_STATE, pageContext);
    expect(state.mode).toBe('BOOKING_ASSISTANT');
    expect(state.source).toBe('conversation_history');
  });

  it('prefers terminal outcome over page context (outcome priority)', () => {
    // Current page: my_bookings (Booking context)
    // Flow outcome: HOST_REQUESTS_FLOW / COMPLETED_SUCCESS
    // Outcome should win — user just finished host action
    const pageContext: ChatbotContextPayload = { pageType: 'booking', kind: 'my_bookings' };
    const outcome = makeOutcomeState('HOST_REQUESTS_FLOW', 'COMPLETED_SUCCESS');

    const state = detectAssistantMode([], NULL_FLOW_STATE, outcome, pageContext);
    expect(state.mode).toBe('HOST_ASSISTANT');
    expect(state.source).toBe('action_result');
  });

  it('prefers live pending confirmation over page context', () => {
    const pageContext: ChatbotContextPayload = { pageType: 'search', kind: 'search_listings' };
    const outcome = makeOutcomeState('BOOKING_HELP_FLOW', 'PENDING_CONFIRMATION');

    const state = detectAssistantMode([], NULL_FLOW_STATE, outcome, pageContext);
    expect(state.mode).toBe('BOOKING_ASSISTANT');
  });

  it('detects mode from page context when no flow/outcome is active', () => {
    const pageContext: ChatbotContextPayload = { pageType: 'listing', kind: 'listing_details', listingId: 'l1' };
    const state = detectAssistantMode([], NULL_FLOW_STATE, NULL_OUTCOME_STATE, pageContext);
    expect(state.mode).toBe('DISCOVERY_ASSISTANT');
    expect(state.source).toBe('page_context');
  });

  it('detects mode from conversation history (recent) when no other signals exist', () => {
    const messages = [makeAssistant('get_host_booking_requests')];
    const state = detectAssistantMode(messages, NULL_FLOW_STATE, NULL_OUTCOME_STATE, null);
    expect(state.mode).toBe('HOST_ASSISTANT');
    expect(state.source).toBe('conversation_history');
  });

  it('ignores "stale" conversation history (outside recency window) and uses page context', () => {
    // Message too old (index 0, but total length is 10)
    const messages = [
      makeAssistant('get_host_booking_requests'),
      ...Array(10).fill({ role: 'user', content: '...' })
    ];
    const pageContext: ChatbotContextPayload = { pageType: 'search', kind: 'search_listings' };

    const state = detectAssistantMode(messages, NULL_FLOW_STATE, NULL_OUTCOME_STATE, pageContext);
    // Should fall back to discovery because history tool call is stale
    expect(state.mode).toBe('DISCOVERY_ASSISTANT');
    expect(state.source).toBe('page_context');
  });

  it('defaults to GENERAL_ASSISTANT when all signals are missing', () => {
    const state = detectAssistantMode([], NULL_FLOW_STATE, NULL_OUTCOME_STATE, null);
    expect(state.mode).toBe('GENERAL_ASSISTANT');
    expect(state.source).toBe('default');
  });

  it('pivots mode when a new flow starts (pivot logic)', () => {
    // Started in Discovery...
    const pageContext: ChatbotContextPayload = { pageType: 'search', kind: 'search_listings' };
    const initial = detectAssistantMode([], NULL_FLOW_STATE, NULL_OUTCOME_STATE, pageContext);
    expect(initial.mode).toBe('DISCOVERY_ASSISTANT');

    // ...but user triggers a booking flow
    const pivoted = detectAssistantMode([], makeFlowState('BOOKING_HELP_FLOW'), NULL_OUTCOME_STATE, pageContext);
    expect(pivoted.mode).toBe('BOOKING_ASSISTANT');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. Prioritization Tests
// ─────────────────────────────────────────────────────────────────────────────

describe('mode-aware entry suggestions', () => {
  it('provides discovery suggestions for DISCOVERY_ASSISTANT', () => {
    const modeState = { mode: 'DISCOVERY_ASSISTANT' as any, source: 'page_context' as any };
    const suggestions = getModeEntrySuggestions(modeState);
    expect(suggestions.some(s => s.intent === 'SEARCH_LISTINGS')).toBe(true);
    expect(suggestions.some(s => s.intent === 'SHOW_MY_BOOKINGS')).toBe(false);
  });

  it('provides booking suggestions for BOOKING_ASSISTANT', () => {
    const modeState = { mode: 'BOOKING_ASSISTANT' as any, source: 'page_context' as any };
    const suggestions = getModeEntrySuggestions(modeState);
    expect(suggestions.some(s => s.intent === 'SHOW_MY_BOOKINGS')).toBe(true);
    // Cancellation policy is relevant to bookings
    expect(suggestions.some(s => s.intent === 'EXPLAIN_CANCELLATION_POLICY')).toBe(true);
  });

  it('provides host suggestions for HOST_ASSISTANT', () => {
    const modeState = { mode: 'HOST_ASSISTANT' as any, source: 'page_context' as any };
    const suggestions = getModeEntrySuggestions(modeState);
    expect(suggestions.some(s => s.intent === 'GET_HOST_BOOKING_REQUESTS')).toBe(true);
    expect(suggestions.some(s => s.intent === 'GET_HOST_LISTINGS')).toBe(true);
  });

  it('includes contextual detail intents if ID is in page context', () => {
    const modeState = { mode: 'DISCOVERY_ASSISTANT' as any };
    const ctx: ChatbotContextPayload = { pageType: 'listing', kind: 'listing_details', listingId: 'l99' };
    const suggestions = getModeEntrySuggestions(modeState, ctx);
    const detailChip = suggestions.find(s => s.intent === 'GET_LISTING_DETAILS');
    expect(detailChip).toBeTruthy();
    expect(detailChip?.contextPayload?.listingId).toBe('l99');
  });
});

describe('mode-aware quick starts', () => {
  it('returns specific quick starts per mode', () => {
    const discovery = getModeQuickStarts({ mode: 'DISCOVERY_ASSISTANT' } as any);
    expect(discovery[0].intent).toBe('SEARCH_LISTINGS');

    const host = getModeQuickStarts({ mode: 'HOST_ASSISTANT' } as any);
    expect(host[0].intent).toBe('GET_HOST_BOOKING_REQUESTS');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. Safety & Robustness
// ─────────────────────────────────────────────────────────────────────────────

describe('robustness: partial or malformed inputs', () => {
  it('does not crash on null messages', () => {
    expect(() => detectAssistantMode(null as any, NULL_FLOW_STATE, NULL_OUTCOME_STATE)).not.toThrow();
  });

  it('does not crash on missing tool names', () => {
    const msgs = [{ role: 'assistant', metadata: {} }] as any;
    expect(() => detectAssistantMode(msgs, NULL_FLOW_STATE, NULL_OUTCOME_STATE)).not.toThrow();
  });
});
