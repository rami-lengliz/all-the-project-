import { z } from 'zod';

export const ConfirmChatbotActionSchema = z.object({
  conversationId: z.string().min(1),
  confirmationToken: z.string().min(1)
}).strip();

export type ConfirmChatbotActionDto = z.infer<typeof ConfirmChatbotActionSchema>;
