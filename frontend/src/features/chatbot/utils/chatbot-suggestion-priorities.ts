/**
 * chatbot-suggestion-priorities.ts
 *
 * Pure ranking and selection logic for context-aware suggestions.
 * No React, no side-effects.
 *
 * Provides:
 *  - getEntrySuggestions(context)          — prioritised empty-state chips
 *  - getNextStepIntents(actionableResult)   — guided next-step intents
 *  - getRecoverySuggestions(blockedStatus)  — recovery intents after errors
 */

import {
  ChatbotActionableResult,
  ChatbotContextPayload,
  ChatbotSuggestionIntent,
} from '../types/chatbot-intents.types';
import { resolveIntent, resolveIntents } from './chatbot-intents';

// ─────────────────────────────────────────────────────────────────────────────
// 1. Entry suggestions (empty state)
// ─────────────────────────────────────────────────────────────────────────────

export function getEntrySuggestions(
  context: ChatbotContextPayload | null,
): ChatbotSuggestionIntent[] {
  if (!context) {
    return resolveIntents([
      { key: 'SEARCH_LISTINGS', kind: 'entry', priority: 1 },
      { key: 'SHOW_MY_BOOKINGS', kind: 'entry', priority: 2 },
      { key: 'HELP_CENTER_SEARCH', kind: 'entry', priority: 3 },
      { key: 'GET_HOST_LISTINGS', kind: 'entry', priority: 4 },
    ]);
  }

  switch (context.pageType) {
    case 'listing':
      return resolveIntents([
        {
          key: 'GET_LISTING_DETAILS',
          kind: 'contextual',
          priority: 1,
          context: { listingId: context.listingId, listingTitle: context.listingTitle },
        },
        {
          key: 'SEARCH_LISTINGS_IN_CONTEXT',
          kind: 'contextual',
          priority: 2,
          context: { listingTitle: context.listingTitle },
        },
        { key: 'EXPLAIN_PRICING', kind: 'contextual', priority: 3 },
        { key: 'HELP_CENTER_SEARCH', kind: 'contextual', priority: 4 },
      ]);

    case 'booking':
      return resolveIntents([
        {
          key: 'GET_BOOKING_DETAILS',
          kind: 'contextual',
          priority: 1,
          context: { bookingId: context.bookingId },
        },
        {
          key: 'CONTACT_HOST_HELP',
          kind: 'contextual',
          priority: 2,
          context: { bookingId: context.bookingId },
        },
        {
          key: 'CANCEL_BOOKING',
          kind: 'contextual',
          priority: 3,
          context: { bookingId: context.bookingId },
        },
        { key: 'EXPLAIN_CANCELLATION_POLICY', kind: 'contextual', priority: 4 },
      ]);

    case 'host-dashboard':
      return resolveIntents([
        { key: 'GET_HOST_BOOKING_REQUESTS', kind: 'entry', priority: 1 },
        { key: 'GET_HOST_LISTINGS', kind: 'entry', priority: 2 },
        { key: 'HELP_CENTER_SEARCH', kind: 'entry', priority: 3 },
      ]);

    case 'search':
      return resolveIntents([
        { key: 'SEARCH_LISTINGS', kind: 'entry', priority: 1 },
        { key: 'SHOW_MY_BOOKINGS', kind: 'entry', priority: 2 },
      ]);

    case 'help':
      return resolveIntents([
        { key: 'HELP_CENTER_SEARCH', kind: 'entry', priority: 1 },
        { key: 'EXPLAIN_CANCELLATION_POLICY', kind: 'entry', priority: 2 },
        { key: 'EXPLAIN_PRICING', kind: 'entry', priority: 3 },
        { key: 'SHOW_MY_BOOKINGS', kind: 'entry', priority: 4 },
      ]);

    default:
      return resolveIntents([
        { key: 'SEARCH_LISTINGS', kind: 'entry', priority: 1 },
        { key: 'SHOW_MY_BOOKINGS', kind: 'entry', priority: 2 },
        { key: 'HELP_CENTER_SEARCH', kind: 'entry', priority: 3 },
      ]);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. Next-step intents (guided flow after actionable result)
// ─────────────────────────────────────────────────────────────────────────────

export function getNextStepIntents(
  result: ChatbotActionableResult,
): ChatbotSuggestionIntent[] {
  const ctx: Partial<ChatbotContextPayload> = {
    listingId: result.primaryId,
    listingTitle: result.primaryTitle,
  };

  switch (result.category) {
    // ── Listing search results ─────────────────────────────────────────────
    case 'listing_search_results': {
      const intents: ChatbotSuggestionIntent[] = [];

      // Guided flow step 2: dive into the first result for full details
      if (result.primaryId) {
        intents.push(
          resolveIntent('GET_LISTING_DETAILS', 'next_step', {
            context: ctx,
            priority: 1,
            id: `ns_listing_detail_${result.primaryId}`,
          }),
        );
      }

      intents.push(
        resolveIntent('SEARCH_LISTINGS', 'next_step', {
          priority: 2,
          id: 'ns_refine_search',
        }),
      );
      intents.push(
        resolveIntent('SHOW_MY_BOOKINGS', 'next_step', {
          priority: 3,
          id: 'ns_see_bookings',
        }),
      );

      return intents;
    }

    // ── Listing details ────────────────────────────────────────────────────
    case 'listing_details': {
      const intents: ChatbotSuggestionIntent[] = [
        resolveIntent('SEARCH_LISTINGS_IN_CONTEXT', 'next_step', {
          context: ctx,
          priority: 1,
          id: `ns_similar_to_${result.primaryId ?? 'this'}`,
        }),
        resolveIntent('EXPLAIN_PRICING', 'next_step', {
          priority: 2,
          id: 'ns_explain_pricing',
        }),
        resolveIntent('HELP_CENTER_SEARCH', 'next_step', {
          priority: 3,
          id: 'ns_help_booking_process',
        }),
      ];

      // Guided flow step 3: host contact if id known
      if (result.primaryId) {
        intents.unshift(
          resolveIntent('CONTACT_HOST_HELP', 'next_step', {
            context: { bookingId: undefined, listingId: result.primaryId },
            priority: 0,
            id: `ns_contact_host_${result.primaryId}`,
          }),
        );
      }

      return intents;
    }

    // ── Booking list ───────────────────────────────────────────────────────
    case 'booking_list': {
      const bookingCtx: Partial<ChatbotContextPayload> = result.primaryId
        ? { bookingId: result.primaryId }
        : {};
      const intents: ChatbotSuggestionIntent[] = [];

      if (result.primaryId) {
        intents.push(
          resolveIntent('GET_BOOKING_DETAILS', 'next_step', {
            context: bookingCtx,
            priority: 1,
            id: `ns_booking_detail_${result.primaryId}`,
          }),
        );
      }
      intents.push(
        resolveIntent('EXPLAIN_CANCELLATION_POLICY', 'next_step', {
          priority: 2,
          id: 'ns_cancel_policy',
        }),
      );
      intents.push(
        resolveIntent('SEARCH_LISTINGS', 'next_step', {
          priority: 3,
          id: 'ns_browse_more',
        }),
      );

      return intents;
    }

    // ── Booking details ────────────────────────────────────────────────────
    case 'booking_details': {
      const bookingCtx: Partial<ChatbotContextPayload> = result.primaryId
        ? { bookingId: result.primaryId }
        : {};
      return [
        resolveIntent('CONTACT_HOST_HELP', 'next_step', {
          context: bookingCtx,
          priority: 1,
          id: 'ns_contact_host_booking',
        }),
        resolveIntent('REQUEST_BOOKING_HELP', 'next_step', {
          context: bookingCtx,
          priority: 2,
          id: 'ns_request_help',
        }),
        resolveIntent('CANCEL_BOOKING', 'next_step', {
          context: bookingCtx,
          priority: 3,
          id: 'ns_cancel_this',
          confirmationHint: true,
        } as any),
      ];
    }

    // ── Host booking requests ──────────────────────────────────────────────
    case 'host_booking_requests':
      return resolveIntents([
        { key: 'GET_HOST_LISTINGS', kind: 'next_step', priority: 1 },
        { key: 'HELP_CENTER_SEARCH', kind: 'next_step', priority: 2 },
      ]);

    // ── Host listings ──────────────────────────────────────────────────────
    case 'host_listings':
      return resolveIntents([
        { key: 'GET_HOST_BOOKING_REQUESTS', kind: 'next_step', priority: 1 },
        { key: 'HELP_CENTER_SEARCH', kind: 'next_step', priority: 2 },
      ]);

    // ── Help answer ────────────────────────────────────────────────────────
    case 'help_answer':
      return resolveIntents([
        { key: 'SHOW_MY_BOOKINGS', kind: 'next_step', priority: 1 },
        { key: 'SEARCH_LISTINGS', kind: 'next_step', priority: 2 },
      ]);

    // ── Mutation success (cancellation / help request submitted) ───────────
    case 'mutation_success':
      return resolveIntents([
        { key: 'RECOVERY_SEARCH_SAFE', kind: 'next_step', priority: 1 },
        { key: 'SHOW_MY_BOOKINGS', kind: 'next_step', priority: 2 },
      ]);

    default:
      return resolveIntents([
        { key: 'SEARCH_LISTINGS', kind: 'next_step', priority: 1 },
        { key: 'SHOW_MY_BOOKINGS', kind: 'next_step', priority: 2 },
      ]);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. Recovery suggestions after blocked / cooldown / error states
// ─────────────────────────────────────────────────────────────────────────────

type BlockedStatus =
  | 'rate_limited'
  | 'cooldown_active'
  | 'trust_restricted'
  | 'suspicious_activity'
  | 'policy_blocked'
  | 'too_many_failed_confirmations'
  | 'empty_results'
  | 'execution_error'
  | string;

export function getRecoverySuggestions(
  status: BlockedStatus,
): ChatbotSuggestionIntent[] {
  switch (status) {
    case 'rate_limited':
    case 'cooldown_active':
    case 'too_many_failed_confirmations':
      // Safe read-only actions only
      return resolveIntents([
        { key: 'RECOVERY_SEARCH_SAFE', kind: 'recovery', priority: 1 },
        { key: 'RECOVERY_HELP_SAFE', kind: 'recovery', priority: 2 },
      ]);

    case 'trust_restricted':
    case 'suspicious_activity':
      // Very safe — only search and help
      return resolveIntents([
        { key: 'RECOVERY_SEARCH_SAFE', kind: 'recovery', priority: 1 },
        { key: 'RECOVERY_HELP_SAFE', kind: 'recovery', priority: 2 },
      ]);

    case 'policy_blocked':
      // Different context — user hit a permission wall; suggest something
      // that is definitely accessible
      return resolveIntents([
        { key: 'RECOVERY_BOOKINGS_SAFE', kind: 'recovery', priority: 1 },
        { key: 'RECOVERY_SEARCH_SAFE', kind: 'recovery', priority: 2 },
      ]);

    case 'empty_results':
      return resolveIntents([
        { key: 'SEARCH_LISTINGS', kind: 'recovery', priority: 1 },
        { key: 'HELP_CENTER_SEARCH', kind: 'recovery', priority: 2 },
      ]);

    case 'execution_error':
    default:
      return resolveIntents([
        { key: 'RECOVERY_SEARCH_SAFE', kind: 'recovery', priority: 1 },
        { key: 'RECOVERY_HELP_SAFE', kind: 'recovery', priority: 2 },
        { key: 'RECOVERY_BOOKINGS_SAFE', kind: 'recovery', priority: 3 },
      ]);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Adapter: bridge ChatbotSuggestionIntent → legacy ChatbotSuggestion shape
// Keeps ChatbotSuggestions component signature unchanged.
// ─────────────────────────────────────────────────────────────────────────────

import { ChatbotSuggestion } from '../types/chatbot-suggestions.types';

export function intentToSuggestion(intent: ChatbotSuggestionIntent): ChatbotSuggestion {
  return {
    id: intent.id,
    label: intent.label,
    message: intent.message,
    icon: intent.icon,
    variant: intent.variant ?? 'default',
  };
}

export function intentsToSuggestions(
  intents: ChatbotSuggestionIntent[],
): ChatbotSuggestion[] {
  return intents.map(intentToSuggestion);
}
