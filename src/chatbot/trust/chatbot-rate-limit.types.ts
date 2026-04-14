export type RateLimitCategory = 
  | 'chatbot_message_requests'
  | 'chatbot_tool_calls'
  | 'chatbot_mutation_proposals'
  | 'chatbot_action_confirmations'
  | 'chatbot_failed_confirmations'
  | 'chatbot_help_or_contact_requests';

export interface RateLimitResult {
  allowed: boolean;
  throttleMs: number;
  reason?: string;
  cooldownActive?: boolean;
}
