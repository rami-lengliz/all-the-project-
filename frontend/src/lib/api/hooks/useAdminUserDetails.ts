import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api/http';

export function useAdminUserDetails(id: string) {
  return useQuery({
    queryKey: ['admin', 'users', id],
    queryFn: async () => {
      const res = await api.get(`/admin/users/${id}`);
      return res.data?.data ?? res.data;
    },
    enabled: !!id,
  });
}
