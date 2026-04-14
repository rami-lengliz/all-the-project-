import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api/http';

export function useVerifyUser() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      const response = await api.post('/users/me/verify');
      return response.data;
    },
    onSuccess: () => {
      // Invalidate profile query to refetch updated user data
      queryClient.invalidateQueries({ queryKey: ['users', 'me'] });
    },
  });
}
