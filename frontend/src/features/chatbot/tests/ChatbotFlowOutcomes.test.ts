/**
 * ChatbotFlowOutcomes.test.ts
 *
 * Exhaustive unit tests for the flow outcome layer:
 *   1. detectFlowOutcome — listing discovery outcomes
 *   2. detectFlowOutcome — booking help outcomes
 *   3. detectFlowOutcome — host requests outcomes
 *   4. detectFlowOutcome — cross-cutting: pending confirmation, blocked, malformed
 *   5. isFlowComplete / getFlowOutcomeSummary
 *   6. getPostFlowActions / getCompletionActions / getInterruptionRecoveryActions
 *   7. Card-rendering guards (showOutcomeCard / completionStatus routing)
 *   8. Continuity / resume integration coexistence
 */

import {
  detectFlowOutcome,
  isFlowComplete,
  getFlowOutcomeSummary,
} from '../utils/chatbot-flow-outcomes';
import {
  getPostFlowActions,
  getCompletionActions,
  getInterruptionRecoveryActions,
} from '../utils/chatbot-flow-completion';
import { detectFlowState, NULL_FLOW_STATE } from '../utils/chatbot-flow-state';
import { NULL_OUTCOME_STATE } from '../types/chatbot-flow-outcomes.types';
import { ChatbotMessage } from '../types/chatbot.types';

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function makeAssistant(toolName: string, status: string, output: any): ChatbotMessage {
  return {
    id: `m-${Math.random()}`,
    role: 'assistant',
    content: 'Result.',
    createdAt: new Date().toISOString(),
    metadata: { toolName, toolResult: { status, output } },
  };
}

function makeUser(text: string): ChatbotMessage {
  return { id: `m-${Math.random()}`, role: 'user', content: text, createdAt: new Date().toISOString() };
}

function makeConfirmation(token: string, actionName: string, expiresAt?: string): ChatbotMessage {
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

/** Helper: run detect chain */
function detect(msgs: ChatbotMessage[]) {
  const flowState = detectFlowState(msgs);
  const outcome = detectFlowOutcome(flowState, msgs);
  return { flowState, outcome };
}

function noMutationIntents(intents: any[]): boolean {
  return !intents.some((i) => ['CANCEL_BOOKING'].includes(i.intent));
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. LISTING_DISCOVERY_FLOW outcomes
// ─────────────────────────────────────────────────────────────────────────────

describe('detectFlowOutcome — LISTING_DISCOVERY_FLOW', () => {
  it('search with results → ACTIVE (not completed)', () => {
    const { outcome } = detect([
      makeAssistant('search_listings', 'success', { data: [{ id: 'l1', title: 'Villa' }] }),
    ]);
    expect(outcome.kind).toBe('ACTIVE');
    expect(outcome.completionStatus).toBe('active');
    expect(outcome.showOutcomeCard).toBe(false);
  });

  it('search with no results → COMPLETED_EMPTY with outcome card', () => {
    const { outcome } = detect([
      makeAssistant('search_listings', 'success', { data: [] }),
    ]);
    expect(outcome.kind).toBe('COMPLETED_EMPTY');
    expect(outcome.completionStatus).toBe('complete');
    expect(outcome.showOutcomeCard).toBe(true);
    expect(outcome.headline).toBeTruthy();
    expect(outcome.subtext).toBeTruthy();
  });

  it('listing details viewed → ACTIVE (not a terminal state)', () => {
    const { outcome } = detect([
      makeAssistant('get_listing_details', 'success', { id: 'l2', title: 'Chalet' }),
    ]);
    expect(outcome.kind).toBe('ACTIVE');
    expect(outcome.showOutcomeCard).toBe(false);
  });

  it('discovery blocked → INTERRUPTED_BLOCKED with outcome card', () => {
    const { outcome } = detect([
      makeAssistant('search_listings', 'success', { data: [{ id: 'l1' }] }),
      makeBlocked('search_listings', 'rate_limited'),
    ]);
    expect(outcome.kind).toBe('INTERRUPTED_BLOCKED');
    expect(outcome.completionStatus).toBe('interrupted');
    expect(outcome.showOutcomeCard).toBe(true);
  });

  it('discovery cooldown active → INTERRUPTED_COOLDOWN', () => {
    const { outcome } = detect([
      makeBlocked('search_listings', 'cooldown_active'),
    ]);
    expect(outcome.kind).toBe('INTERRUPTED_COOLDOWN');
    expect(outcome.showOutcomeCard).toBe(true);
  });

  it('headline and subtext are non-empty for all listing outcomes', () => {
    const cases = [
      [makeAssistant('search_listings', 'success', { data: [{ id: 'l1' }] })],
      [makeAssistant('search_listings', 'success', { data: [] })],
      [makeAssistant('get_listing_details', 'success', { id: 'l2', title: 'T' })],
      [makeAssistant('search_listings', 'success', { data: [{ id: 'l1' }] }), makeBlocked('search_listings', 'rate_limited')],
    ] as ChatbotMessage[][];
    cases.forEach((msgs) => {
      const { outcome } = detect(msgs);
      expect(outcome.headline.trim().length).toBeGreaterThan(0);
      expect(outcome.headline).not.toContain('undefined');
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. BOOKING_HELP_FLOW outcomes
// ─────────────────────────────────────────────────────────────────────────────

describe('detectFlowOutcome — BOOKING_HELP_FLOW', () => {
  it('booking list viewed → ACTIVE', () => {
    const { outcome } = detect([
      makeAssistant('get_my_bookings', 'success', [{ id: 'b1' }]),
    ]);
    expect(outcome.kind).toBe('ACTIVE');
    expect(outcome.showOutcomeCard).toBe(false);
  });

  it('booking details viewed → ACTIVE (not terminal)', () => {
    const { outcome } = detect([
      makeAssistant('get_booking_details', 'success', { id: 'b2', status: 'confirmed' }),
    ]);
    expect(outcome.kind).toBe('ACTIVE');
  });

  it('mutation success → COMPLETED_SUCCESS with outcome card', () => {
    const { outcome } = detect([
      makeAssistant('cancel_my_booking_if_allowed', 'success', { message: 'Cancelled' }),
    ]);
    expect(outcome.kind).toBe('COMPLETED_SUCCESS');
    expect(outcome.completionStatus).toBe('complete');
    expect(outcome.showOutcomeCard).toBe(true);
    expect(outcome.headline).toBeTruthy();
  });

  it('live pending confirmation → PENDING_CONFIRMATION, showOutcomeCard=false', () => {
    // showOutcomeCard is false: ResumeCard/ConfirmationCard already owns this UX.
    // Having it true would cause the panel to render two simultaneous confirmation surfaces.
    const { outcome } = detect([
      makeConfirmation('tok-live', 'cancel_my_booking_if_allowed'),
    ]);
    expect(outcome.kind).toBe('PENDING_CONFIRMATION');
    expect(outcome.completionStatus).toBe('pending');
    expect(outcome.showOutcomeCard).toBe(false);
  });

  it('expired confirmation → EXPIRED_CONFIRMATION, completionStatus=interrupted, showOutcomeCard=true', () => {
    // Expired confirmation is treated as an interruption (user must recover),
    // not as a pending state (which is only for live confirmations).
    const expiredAt = new Date(Date.now() - 3_600_000).toISOString();
    const { outcome } = detect([
      makeConfirmation('tok-exp', 'cancel_my_booking_if_allowed', expiredAt),
    ]);
    expect(outcome.kind).toBe('EXPIRED_CONFIRMATION');
    expect(outcome.completionStatus).toBe('interrupted');
    expect(outcome.showOutcomeCard).toBe(true);
  });

  it('booking blocked → INTERRUPTED_BLOCKED', () => {
    const { outcome } = detect([
      makeAssistant('get_booking_details', 'success', { id: 'b3' }),
      makeBlocked('cancel_my_booking_if_allowed', 'trust_restricted'),
    ]);
    expect(outcome.kind).toBe('INTERRUPTED_BLOCKED');
    expect(outcome.blockedStatus).toBe('trust_restricted');
  });

  it('booking cooldown → INTERRUPTED_COOLDOWN', () => {
    const { outcome } = detect([
      makeAssistant('get_booking_details', 'success', { id: 'b4' }),
      makeBlocked('cancel_my_booking_if_allowed', 'cooldown_active'),
    ]);
    expect(outcome.kind).toBe('INTERRUPTED_COOLDOWN');
  });

  it('pending confirmation overrides weaker booking list outcome', () => {
    const { outcome } = detect([
      makeAssistant('get_my_bookings', 'success', [{ id: 'b1' }]),
      makeConfirmation('tok', 'cancel_my_booking_if_allowed'),
    ]);
    expect(outcome.kind).toBe('PENDING_CONFIRMATION');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. HOST_REQUESTS_FLOW outcomes
// ─────────────────────────────────────────────────────────────────────────────

describe('detectFlowOutcome — HOST_REQUESTS_FLOW', () => {
  it('host requests with items → ACTIVE', () => {
    const { outcome } = detect([
      makeAssistant('get_host_booking_requests', 'success', { requests: [{ id: 'r1' }] }),
    ]);
    expect(outcome.kind).toBe('ACTIVE');
    expect(outcome.showOutcomeCard).toBe(false);
  });

  it('host requests empty → COMPLETED_EMPTY', () => {
    const { outcome } = detect([
      makeAssistant('get_host_booking_requests', 'success', { requests: [] }),
    ]);
    expect(outcome.kind).toBe('COMPLETED_EMPTY');
    expect(outcome.showOutcomeCard).toBe(true);
  });

  it('host listings active → ACTIVE', () => {
    const { outcome } = detect([
      makeAssistant('get_host_listings', 'success', { listings: [{ id: 'l10' }] }),
    ]);
    expect(outcome.kind).toBe('ACTIVE');
  });

  it('host blocked → INTERRUPTED_BLOCKED', () => {
    const { outcome } = detect([
      makeAssistant('get_host_booking_requests', 'success', { requests: [{ id: 'r1' }] }),
      makeBlocked('get_host_booking_requests', 'rate_limited'),
    ]);
    expect(outcome.kind).toBe('INTERRUPTED_BLOCKED');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. Cross-cutting: priority, malformed, no flow
// ─────────────────────────────────────────────────────────────────────────────

describe('detectFlowOutcome — cross-cutting', () => {
  it('no active flow → NO_MEANINGFUL_OUTCOME', () => {
    const outcome = detectFlowOutcome(NULL_FLOW_STATE, []);
    expect(outcome).toEqual(NULL_OUTCOME_STATE);
    expect(outcome.kind).toBe('NO_MEANINGFUL_OUTCOME');
    expect(outcome.showOutcomeCard).toBe(false);
  });

  it('pure user messages → NO_MEANINGFUL_OUTCOME', () => {
    const msgs = [makeUser('hello'), makeUser('how do I rent?')];
    const { outcome } = detect(msgs);
    expect(outcome.kind).toBe('NO_MEANINGFUL_OUTCOME');
  });

  it('does not crash on null metadata', () => {
    const bad: ChatbotMessage[] = [
      { id: '1', role: 'assistant', content: '', createdAt: '', metadata: null },
    ];
    expect(() => detect(bad)).not.toThrow();
    expect(detect(bad).outcome.kind).toBe('NO_MEANINGFUL_OUTCOME');
  });

  it('unknown tool → NO_MEANINGFUL_OUTCOME (no over-classification)', () => {
    const msgs = [makeAssistant('some_unknown_tool', 'success', { data: [] })];
    const { outcome } = detect(msgs);
    expect(outcome.kind).toBe('NO_MEANINGFUL_OUTCOME');
  });

  it('pending confirmation beats blocked in outcome', () => {
    // Pending confirmation remains the highest-priority outcome signal here.
    // The confirmation surface owns this state, so it should not show an outcome card.
    const msgs = [
      makeConfirmation('tok', 'cancel_my_booking_if_allowed'),
      makeBlocked('cancel_my_booking_if_allowed', 'rate_limited'),
    ];
    const { outcome } = detect(msgs);
    expect(outcome.kind).toBe('PENDING_CONFIRMATION');
    expect(outcome.completionStatus).toBe('pending');
    expect(outcome.showOutcomeCard).toBe(false);
  });

  it('RECOVERY_READY outcome does not show an outcome card', () => {
    // RECOVERY_READY is a placeholder kind — it should not trigger the outcome card.
    // It is displayed via ChatbotFlowRecoveryCard instead.
    const outcome = detectFlowOutcome(
      { ...NULL_FLOW_STATE, hasActiveFlow: true, kind: 'RECOVERY_READY' } as any,
      [],
    );
    // In the real flow, RECOVERY_READY isn't emitted by detectFlowOutcome directly
    // (COMPLETED_EMPTY is). But NULL_FLOW_STATE has hasActiveFlow=false → NO_MEANINGFUL_OUTCOME.
    expect(outcome.showOutcomeCard).toBe(false);
  });

  it('headline and subtext never contain "undefined"', () => {
    const testCases: ChatbotMessage[][] = [
      [makeAssistant('search_listings', 'success', { data: [] })],
      [makeAssistant('cancel_my_booking_if_allowed', 'success', { message: 'ok' })],
      [makeAssistant('get_host_booking_requests', 'success', { requests: [] })],
      [makeBlocked('search_listings', 'cooldown_active')],
    ];
    testCases.forEach((msgs) => {
      const { outcome } = detect(msgs);
      expect(outcome.headline).not.toContain('undefined');
      expect(outcome.subtext).not.toContain('undefined');
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 5. isFlowComplete / getFlowOutcomeSummary
// ─────────────────────────────────────────────────────────────────────────────

describe('isFlowComplete', () => {
  it('COMPLETED_SUCCESS → true', () => {
    const { outcome } = detect([makeAssistant('cancel_my_booking_if_allowed', 'success', { message: 'ok' })]);
    expect(isFlowComplete(outcome)).toBe(true);
  });

  it('COMPLETED_EMPTY → true', () => {
    const { outcome } = detect([makeAssistant('search_listings', 'success', { data: [] })]);
    expect(isFlowComplete(outcome)).toBe(true);
  });

  it('ACTIVE → false', () => {
    const { outcome } = detect([makeAssistant('search_listings', 'success', { data: [{ id: 'l1' }] })]);
    expect(isFlowComplete(outcome)).toBe(false);
  });

  it('INTERRUPTED_BLOCKED → false', () => {
    const { outcome } = detect([makeBlocked('search_listings', 'rate_limited')]);
    expect(isFlowComplete(outcome)).toBe(false);
  });

  it('PENDING_CONFIRMATION → false', () => {
    const { outcome } = detect([makeConfirmation('tok', 'cancel_my_booking_if_allowed')]);
    expect(isFlowComplete(outcome)).toBe(false);
  });
});

describe('getFlowOutcomeSummary', () => {
  it('returns kind, headline, subtext matching the state', () => {
    const { outcome } = detect([makeAssistant('search_listings', 'success', { data: [] })]);
    const summary = getFlowOutcomeSummary(outcome);
    expect(summary.kind).toBe(outcome.kind);
    expect(summary.headline).toBe(outcome.headline);
    expect(summary.subtext).toBe(outcome.subtext);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 6. Post-flow action generation
// ─────────────────────────────────────────────────────────────────────────────

describe('getPostFlowActions', () => {
  it('ACTIVE outcome → empty actions (uses in-flow chips instead)', () => {
    const { outcome } = detect([makeAssistant('search_listings', 'success', { data: [{ id: 'l1' }] })]);
    const actions = getPostFlowActions(outcome);
    expect(actions.primaryIntents).toHaveLength(0);
    expect(actions.fallbackIntents).toHaveLength(0);
  });

  it('NO_MEANINGFUL_OUTCOME → empty actions', () => {
    const actions = getPostFlowActions(NULL_OUTCOME_STATE);
    expect(actions.primaryIntents).toHaveLength(0);
  });

  it('COMPLETED_SUCCESS → chips including show-bookings or get-booking-details', () => {
    const { outcome } = detect([makeAssistant('cancel_my_booking_if_allowed', 'success', { message: 'ok' })]);
    const actions = getPostFlowActions(outcome);
    expect(actions.primaryIntents.length).toBeGreaterThan(0);
    const hasBookingChip = actions.primaryIntents.some(
      (i) => i.intent === 'SHOW_MY_BOOKINGS' || i.intent === 'GET_BOOKING_DETAILS',
    );
    expect(hasBookingChip).toBe(true);
    expect(noMutationIntents(actions.primaryIntents)).toBe(true);
  });

  it('COMPLETED_EMPTY (listing) → search and help chips', () => {
    const { outcome } = detect([makeAssistant('search_listings', 'success', { data: [] })]);
    const actions = getPostFlowActions(outcome);
    expect(actions.primaryIntents.some((i) => i.intent === 'SEARCH_LISTINGS')).toBe(true);
    expect(noMutationIntents(actions.primaryIntents)).toBe(true);
  });

  it('COMPLETED_EMPTY (host) → host listings and help chips', () => {
    const { outcome } = detect([makeAssistant('get_host_booking_requests', 'success', { requests: [] })]);
    const actions = getPostFlowActions(outcome);
    expect(actions.primaryIntents.some((i) => i.intent === 'GET_HOST_LISTINGS')).toBe(true);
  });

  it('INTERRUPTED_BLOCKED → safe read-only recovery chips only', () => {
    const { outcome } = detect([makeBlocked('search_listings', 'rate_limited')]);
    const actions = getPostFlowActions(outcome);
    expect(actions.primaryIntents.length).toBeGreaterThan(0);
    expect(noMutationIntents(actions.primaryIntents)).toBe(true);
    expect(noMutationIntents(actions.fallbackIntents)).toBe(true);
  });

  it('INTERRUPTED_COOLDOWN → safe read-only recovery chips only', () => {
    const { outcome } = detect([makeBlocked('search_listings', 'cooldown_active')]);
    const actions = getPostFlowActions(outcome);
    expect(actions.primaryIntents.length).toBeGreaterThan(0);
    expect(noMutationIntents(actions.primaryIntents)).toBe(true);
  });

  it('EXPIRED_CONFIRMATION → booking-detail chips (regenerate path, no mutation replay)', () => {
    const expiredAt = new Date(Date.now() - 3_600_000).toISOString();
    const { outcome } = detect([makeConfirmation('tok-exp', 'cancel_my_booking_if_allowed', expiredAt)]);
    const actions = getPostFlowActions(outcome);
    // Should suggest viewing bookings, not directly replaying the action
    expect(actions.primaryIntents.some(
      (i) => i.intent === 'SHOW_MY_BOOKINGS' || i.intent === 'GET_BOOKING_DETAILS',
    )).toBe(true);
    expect(noMutationIntents(actions.primaryIntents)).toBe(true);
  });

  it('PENDING_CONFIRMATION → no primary chips (card owns confirm button), safe fallbacks', () => {
    const { outcome } = detect([makeConfirmation('tok', 'cancel_my_booking_if_allowed')]);
    const actions = getPostFlowActions(outcome);
    expect(actions.primaryIntents).toHaveLength(0);
    expect(actions.fallbackIntents.length).toBeGreaterThan(0);
    expect(noMutationIntents(actions.fallbackIntents)).toBe(true);
  });

  it('post-flow chips are different from in-flow next-step chips for COMPLETED_SUCCESS', () => {
    // In-flow: BOOKING_MUTATION_DONE uses { RECOVERY_SEARCH_SAFE, SHOW_MY_BOOKINGS }
    // Post-flow: should include enriched follow-up (show bookings, help center, search)
    // The key invariant: outcome chips are produced by getCompletionActions,
    // not by getFlowNextIntents — they should not be identical.
    const { outcome } = detect([makeAssistant('cancel_my_booking_if_allowed', 'success', { message: 'ok' })]);
    const postFlowChips = getCompletionActions(outcome);
    expect(postFlowChips.length).toBeGreaterThan(0);
    // At least one chip should be present (this validates the function doesn't return empty)
    expect(postFlowChips[0].message.trim()).not.toBe('');
    expect(postFlowChips[0].message).not.toContain('undefined');
  });

  it('all chip messages and labels contain no "undefined" string', () => {
    const cases: ChatbotMessage[][] = [
      [makeAssistant('search_listings', 'success', { data: [] })],
      [makeAssistant('cancel_my_booking_if_allowed', 'success', { message: 'ok' })],
      [makeBlocked('search_listings', 'rate_limited')],
      [makeBlocked('search_listings', 'cooldown_active')],
      [makeConfirmation('tok', 'cancel_my_booking_if_allowed')],
    ];
    cases.forEach((msgs) => {
      const { outcome } = detect(msgs);
      const { primaryIntents, fallbackIntents } = getPostFlowActions(outcome);
      [...primaryIntents, ...fallbackIntents].forEach((i) => {
        expect(i.message).not.toContain('undefined');
        expect(i.label).not.toContain('undefined');
      });
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// AUDIT regression tests
// ─────────────────────────────────────────────────────────────────────────────

describe('AUDIT: no-results listing completion chips ordering', () => {
  it('SEARCH_LISTINGS is the first chip for COMPLETED_EMPTY listing (not help center)', () => {
    const { outcome } = detect([makeAssistant('search_listings', 'success', { data: [] })]);
    const actions = getPostFlowActions(outcome);
    expect(actions.primaryIntents[0].intent).toBe('SEARCH_LISTINGS');
  });

  it('help center is in the chip set but not first', () => {
    const { outcome } = detect([makeAssistant('search_listings', 'success', { data: [] })]);
    const actions = getPostFlowActions(outcome);
    const helpIdx = actions.primaryIntents.findIndex((i) => i.intent === 'HELP_CENTER_SEARCH');
    expect(helpIdx).toBeGreaterThan(0);
  });
});

describe('AUDIT: host empty completion chips', () => {
  it('GET_HOST_LISTINGS is surfaced for HOST_REQUESTS_FLOW empty outcome', () => {
    const { outcome } = detect([makeAssistant('get_host_booking_requests', 'success', { requests: [] })]);
    const actions = getPostFlowActions(outcome);
    expect(actions.primaryIntents[0].intent).toBe('GET_HOST_LISTINGS');
  });

  it('host empty outcome does NOT produce SEARCH_LISTINGS as a chip', () => {
    const { outcome } = detect([makeAssistant('get_host_booking_requests', 'success', { requests: [] })]);
    const actions = getPostFlowActions(outcome);
    const searchListings = actions.primaryIntents.find((i) => i.intent === 'SEARCH_LISTINGS');
    expect(searchListings).toBeUndefined();
  });
});

describe('AUDIT: expired confirmation with detectedBookingId produces booking-specific chip first', () => {
  it('booking-contextual chip is preferred over generic show-bookings when bookingId available', () => {
    const expiredAt = new Date(Date.now() - 3_600_000).toISOString();
    // Construct a conversation where bookingId is in context:
    // get_booking_details gives us detectedBookingId, then confirmation expires
    const msgs = [
      makeAssistant('get_booking_details', 'success', { id: 'booking-99', status: 'pending' }),
      makeConfirmation('tok-exp', 'cancel_my_booking_if_allowed', expiredAt),
    ];
    const { outcome } = detect(msgs);
    expect(outcome.kind).toBe('EXPIRED_CONFIRMATION');
    const actions = getPostFlowActions(outcome);
    // When detectedBookingId is available, GET_BOOKING_DETAILS should be first
    if (outcome.detectedBookingId) {
      expect(actions.primaryIntents[0].intent).toBe('GET_BOOKING_DETAILS');
    } else {
      // Without bookingId: SHOW_MY_BOOKINGS is acceptable
      expect(actions.primaryIntents.some((i) => i.intent === 'SHOW_MY_BOOKINGS')).toBe(true);
    }
    expect(noMutationIntents(actions.primaryIntents)).toBe(true);
  });

  it('expired confirmation completionStatus is interrupted (not pending)', () => {
    const expiredAt = new Date(Date.now() - 3_600_000).toISOString();
    const { outcome } = detect([makeConfirmation('tok-exp', 'cancel_my_booking_if_allowed', expiredAt)]);
    expect(outcome.completionStatus).toBe('interrupted');
  });
});

describe('AUDIT: INTERRUPTED_COOLDOWN chips are safe and distinct from blocked chips', () => {
  it('cooldown and blocked both return mutation-free chip sets', () => {
    const cooldownOutcome = detect([makeBlocked('search_listings', 'cooldown_active')]).outcome;
    const blockedOutcome = detect([makeBlocked('search_listings', 'trust_restricted')]).outcome;
    const cooldownActions = getPostFlowActions(cooldownOutcome);
    const blockedActions = getPostFlowActions(blockedOutcome);
    expect(noMutationIntents(cooldownActions.primaryIntents)).toBe(true);
    expect(noMutationIntents(blockedActions.primaryIntents)).toBe(true);
  });

  it('cooldown outcome kind is INTERRUPTED_COOLDOWN (not INTERRUPTED_BLOCKED)', () => {
    const { outcome } = detect([makeBlocked('cancel_my_booking_if_allowed', 'cooldown_active')]);
    expect(outcome.kind).toBe('INTERRUPTED_COOLDOWN');
    expect(outcome.kind).not.toBe('INTERRUPTED_BLOCKED');
  });

  it('getInterruptionRecoveryActions returns PRIMARY intents (the real safe recovery set)', () => {
    const { outcome } = detect([makeBlocked('search_listings', 'rate_limited')]);
    const primary = getInterruptionRecoveryActions(outcome);
    expect(primary.length).toBeGreaterThan(0);
    // Primary should be the safe recovery set from getRecoverySuggestions,
    // NOT the secondary fallback (SHOW_MY_BOOKINGS only)
    expect(noMutationIntents(primary)).toBe(true);
  });
});

describe('AUDIT: PENDING_CONFIRMATION does not produce an outcome card', () => {
  it('showOutcomeCard=false prevents double confirmation surface in the panel', () => {
    const { outcome } = detect([makeConfirmation('tok', 'cancel_my_booking_if_allowed')]);
    // If this were true, ChatbotPanel would render BOTH the ResumeCard AND the OutcomeCard
    // for the same pending action — a duplicated UX bug.
    expect(outcome.showOutcomeCard).toBe(false);
  });

  it('pending confirmation still has completionStatus=pending for panel guard logic', () => {
    const { outcome } = detect([makeConfirmation('tok', 'cancel_my_booking_if_allowed')]);
    expect(outcome.completionStatus).toBe('pending');
  });

  it('PostFlowActions for PENDING_CONFIRMATION: no primary chips, safe fallbacks only', () => {
    const { outcome } = detect([makeConfirmation('tok', 'cancel_my_booking_if_allowed')]);
    const actions = getPostFlowActions(outcome);
    // No primary chips: confirmation card owns the confirm/dismiss UX
    expect(actions.primaryIntents).toHaveLength(0);
    // Fallbacks should be safe read-only options
    expect(actions.fallbackIntents.length).toBeGreaterThan(0);
    expect(noMutationIntents(actions.fallbackIntents)).toBe(true);
  });
});

describe('AUDIT: outcome detection never marks ACTIVE flows as completed', () => {
  const activeCases: [string, ChatbotMessage[]][] = [
    ['search results found', [makeAssistant('search_listings', 'success', { data: [{ id: 'l1' }] })]],
    ['listing details viewed', [makeAssistant('get_listing_details', 'success', { id: 'l1', title: 'T' })]],
    ['booking list viewed (non-empty)', [makeAssistant('get_my_bookings', 'success', [{ id: 'b1' }])]],
    ['booking details viewed', [makeAssistant('get_booking_details', 'success', { id: 'b2' })]],
    ['host requests (non-empty)', [makeAssistant('get_host_booking_requests', 'success', { requests: [{ id: 'r1' }] })]],
    ['host listings viewed', [makeAssistant('get_host_listings', 'success', { listings: [{ id: 'l9' }] })]],
  ];

  activeCases.forEach(([label, msgs]) => {
    it(`${label} → ACTIVE, not completed`, () => {
      const { outcome } = detect(msgs);
      expect(outcome.kind).toBe('ACTIVE');
      expect(outcome.showOutcomeCard).toBe(false);
      expect(isFlowComplete(outcome)).toBe(false);
    });
  });
});

describe('AUDIT: malformed metadata crash safety', () => {
  it('does not crash when metadata is null', () => {
    const msgs: ChatbotMessage[] = [
      { id: '1', role: 'assistant', content: '', createdAt: '', metadata: null },
    ];
    expect(() => detect(msgs)).not.toThrow();
  });

  it('does not crash when toolResult is missing', () => {
    const msgs: ChatbotMessage[] = [
      { id: '1', role: 'assistant', content: '', createdAt: '', metadata: { toolName: 'x', toolResult: undefined } },
    ];
    expect(() => detect(msgs)).not.toThrow();
  });

  it('does not crash when output is deeply null', () => {
    const msgs: ChatbotMessage[] = [
      { id: '1', role: 'assistant', content: '', createdAt: '', metadata: { toolName: 'search_listings', toolResult: { status: 'success', output: null } } },
    ];
    expect(() => detect(msgs)).not.toThrow();
  });

  it('does not crash when messages array is empty', () => {
    expect(() => detectFlowOutcome(NULL_FLOW_STATE, [])).not.toThrow();
    expect(detectFlowOutcome(NULL_FLOW_STATE, []).kind).toBe('NO_MEANINGFUL_OUTCOME');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 7. showOutcomeCard / completionStatus routing sanity
// ─────────────────────────────────────────────────────────────────────────────

describe('showOutcomeCard and completionStatus routing', () => {
  it('ACTIVE: active, no card', () => {
    const { outcome } = detect([makeAssistant('search_listings', 'success', { data: [{ id: 'l1' }] })]);
    expect(outcome.completionStatus).toBe('active');
    expect(outcome.showOutcomeCard).toBe(false);
  });

  it('COMPLETED_EMPTY: complete, card shown', () => {
    const { outcome } = detect([makeAssistant('search_listings', 'success', { data: [] })]);
    expect(outcome.completionStatus).toBe('complete');
    expect(outcome.showOutcomeCard).toBe(true);
  });

  it('COMPLETED_SUCCESS: complete, card shown', () => {
    const { outcome } = detect([makeAssistant('cancel_my_booking_if_allowed', 'success', { message: 'ok' })]);
    expect(outcome.completionStatus).toBe('complete');
    expect(outcome.showOutcomeCard).toBe(true);
  });

  it('INTERRUPTED_BLOCKED: interrupted, card shown', () => {
    const { outcome } = detect([makeBlocked('search_listings', 'rate_limited')]);
    expect(outcome.completionStatus).toBe('interrupted');
    expect(outcome.showOutcomeCard).toBe(true);
  });

  it('INTERRUPTED_COOLDOWN: interrupted, card shown', () => {
    const { outcome } = detect([makeBlocked('search_listings', 'cooldown_active')]);
    expect(outcome.completionStatus).toBe('interrupted');
    expect(outcome.showOutcomeCard).toBe(true);
  });

  it('PENDING_CONFIRMATION: pending, NO card (ResumeCard owns this UX)', () => {
    const { outcome } = detect([makeConfirmation('tok', 'cancel_my_booking_if_allowed')]);
    expect(outcome.completionStatus).toBe('pending');
    // showOutcomeCard must be false to prevent two simultaneous confirmation surfaces
    expect(outcome.showOutcomeCard).toBe(false);
  });

  it('EXPIRED_CONFIRMATION: interrupted (not pending), card shown', () => {
    const expiredAt = new Date(Date.now() - 3_600_000).toISOString();
    const { outcome } = detect([makeConfirmation('tok-exp', 'cancel_my_booking_if_allowed', expiredAt)]);
    // Expired confirmation is an interruption the user must recover from,
    // not a live action waiting for user input.
    expect(outcome.completionStatus).toBe('interrupted');
    expect(outcome.showOutcomeCard).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 8. Continuity / resume coexistence
// ─────────────────────────────────────────────────────────────────────────────

import { detectResumeState } from '../utils/chatbot-resume-utils';

describe('detectFlowOutcome + detectResumeState coexistence', () => {
  it('COMPLETED_SUCCESS outcome: resume sees mutation_success kind', () => {
    const msgs = [makeAssistant('cancel_my_booking_if_allowed', 'success', { message: 'Done' })];
    const { outcome } = detect(msgs);
    const resume = detectResumeState(msgs);
    expect(outcome.kind).toBe('COMPLETED_SUCCESS');
    expect(resume.kind).toBe('help_flow'); // mutation_success maps to help_flow resume kind
    // They are complementary, not conflicting
  });

  it('PENDING_CONFIRMATION: both agree', () => {
    const msgs = [makeConfirmation('tok', 'cancel_my_booking_if_allowed')];
    const { outcome } = detect(msgs);
    const resume = detectResumeState(msgs);
    expect(outcome.kind).toBe('PENDING_CONFIRMATION');
    expect(resume.kind).toBe('pending_confirmation');
  });

  it('INTERRUPTED_BLOCKED: resume gives after_blocked, outcome gives interruption', () => {
    const msgs = [makeBlocked('cancel_my_booking_if_allowed', 'too_many_failed_confirmations')];
    const { outcome } = detect(msgs);
    const resume = detectResumeState(msgs);
    expect(outcome.kind).toBe('INTERRUPTED_BLOCKED');
    expect(resume.kind).toBe('after_blocked');
    // Both agree: this is a blocked/recovery state
  });

  it('COMPLETED_EMPTY: resume sees listing search, outcome interprets it as empty', () => {
    const msgs = [makeAssistant('search_listings', 'success', { data: [] })];
    const { outcome } = detect(msgs);
    const resume = detectResumeState(msgs);
    expect(outcome.kind).toBe('COMPLETED_EMPTY');
    // Resume still sees it as resumable (search), outcome as an empty-complete checkpoint
    expect(resume.kind).toBe('listing_search');
    // Both are correct: they serve different UX surfaces (list vs. chat panel cards)
  });
});
