import { z } from 'zod';

export const GetBookingDetailsToolSchema = z.object({
  bookingId: z.string().min(1),
}).strip();

export type GetBookingDetailsToolArgs = z.infer<typeof GetBookingDetailsToolSchema>;
