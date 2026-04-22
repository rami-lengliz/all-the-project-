import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api/http';

export function useAdminUsers() {
  return useQuery({
    queryKey: ['admin', 'users'],
    queryFn: async () => {
      const res = await api.get('/admin/users');
      return res.data?.data ?? res.data;
    },
  });
}
