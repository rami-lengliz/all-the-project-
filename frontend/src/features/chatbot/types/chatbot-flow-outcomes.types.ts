/**
 * chatbot-flow-outcomes.types.ts
 *
 * Typed model for flow outcomes and post-flow UX.
 *
 * These are PURELY FRONTEND UX constructs. They do NOT represent backend
 * transaction state, booking confirmations, or any authoritative domain truth.
 * A "COMPLETED_SUCCESS" outcome means the chatbot reached a logical UX
 * resolution point — it does NOT mean the backend operation is finalized.
 */

import { ChatbotSuggestionIntent } from './chatbot-intents.types';
import { ChatbotFlowKey, ChatbotFlowBranch } from './chatbot-flows.types';

// ─────────────────────────────────────────────────────────────────────────────
// Outcome kinds
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The kind of outcome detected for a flow.
 *
 *  ACTIVE                 — flow is still in progress; no outcome yet
 *  COMPLETED_SUCCESS      — user reached a logical resolution (e.g. mutation confirmed)
 *  COMPLETED_EMPTY        — flow ended with no-results (e.g. empty search, no requests)
 *  INTERRUPTED_BLOCKED    — flow was stopped by a trust/policy block
 *  INTERRUPTED_COOLDOWN   — flow was stopped by an active cooldown
 *  PENDING_CONFIRMATION   — flow is waiting for explicit user confirmation
 *  EXPIRED_CONFIRMATION   — confirmation window closed; stale action, needs refresh
 *  RECOVERY_READY         — dead end detected; recovery actions available
 *  NO_MEANINGFUL_OUTCOME  — not enough signal to compute an outcome (no active flow)
 */
export type ChatbotFlowOutcomeKind =
  | 'ACTIVE'
  | 'COMPLETED_SUCCESS'
  | 'COMPLETED_EMPTY'
  | 'INTERRUPTED_BLOCKED'
  | 'INTERRUPTED_COOLDOWN'
  | 'PENDING_CONFIRMATION'
  | 'EXPIRED_CONFIRMATION'
  | 'RECOVERY_READY'
  | 'NO_MEANINGFUL_OUTCOME';

// ─────────────────────────────────────────────────────────────────────────────
// Completion status (coarser grouping)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Coarse grouping of outcome kinds — used by display logic to choose
 * which card family to render.
 *
 *  complete    → ChatbotFlowCompletionCard
 *  interrupted → ChatbotFlowInterruptionCard
 *  pending     → (existing) ChatbotConfirmationCard / ResumeCard
 *  active      → ChatbotFlowCard (existing)
 *  none        → no card
 */
export type ChatbotFlowCompletionStatus =
  | 'complete'
  | 'interrupted'
  | 'pending'
  | 'active'
  | 'none';

// ─────────────────────────────────────────────────────────────────────────────
// Outcome state
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Complete detected outcome for a flow.
 * Derived deterministically from (flowState + messages).
 */
export interface ChatbotFlowOutcomeState {
  /** Which flow this outcome belongs to */
  flow: ChatbotFlowKey;
  /** The specific outcome kind */
  kind: ChatbotFlowOutcomeKind;
  /** Coarse display-routing category */
  completionStatus: ChatbotFlowCompletionStatus;
  /** User-facing headline for the outcome card */
  headline: string;
  /** Supporting subtext (optional) */
  subtext: string;
  /** Whether the outcome warrants showing an outcome card */
  showOutcomeCard: boolean;
  /** Contextual data preserved from the flow for post-flow actions */
  flowBranch: ChatbotFlowBranch;
  blockedStatus?: string;
  detectedBookingId?: string;
  detectedListingId?: string;
  pendingConfirmationToken?: string;
  pendingConfirmationAction?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Outcome summary (display-friendly extract)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * A lightweight summary used by components that don't need the full state.
 */
export interface ChatbotFlowOutcomeSummary {
  kind: ChatbotFlowOutcomeKind;
  headline: string;
  subtext: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Post-flow actions
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The resolved set of next-step intents after a flow reaches an outcome.
 */
export interface ChatbotPostFlowAction {
  /** Primary actions (always present if outcome is non-trivial) */
  primaryIntents: ChatbotSuggestionIntent[];
  /** Fallback/safe actions for interrupted/expired states */
  fallbackIntents: ChatbotSuggestionIntent[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Null constant
// ─────────────────────────────────────────────────────────────────────────────

export const NULL_OUTCOME_STATE: ChatbotFlowOutcomeState = {
  flow: 'NONE',
  kind: 'NO_MEANINGFUL_OUTCOME',
  completionStatus: 'none',
  headline: '',
  subtext: '',
  showOutcomeCard: false,
  flowBranch: 'NONE',
};
