import {
  ChatbotPageContext,
  ChatbotSuggestion,
} from '../types/chatbot-suggestions.types';

// ─────────────────────────────────────────────────────────────────────────────
// Static entry-point suggestions (empty state / fresh session)
// ─────────────────────────────────────────────────────────────────────────────

const BASE_SUGGESTIONS: ChatbotSuggestion[] = [
  {
    id: 'search_listings',
    label: 'Find something to rent',
    message: 'I\'m looking for something to rent. Can you help me search?',
    icon: 'fa-magnifying-glass',
    variant: 'default',
  },
  {
    id: 'my_bookings',
    label: 'My bookings',
    message: 'Show me my current bookings.',
    icon: 'fa-calendar-check',
    variant: 'default',
  },
  {
    id: 'help_general',
    label: 'How does this work?',
    message: 'How does RentEverything work? Give me a quick overview.',
    icon: 'fa-circle-question',
    variant: 'info',
  },
  {
    id: 'host_listings',
    label: 'My listings',
    message: 'Show me my active listings.',
    icon: 'fa-store',
    variant: 'default',
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// Context-aware entry points per page type
// ─────────────────────────────────────────────────────────────────────────────

export function getSuggestionsForContext(
  context: ChatbotPageContext | null,
): ChatbotSuggestion[] {
  if (!context) return BASE_SUGGESTIONS;

  switch (context.pageType) {
    case 'listing': {
      const title = context.listingTitle ? `"${context.listingTitle}"` : 'this listing';
      return [
        {
          id: 'listing_details',
          label: 'Tell me about this listing',
          message: context.listingId
            ? `Tell me more about listing ${context.listingId}.`
            : `Tell me about ${title}.`,
          icon: 'fa-circle-info',
          variant: 'info',
        },
        {
          id: 'listing_availability',
          label: 'Check availability',
          message: context.listingId
            ? `What are the available dates for listing ${context.listingId}?`
            : `Is ${title} available next week?`,
          icon: 'fa-calendar',
          variant: 'default',
        },
        {
          id: 'similar_listings',
          label: 'Find similar items',
          message: `Find me listings similar to ${title}.`,
          icon: 'fa-magnifying-glass',
          variant: 'default',
        },
        {
          id: 'help_booking',
          label: 'How do I book?',
          message: 'How do I make a booking on RentEverything?',
          icon: 'fa-circle-question',
          variant: 'info',
        },
      ];
    }

    case 'booking': {
      const bookingRef = context.bookingId ? `booking ${context.bookingId}` : 'my booking';
      return [
        {
          id: 'booking_details',
          label: 'View booking details',
          message: context.bookingId
            ? `Show me the details for booking ${context.bookingId}.`
            : 'Show me my booking details.',
          icon: 'fa-receipt',
          variant: 'default',
        },
        {
          id: 'contact_host',
          label: 'Contact the host',
          message: context.bookingId
            ? `I need to contact the host about booking ${context.bookingId}.`
            : 'I need to contact the host about my booking.',
          icon: 'fa-message',
          variant: 'action',
        },
        {
          id: 'cancel_booking',
          label: 'Cancel this booking',
          message: context.bookingId
            ? `I want to cancel ${bookingRef}.`
            : 'I want to cancel my booking.',
          icon: 'fa-ban',
          variant: 'warning',
        },
        {
          id: 'help_cancellation',
          label: 'Cancellation policy',
          message: 'What is the cancellation policy?',
          icon: 'fa-circle-question',
          variant: 'info',
        },
      ];
    }

    case 'host-dashboard': {
      return [
        {
          id: 'host_booking_requests',
          label: 'Pending requests',
          message: 'Show me my pending booking requests.',
          icon: 'fa-inbox',
          variant: 'action',
        },
        {
          id: 'host_listings',
          label: 'My listings',
          message: 'Show me all my active listings.',
          icon: 'fa-store',
          variant: 'default',
        },
        {
          id: 'host_earnings',
          label: 'Earnings overview',
          message: 'Give me a summary of my recent earnings.',
          icon: 'fa-coins',
          variant: 'info',
        },
        {
          id: 'help_host',
          label: 'Host tips',
          message: 'What are some tips for being a great host?',
          icon: 'fa-lightbulb',
          variant: 'info',
        },
      ];
    }

    case 'search': {
      const baseSearch: ChatbotSuggestion[] = [
        {
          id: 'search_refine',
          label: 'Refine my search',
          message: context.searchQuery
            ? `Help me find better results for: ${context.searchQuery}`
            : 'Help me find what I\'m looking for.',
          icon: 'fa-sliders',
          variant: 'default',
        },
        {
          id: 'search_category',
          label: 'Search by category',
          message: 'What categories are available on RentEverything?',
          icon: 'fa-folder-open',
          variant: 'info',
        },
      ];
      return [...baseSearch, ...BASE_SUGGESTIONS.slice(0, 2)];
    }

    case 'help':
      return [
        {
          id: 'help_bookings',
          label: 'Booking questions',
          message: 'I have a question about my booking.',
          icon: 'fa-calendar-check',
          variant: 'info',
        },
        {
          id: 'help_payments',
          label: 'Payment help',
          message: 'I have a question about a payment.',
          icon: 'fa-credit-card',
          variant: 'info',
        },
        {
          id: 'help_cancellation',
          label: 'Cancellation policy',
          message: 'What is the cancellation and refund policy?',
          icon: 'fa-rotate-left',
          variant: 'info',
        },
        {
          id: 'help_listing_issue',
          label: 'Report an issue',
          message: 'I need help reporting an issue with a listing.',
          icon: 'fa-flag',
          variant: 'warning',
        },
      ];

    default:
      return BASE_SUGGESTIONS;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Post-result next-step suggestions (action chaining)
// Maps a tool that just returned successfully to logical follow-up actions.
// ─────────────────────────────────────────────────────────────────────────────

export function getNextStepSuggestions(
  toolName: string,
  output: any,
): ChatbotSuggestion[] {
  switch (toolName) {
    case 'search_listings': {
      const items = Array.isArray(output)
        ? output
        : output?.data ?? output?.listings ?? [];
      const suggestions: ChatbotSuggestion[] = [
        {
          id: 'ns_search_refine',
          label: 'Refine results',
          message: 'Can you refine these results? I\'m looking for something more specific.',
          icon: 'fa-sliders',
          variant: 'default',
        },
        {
          id: 'ns_search_more',
          label: 'Show more',
          message: 'Show me more listings like these.',
          icon: 'fa-arrows-rotate',
          variant: 'default',
        },
      ];
      // If results returned, offer detail lookup on the first item
      if (items.length > 0 && items[0]?.id) {
        suggestions.unshift({
          id: `ns_listing_detail_${items[0].id}`,
          label: `Details: ${items[0].title?.slice(0, 20) ?? 'first result'}`,
          message: `Tell me more about listing ${items[0].id}.`,
          icon: 'fa-circle-info',
          variant: 'info',
        });
      }
      return suggestions;
    }

    case 'get_listing_details': {
      const id = output?.id;
      return [
        {
          id: 'ns_similar',
          label: 'Find similar listings',
          message: `Find listings similar to ${output?.title ?? 'this one'}.`,
          icon: 'fa-magnifying-glass',
          variant: 'default',
        },
        {
          id: 'ns_booking_help',
          label: 'How to book this',
          message: 'How do I make a booking on RentEverything?',
          icon: 'fa-circle-question',
          variant: 'info',
        },
        ...(id
          ? [{
              id: `ns_contact_about_${id}`,
              label: 'Ask host a question',
              message: `I want to contact the host about listing ${id}.`,
              icon: 'fa-message',
              variant: 'action' as const,
            }]
          : []),
      ];
    }

    case 'get_my_bookings': {
      const items = Array.isArray(output) ? output : output?.data ?? output?.bookings ?? [];
      const suggestions: ChatbotSuggestion[] = [
        {
          id: 'ns_booking_help',
          label: 'Cancellation policy',
          message: 'What is the cancellation policy?',
          icon: 'fa-circle-question',
          variant: 'info',
        },
      ];
      if (items.length > 0 && items[0]?.id) {
        suggestions.unshift({
          id: `ns_booking_detail_${items[0].id}`,
          label: 'Details of first booking',
          message: `Show me the details for booking ${items[0].id}.`,
          icon: 'fa-receipt',
          variant: 'default',
        });
      }
      return suggestions;
    }

    case 'get_host_booking_requests': {
      return [
        {
          id: 'ns_host_listings',
          label: 'View my listings',
          message: 'Show me all my active listings.',
          icon: 'fa-store',
          variant: 'default',
        },
        {
          id: 'ns_host_help',
          label: 'Host guidelines',
          message: 'What are the host guidelines and best practices?',
          icon: 'fa-lightbulb',
          variant: 'info',
        },
      ];
    }

    case 'request_booking_help':
    case 'contact_host_about_booking': {
      return [
        {
          id: 'ns_my_bookings',
          label: 'Back to my bookings',
          message: 'Show me my current bookings.',
          icon: 'fa-calendar-check',
          variant: 'default',
        },
      ];
    }

    case 'cancel_my_booking_if_allowed': {
      return [
        {
          id: 'ns_search_again',
          label: 'Search for alternatives',
          message: 'Help me find an alternative to rent.',
          icon: 'fa-magnifying-glass',
          variant: 'default',
        },
        {
          id: 'ns_refund_help',
          label: 'Refund timeline?',
          message: 'When will I receive my refund after a cancellation?',
          icon: 'fa-credit-card',
          variant: 'info',
        },
      ];
    }

    default:
      // Generic fallback: offer the most universally useful next steps
      return [
        {
          id: 'ns_search',
          label: 'Search listings',
          message: 'Help me find something to rent.',
          icon: 'fa-magnifying-glass',
          variant: 'default',
        },
        {
          id: 'ns_bookings',
          label: 'My bookings',
          message: 'Show me my current bookings.',
          icon: 'fa-calendar-check',
          variant: 'default',
        },
      ];
  }
}
