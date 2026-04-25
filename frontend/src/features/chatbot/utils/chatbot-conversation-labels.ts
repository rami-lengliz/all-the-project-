/**
 * chatbot-conversation-labels.ts
 *
 * Pure utility for deriving a safe, human-readable label for a conversation.
 * Priority order:
 *   1. backend-provided title (if non-empty)
 *   2. last actionable result category → category-derived text
 *   3. last meaningful user or assistant text snippet
 *   4. generic fallback
 *
 * No React, no side-effects — fully testable.
 */

import { Conversation, ChatbotMessage } from '../types/chatbot.types';
import {
  ChatbotConversationLabel,
} from '../types/chatbot-continuity.types';
import { detectLastActionableResult } from './chatbot-actionable-results';

// ─────────────────────────────────────────────────────────────────────────────
// Category → human label map
// ─────────────────────────────────────────────────────────────────────────────

const CATEGORY_LABELS: Record<string, string> = {
  listing_search_results: 'Listing search',
  listing_details: 'Listing details',
  booking_list: 'My bookings',
  booking_details: 'Booking details',
  host_booking_requests: 'Booking requests',
  host_listings: 'My listings',
  help_answer: 'Help center',
  mutation_success: 'Action completed',
  unknown: 'Recent activity',
};

// ─────────────────────────────────────────────────────────────────────────────
// Message snippet extraction
// ─────────────────────────────────────────────────────────────────────────────

/** Minimum number of word characters a snippet must contain to be useful */
const MIN_WORD_CHARS = 3;

function isMeaningfulSnippet(text: string): boolean {
  return (text.match(/\w/g) ?? []).length >= MIN_WORD_CHARS;
}

/**
 * Extract a short, safe text snippet from message history.
 * Prefers the last user message, then the last assistant text.
 * Truncates to 40 chars. Rejects whitespace/punctuation-only content.
 */
function extractMessageSnippet(messages: ChatbotMessage[]): string | null {
  // Try last user message first (most meaningful as a self-description)
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];
    if (
      msg.role === 'user' &&
      typeof msg.content === 'string'
    ) {
      const snippet = msg.content.trim().replace(/\s+/g, ' ');
      if (!isMeaningfulSnippet(snippet)) continue;
      return snippet.length > 40 ? snippet.slice(0, 37) + '…' : snippet;
    }
  }
  // Fall back to last assistant text (non-empty, non-tool)
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];
    if (
      msg.role === 'assistant' &&
      typeof msg.content === 'string' &&
      !msg.metadata?.toolName // skip pure tool responses
    ) {
      const snippet = msg.content.trim().replace(/\s+/g, ' ');
      if (!isMeaningfulSnippet(snippet)) continue;
      return snippet.length > 40 ? snippet.slice(0, 37) + '…' : snippet;
    }
  }
  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Derive a conversation label given the conversation metadata and its messages.
 * messages may be empty (e.g. when listing without loading history).
 */
export function deriveConversationLabel(
  conversation: Conversation,
  messages: ChatbotMessage[] = [],
): ChatbotConversationLabel {
  // 1. Backend-provided title
  if (conversation.title && conversation.title.trim().length > 0) {
    return { text: conversation.title.trim(), source: 'backend_title' };
  }

  // 2. Actionable result category
  if (messages.length > 0) {
    const actionable = detectLastActionableResult(messages);
    if (actionable && actionable.category !== 'unknown') {
      const base = CATEGORY_LABELS[actionable.category] ?? 'Recent activity';
      // Enrich with primaryTitle if available
      const text = actionable.primaryTitle
        ? `${base}: ${actionable.primaryTitle.slice(0, 25)}`
        : base;
      return { text, source: 'actionable_result' };
    }
  }

  // 3. Message snippet
  if (messages.length > 0) {
    const snippet = extractMessageSnippet(messages);
    if (snippet) {
      return { text: snippet, source: 'message_snippet' };
    }
  }

  // 4. Fallback
  return { text: 'New conversation', source: 'fallback' };
}

/**
 * Format a conversation's updatedAt timestamp into a compact relative label.
 * e.g. "Just now", "2h ago", "3 days ago"
 */
export function formatRelativeTime(isoString: string): string {
  try {
    const date = new Date(isoString);
    if (isNaN(date.getTime())) return '';

    const diffMs = Date.now() - date.getTime();
    const diffMin = Math.floor(diffMs / 60_000);
    const diffHr = Math.floor(diffMs / 3_600_000);
    const diffDay = Math.floor(diffMs / 86_400_000);

    if (diffMin < 1) return 'Just now';
    if (diffMin < 60) return `${diffMin}m ago`;
    if (diffHr < 24) return `${diffHr}h ago`;
    if (diffDay < 7) return `${diffDay}d ago`;
    return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  } catch {
    return '';
  }
}
