// Internal Provider-Agnostic Types for LLM Interoperability

export type LlmRole = 'user' | 'assistant' | 'system' | 'tool';

export interface LlmToolRequest {
  id: string; // Internal or provider-generated call id
  name: string;
  arguments: any; // Raw parsed arguments
}

export interface LlmConversationTurn {
  role: LlmRole;
  content: string;
  // If the assistant requested tools:
  toolRequests?: LlmToolRequest[];
  // If this turn role = 'tool', we need to link it back:
  toolCallId?: string;
  toolName?: string;
}

export interface LlmAssistantOutput {
  text: string;
  toolRequests?: LlmToolRequest[];
  finishReason: 'stop' | 'tool_calls' | 'length' | 'content_filter' | 'unknown';
  metadata?: any;
}

export interface LlmToolDefinition {
  name: string;
  description: string;
  schema: any; // e.g. JSON schema block
}

export interface LlmGenerationOptions {
  model?: string;
  temperature?: number;
  maxTokens?: number;
  systemPrompt?: string;
  tools?: LlmToolDefinition[];
  forceToolName?: string; // If we explicitly force the model to use a specific tool
}
