import { z } from 'zod';

export const HelpCenterSearchToolSchema = z.object({
  query: z.string().min(1).max(200),
}).strip();

export type HelpCenterSearchToolArgs = z.infer<typeof HelpCenterSearchToolSchema>;
