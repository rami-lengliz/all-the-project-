import { z } from 'zod';

export const CancelMyBookingIfAllowedSchema = z.object({
  bookingId: z.string().min(1),
  reason: z.string().max(500).optional(),
}).strip();

export type CancelMyBookingIfAllowedArgs = z.infer<typeof CancelMyBookingIfAllowedSchema>;
