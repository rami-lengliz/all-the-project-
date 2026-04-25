export type ChatbotTrustTier = 'NORMAL' | 'LIMITED' | 'RESTRICTED' | 'SUSPICIOUS';

export interface ChatbotTrustStatus {
  tier: ChatbotTrustTier;
  reasons: string[];
  suggestedRestrictions: string[];
}

export type SecurityEventType = 
  | 'rate_limit_exceeded' 
  | 'suspicious_payload' 
  | 'confirmation_replay' 
  | 'cross_resource_probe'
  | 'excessive_failed_confirmations'
  | 'excessive_unauthorized_tools'
  | 'mutation_spam'
  | 'cooldown_applied';

export interface AddSecurityEventPayload {
  userId: string;
  conversationId?: string;
  eventType: SecurityEventType;
  severity: 'low' | 'medium' | 'high' | 'critical';
  reasonCode: string;
  metadata?: Record<string, any>;
}
