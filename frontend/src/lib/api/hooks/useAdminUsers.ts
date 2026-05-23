import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api/http';

export function useAdminUsers(search?: string) {
  return useQuery({
    queryKey: ['admin', 'users', search ?? ''],
    queryFn: async () => {
      const params = search ? `?search=${encodeURIComponent(search)}` : '';
      const res = await api.get(`/admin/users${params}`);
      return res.data;
    },
  });
}
