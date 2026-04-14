export interface ChatbotToolContext {
  userId: string;
  role?: string; // 'USER' | 'ADMIN'
  conversationId?: string;
}

export interface ChatbotToolPermissionResult {
  allowed: boolean;
  reasonCode?: string;
  resolvedResourceContext?: any;
  auditMetadata?: Record<string, any>;
}
