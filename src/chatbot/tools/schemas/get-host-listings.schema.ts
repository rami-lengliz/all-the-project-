import { z } from 'zod';

export const GetHostListingsToolSchema = z.object({
  limit: z.coerce.number().max(20).default(5).optional(),
}).strip();

export type GetHostListingsToolArgs = z.infer<typeof GetHostListingsToolSchema>;
