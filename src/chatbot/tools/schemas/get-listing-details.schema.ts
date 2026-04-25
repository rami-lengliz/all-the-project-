import { z } from 'zod';

export const GetListingDetailsToolSchema = z.object({
  listingId: z.string().min(1),
}).strip();

export type GetListingDetailsToolArgs = z.infer<typeof GetListingDetailsToolSchema>;
