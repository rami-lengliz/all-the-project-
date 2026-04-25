import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api/http';

export function useAdminListingLogs(id: string) {
  return useQuery({
    queryKey: ['admin', 'listings', id, 'logs'],
    queryFn: async () => {
      const res = await api.get(`/admin/listings/${id}/logs`);
      return res.data?.data ?? res.data;
    },
    enabled: !!id,
  });
}
