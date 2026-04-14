import { z } from 'zod';

export const RequestBookingHelpSchema = z.object({
  bookingId: z.string().min(1),
  reason: z.enum(['general_inquiry', 'delay', 'item_condition', 'cant_find_host', 'other']),
  message: z.string().max(500).optional(),
}).strip();

export type RequestBookingHelpArgs = z.infer<typeof RequestBookingHelpSchema>;
