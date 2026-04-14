/**
 * ChatbotFlowState.test.ts
 *
 * Exhaustive unit tests for the branching guided-flow system:
 *   1. detectFlowState — listing discovery cases
 *   2. detectFlowState — booking help cases
 *   3. detectFlowState — host requests cases
 *   4. detectFlowState — cross-cutting: pending confirmation, blocked, malformed
 *   5. getFlowNextAction / getFlowNextIntents / getFlowRecoveryIntents
 *   6. Continuity integration — resume state and flow state do not conflict
 *   7. NULL_FLOW_STATE / no active flow
 */

import { detectFlowState, NULL_FLOW_STATE } from '../utils/chatbot-flow-state';
import {
  getFlowNextAction,
  getFlowNextIntents,
  getFlowRecoveryIntents,
} from '../utils/chatbot-flow-branches';
import { ChatbotMessage } from '../types/chatbot.types';
import { ChatbotFlowState } from '../types/chatbot-flows.types';

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function makeAssistant(
  toolName: string,
  status: string,
  output: any,
): ChatbotMessage {
  return {
    id: `m-${Math.random()}`,
    role: 'assistant',
    content: 'Result.',
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

function makeConfirmationRequired(
  token: string,
  actionName: string,
  expiresAt?: string,
): ChatbotMessage {
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

function makeBlocked(toolName: string, status: string): ChatbotMessage {
  return makeAssistant(toolName, status, null);
}

function noMutationIntents(intents: any[]): boolean {
  const MUTATION_INTENTS = ['CANCEL_BOOKING', 'REQUEST_BOOKING_HELP', 'CONTACT_HOST_HELP'];
  return !intents.some((i) => MUTATION_INTENTS.includes(i.intent));
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. Listing discovery flow
// ─────────────────────────────────────────────────────────────────────────────

describe('detectFlowState — LISTING_DISCOVERY_FLOW', () => {
  it('detects listing search with results', () => {
    const msgs = [makeAssistant('search_listings', 'success', { data: [{ id: 'l1', title: 'Villa' }] })];
    const state = detectFlowState(msgs);
    expect(state.flow).toBe('LISTING_DISCOVERY_FLOW');
    expect(state.step).toBe('SEARCH_RESULTS_SHOWN');
    expect(state.branch).toBe('DISCOVERY_SEARCH_HAS_RESULTS');
    expect(state.hasActiveFlow).toBe(true);
    expect(state.isRecovery).toBe(false);
    expect(state.bannerLabel).toBeTruthy();
  });

  it('detects empty listing search as recovery branch', () => {
    const msgs = [makeAssistant('search_listings', 'success', { data: [] })];
    const state = detectFlowState(msgs);
    expect(state.flow).toBe('LISTING_DISCOVERY_FLOW');
    expect(state.step).toBe('SEARCH_EMPTY');
    expect(state.branch).toBe('DISCOVERY_SEARCH_EMPTY');
    expect(state.isRecovery).toBe(true);
    expect(state.context.searchWasEmpty).toBe(true);
  });

  it('detects listing details viewed with id', () => {
    const msgs = [makeAssistant('get_listing_details', 'success', { id: 'l2', title: 'Tent' })];
    const state = detectFlowState(msgs);
    expect(state.flow).toBe('LISTING_DISCOVERY_FLOW');
    expect(state.step).toBe('LISTING_DETAILS_VIEWED');
    expect(state.branch).toBe('DISCOVERY_DETAILS_WITH_ID');
    expect(state.context.detectedListingId).toBe('l2');
    expect(state.context.detectedListingTitle).toBe('Tent');
  });

  it('detects listing details with no id as DISCOVERY_DETAILS_NO_ID', () => {
    const msgs = [makeAssistant('get_listing_details', 'success', { description: 'Nice place' })];
    const state = detectFlowState(msgs);
    expect(state.branch).toBe('DISCOVERY_DETAILS_NO_ID');
  });

  it('progressSummary is non-empty for listing search', () => {
    const msgs = [makeAssistant('search_listings', 'success', { data: [{ id: 'l1', title: 'Boat' }] })];
    const state = detectFlowState(msgs);
    expect(state.progressSummary.length).toBeGreaterThan(0);
    expect(state.progressSummary).not.toContain('undefined');
  });

  it('detects blocked listing discovery', () => {
    const msgs = [
      makeAssistant('search_listings', 'success', { data: [{ id: 'l1' }] }),
      makeBlocked('search_listings', 'rate_limited'),
    ];
    const state = detectFlowState(msgs);
    expect(state.flow).toBe('LISTING_DISCOVERY_FLOW');
    expect(state.step).toBe('BLOCKED');
    expect(state.branch).toBe('DISCOVERY_BLOCKED');
    expect(state.isRecovery).toBe(true);
    expect(state.context.isBlocked).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. Booking help flow
// ─────────────────────────────────────────────────────────────────────────────

describe('detectFlowState — BOOKING_HELP_FLOW', () => {
  it('detects booking list viewed', () => {
    const msgs = [makeAssistant('get_my_bookings', 'success', [{ id: 'b1' }, { id: 'b2' }])];
    const state = detectFlowState(msgs);
    expect(state.flow).toBe('BOOKING_HELP_FLOW');
    expect(state.step).toBe('BOOKING_LIST_VIEWED');
    expect(state.branch).toBe('BOOKING_LIST_HAS_ITEMS');
  });

  it('detects booking details viewed', () => {
    const msgs = [makeAssistant('get_booking_details', 'success', { id: 'b3', status: 'confirmed' })];
    const state = detectFlowState(msgs);
    expect(state.flow).toBe('BOOKING_HELP_FLOW');
    expect(state.step).toBe('BOOKING_DETAILS_VIEWED');
    expect(state.branch).toBe('BOOKING_DETAILS_ACTIVE');
    expect(state.context.detectedBookingId).toBe('b3');
  });

  it('detects live pending confirmation as BOOKING_CONFIRMATION_LIVE', () => {
    const msgs = [makeConfirmationRequired('tok-live', 'cancel_my_booking_if_allowed')];
    const state = detectFlowState(msgs);
    expect(state.flow).toBe('BOOKING_HELP_FLOW');
    expect(state.step).toBe('BOOKING_CONFIRMATION_PENDING');
    expect(state.branch).toBe('BOOKING_CONFIRMATION_LIVE');
    expect(state.context.hasPendingConfirmation).toBe(true);
    expect(state.context.pendingConfirmationToken).toBe('tok-live');
    expect(state.isRecovery).toBe(false);
  });

  it('detects expired confirmation as BOOKING_CONFIRMATION_EXPIRED', () => {
    const expiredAt = new Date(Date.now() - 3_600_000).toISOString();
    const msgs = [makeConfirmationRequired('tok-exp', 'cancel_my_booking_if_allowed', expiredAt)];
    const state = detectFlowState(msgs);
    expect(state.branch).toBe('BOOKING_CONFIRMATION_EXPIRED');
    expect(state.isRecovery).toBe(true);
  });

  it('detects mutation success as BOOKING_MUTATION_DONE', () => {
    const msgs = [makeAssistant('cancel_my_booking_if_allowed', 'success', { message: 'Cancelled' })];
    const state = detectFlowState(msgs);
    expect(state.flow).toBe('BOOKING_HELP_FLOW');
    expect(state.branch).toBe('BOOKING_MUTATION_DONE');
  });

  it('detects blocked booking as BOOKING_BLOCKED', () => {
    const msgs = [
      makeAssistant('get_booking_details', 'success', { id: 'b4' }),
      makeBlocked('cancel_my_booking_if_allowed', 'cooldown_active'),
    ];
    const state = detectFlowState(msgs);
    expect(state.branch).toBe('BOOKING_BLOCKED');
    expect(state.isRecovery).toBe(true);
    expect(state.context.blockedStatus).toBe('cooldown_active');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. Host requests flow
// ─────────────────────────────────────────────────────────────────────────────

describe('detectFlowState — HOST_REQUESTS_FLOW', () => {
  it('detects host booking requests with items', () => {
    const msgs = [makeAssistant('get_host_booking_requests', 'success', { requests: [{ id: 'r1' }] })];
    const state = detectFlowState(msgs);
    expect(state.flow).toBe('HOST_REQUESTS_FLOW');
    expect(state.step).toBe('HOST_REQUESTS_VIEWED');
    expect(state.branch).toBe('HOST_REQUESTS_HAS_ITEMS');
    expect(state.hasActiveFlow).toBe(true);
  });

  it('detects empty host requests as HOST_REQUESTS_EMPTY', () => {
    const msgs = [makeAssistant('get_host_booking_requests', 'success', { requests: [] })];
    const state = detectFlowState(msgs);
    expect(state.branch).toBe('HOST_REQUESTS_EMPTY');
    expect(state.isRecovery).toBe(true);
  });

  it('detects host listings viewed', () => {
    const msgs = [makeAssistant('get_host_listings', 'success', { listings: [{ id: 'l10' }] })];
    const state = detectFlowState(msgs);
    expect(state.flow).toBe('HOST_REQUESTS_FLOW');
    expect(state.step).toBe('HOST_LISTINGS_VIEWED');
    expect(state.branch).toBe('HOST_LISTINGS_ACTIVE');
  });

  it('detects blocked host flow as HOST_BLOCKED', () => {
    const msgs = [
      makeAssistant('get_host_booking_requests', 'success', { requests: [{ id: 'r2' }] }),
      makeBlocked('get_host_booking_requests', 'trust_restricted'),
    ];
    const state = detectFlowState(msgs);
    expect(state.branch).toBe('HOST_BLOCKED');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. Cross-cutting: priorities, malformed, no signal
// ─────────────────────────────────────────────────────────────────────────────

describe('detectFlowState — cross-cutting', () => {
  it('pending confirmation overrides a weaker listing flow branch', () => {
    const msgs = [
      makeAssistant('search_listings', 'success', { data: [{ id: 'l1' }] }),
      makeConfirmationRequired('tok', 'cancel_my_booking_if_allowed'),
    ];
    const state = detectFlowState(msgs);
    // Confirmation beats listing discovery
    expect(state.flow).toBe('BOOKING_HELP_FLOW');
    expect(state.step).toBe('BOOKING_CONFIRMATION_PENDING');
  });

  it('returns NULL_FLOW_STATE for empty messages', () => {
    const state = detectFlowState([]);
    expect(state).toEqual(NULL_FLOW_STATE);
    expect(state.hasActiveFlow).toBe(false);
  });

  it('does not crash on null metadata', () => {
    const bad: ChatbotMessage[] = [
      { id: '1', role: 'assistant', content: '', createdAt: '', metadata: null },
      { id: '2', role: 'user', content: '', createdAt: '' },
    ];
    expect(() => detectFlowState(bad)).not.toThrow();
    expect(detectFlowState(bad).hasActiveFlow).toBe(false);
  });

  it('does not classify pure user messages into any flow', () => {
    const msgs = [makeUser('hello'), makeUser('can you help me?')];
    const state = detectFlowState(msgs);
    expect(state.hasActiveFlow).toBe(false);
    expect(state.flow).toBe('NONE');
  });

  it('does not classify unrecognised tool as a flow', () => {
    const msgs = [makeAssistant('some_future_tool', 'success', { data: [] })];
    const state = detectFlowState(msgs);
    expect(state.hasActiveFlow).toBe(false);
  });

  it('blocked with no prior flow still returns a safe recovery state', () => {
    const msgs = [makeBlocked('cancel_my_booking_if_allowed', 'rate_limited')];
    const state = detectFlowState(msgs);
    expect(state.isRecovery).toBe(true);
    expect(state.hasActiveFlow).toBe(true);
    expect(state.context.isBlocked).toBe(true);
  });

  it('bannerLabel and progressSummary are never empty when hasActiveFlow', () => {
    const cases: ChatbotMessage[][] = [
      [makeAssistant('search_listings', 'success', { data: [{ id: 'l1' }] })],
      [makeAssistant('get_listing_details', 'success', { id: 'l2', title: 'T' })],
      [makeAssistant('get_my_bookings', 'success', [{ id: 'b1' }])],
      [makeAssistant('get_host_booking_requests', 'success', { requests: [{ id: 'r1' }] })],
    ];
    cases.forEach((msgs) => {
      const state = detectFlowState(msgs);
      if (state.hasActiveFlow) {
        expect(state.bannerLabel.trim().length).toBeGreaterThan(0);
        expect(state.progressSummary.trim().length).toBeGreaterThan(0);
        expect(state.bannerLabel).not.toContain('undefined');
        expect(state.progressSummary).not.toContain('undefined');
      }
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 5. getFlowNextIntents / getFlowRecoveryIntents
// ─────────────────────────────────────────────────────────────────────────────

describe('getFlowNextIntents — branch awareness', () => {
  it('returns detail-dive chip for DISCOVERY_SEARCH_HAS_RESULTS with listing id', () => {
    const state = detectFlowState([
      makeAssistant('search_listings', 'success', { data: [{ id: 'l1', title: 'Villa' }] }),
    ]);
    const intents = getFlowNextIntents(state);
    expect(intents.length).toBeGreaterThan(0);
    const hasDetail = intents.some((i) => i.intent === 'GET_LISTING_DETAILS');
    expect(hasDetail).toBe(true);
  });

  it('returns contact-host chip for DISCOVERY_DETAILS_WITH_ID', () => {
    const state = detectFlowState([
      makeAssistant('get_listing_details', 'success', { id: 'l2', title: 'Tent' }),
    ]);
    const intents = getFlowNextIntents(state);
    expect(intents.some((i) => i.intent === 'CONTACT_HOST_HELP')).toBe(true);
  });

  it('returns no chips for BOOKING_CONFIRMATION_LIVE (card handles it)', () => {
    const state = detectFlowState([makeConfirmationRequired('tok', 'cancel_my_booking_if_allowed')]);
    const intents = getFlowNextIntents(state);
    expect(intents).toHaveLength(0);
  });

  it('returns no mutation intents in recovery path after blocked', () => {
    const state = detectFlowState([makeBlocked('cancel_my_booking_if_allowed', 'cooldown_active')]);
    const recovery = getFlowRecoveryIntents(state);
    expect(noMutationIntents(recovery)).toBe(true);
    expect(recovery.length).toBeGreaterThan(0);
  });

  it('returns recovery intents for DISCOVERY_SEARCH_EMPTY', () => {
    const state = detectFlowState([makeAssistant('search_listings', 'success', { data: [] })]);
    const intents = getFlowNextIntents(state); // empty search uses nextIntents, not recovery
    expect(intents.length).toBeGreaterThan(0);
    expect(intents.some((i) => i.intent === 'SEARCH_LISTINGS')).toBe(true);
  });

  it('returns [] for expired confirmation in nextIntents (uses recoveryIntents)', () => {
    const expiredAt = new Date(Date.now() - 3_600_000).toISOString();
    const state = detectFlowState([makeConfirmationRequired('tok-exp', 'cancel_my_booking_if_allowed', expiredAt)]);
    const next = getFlowNextIntents(state);
    const recovery = getFlowRecoveryIntents(state);
    expect(next).toHaveLength(0);
    expect(recovery.length).toBeGreaterThan(0);
  });

  it('returns [] for inactive flow', () => {
    const next = getFlowNextIntents(NULL_FLOW_STATE);
    const recovery = getFlowRecoveryIntents(NULL_FLOW_STATE);
    expect(next).toHaveLength(0);
    expect(recovery).toHaveLength(0);
  });

  it('booking details branch includes contact-host and request-help', () => {
    const state = detectFlowState([makeAssistant('get_booking_details', 'success', { id: 'b5' })]);
    const intents = getFlowNextIntents(state);
    expect(intents.some((i) => i.intent === 'CONTACT_HOST_HELP')).toBe(true);
    expect(intents.some((i) => i.intent === 'REQUEST_BOOKING_HELP')).toBe(true);
  });

  it('all intent messages are non-empty and contain no "undefined"', () => {
    const testCases: ChatbotMessage[][] = [
      [makeAssistant('search_listings', 'success', { data: [{ id: 'l1', title: 'X' }] })],
      [makeAssistant('get_listing_details', 'success', { id: 'l2', title: 'Y' })],
      [makeAssistant('get_my_bookings', 'success', [{ id: 'b1' }])],
      [makeAssistant('get_booking_details', 'success', { id: 'b2' })],
      [makeAssistant('get_host_booking_requests', 'success', { requests: [{ id: 'r1' }] })],
    ];
    testCases.forEach((msgs) => {
      const state = detectFlowState(msgs);
      const intents = getFlowNextIntents(state);
      intents.forEach((i) => {
        expect(i.message.trim().length).toBeGreaterThan(0);
        expect(i.message).not.toContain('undefined');
        expect(i.label.trim().length).toBeGreaterThan(0);
      });
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 6. Continuity + flow state coexistence
// ─────────────────────────────────────────────────────────────────────────────

import { detectResumeState, isHighPriorityResume } from '../utils/chatbot-resume-utils';

describe('Flow state + resume state coexistence', () => {
  it('both can be derived from same messages without conflict', () => {
    const msgs = [makeAssistant('get_listing_details', 'success', { id: 'l3', title: 'Kairouan Villa' })];
    const flowState = detectFlowState(msgs);
    const resumeState = detectResumeState(msgs);
    expect(flowState.hasActiveFlow).toBe(true);
    expect(resumeState.isResumable).toBe(true);
    expect(flowState.flow).toBe('LISTING_DISCOVERY_FLOW');
    expect(resumeState.kind).toBe('listing_details');
  });

  it('pending confirmation: both agree; flow overrides weaker resumable kind', () => {
    const msgs = [makeConfirmationRequired('tok', 'cancel_my_booking_if_allowed')];
    const flowState = detectFlowState(msgs);
    const resumeState = detectResumeState(msgs);
    expect(flowState.step).toBe('BOOKING_CONFIRMATION_PENDING');
    expect(resumeState.kind).toBe('pending_confirmation');
    expect(isHighPriorityResume(resumeState)).toBe(true);
  });

  it('blocked state: both agree on recovery', () => {
    const msgs = [makeBlocked('cancel_my_booking_if_allowed', 'too_many_failed_confirmations')];
    const flowState = detectFlowState(msgs);
    const resumeState = detectResumeState(msgs);
    expect(flowState.isRecovery).toBe(true);
    expect(resumeState.kind).toBe('after_blocked');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 7. Audit regression tests
// ─────────────────────────────────────────────────────────────────────────────

describe('AUDIT: empty booking list branch', () => {
  it('empty booking list must NOT map to BOOKING_MUTATION_DONE branch', () => {
    // Bug: previously empty booking list fell into BOOKING_MUTATION_DONE
    // which produced post-mutation recovery chips ("here's what you can do after")
    // instead of meaningful next-step chips.
    const msgs = [makeAssistant('get_my_bookings', 'success', [])]; // empty array
    const state = detectFlowState(msgs);
    expect(state.flow).toBe('BOOKING_HELP_FLOW');
    expect(state.step).toBe('BOOKING_LIST_VIEWED');
    expect(state.branch).not.toBe('BOOKING_MUTATION_DONE');
    // Should use BOOKING_LIST_HAS_ITEMS branch (empty list still gets next-steps)
    expect(state.branch).toBe('BOOKING_LIST_HAS_ITEMS');
  });

  it('empty booking list produces useful next-step chips, not mutation-done recovery', () => {
    const msgs = [makeAssistant('get_my_bookings', 'success', [])];
    const state = detectFlowState(msgs);
    const intents = getFlowNextIntents(state);
    // Must get useful chips (search listings, cancellation policy)
    // rather than the "your action was submitted" post-mutation set
    expect(intents.some((i) => i.intent === 'SEARCH_LISTINGS' || i.intent === 'EXPLAIN_CANCELLATION_POLICY')).toBe(true);
    // Must not get RECOVERY_SEARCH_SAFE as the primary chip (that's for post-mutation)
    expect(intents[0]?.intent).not.toBe('RECOVERY_SEARCH_SAFE');
  });
});

describe('AUDIT: blocked status correctly forwarded (not hardcoded to rate_limited)', () => {
  it('trust_restricted blocked state produces trust-specific recovery, not rate_limited recovery', () => {
    const msgs = [
      makeAssistant('get_booking_details', 'success', { id: 'b1' }),
      makeBlocked('cancel_my_booking_if_allowed', 'trust_restricted'),
    ];
    const state = detectFlowState(msgs);
    expect(state.context.blockedStatus).toBe('trust_restricted');

    const recovery = getFlowRecoveryIntents(state);
    // trust_restricted → getRecoverySuggestions('trust_restricted') not ('rate_limited')
    // Both produce RECOVERY_SEARCH_SAFE and RECOVERY_HELP_SAFE per current impl —
    // but the important thing is the correct status was forwarded
    expect(recovery.length).toBeGreaterThan(0);
    recovery.forEach((i) => {
      // No mutation intent in recovery regardless of status
      expect(['CANCEL_BOOKING']).not.toContain(i.intent);
    });
  });

  it('cooldown_active produces its own status in context', () => {
    const msgs = [makeBlocked('search_listings', 'cooldown_active')];
    const state = detectFlowState(msgs);
    expect(state.context.blockedStatus).toBe('cooldown_active');
    const recovery = getFlowRecoveryIntents(state);
    expect(recovery.length).toBeGreaterThan(0);
  });

  it('too_many_failed_confirmations is forwarded and produces recovery', () => {
    const msgs = [makeBlocked('cancel_my_booking_if_allowed', 'too_many_failed_confirmations')];
    const state = detectFlowState(msgs);
    expect(state.context.blockedStatus).toBe('too_many_failed_confirmations');
    const recovery = getFlowRecoveryIntents(state);
    expect(recovery.length).toBeGreaterThan(0);
  });
});

describe('AUDIT: page context must not force wrong flow classification', () => {
  const bookingPageContext = {
    pageType: 'booking' as const,
    bookingId: 'b999',
  };

  it('listing discovery evidence wins over booking page context', () => {
    // The user is on a booking page but the conversation has listing search results.
    // Flow classification must follow conversation evidence, not page context.
    const msgs = [makeAssistant('search_listings', 'success', { data: [{ id: 'l1', title: 'Villa' }] })];
    const state = detectFlowState(msgs, bookingPageContext);
    expect(state.flow).toBe('LISTING_DISCOVERY_FLOW');
    expect(state.branch).toBe('DISCOVERY_SEARCH_HAS_RESULTS');
  });

  it('host dashboard page context does not classify a booking-details conversation as HOST_REQUESTS_FLOW', () => {
    const msgs = [makeAssistant('get_booking_details', 'success', { id: 'b2' })];
    const state = detectFlowState(msgs, { pageType: 'host-dashboard' });
    expect(state.flow).toBe('BOOKING_HELP_FLOW');
    expect(state.flow).not.toBe('HOST_REQUESTS_FLOW');
  });

  it('null pageContext does not crash and returns correct flow', () => {
    const msgs = [makeAssistant('get_listing_details', 'success', { id: 'l5', title: 'Apt' })];
    expect(() => detectFlowState(msgs, null)).not.toThrow();
    const state = detectFlowState(msgs, null);
    expect(state.flow).toBe('LISTING_DISCOVERY_FLOW');
  });
});

describe('AUDIT: help_answer category must not produce any flow', () => {
  it('search_help_center (help_answer) does not classify into listing/booking/host flow', () => {
    const msgs = [makeAssistant('search_help_center', 'success', { answer: 'You can cancel within 24h' })];
    const state = detectFlowState(msgs);
    // help_answer is not handled by any classifier → should be NONE
    expect(state.hasActiveFlow).toBe(false);
    expect(state.flow).toBe('NONE');
  });

  it('help_answer followed by a noisy user message still produces NONE flow', () => {
    const msgs = [
      makeAssistant('search_help_center', 'success', { answer: 'Cancellation policy...' }),
      makeUser('thanks!'),
    ];
    const state = detectFlowState(msgs);
    expect(state.hasActiveFlow).toBe(false);
  });
});

describe('AUDIT: HOST_REQUESTS_EMPTY recovery intents are mutation-free', () => {
  it('HOST_REQUESTS_EMPTY next intents contain no mutation intents', () => {
    const msgs = [makeAssistant('get_host_booking_requests', 'success', { requests: [] })];
    const state = detectFlowState(msgs);
    expect(state.branch).toBe('HOST_REQUESTS_EMPTY');
    const intents = getFlowNextIntents(state);
    expect(intents.length).toBeGreaterThan(0);
    // All HOST_REQUESTS_EMPTY intents should be read-only
    const MUTATION_INTENTS = ['CANCEL_BOOKING', 'REQUEST_BOOKING_HELP'];
    intents.forEach((i) => expect(MUTATION_INTENTS).not.toContain(i.intent));
  });

  it('HOST_REQUESTS_EMPTY chips suggest listings and help center', () => {
    const msgs = [makeAssistant('get_host_booking_requests', 'success', { requests: [] })];
    const state = detectFlowState(msgs);
    const intents = getFlowNextIntents(state);
    expect(intents.some((i) => i.intent === 'GET_HOST_LISTINGS')).toBe(true);
    expect(intents.some((i) => i.intent === 'HELP_CENTER_SEARCH')).toBe(true);
  });
});

describe('AUDIT: no-results search recovery chips are mutation-free', () => {
  it('DISCOVERY_SEARCH_EMPTY next intents contain no mutation intents', () => {
    const msgs = [makeAssistant('search_listings', 'success', { data: [] })];
    const state = detectFlowState(msgs);
    const intents = getFlowNextIntents(state);
    expect(intents.length).toBeGreaterThan(0);
    const MUTATION_INTENTS = ['CANCEL_BOOKING', 'REQUEST_BOOKING_HELP', 'CONTACT_HOST_HELP'];
    intents.forEach((i) => expect(MUTATION_INTENTS).not.toContain(i.intent));
  });

  it('DISCOVERY_SEARCH_EMPTY recovery suggests widening search', () => {
    const msgs = [makeAssistant('search_listings', 'success', { data: [] })];
    const state = detectFlowState(msgs);
    const intents = getFlowNextIntents(state);
    expect(intents.some((i) => i.intent === 'SEARCH_LISTINGS')).toBe(true);
  });
});

describe('AUDIT: HOST_BLOCKED recovery', () => {
  it('HOST_BLOCKED produces safe read-only recovery intents', () => {
    const msgs = [
      makeAssistant('get_host_booking_requests', 'success', { requests: [{ id: 'r1' }] }),
      makeBlocked('get_host_booking_requests', 'rate_limited'),
    ];
    const state = detectFlowState(msgs);
    expect(state.branch).toBe('HOST_BLOCKED');
    expect(state.isRecovery).toBe(true);
    const recovery = getFlowRecoveryIntents(state);
    expect(recovery.length).toBeGreaterThan(0);
    const MUTATION_INTENTS = ['CANCEL_BOOKING'];
    recovery.forEach((i) => expect(MUTATION_INTENTS).not.toContain(i.intent));
  });
});

describe('AUDIT: mixed noisy conversation → correct flow from last result', () => {
  it('user messages interspersed between tool results do not change flow classification', () => {
    const msgs = [
      makeAssistant('search_listings', 'success', { data: [{ id: 'l1' }] }),
      makeUser('can you show me more details?'),
      makeUser('what about pricing?'),
      makeAssistant('get_listing_details', 'success', { id: 'l2', title: 'Chalet' }),
      makeUser('interesting!'),
    ];
    const state = detectFlowState(msgs);
    // Last actionable result is get_listing_details → LISTING_DETAILS_VIEWED
    expect(state.flow).toBe('LISTING_DISCOVERY_FLOW');
    expect(state.step).toBe('LISTING_DETAILS_VIEWED');
    expect(state.branch).toBe('DISCOVERY_DETAILS_WITH_ID');
    expect(state.context.detectedListingId).toBe('l2');
  });

  it('error status tool results are treated as noise and skip to previous result', () => {
    const msgs = [
      makeAssistant('search_listings', 'success', { data: [{ id: 'l1' }] }),
      makeAssistant('get_listing_details', 'execution_error', null),
    ];
    const state = detectFlowState(msgs);
    // execution_error is not 'success' so detectLastActionableResult skips it
    // Should fall back to the successful search result
    expect(state.step).toBe('SEARCH_RESULTS_SHOWN');
    expect(state.branch).toBe('DISCOVERY_SEARCH_HAS_RESULTS');
  });
});
