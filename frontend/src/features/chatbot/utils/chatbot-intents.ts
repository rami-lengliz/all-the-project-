/**
 * chatbot-intents.ts
 *
 * Pure intent-to-message mapping logic. No React, no side-effects.
 *
 * Provides:
 *  - INTENT_DEFINITIONS   — canonical label/message/icon registry
 *  - buildIntentMessage() — context-aware message interpolation
 *  - resolveIntent()      — produce a ChatbotSuggestionIntent from a key + context
 */

import {
  ChatbotContextPayload,
  ChatbotIntentKey,
  ChatbotSuggestionIntent,
  ChatbotSuggestionKind,
} from '../types/chatbot-intents.types';

// ─────────────────────────────────────────────────────────────────────────────
// Intent definition registry
// ─────────────────────────────────────────────────────────────────────────────

interface IntentDefinition {
  label: string;
  /** Static baseline message. Use buildIntentMessage() for dynamic interpolation. */
  baseMessage: string;
  icon?: string;
  variant?: ChatbotSuggestionIntent['variant'];
  confirmationHint?: boolean;
}

const INTENT_DEFINITIONS: Readonly<Record<ChatbotIntentKey, IntentDefinition>> = {
  SEARCH_LISTINGS: {
    label: 'Find something to rent',
    baseMessage: "I'm looking for something to rent. Can you help me search?",
    icon: 'fa-magnifying-glass',
    variant: 'default',
  },
  SEARCH_LISTINGS_IN_CONTEXT: {
    label: 'Find similar listings',
    baseMessage: 'Find me listings similar to this one.',
    icon: 'fa-magnifying-glass',
    variant: 'default',
  },
  GET_LISTING_DETAILS: {
    label: 'Listing details',
    baseMessage: 'Tell me more about this listing.',
    icon: 'fa-circle-info',
    variant: 'info',
  },
  SHOW_MY_BOOKINGS: {
    label: 'My bookings',
    baseMessage: 'Show me my current bookings.',
    icon: 'fa-calendar-check',
    variant: 'default',
  },
  GET_BOOKING_DETAILS: {
    label: 'Booking details',
    baseMessage: 'Show me the details for my booking.',
    icon: 'fa-receipt',
    variant: 'default',
  },
  GET_HOST_LISTINGS: {
    label: 'My listings',
    baseMessage: 'Show me all my active listings.',
    icon: 'fa-store',
    variant: 'default',
  },
  GET_HOST_BOOKING_REQUESTS: {
    label: 'Pending requests',
    baseMessage: 'Show me my pending booking requests.',
    icon: 'fa-inbox',
    variant: 'action',
  },
  HELP_CENTER_SEARCH: {
    label: 'Search help center',
    baseMessage: 'Can you help me find an answer in the help center?',
    icon: 'fa-circle-question',
    variant: 'info',
  },
  EXPLAIN_PRICING: {
    label: 'How does pricing work?',
    baseMessage: 'Can you explain how pricing and fees work on RentEverything?',
    icon: 'fa-coins',
    variant: 'info',
  },
  EXPLAIN_CANCELLATION_POLICY: {
    label: 'Cancellation policy',
    baseMessage: 'What is the cancellation and refund policy?',
    icon: 'fa-rotate-left',
    variant: 'info',
  },
  CONTACT_HOST_HELP: {
    label: 'Contact the host',
    baseMessage: 'I need to contact the host about my booking.',
    icon: 'fa-message',
    variant: 'action',
    confirmationHint: true,
  },
  REQUEST_BOOKING_HELP: {
    label: 'Request support',
    baseMessage: 'I need help with my booking.',
    icon: 'fa-headset',
    variant: 'action',
    confirmationHint: true,
  },
  CANCEL_BOOKING: {
    label: 'Cancel booking',
    baseMessage: 'I want to cancel my booking.',
    icon: 'fa-ban',
    variant: 'warning',
    confirmationHint: true,
  },
  RECOVERY_SEARCH_SAFE: {
    label: 'Browse listings instead',
    baseMessage: 'Help me find something to rent.',
    icon: 'fa-magnifying-glass',
    variant: 'default',
  },
  RECOVERY_HELP_SAFE: {
    label: 'Visit help center',
    baseMessage: 'I have a question about how RentEverything works.',
    icon: 'fa-circle-question',
    variant: 'info',
  },
  RECOVERY_BOOKINGS_SAFE: {
    label: 'View my bookings',
    baseMessage: 'Show me my current bookings.',
    icon: 'fa-calendar-check',
    variant: 'default',
  },
  COMPARE_LISTINGS: {
    label: 'Compare listings',
    baseMessage: 'Compare these listings for me.',
    icon: 'fa-scale-balanced',
    variant: 'info',
  },
  ADD_TO_COMPARISON: {
    label: 'Add to comparison',
    baseMessage: 'Add this listing to my comparison.',
    icon: 'fa-plus',
    variant: 'default',
  },
  REMOVE_FROM_COMPARISON: {
    label: 'Remove from comparison',
    baseMessage: 'Remove this listing from my comparison.',
    icon: 'fa-minus',
    variant: 'default',
  },
  CLEAR_COMPARISON: {
    label: 'Clear comparison',
    baseMessage: 'Clear my listing comparison.',
    icon: 'fa-trash',
    variant: 'warning',
  },
  HELP_ME_CHOOSE: {
    label: 'Help me choose',
    baseMessage: 'Help me choose the best listing for my needs.',
    icon: 'fa-wand-magic-sparkles',
    variant: 'info',
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// Context-aware message interpolation
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Returns the backend-bound message text for an intent, interpolating
 * any context payload values (listingId, bookingId, etc.) deterministically.
 *
 * All string building lives here — components never build these strings inline.
 */
export function buildIntentMessage(
  key: ChatbotIntentKey,
  context?: Partial<ChatbotContextPayload>,
): string {
  const def = INTENT_DEFINITIONS[key];

  switch (key) {
    case 'GET_LISTING_DETAILS':
      if (context?.listingId) {
        return `Tell me more about listing ${context.listingId}.`;
      }
      if (context?.listingTitle) {
        return `Tell me more about the listing called "${context.listingTitle}".`;
      }
      return def.baseMessage;

    case 'SEARCH_LISTINGS_IN_CONTEXT':
      if (context?.listingTitle) {
        return `Find me listings similar to "${context.listingTitle}".`;
      }
      return def.baseMessage;

    case 'GET_BOOKING_DETAILS':
      if (context?.bookingId) {
        return `Show me the details for booking ${context.bookingId}.`;
      }
      return def.baseMessage;

    case 'CONTACT_HOST_HELP':
      if (context?.bookingId) {
        return `I need to contact the host about booking ${context.bookingId}.`;
      }
      return def.baseMessage;

    case 'REQUEST_BOOKING_HELP':
      if (context?.bookingId) {
        return `I need help with booking ${context.bookingId}.`;
      }
      return def.baseMessage;

    case 'CANCEL_BOOKING':
      if (context?.bookingId) {
        return `I want to cancel booking ${context.bookingId}.`;
      }
      return def.baseMessage;

    default:
      return def.baseMessage;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Intent resolver — produce a fully typed ChatbotSuggestionIntent
// ─────────────────────────────────────────────────────────────────────────────

let _idCounter = 0;

export function resolveIntent(
  key: ChatbotIntentKey,
  kind: ChatbotSuggestionKind,
  options?: {
    context?: Partial<ChatbotContextPayload>;
    priority?: number;
    /** Override the auto-generated id (useful for deterministic test keys) */
    id?: string;
  },
): ChatbotSuggestionIntent {
  const def = INTENT_DEFINITIONS[key];
  const message = buildIntentMessage(key, options?.context);
  const id = options?.id ?? `${key.toLowerCase()}_${kind}_${++_idCounter}`;

  return {
    id,
    intent: key,
    label: def.label,
    message,
    icon: def.icon,
    variant: def.variant ?? 'default',
    kind,
    priority: options?.priority,
    confirmationHint: def.confirmationHint,
    contextPayload: options?.context,
  };
}

/** Convenience: resolve multiple intents at once */
export function resolveIntents(
  entries: Array<{
    key: ChatbotIntentKey;
    kind: ChatbotSuggestionKind;
    priority?: number;
    context?: Partial<ChatbotContextPayload>;
  }>,
): ChatbotSuggestionIntent[] {
  return entries.map(({ key, kind, priority, context }) =>
    resolveIntent(key, kind, { context, priority }),
  );
}
