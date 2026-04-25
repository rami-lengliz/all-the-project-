export interface ChatbotTraceEvent {
  phase: 'request_received' | 'context_loaded' | 'llm_started' | 'llm_completed' | 'tool_started' | 'tool_completed' | 'confirmation_issued' | 'summarization_triggered' | 'summarization_completed' | 'response_generated' | 'failure';
  timestamp: string;
  metadata?: Record<string, any>;
}

export interface ChatbotRequestTrace {
  requestId: string;
  conversationId?: string;
  userId?: string;
  startTime: number;
  endTime?: number;
  totalDurationMs?: number;
  events: ChatbotTraceEvent[];
  error?: string;
  
  // High level metrics
  llmLatencyMs: number;
  toolCount: number;
  toolLatenciesMs: number[];
  modelsUsed: string[];
  totalPromptTokens: number;
  totalCompletionTokens: number;
  summarizationOccurred: boolean;
}
