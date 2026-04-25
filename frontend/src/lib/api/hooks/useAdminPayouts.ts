import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api/http';

export function useAdminPayouts(status?: string, page = 1, limit = 50) {
  return useQuery({
    queryKey: ['admin', 'payouts', { status, page, limit }],
    queryFn: async () => {
      const res = await api.get('/admin/payouts', { params: { status, page, limit } });
      return res.data?.data ?? res.data;
    },
  });
}
