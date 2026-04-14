import { z } from 'zod';

export const GetHostBookingRequestsToolSchema = z.object({
  listingId: z.string().optional(),
  status: z.enum(['pending', 'confirmed', 'paid', 'completed', 'cancelled', 'rejected']).optional(),
  limit: z.coerce.number().max(20).default(5).optional(),
}).strip();

export type GetHostBookingRequestsToolArgs = z.infer<typeof GetHostBookingRequestsToolSchema>;
