import { useQuery } from '@tanstack/react-query';
import { fetchConversations } from '@/lib/api/chat';

export function useConversations() {
  return useQuery({
    queryKey: ['conversations'],
    queryFn: fetchConversations,
    staleTime: 10_000, // 10 seconds
    retry: 1,
  });
}
