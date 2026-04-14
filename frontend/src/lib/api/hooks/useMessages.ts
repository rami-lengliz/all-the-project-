import { useQuery } from '@tanstack/react-query';
import { fetchMessages } from '@/lib/api/chat';

export function useMessages(conversationId: string, page = 1) {
  return useQuery({
    queryKey: ['messages', conversationId, page],
    queryFn: () => fetchMessages(conversationId, page),
    enabled: !!conversationId,
    staleTime: 10_000,
    retry: 1,
  });
}
