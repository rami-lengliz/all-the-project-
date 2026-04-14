export const ALLOWED_CHATBOT_CATEGORIES = [
  'accommodation',
  'mobility',
  'water-beach-activities',
] as const;

export type ChatbotCategory = typeof ALLOWED_CHATBOT_CATEGORIES[number];

/**
 * Maps the generic prompt-friendly categories back to the internal listing taxonomy slugs.
 * This is the SINGLE SOURCE OF TRUTH for category mapping in the chatbot.
 */
export const CHATBOT_CATEGORY_TO_INTERNAL_SLUG: Record<ChatbotCategory, string> = {
  'accommodation': 'stays',
  'mobility': 'mobility',
  'water-beach-activities': 'beach-gear',
};
