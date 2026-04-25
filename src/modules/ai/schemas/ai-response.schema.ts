import { z } from 'zod';

// Zod schemas for AI search response validation

export const FollowUpSchema = z.object({
  question: z.string().min(1, 'Follow-up question cannot be empty'),
  field: z.enum([
    'dates',
    'price',
    'category',
    'bookingType',
    'location',
    'other',
  ]),
  options: z.array(z.string()).optional(),
});

export const SearchFiltersSchema = z.object({
  q: z.string().optional(),
  categorySlug: z.string().optional(),
  minPrice: z.number().min(0).optional(),
  maxPrice: z.number().min(0).optional(),
  bookingType: z.enum(['DAILY', 'SLOT', 'ANY']).optional(),
  availableFrom: z.string().optional(), // YYYY-MM-DD format
  availableTo: z.string().optional(),
  sortBy: z.enum(['distance', 'date', 'price_asc', 'price_desc']).optional(),
  radiusKm: z.number().min(0).max(50).optional(),
});

export const SearchChipSchema = z.object({
  key: z.string(),
  label: z.string(),
});

export const AiResponseFollowUpSchema = z.object({
  mode: z.literal('FOLLOW_UP'),
  followUp: FollowUpSchema,
  filters: SearchFiltersSchema.optional(),
  chips: z.array(SearchChipSchema).optional(),
});

export const AiResponseResultSchema = z.object({
  mode: z.literal('RESULT'),
  filters: SearchFiltersSchema,
  chips: z.array(SearchChipSchema).optional(),
});

export const AiResponseSchema = z.union([
  AiResponseFollowUpSchema,
  AiResponseResultSchema,
]);

export type AiResponse = z.infer<typeof AiResponseSchema>;
export type FollowUp = z.infer<typeof FollowUpSchema>;
export type SearchFilters = z.infer<typeof SearchFiltersSchema>;
export type SearchChip = z.infer<typeof SearchChipSchema>;

// ── Price Suggestion Response Schema ──────────────────────────────────────────

export const PriceSuggestionResponseSchema = z.object({
  recommended: z.number().positive(),
  rangeMin:    z.number().positive(),
  rangeMax:    z.number().positive(),
  confidence:  z.enum(['high', 'medium', 'low']),
  explanation: z.array(z.string()).length(3),
});

export type PriceSuggestionResponse = z.infer<typeof PriceSuggestionResponseSchema>;

/**
 * Safe parser for the raw string returned by Gemini.
 *
 * Steps:
 *  1. Strip markdown code fences (```json ... ``` or ``` ... ```)
 *  2. Extract the first {...} JSON object from the text
 *  3. JSON.parse
 *  4. Zod-validate against PriceSuggestionResponseSchema
 *  5. Return the parsed object or null if any step fails
 *
 * Returning null tells callGeminiPricing() to fall back to the math pipeline.
 */
export function parsePriceSuggestionResponse(raw: string): PriceSuggestionResponse | null {
  try {
    // Step 1 — strip markdown fences (```json\n...\n``` or ```\n...\n```)
    const stripped = raw
      .replace(/```(?:json)?\s*/gi, '')
      .replace(/```/g, '')
      .trim();

    // Step 2 — extract the first {...} block (handles any leading/trailing text)
    const match = stripped.match(/\{[\s\S]*\}/);
    if (!match) return null;

    // Step 3 — JSON parse
    const parsed: unknown = JSON.parse(match[0]);

    // Step 4 — Zod validation (safeParse never throws)
    const result = PriceSuggestionResponseSchema.safeParse(parsed);
    if (!result.success) return null;

    // Step 5 — return validated object
    return result.data;
  } catch {
    return null;
  }
}
