import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api/http';

export function useAdminPayoutDetails(id: string) {
  return useQuery({
    queryKey: ['admin', 'payouts', id],
    queryFn: async () => {
      if (!id) return null;
      const res = await api.get(`/admin/payouts/${id}`);
      return res.data?.data ?? res.data;
    },
    enabled: !!id,
  });
}
