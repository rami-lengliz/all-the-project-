import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api/http';

export function useAdminListingDetails(id: string) {
  return useQuery({
    queryKey: ['admin', 'listings', id],
    queryFn: async () => {
      const res = await api.get(`/admin/listings/${id}`);
      return res.data?.data ?? res.data;
    },
    enabled: !!id,
  });
}
