import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api/http';

export interface ModerateUserVariables {
  userId: string;
  action: 'suspend' | 'unsuspend';
  reason?: string;
}

export function useAdminModerateUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ userId, action, reason }: ModerateUserVariables) => {
      const res = await api.patch(`/admin/users/${userId}/${action}`, { reason });
      return res.data;
    },
    onSuccess: async (_, vars) => {
      // Invalidate the users list, the specific user detail, and their logs
      await qc.invalidateQueries({ queryKey: ['admin', 'users'] });
      await qc.invalidateQueries({ queryKey: ['admin', 'users', vars.userId] });
      await qc.invalidateQueries({ queryKey: ['admin', 'users', vars.userId, 'logs'] });
      await qc.invalidateQueries({ queryKey: ['admin', 'logs'] });
    },
  });
}
