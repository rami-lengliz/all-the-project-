/**
 * chatbot-comparison.types.ts
 *
 * Decision-support model for comparing listings.
 * Holds only safe, visible data derived from backend tool results.
 */

export interface ChatbotComparisonItem {
  id: string;
  title: string;
  price?: number;
  currency?: string;
  location?: string;
  category?: string;
  image?: string;
  /** Safe subset of attributes for side-by-side view (max 3) */
  attributes: { label: string; value: string }[];
}

export type ChatbotComparisonMetricKind =
  | 'price'
  | 'location'
  | 'amenity_count'
  | 'category_match';

export interface ChatbotComparisonMetric {
  kind: ChatbotComparisonMetricKind;
  label: string;
  /** Which item is better on this metric? (if applicable) */
  betterItemId?: string;
  explanation: string;
}

export interface ChatbotComparisonSummary {
  /** "Best value", "Closer match", etc. */
  headline?: string;
  metrics: ChatbotComparisonMetric[];
  /** IDs of the 2-3 listings being compared */
  itemIds: string[];
}

export interface ChatbotComparisonState {
  /** True if the user is actively in a comparison view or triggered a comparison */
  isActive: boolean;
  items: ChatbotComparisonItem[];
  summary?: ChatbotComparisonSummary;
  /** Limit enforced by logic: 3 items max */
  isLimitReached: boolean;
}

export const NULL_COMPARISON_STATE: ChatbotComparisonState = {
  isActive: false,
  items: [],
  isLimitReached: false,
};
