import { api } from '@/lib/api/http';
import {
  ChatbotBackendResponse,
  ChatbotMessage,
  ConfirmActionPayload,
  ConfirmActionResponse,
  Conversation,
  ProcessMessageResponse,
} from '../types/chatbot.types';

export const chatbotApi = {
  getConversations: async (): Promise<Conversation[]> => {
    const res = await api.get<ChatbotBackendResponse<Conversation[]>>('/chatbot/conversations');
    return res.data;
  },

  getConversationMessages: async (conversationId: string): Promise<ChatbotMessage[]> => {
    const res = await api.get<ChatbotBackendResponse<ChatbotMessage[]>>(`/chatbot/conversations/${conversationId}/messages`);
    return res.data;
  },

  sendMessage: async (message: string, conversationId?: string): Promise<ProcessMessageResponse> => {
    const res = await api.post<ChatbotBackendResponse<ProcessMessageResponse>>('/chatbot/messages', {
      message,
      conversationId,
    }, {
      timeout: 120_000,  // Ollama / local LLM can be slow
    });
    return res.data;
  },

  confirmAction: async (payload: ConfirmActionPayload): Promise<ConfirmActionResponse> => {
    const res = await api.post<ChatbotBackendResponse<ConfirmActionResponse>>('/chatbot/actions/confirm', payload);
    return res.data;
  },
};
