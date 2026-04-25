import { z } from 'zod';

export const GetMyBookingsToolSchema = z.object({
  status: z.enum(['pending', 'confirmed', 'paid', 'completed', 'cancelled', 'rejected']).optional(),
  limit: z.coerce.number().max(20).default(5).optional(),
}).strip();

export type GetMyBookingsToolArgs = z.infer<typeof GetMyBookingsToolSchema>;
