import { z } from 'zod';

export const ContactHostAboutBookingSchema = z.object({
  bookingId: z.string().min(1),
  message: z.string().min(5).max(500),
}).strip();

export type ContactHostAboutBookingArgs = z.infer<typeof ContactHostAboutBookingSchema>;
