/**
 * Chatbot Product Intelligence — Intent Layer Tests
 *
 * Covers:
 *  1. buildIntentMessage  — context-aware message generation
 *  2. resolveIntent       — fully typed intent production
 *  3. detectLastActionableResult — structured result detection
 *  4. getEntrySuggestions — context-aware entry prioritization
 *  5. getNextStepIntents  — guided flow next steps
 *  6. getRecoverySuggestions — recovery after blocked/cooldown states
 *  7. intentsToSuggestions — bridge adapter
 */

import { buildIntentMessage, resolveIntent, resolveIntents } from '../utils/chatbot-intents';
import { detectLastActionableResult } from '../utils/chatbot-actionable-results';
import {
  getEntrySuggestions,
  getNextStepIntents,
  getRecoverySuggestions,
  intentsToSuggestions,
} from '../utils/chatbot-suggestion-priorities';
import { ChatbotContextPayload, ChatbotActionableResult } from '../types/chatbot-intents.types';
import { ChatbotMessage } from '../types/chatbot.types';

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function makeAssistantMessage(
  toolName: string,
  status: string,
  output: any,
): ChatbotMessage {
  return {
    id: `msg-${Math.random()}`,
    role: 'assistant',
    content: 'Here are the results.',
    createdAt: new Date().toISOString(),
    metadata: {
      toolName,
      toolResult: { status, output },
    },
  };
}

function makeUserMessage(text: string): ChatbotMessage {
  return {
    id: `msg-${Math.random()}`,
    role: 'user',
    content: text,
    createdAt: new Date().toISOString(),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. buildIntentMessage
// ─────────────────────────────────────────────────────────────────────────────

describe('buildIntentMessage', () => {
  it('interpolates listingId into GET_LISTING_DETAILS message', () => {
    const msg = buildIntentMessage('GET_LISTING_DETAILS', { listingId: 'l-42' });
    expect(msg).toContain('l-42');
    expect(msg).not.toContain('undefined');
  });

  it('falls back to listingTitle when no listingId', () => {
    const msg = buildIntentMessage('GET_LISTING_DETAILS', { listingTitle: 'Red Kayak' });
    expect(msg).toContain('Red Kayak');
  });

  it('uses baseMessage when no context provided', () => {
    const msg = buildIntentMessage('GET_LISTING_DETAILS');
    expect(typeof msg).toBe('string');
    expect(msg.trim().length).toBeGreaterThan(0);
    expect(msg).not.toContain('undefined');
  });

  it('interpolates bookingId into GET_BOOKING_DETAILS message', () => {
    const msg = buildIntentMessage('GET_BOOKING_DETAILS', { bookingId: 'bk-99' });
    expect(msg).toContain('bk-99');
  });

  it('interpolates bookingId into CANCEL_BOOKING message', () => {
    const msg = buildIntentMessage('CANCEL_BOOKING', { bookingId: 'bk-55' });
    expect(msg).toContain('bk-55');
  });

  it('returns non-empty string for every defined intent key', () => {
    const keys = [
      'SEARCH_LISTINGS', 'SHOW_MY_BOOKINGS', 'GET_HOST_LISTINGS',
      'GET_HOST_BOOKING_REQUESTS', 'HELP_CENTER_SEARCH', 'EXPLAIN_PRICING',
      'EXPLAIN_CANCELLATION_POLICY', 'CONTACT_HOST_HELP', 'REQUEST_BOOKING_HELP',
      'RECOVERY_SEARCH_SAFE', 'RECOVERY_HELP_SAFE', 'RECOVERY_BOOKINGS_SAFE',
    ] as const;
    keys.forEach((k) => {
      const msg = buildIntentMessage(k as any);
      expect(msg.trim().length).toBeGreaterThan(0);
      expect(msg).not.toContain('undefined');
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. resolveIntent
// ─────────────────────────────────────────────────────────────────────────────

describe('resolveIntent', () => {
  it('produces a fully typed intent with all required fields', () => {
    const intent = resolveIntent('SEARCH_LISTINGS', 'entry', { priority: 1 });
    expect(intent.intent).toBe('SEARCH_LISTINGS');
    expect(intent.kind).toBe('entry');
    expect(intent.priority).toBe(1);
    expect(typeof intent.label).toBe('string');
    expect(typeof intent.message).toBe('string');
    expect(intent.label).not.toBe(intent.message);
  });

  it('applies context payload to message but not to label', () => {
    const intent = resolveIntent('GET_LISTING_DETAILS', 'contextual', {
      context: { listingId: 'abc' },
    });
    expect(intent.message).toContain('abc');
    expect(intent.label).not.toContain('abc');
  });

  it('accepts a custom id to guarantee deterministic test keys', () => {
    const intent = resolveIntent('SHOW_MY_BOOKINGS', 'entry', { id: 'my-stable-id' });
    expect(intent.id).toBe('my-stable-id');
  });

  it('marks confirmationHint correctly for mutation intents', () => {
    const intent = resolveIntent('CANCEL_BOOKING', 'contextual');
    expect(intent.confirmationHint).toBe(true);
  });

  it('does not set confirmationHint for read-only intents', () => {
    const intent = resolveIntent('SEARCH_LISTINGS', 'entry');
    expect(intent.confirmationHint).toBeFalsy();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. detectLastActionableResult
// ─────────────────────────────────────────────────────────────────────────────

describe('detectLastActionableResult', () => {
  it('returns null for empty message list', () => {
    expect(detectLastActionableResult([])).toBeNull();
  });

  it('ignores user messages', () => {
    const msgs = [makeUserMessage('hello')];
    expect(detectLastActionableResult(msgs)).toBeNull();
  });

  it('ignores assistant messages without toolResult metadata', () => {
    const msg: ChatbotMessage = {
      id: '1', role: 'assistant', content: 'Hi!', createdAt: new Date().toISOString(),
    };
    expect(detectLastActionableResult([msg])).toBeNull();
  });

  it('ignores non-success statuses (rate_limited, blocked, confirmation_required)', () => {
    const msgs = [
      makeAssistantMessage('search_listings', 'rate_limited', null),
      makeAssistantMessage('search_listings', 'policy_blocked', null),
      makeAssistantMessage('search_listings', 'confirmation_required', {}),
    ];
    expect(detectLastActionableResult(msgs)).toBeNull();
  });

  it('ignores unknown tool names', () => {
    const msgs = [makeAssistantMessage('some_future_tool', 'success', { data: [] })];
    expect(detectLastActionableResult(msgs)).toBeNull();
  });

  it('detects listing search results correctly', () => {
    const output = { data: [{ id: 'l1', title: 'Kayak' }] };
    const msgs = [makeAssistantMessage('search_listings', 'success', output)];
    const result = detectLastActionableResult(msgs);
    expect(result).not.toBeNull();
    expect(result!.category).toBe('listing_search_results');
    expect(result!.primaryId).toBe('l1');
    expect(result!.primaryTitle).toBe('Kayak');
    expect(result!.hasItems).toBe(true);
  });

  it('detects listing details correctly', () => {
    const output = { id: 'l2', title: 'Tent' };
    const msgs = [makeAssistantMessage('get_listing_details', 'success', output)];
    const result = detectLastActionableResult(msgs);
    expect(result!.category).toBe('listing_details');
    expect(result!.primaryId).toBe('l2');
  });

  it('detects booking list correctly', () => {
    const output = [{ id: 'bk1' }, { id: 'bk2' }];
    const msgs = [makeAssistantMessage('get_my_bookings', 'success', output)];
    const result = detectLastActionableResult(msgs);
    expect(result!.category).toBe('booking_list');
    expect(result!.primaryId).toBe('bk1');
  });

  it('detects host booking requests', () => {
    const msgs = [makeAssistantMessage('get_host_booking_requests', 'success', { requests: [{ id: 'r1' }] })];
    const result = detectLastActionableResult(msgs);
    expect(result!.category).toBe('host_booking_requests');
  });

  it('detects mutation_success for cancel tool', () => {
    const msgs = [makeAssistantMessage('cancel_my_booking_if_allowed', 'success', { message: 'Cancelled' })];
    const result = detectLastActionableResult(msgs);
    expect(result!.category).toBe('mutation_success');
  });

  it('returns the LAST actionable result when multiple exist', () => {
    const msgs = [
      makeAssistantMessage('search_listings', 'success', { data: [{ id: 'l1' }] }),
      makeUserMessage('tell me more'),
      makeAssistantMessage('get_listing_details', 'success', { id: 'l1', title: 'Kayak' }),
    ];
    const result = detectLastActionableResult(msgs);
    expect(result!.category).toBe('listing_details');
  });

  it('skips blocked messages and finds earlier actionable result', () => {
    const msgs = [
      makeAssistantMessage('search_listings', 'success', { data: [{ id: 'l1' }] }),
      makeAssistantMessage('cancel_my_booking_if_allowed', 'rate_limited', null),
    ];
    const result = detectLastActionableResult(msgs);
    // The rate_limited one is skipped; falls back to the search result
    expect(result!.category).toBe('listing_search_results');
  });

  it('handles output with empty array gracefully', () => {
    const msgs = [makeAssistantMessage('get_my_bookings', 'success', [])];
    const result = detectLastActionableResult(msgs);
    expect(result).not.toBeNull();
    expect(result!.hasItems).toBe(false);
    expect(result!.primaryId).toBeUndefined();
  });

  it('does not crash on null/undefined/malformed metadata', () => {
    const bad: ChatbotMessage[] = [
      { id: '1', role: 'assistant', content: 'oops', createdAt: '', metadata: null },
      { id: '2', role: 'assistant', content: 'oops', createdAt: '', metadata: { toolResult: null } },
      { id: '3', role: 'assistant', content: 'oops', createdAt: '', metadata: { toolName: undefined, toolResult: { status: 'success', output: {} } } },
    ];
    expect(() => detectLastActionableResult(bad)).not.toThrow();
    expect(detectLastActionableResult(bad)).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. getEntrySuggestions
// ─────────────────────────────────────────────────────────────────────────────

describe('getEntrySuggestions', () => {
  it('returns base intents when context is null', () => {
    const intents = getEntrySuggestions(null);
    expect(intents.length).toBeGreaterThan(0);
    const keys = intents.map((i) => i.intent);
    expect(keys).toContain('SEARCH_LISTINGS');
  });

  it('prioritizes listing intents on listing pages and embeds listingId', () => {
    const ctx: ChatbotContextPayload = {
      pageType: 'listing',
      listingId: 'l-99',
      listingTitle: 'Scooter',
    };
    const intents = getEntrySuggestions(ctx);
    expect(intents[0].intent).toBe('GET_LISTING_DETAILS');
    // Message must include the listing id
    expect(intents[0].message).toContain('l-99');
  });

  it('prioritizes booking intents on booking pages and embeds bookingId', () => {
    const ctx: ChatbotContextPayload = { pageType: 'booking', bookingId: 'bk-77' };
    const intents = getEntrySuggestions(ctx);
    expect(intents[0].intent).toBe('GET_BOOKING_DETAILS');
    expect(intents[0].message).toContain('bk-77');
  });

  it('prioritizes host intents on host-dashboard pages', () => {
    const ctx: ChatbotContextPayload = { pageType: 'host-dashboard', isHost: true };
    const intents = getEntrySuggestions(ctx);
    expect(intents[0].intent).toBe('GET_HOST_BOOKING_REQUESTS');
  });

  it('returns intents with kind = contextual on listing pages', () => {
    const ctx: ChatbotContextPayload = { pageType: 'listing', listingId: 'x' };
    const intents = getEntrySuggestions(ctx);
    expect(intents.every((i) => i.kind === 'contextual')).toBe(true);
  });

  it('produces unique ids across all intents in a set', () => {
    const intents = getEntrySuggestions(null);
    const ids = intents.map((i) => i.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('every entry has a non-empty label and message', () => {
    const pageTypes: ChatbotContextPayload['pageType'][] = [
      'listing', 'booking', 'host-dashboard', 'search', 'help', 'generic',
    ];
    pageTypes.forEach((pageType) => {
      const intents = getEntrySuggestions({ pageType });
      intents.forEach((i) => {
        expect(i.label.trim().length).toBeGreaterThan(0);
        expect(i.message.trim().length).toBeGreaterThan(0);
        expect(i.message).not.toContain('undefined');
      });
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 5. getNextStepIntents (guided flow)
// ─────────────────────────────────────────────────────────────────────────────

describe('getNextStepIntents', () => {
  function makeResult(
    category: ChatbotActionableResult['category'],
    primaryId?: string,
    primaryTitle?: string,
  ): ChatbotActionableResult {
    return { toolName: 'test_tool', category, output: {}, hasItems: !!primaryId, primaryId, primaryTitle };
  }

  it('suggests GET_LISTING_DETAILS as step 2 after listing search results when primaryId known', () => {
    const result = makeResult('listing_search_results', 'l1', 'Kayak');
    const intents = getNextStepIntents(result);
    expect(intents.some((i) => i.intent === 'GET_LISTING_DETAILS')).toBe(true);
    const detailIntent = intents.find((i) => i.intent === 'GET_LISTING_DETAILS');
    expect(detailIntent!.message).toContain('l1');
  });

  it('suggests search refinement after listing results', () => {
    const result = makeResult('listing_search_results');
    const intents = getNextStepIntents(result);
    expect(intents.some((i) => i.intent === 'SEARCH_LISTINGS')).toBe(true);
  });

  it('suggests CONTACT_HOST_HELP + similar after listing details', () => {
    const result = makeResult('listing_details', 'l2', 'Tent');
    const intents = getNextStepIntents(result);
    expect(intents.some((i) => i.intent === 'CONTACT_HOST_HELP')).toBe(true);
    expect(intents.some((i) => i.intent === 'SEARCH_LISTINGS_IN_CONTEXT')).toBe(true);
  });

  it('suggests booking detail dive as step 2 after booking list when primaryId known', () => {
    const result = makeResult('booking_list', 'bk1');
    const intents = getNextStepIntents(result);
    expect(intents.some((i) => i.intent === 'GET_BOOKING_DETAILS')).toBe(true);
    const detailIntent = intents.find((i) => i.intent === 'GET_BOOKING_DETAILS');
    expect(detailIntent!.message).toContain('bk1');
  });

  it('suggests CANCEL_BOOKING after booking_details (with confirmationHint)', () => {
    const result = makeResult('booking_details', 'bk2');
    const intents = getNextStepIntents(result);
    expect(intents.some((i) => i.intent === 'CANCEL_BOOKING')).toBe(true);
  });

  it('returns recovery/search intents after mutation_success', () => {
    const result = makeResult('mutation_success');
    const intents = getNextStepIntents(result);
    expect(intents.some((i) => i.kind === 'next_step')).toBe(true);
  });

  it('never produces "undefined" in any message', () => {
    const categories: ChatbotActionableResult['category'][] = [
      'listing_search_results', 'listing_details', 'booking_list',
      'booking_details', 'host_booking_requests', 'host_listings',
      'help_answer', 'mutation_success', 'unknown',
    ];
    categories.forEach((category) => {
      const intents = getNextStepIntents(makeResult(category, 'id-x', 'Title Y'));
      intents.forEach((i) => {
        expect(i.message).not.toContain('undefined');
      });
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 6. getRecoverySuggestions
// ─────────────────────────────────────────────────────────────────────────────

describe('getRecoverySuggestions', () => {
  it('returns safe read-only intents after rate_limited', () => {
    const intents = getRecoverySuggestions('rate_limited');
    expect(intents.every((i) => i.kind === 'recovery')).toBe(true);
    // Must not include mutation intents
    const hasMutation = intents.some((i) =>
      ['CANCEL_BOOKING', 'REQUEST_BOOKING_HELP', 'CONTACT_HOST_HELP'].includes(i.intent),
    );
    expect(hasMutation).toBe(false);
  });

  it('returns safe intents after cooldown_active', () => {
    const intents = getRecoverySuggestions('cooldown_active');
    expect(intents.length).toBeGreaterThan(0);
    expect(intents.every((i) => i.intent.startsWith('RECOVERY_') || i.intent.startsWith('SEARCH'))).toBe(true);
  });

  it('returns safe intents after trust_restricted', () => {
    const intents = getRecoverySuggestions('trust_restricted');
    expect(intents.length).toBeGreaterThan(0);
  });

  it('suggests book browsing after policy_blocked', () => {
    const intents = getRecoverySuggestions('policy_blocked');
    expect(intents.some((i) => i.intent === 'RECOVERY_BOOKINGS_SAFE' || i.intent === 'RECOVERY_SEARCH_SAFE')).toBe(true);
  });

  it('handles unknown status gracefully without crashing', () => {
    expect(() => getRecoverySuggestions('some_weird_status')).not.toThrow();
    const intents = getRecoverySuggestions('some_weird_status');
    expect(intents.length).toBeGreaterThan(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 7. intentsToSuggestions adapter
// ─────────────────────────────────────────────────────────────────────────────

describe('intentsToSuggestions', () => {
  it('maps intent fields to ChatbotSuggestion shape correctly', () => {
    const intents = resolveIntents([
      { key: 'SEARCH_LISTINGS', kind: 'entry', priority: 1 },
    ]);
    const suggestions = intentsToSuggestions(intents);
    expect(suggestions[0].id).toBe(intents[0].id);
    expect(suggestions[0].label).toBe(intents[0].label);
    expect(suggestions[0].message).toBe(intents[0].message);
    expect(suggestions[0].variant).toBeDefined();
  });

  it('returns empty array for empty input without crashing', () => {
    expect(intentsToSuggestions([])).toEqual([]);
  });
});
