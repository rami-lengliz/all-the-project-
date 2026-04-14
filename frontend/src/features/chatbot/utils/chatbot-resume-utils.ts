/**
 * chatbot-resume-utils.ts
 *
 * Pure utility to detect whether a conversation has a meaningful resumable
 * state and what the best next actions are.
 *
 * Never mutates state. Never fires actions. Never calls the backend.
 */

import { ChatbotMessage } from '../types/chatbot.types';
import {
  ChatbotResumeState,
  ChatbotResumeKind,
} from '../types/chatbot-continuity.types';
import { detectLastActionableResult } from './chatbot-actionable-results';
import {
  getNextStepIntents,
  getRecoverySuggestions,
} from './chatbot-suggestion-priorities';

// ─────────────────────────────────────────────────────────────────────────────
// Pending confirmation detection
// ─────────────────────────────────────────────────────────────────────────────

interface PendingConfirmation {
  token: string;
  actionName: string;
  expiresAt?: string;
  isExpired: boolean;
}

export function detectPendingConfirmation(
  messages: ChatbotMessage[],
): PendingConfirmation | null {
  // Walk backward (newest first). Track whether a mutation success appears
  // CHRONOLOGICALLY AFTER (i.e., found earlier in the backward walk) a
  // confirmation_required — if so, the confirmation is consumed.
  let foundMutationSuccess = false;

  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];
    if (msg.role !== 'assistant') continue;

    const result = msg.metadata?.toolResult;
    if (!result) continue;

    // Walking backward: if we see a mutation success before seeing a
    // confirmation_required, any confirmation we find afterward is consumed.
    if (result.status === 'success' && msg.metadata?.toolName) {
      const tool: string = msg.metadata.toolName;
      if (
        MUTATION_TOOLS.includes(tool)
      ) {
        foundMutationSuccess = true;
      }
    }

    if (result.status === 'confirmation_required') {
      // Even if consumed, do NOT continue past this — a tokenless or consumed
      // confirmation_required is still the "last" confirmation event; searching
      // deeper would surface a stale earlier token.
      if (foundMutationSuccess) break;

      const token: string | undefined = result.output?.confirmationToken;
      if (!token) break; // Tokenless confirmation — stop, don't fall through to older ones

      const expiresAt: string | undefined = result.output?.expiresAt;
      const isExpired = expiresAt ? new Date(expiresAt) < new Date() : false;
      const actionName: string =
        msg.metadata?.toolName ?? result.output?.actionName ?? 'action';

      return { token, actionName, expiresAt, isExpired };
    }
  }

  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

/** Tools that produce a mutation result requiring confirmation */
const MUTATION_TOOLS = [
  'cancel_my_booking_if_allowed',
  'request_booking_help',
  'contact_host_about_booking',
];

// ─────────────────────────────────────────────────────────────────────────────
// Blocked state detection
// ─────────────────────────────────────────────────────────────────────────────

export const BLOCKED_STATUSES = new Set([
  'rate_limited',
  'cooldown_active',
  'trust_restricted',
  'suspicious_activity',
  'policy_blocked',
  'too_many_failed_confirmations',
]);

function detectLastBlockedStatus(messages: ChatbotMessage[]): string | null {
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];
    if (msg.role !== 'assistant') continue;
    const result = msg.metadata?.toolResult;
    if (!result) continue;

    if (BLOCKED_STATUSES.has(result.status)) {
      return result.status as string;
    }
    // Only stop scanning backward on a definitive success result — not on
    // confirmation_required (which is neither blocked nor a clean success).
    if (result.status === 'success') break;
  }
  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Resume kind + summary derivation
// ─────────────────────────────────────────────────────────────────────────────

const CATEGORY_RESUME_SUMMARY: Record<string, string> = {
  listing_search_results: 'Continue your listing search',
  listing_details: 'Return to listing details',
  booking_list: 'Review your bookings',
  booking_details: 'Continue with this booking',
  host_booking_requests: 'Check your booking requests',
  host_listings: 'Manage your listings',
  help_answer: 'Continue help conversation',
  mutation_success: 'See what to do next',
};

const CATEGORY_KIND: Record<string, ChatbotResumeKind> = {
  listing_search_results: 'listing_search',
  listing_details: 'listing_details',
  booking_list: 'booking_flow',
  booking_details: 'booking_flow',
  host_booking_requests: 'host_operations',
  host_listings: 'host_operations',
  help_answer: 'help_flow',
  mutation_success: 'help_flow',
};

const NULL_RESUME: ChatbotResumeState = {
  kind: 'none',
  summary: '',
  suggestedNextIntents: [],
  isResumable: false,
};

// ─────────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Analyse a conversation's message history and return its resume state.
 * Safe: never throws, never returns undefined. Returns NULL_RESUME for empty/noisy.
 */
export function detectResumeState(
  messages: ChatbotMessage[],
): ChatbotResumeState {
  if (!messages || messages.length === 0) return NULL_RESUME;

  // ── 1. Highest priority: pending confirmation ──────────────────────────
  const pending = detectPendingConfirmation(messages);
  if (pending) {
    const expiredNote = pending.isExpired ? ' (expired)' : '';
    return {
      kind: 'pending_confirmation',
      summary: `Pending confirmation: ${pending.actionName}${expiredNote}`,
      suggestedNextIntents: [],
      pendingConfirmationToken: pending.token,
      pendingConfirmationAction: pending.actionName,
      pendingConfirmationExpiresAt: pending.expiresAt,
      isResumable: true,
    };
  }

  // ── 2. Actionable result ───────────────────────────────────────────────
  const actionable = detectLastActionableResult(messages);
  if (actionable && actionable.category !== 'unknown') {
    const summary =
      CATEGORY_RESUME_SUMMARY[actionable.category] ?? 'Continue previous conversation';
    const kind: ChatbotResumeKind =
      CATEGORY_KIND[actionable.category] ?? 'none';

    // Enrich summary with primary item if present
    const enrichedSummary = actionable.primaryTitle
      ? `${summary}: ${actionable.primaryTitle.slice(0, 28)}`
      : summary;

    return {
      kind,
      summary: enrichedSummary,
      suggestedNextIntents: getNextStepIntents(actionable),
      isResumable: true,
    };
  }

  // ── 3. Blocked/cooldown state (degrade to safe recovery) ───────────────
  const blockedStatus = detectLastBlockedStatus(messages);
  if (blockedStatus) {
    return {
      kind: 'after_blocked',
      summary: 'Try a safer option',
      suggestedNextIntents: getRecoverySuggestions(blockedStatus),
      isResumable: true,
    };
  }

  return NULL_RESUME;
}

/**
 * Returns whether a conversation's resume state should be surfaced to
 * the user as a prominent resume card (not just a passive list item).
 */
export function isHighPriorityResume(state: ChatbotResumeState): boolean {
  return (
    state.isResumable &&
    (state.kind === 'pending_confirmation' ||
      state.kind === 'listing_search' ||
      state.kind === 'listing_details' ||
      state.kind === 'booking_flow')
  );
}
