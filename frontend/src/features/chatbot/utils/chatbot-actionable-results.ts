/**
 * chatbot-actionable-results.ts
 *
 * Replaces the naive "last successful tool result" backward-scan in
 * ChatbotMessageList with structured, typed detection logic.
 *
 * Provides:
 *  - detectLastActionableResult(messages) — primary public function
 *  - normaliseOutput()                   — internal normaliser
 *  - isActionableToolName()              — guard
 */

import { ChatbotMessage } from '../types/chatbot.types';
import { ChatbotActionableResult } from '../types/chatbot-intents.types';

// ─────────────────────────────────────────────────────────────────────────────
// Which tools produce actionable results worth follow-up suggestions
// ─────────────────────────────────────────────────────────────────────────────

type ActionableCategory = ChatbotActionableResult['category'];

const TOOL_CATEGORY_MAP: Readonly<Record<string, ActionableCategory>> = {
  search_listings: 'listing_search_results',
  get_listing_details: 'listing_details',
  get_my_bookings: 'booking_list',
  get_booking_details: 'booking_details',
  get_host_booking_requests: 'host_booking_requests',
  get_host_listings: 'host_listings',
  search_help_center: 'help_answer',
  // Mutation successes — we surface recovery/follow-up only, not re-execution
  cancel_my_booking_if_allowed: 'mutation_success',
  request_booking_help: 'mutation_success',
  contact_host_about_booking: 'mutation_success',
};

function isActionableToolName(name: string): boolean {
  return name in TOOL_CATEGORY_MAP;
}

// ─────────────────────────────────────────────────────────────────────────────
// Normalise heterogeneous backend output shapes into a stable form
// ─────────────────────────────────────────────────────────────────────────────

interface NormalisedOutput {
  items: any[];          // primary list (may be empty)
  single: any | null;   // single-object result (listing details, booking details)
  raw: any;
}

function normaliseOutput(output: any): NormalisedOutput {
  if (output == null) return { items: [], single: null, raw: output };

  // Array at root
  if (Array.isArray(output)) {
    return { items: output, single: output[0] ?? null, raw: output };
  }

  // Paginated/wrapped: { data: [...] }
  if (Array.isArray(output?.data)) {
    return { items: output.data, single: output.data[0] ?? null, raw: output };
  }

  // Named arrays: listings / bookings / requests
  for (const key of ['listings', 'bookings', 'requests', 'results', 'items']) {
    if (Array.isArray(output?.[key])) {
      return { items: output[key], single: output[key][0] ?? null, raw: output };
    }
  }

  // Single object (listing details, booking details, mutation result)
  return { items: [], single: output, raw: output };
}

// ─────────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Scans the message history from the end and returns the last result that:
 *  1. Comes from an assistant message
 *  2. Has a known actionable tool name
 *  3. Has a status of 'success'
 *  4. Has non-null output
 *  5. Is not a noise state (blocked / confirmation_required / error)
 *
 * Returns null if no actionable result is found.
 */
export function detectLastActionableResult(
  messages: ChatbotMessage[],
): ChatbotActionableResult | null {
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];

    if (msg.role !== 'assistant') continue;

    const result = msg.metadata?.toolResult;
    const toolName: string | undefined = msg.metadata?.toolName;

    if (!result || !toolName) continue;
    if (result.status !== 'success') continue;
    if (result.output == null) continue;
    if (!isActionableToolName(toolName)) continue;

    const category = TOOL_CATEGORY_MAP[toolName];
    const { items, single } = normaliseOutput(result.output);

    const hasItems =
      items.length > 0 || (single != null && typeof single === 'object');

    const primaryId: string | undefined =
      (items[0]?.id as string | undefined) ??
      (single?.id as string | undefined) ??
      undefined;

    const primaryTitle: string | undefined =
      (items[0]?.title as string | undefined) ??
      (items[0]?.name as string | undefined) ??
      (single?.title as string | undefined) ??
      (single?.name as string | undefined) ??
      undefined;

    return {
      toolName,
      category,
      output: result.output,
      hasItems,
      primaryId,
      primaryTitle,
    };
  }

  return null;
}
