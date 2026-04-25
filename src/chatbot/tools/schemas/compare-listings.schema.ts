import { z } from 'zod';

export const CompareListingsSchema = z.object({
  listingIds: z.array(z.string().uuid()).min(2).max(3).describe('An array of 2 to 3 listing UUIDs to compare.'),
}).strip();

export type CompareListingsArgs = z.infer<typeof CompareListingsSchema>;
