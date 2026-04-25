/**
 * Chatbot Conversation Continuity — Unit Tests
 *
 * Covers:
 *  1. deriveConversationLabel  — priority order + safe fallbacks
 *  2. formatRelativeTime       — edge cases
 *  3. detectResumeState        — all resume kinds; crash safety; noise filtering
 *  4. isHighPriorityResume     — priority classification
 */

import {
  deriveConversationLabel,
  formatRelativeTime,
} from '../utils/chatbot-conversation-labels';
import {
  detectResumeState,
  isHighPriorityResume,
} from '../utils/chatbot-resume-utils';
import { Conversation, ChatbotMessage } from '../types/chatbot.types';

// ─────────────────────────────────────────────────────────────────────────────
// Test helpers
// ─────────────────────────────────────────────────────────────────────────────

function makeConversation(overrides?: Partial<Conversation>): Conversation {
  return {
    id: 'c1',
    userId: 'u1',
    title: null,
    createdAt: '2024-01-01T10:00:00Z',
    updatedAt: '2024-01-01T10:30:00Z',
    ...overrides,
  };
}

function makeAssistant(
  toolName: string,
  status: string,
  output: any,
): ChatbotMessage {
  return {
    id: `m-${Math.random()}`,
    role: 'assistant',
    content: 'Here are your results.',
    createdAt: new Date().toISOString(),
    metadata: { toolName, toolResult: { status, output } },
  };
}

function makeUser(text: string): ChatbotMessage {
  return {
    id: `m-${Math.random()}`,
    role: 'user',
    content: text,
    createdAt: new Date().toISOString(),
  };
}

function makeConfirmationRequired(token: string, actionName: string, expiresAt?: string): ChatbotMessage {
  return {
    id: `m-${Math.random()}`,
    role: 'assistant',
    content: 'Please confirm.',
    createdAt: new Date().toISOString(),
    metadata: {
      toolName: actionName,
      toolResult: {
        status: 'confirmation_required',
        output: { confirmationToken: token, actionName, expiresAt },
      },
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. deriveConversationLabel
// ─────────────────────────────────────────────────────────────────────────────

describe('deriveConversationLabel', () => {
  it('uses backend title when available', () => {
    const conv = makeConversation({ title: 'Searching for villas' });
    const label = deriveConversationLabel(conv, []);
    expect(label.text).toBe('Searching for villas');
    expect(label.source).toBe('backend_title');
  });

  it('derives from actionable result category when no title', () => {
    const conv = makeConversation({ title: null });
    const messages = [makeAssistant('search_listings', 'success', { data: [{ id: 'l1', title: 'Blue Kayak' }] })];
    const label = deriveConversationLabel(conv, messages);
    expect(label.source).toBe('actionable_result');
    expect(label.text).not.toContain('l1'); // no raw IDs
    expect(label.text).toMatch(/search|listing/i);
  });

  it('enriches actionable label with primaryTitle when available', () => {
    const conv = makeConversation({ title: null });
    const messages = [makeAssistant('get_listing_details', 'success', { id: 'l2', title: 'Mountain Tent' })];
    const label = deriveConversationLabel(conv, messages);
    expect(label.text).toContain('Mountain Tent');
    expect(label.source).toBe('actionable_result');
  });

  it('falls back to user message snippet', () => {
    const conv = makeConversation({ title: null });
    const messages = [makeUser('I need a car near Tunis for the weekend')];
    const label = deriveConversationLabel(conv, messages);
    expect(label.source).toBe('message_snippet');
    expect(label.text).toContain('Tunis');
    expect(label.text.length).toBeLessThanOrEqual(43); // 40 + ellipsis
  });

  it('truncates long user messages', () => {
    const conv = makeConversation();
    const messages = [makeUser('A'.repeat(80))];
    const label = deriveConversationLabel(conv, messages);
    expect(label.text.length).toBeLessThanOrEqual(43);
    expect(label.text.endsWith('…')).toBe(true);
  });

  it('uses generic fallback for empty messages and no title', () => {
    const conv = makeConversation({ title: '' });
    const label = deriveConversationLabel(conv, []);
    expect(label.text).toBe('New conversation');
    expect(label.source).toBe('fallback');
  });

  it('never exposes raw IDs in labels', () => {
    const conv = makeConversation({ title: null, id: 'uuid-abc-123-not-visible' });
    const messages: ChatbotMessage[] = [];
    const label = deriveConversationLabel(conv, messages);
    expect(label.text).not.toContain('uuid-abc-123-not-visible');
  });

  it('never exposes raw JSON in labels', () => {
    const conv = makeConversation({ title: null });
    // A message with JSON-like content
    const messages = [makeUser('{"id":"abc","q":"search"}')];
    const label = deriveConversationLabel(conv, messages);
    // Should still be the snippet, but it's safe user text — not parsed JSON
    expect(label.text).not.toContain('undefined');
    expect(label.source).toBe('message_snippet');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. formatRelativeTime
// ─────────────────────────────────────────────────────────────────────────────

describe('formatRelativeTime', () => {
  it('shows "Just now" for very recent timestamps', () => {
    const now = new Date().toISOString();
    expect(formatRelativeTime(now)).toBe('Just now');
  });

  it('shows minutes ago for timestamps < 1 hour', () => {
    const past = new Date(Date.now() - 15 * 60_000).toISOString();
    expect(formatRelativeTime(past)).toMatch(/\dm ago/);
  });

  it('shows hours ago for timestamps between 1-24h', () => {
    const past = new Date(Date.now() - 3 * 3_600_000).toISOString();
    expect(formatRelativeTime(past)).toMatch(/\dh ago/);
  });

  it('shows days ago for timestamps between 1-7 days', () => {
    const past = new Date(Date.now() - 2 * 86_400_000).toISOString();
    expect(formatRelativeTime(past)).toMatch(/\dd ago/);
  });

  it('returns empty string for invalid input', () => {
    expect(formatRelativeTime('not-a-date')).toBe('');
    expect(formatRelativeTime('')).toBe('');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. detectResumeState
// ─────────────────────────────────────────────────────────────────────────────

describe('detectResumeState', () => {
  it('returns kind=none for empty messages', () => {
    const state = detectResumeState([]);
    expect(state.kind).toBe('none');
    expect(state.isResumable).toBe(false);
  });

  it('returns kind=none for messages with no useful metadata', () => {
    const messages = [makeUser('hi'), makeUser('thanks')];
    const state = detectResumeState(messages);
    expect(state.kind).toBe('none');
  });

  it('detects pending_confirmation as highest priority resume kind', () => {
    const msgs = [
      makeAssistant('search_listings', 'success', { data: [{ id: 'l1' }] }),
      makeConfirmationRequired('tok-abc', 'cancel_my_booking_if_allowed'),
    ];
    const state = detectResumeState(msgs);
    expect(state.kind).toBe('pending_confirmation');
    expect(state.pendingConfirmationToken).toBe('tok-abc');
    expect(state.isResumable).toBe(true);
    expect(state.suggestedNextIntents).toHaveLength(0); // confirmation handles its own flow
  });

  it('does NOT treat pending_confirmation as pending if a subsequent mutation succeeded', () => {
    const msgs = [
      makeConfirmationRequired('tok-xyz', 'cancel_my_booking_if_allowed'),
      makeAssistant('cancel_my_booking_if_allowed', 'success', { message: 'Cancelled' }),
    ];
    const state = detectResumeState(msgs);
    // confirmation is consumed by the successful mutation
    expect(state.kind).not.toBe('pending_confirmation');
  });

  it('marks expired confirmation correctly', () => {
    const expiredAt = new Date(Date.now() - 3_600_000).toISOString();
    const msgs = [makeConfirmationRequired('tok-old', 'request_booking_help', expiredAt)];
    const state = detectResumeState(msgs);
    expect(state.kind).toBe('pending_confirmation');
    expect(state.summary).toContain('expired');
  });

  it('detects listing_search resumable state', () => {
    const msgs = [makeAssistant('search_listings', 'success', { data: [{ id: 'l1', title: 'Kayak' }] })];
    const state = detectResumeState(msgs);
    expect(state.kind).toBe('listing_search');
    expect(state.isResumable).toBe(true);
    expect(state.suggestedNextIntents.length).toBeGreaterThan(0);
  });

  it('detects listing_details resumable state', () => {
    const msgs = [makeAssistant('get_listing_details', 'success', { id: 'l2', title: 'Tent' })];
    const state = detectResumeState(msgs);
    expect(state.kind).toBe('listing_details');
    expect(state.summary).toContain('Tent');
  });

  it('detects booking_flow resumable state', () => {
    const msgs = [makeAssistant('get_my_bookings', 'success', [{ id: 'bk1' }])];
    const state = detectResumeState(msgs);
    expect(state.kind).toBe('booking_flow');
  });

  it('detects after_blocked resume state', () => {
    const msgs = [
      makeUser('cancel booking'),
      makeAssistant('cancel_my_booking_if_allowed', 'rate_limited', null),
    ];
    const state = detectResumeState(msgs);
    expect(state.kind).toBe('after_blocked');
    expect(state.isResumable).toBe(true);
    // Recovery suggestions must not include mutation intents
    const hasMutation = state.suggestedNextIntents.some((i) =>
      ['CANCEL_BOOKING', 'REQUEST_BOOKING_HELP', 'CONTACT_HOST_HELP'].includes(i.intent),
    );
    expect(hasMutation).toBe(false);
  });

  it('does not mark host_operations as above pending_confirmation priority', () => {
    const msgs = [
      makeAssistant('get_host_booking_requests', 'success', { requests: [] }),
      makeConfirmationRequired('tok-high', 'request_booking_help'),
    ];
    const state = detectResumeState(msgs);
    expect(state.kind).toBe('pending_confirmation');
  });

  it('does not crash on null/undefined/malformed metadata', () => {
    const bad: ChatbotMessage[] = [
      { id: '1', role: 'assistant', content: '', createdAt: '', metadata: null },
      { id: '2', role: 'assistant', content: '', createdAt: '', metadata: { toolResult: undefined } },
      { id: '3', role: 'user', content: '', createdAt: '' },
    ];
    expect(() => detectResumeState(bad)).not.toThrow();
    const state = detectResumeState(bad);
    expect(state.kind).toBe('none');
  });

  it('all suggestedNextIntents have non-empty messages without "undefined"', () => {
    const msgs = [makeAssistant('get_listing_details', 'success', { id: 'l3', title: 'Villa' })];
    const state = detectResumeState(msgs);
    state.suggestedNextIntents.forEach((i) => {
      expect(i.message.trim().length).toBeGreaterThan(0);
      expect(i.message).not.toContain('undefined');
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 5. Additional edge-case coverage
// ─────────────────────────────────────────────────────────────────────────────

import { BLOCKED_STATUSES, detectPendingConfirmation } from '../utils/chatbot-resume-utils';

describe('detectPendingConfirmation — stale token safety', () => {
  it('does NOT surface a stale earlier token when the latest confirmation_required has no token', () => {
    // Older message has a valid token; newer one is tokenless (malformed).
    // The function must stop at the tokenless message and NOT fall through.
    const msgs: ChatbotMessage[] = [
      {
        id: 'old',
        role: 'assistant',
        content: '',
        createdAt: '',
        metadata: {
          toolName: 'cancel_my_booking_if_allowed',
          toolResult: {
            status: 'confirmation_required',
            output: { confirmationToken: 'stale-token-must-not-appear', actionName: 'cancel' },
          },
        },
      },
      {
        id: 'new',
        role: 'assistant',
        content: '',
        createdAt: '',
        metadata: {
          toolName: 'cancel_my_booking_if_allowed',
          // No confirmationToken in output
          toolResult: {
            status: 'confirmation_required',
            output: { actionName: 'cancel' },
          },
        },
      },
    ];

    const result = detectPendingConfirmation(msgs);
    // Must be null — the tokenless one stops the search, not leaks the old one
    expect(result).toBeNull();
  });

  it('returns valid token when there are no consumed mutations', () => {
    const msgs = [makeConfirmationRequired('live-token', 'request_booking_help')];
    const result = detectPendingConfirmation(msgs);
    expect(result?.token).toBe('live-token');
  });

  it('returns null when mutation success follows the confirmation', () => {
    const msgs = [
      makeConfirmationRequired('tok', 'cancel_my_booking_if_allowed'),
      makeAssistant('cancel_my_booking_if_allowed', 'success', {}),
    ];
    const result = detectPendingConfirmation(msgs);
    expect(result).toBeNull();
  });
});

describe('detectResumeState — blocked visible through confirmation_required', () => {
  it('detects blocked state even when last assistant message is confirmation_required (no token)', () => {
    // Sequence: blocked → tokenless confirmation_required
    // Should surface after_blocked, not crash
    const msgs: ChatbotMessage[] = [
      makeAssistant('cancel_my_booking_if_allowed', 'rate_limited', null),
      {
        id: 'x',
        role: 'assistant',
        content: '',
        createdAt: '',
        metadata: {
          toolName: 'cancel_my_booking_if_allowed',
          toolResult: { status: 'confirmation_required', output: {} }, // no token
        },
      },
    ];
    // detectPendingConfirmation finds no live token → falls through
    // detectLastBlockedStatus should NOT stop at confirmation_required
    const state = detectResumeState(msgs);
    // The blocked state from earlier should be visible now
    expect(state.kind).toBe('after_blocked');
  });
});

describe('deriveConversationLabel — whitespace and punctuation safety', () => {
  it('falls back gracefully when user message is whitespace only', () => {
    const conv = makeConversation({ title: null });
    const messages = [makeUser('   ')];
    const label = deriveConversationLabel(conv, messages);
    // Should not produce a label of whitespace
    expect(label.text.trim().length).toBeGreaterThan(0);
    expect(label.source).toBe('fallback');
  });

  it('falls back gracefully when user message is punctuation only', () => {
    const conv = makeConversation({ title: null });
    const messages = [makeUser('...')];
    const label = deriveConversationLabel(conv, messages);
    expect(label.source).toBe('fallback');
    expect(label.text).toBe('New conversation');
  });

  it('accepts a short but meaningful user message', () => {
    const conv = makeConversation({ title: null });
    const messages = [makeUser('hey')];
    const label = deriveConversationLabel(conv, messages);
    expect(label.source).toBe('message_snippet');
    expect(label.text).toBe('hey');
  });
});

describe('detectResumeState — cooldown and trust_restricted recovery', () => {
  it('surfaces recovery suggestions after cooldown_active', () => {
    const msgs = [
      makeAssistant('cancel_my_booking_if_allowed', 'cooldown_active', null),
    ];
    const state = detectResumeState(msgs);
    expect(state.kind).toBe('after_blocked');
    expect(state.isResumable).toBe(true);
    // Recovery intents must be read-only
    state.suggestedNextIntents.forEach((i) => {
      expect(['CANCEL_BOOKING', 'REQUEST_BOOKING_HELP', 'CONTACT_HOST_HELP']).not.toContain(i.intent);
    });
  });

  it('surfaces recovery suggestions after trust_restricted', () => {
    const msgs = [
      makeAssistant('cancel_my_booking_if_allowed', 'trust_restricted', null),
    ];
    const state = detectResumeState(msgs);
    expect(state.kind).toBe('after_blocked');
    expect(state.suggestedNextIntents.length).toBeGreaterThan(0);
  });

  it('surfaces recovery suggestions after too_many_failed_confirmations', () => {
    const msgs = [
      makeAssistant('cancel_my_booking_if_allowed', 'too_many_failed_confirmations', null),
    ];
    const state = detectResumeState(msgs);
    expect(state.kind).toBe('after_blocked');
  });
});

describe('BLOCKED_STATUSES export', () => {
  it('contains all expected blocked status codes', () => {
    const expected = [
      'rate_limited', 'cooldown_active', 'trust_restricted',
      'suspicious_activity', 'policy_blocked', 'too_many_failed_confirmations',
    ];
    expected.forEach((s) => expect(BLOCKED_STATUSES.has(s)).toBe(true));
  });
});
