/**
 * A single suggested quick-action the user can tap to send a pre-filled message.
 * The `message` field is what actually gets submitted to the backend – it must
 * map to a real supported tool/intent recognised by the chatbot system prompt.
 */
export interface ChatbotSuggestion {
  /** Unique stable key used as React key / tracking id */
  id: string;
  /** Short human-readable label shown in the chip */
  label: string;
  /** The exact text that will be sent as a user message when tapped */
  message: string;
  /** Optional icon class (FontAwesome solid) */
  icon?: string;
  /** Visual variant – drives the chip colour */
  variant?: 'default' | 'action' | 'info' | 'warning';
}

/**
 * Page context passed in by the host page so the panel can surface
 * context-sensitive entry points without faking any authorization.
 */
export interface ChatbotPageContext {
  pageType: 'listing' | 'booking' | 'host-dashboard' | 'search' | 'help' | 'generic';
  listingId?: string;
  listingTitle?: string;
  bookingId?: string;
  searchQuery?: string;
  isHost?: boolean;
}

/**
 * Result of mapping a tool output to a next-step suggestion set.
 */
export interface ToolResultSuggestions {
  toolName: string;
  suggestions: ChatbotSuggestion[];
}
