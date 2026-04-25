import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api/http';

export function useAdminUserLogs(id: string) {
  return useQuery({
    queryKey: ['admin', 'users', id, 'logs'],
    queryFn: async () => {
      const res = await api.get(`/admin/users/${id}/logs`);
      return res.data?.data ?? res.data;
    },
    enabled: !!id,
  });
}
