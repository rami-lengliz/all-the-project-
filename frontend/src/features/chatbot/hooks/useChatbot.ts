import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { chatbotApi } from '../api/chatbot.api';
import { ConfirmActionPayload } from '../types/chatbot.types';
import { useAuth } from '@/lib/auth/AuthProvider';

export function useChatbotConversations() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['chatbot', 'conversations'],
    queryFn: chatbotApi.getConversations,
    enabled: !!user,
    staleTime: 30_000, // don't refetch the list on every render
  });
}

export function useChatbotMessages(conversationId: string | null) {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['chatbot', 'messages', conversationId],
    queryFn: () => chatbotApi.getConversationMessages(conversationId!),
    enabled: !!user && !!conversationId,
    refetchOnWindowFocus: false,
    staleTime: 10_000,
  });
}

/**
 * Loads messages for up to 3 additional conversation IDs in parallel.
 * Uses a fixed number of React Query hooks (Rules of Hooks compliant —
 * hooks must not be called inside loops or conditional branches).
 * Slots that have no corresponding ID remain disabled.
 */
export function useChatbotMultiMessages(conversationIds: string[]) {
  const { user } = useAuth();

  // Fixed 3 slots — hooks called unconditionally, enabled flag varies
  const id0 = conversationIds[0] ?? null;
  const id1 = conversationIds[1] ?? null;
  const id2 = conversationIds[2] ?? null;

  const q0 = useQuery({
    queryKey: ['chatbot', 'messages', id0],
    queryFn: () => chatbotApi.getConversationMessages(id0!),
    enabled: !!user && !!id0,
    refetchOnWindowFocus: false,
    staleTime: 30_000,
  });
  const q1 = useQuery({
    queryKey: ['chatbot', 'messages', id1],
    queryFn: () => chatbotApi.getConversationMessages(id1!),
    enabled: !!user && !!id1,
    refetchOnWindowFocus: false,
    staleTime: 30_000,
  });
  const q2 = useQuery({
    queryKey: ['chatbot', 'messages', id2],
    queryFn: () => chatbotApi.getConversationMessages(id2!),
    enabled: !!user && !!id2,
    refetchOnWindowFocus: false,
    staleTime: 30_000,
  });

  return [
    { conversationId: id0, messages: q0.data ?? [], isLoading: q0.isPending },
    { conversationId: id1, messages: q1.data ?? [], isLoading: q1.isPending },
    { conversationId: id2, messages: q2.data ?? [], isLoading: q2.isPending },
  ].filter((entry) => entry.conversationId !== null) as Array<{
    conversationId: string;
    messages: import('../types/chatbot.types').ChatbotMessage[];
    isLoading: boolean;
  }>;
}

export function useSendChatbotMessage() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      message,
      conversationId,
    }: {
      message: string;
      conversationId?: string;
    }) => chatbotApi.sendMessage(message, conversationId),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['chatbot', 'conversations'] });
      queryClient.invalidateQueries({
        queryKey: ['chatbot', 'messages', data.conversationId],
      });
    },
  });
}

export function useConfirmChatbotAction() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: ConfirmActionPayload) =>
      chatbotApi.confirmAction(payload),
    onSuccess: (data) => {
      queryClient.invalidateQueries({
        queryKey: ['chatbot', 'messages', data.conversationId],
      });
    },
  });
}
