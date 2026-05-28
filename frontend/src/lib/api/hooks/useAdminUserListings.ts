import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api/http';

export function useAdminUserListings(userId: string) {
  return useQuery({
    queryKey: ['admin', 'users', userId, 'listings'],
    queryFn: async () => {
      const res = await api.get(`/admin/users/${userId}/listings`);
      return res.data;
    },
    enabled: !!userId,
  });
}
