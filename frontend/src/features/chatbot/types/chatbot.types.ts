export type ChatbotRole = 'user' | 'assistant' | 'system' | 'tool';

export type ToolExecutionStatus =
  | 'success'
  | 'validation_error'
  | 'timeout'
  | 'execution_error'
  | 'policy_blocked'
  | 'not_found'
  | 'confirmation_required'
  | 'rate_limited'
  | 'trust_restricted'
  | 'suspicious_activity'
  | 'cooldown_active'
  | 'too_many_failed_confirmations';

export interface GovernedToolResult {
  status: ToolExecutionStatus;
  output?: any;
  errorMessage?: string;
  metadata?: any;
}

export interface ChatbotMessage {
  id: string;
  role: ChatbotRole;
  content: string;
  createdAt: string;
  toolCallId?: string;
  metadata?: any;
}

export interface Conversation {
  id: string;
  userId: string;
  title: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ChatbotBackendResponse<T = any> {
  success: boolean;
  data: T;
  timestamp: string;
}

export interface ProcessMessageResponse {
  conversationId: string;
  response?: string;
  results?: GovernedToolResult[];
}

export interface ConfirmActionPayload {
  conversationId: string;
  confirmationToken: string;
}

export interface ConfirmActionResponse {
  success: boolean;
  conversationId: string;
  actionName: string;
  result: GovernedToolResult;
}
