import { z } from 'zod';
import { ALLOWED_CHATBOT_CATEGORIES } from '../../constants/chatbot-category-map';

export const SearchListingsToolSchema = z.object({
  query: z.string().optional(),
  category: z.enum(ALLOWED_CHATBOT_CATEGORIES).optional(),
  lat: z.coerce.number().optional(),
  lng: z.coerce.number().optional(),
  radiusKm: z.coerce.number().max(50).default(10).optional(),
  minPrice: z.coerce.number().min(0).optional(),
  maxPrice: z.coerce.number().min(0).optional(),
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
}).strip(); // strip unknown fields entirely

export type SearchListingsToolArgs = z.infer<typeof SearchListingsToolSchema>;
