import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api/http';

export function useAdminMarkTrustReviewed() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ userId, reason }: { userId: string; reason?: string }) => {
      const res = await api.patch(`/admin/users/${userId}/trust/review`, { reason });
      return res.data;
    },
    onSuccess: (_, { userId }) => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'trust', 'suspicious'] });
      queryClient.invalidateQueries({ queryKey: ['admin', 'users', userId, 'trust'] });
    },
  });
}

export function useAdminUpdateTrustTier() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ userId, tier, reason }: { userId: string; tier: string | null; reason: string }) => {
      const res = await api.patch(`/admin/users/${userId}/trust/tier`, { tier, reason });
      return res.data;
    },
    onSuccess: (_, { userId }) => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'trust', 'suspicious'] });
      queryClient.invalidateQueries({ queryKey: ['admin', 'users', userId, 'trust'] });
    },
  });
}
