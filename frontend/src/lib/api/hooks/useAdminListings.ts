import { useQuery } from '@tanstack/react-query';
import { AdminService } from '@/lib/api/generated';

export function useAdminListings() {
  return useQuery({
    queryKey: ['admin', 'listings'],
    queryFn: async () => AdminService.adminControllerGetAllListings(),
  });
}

