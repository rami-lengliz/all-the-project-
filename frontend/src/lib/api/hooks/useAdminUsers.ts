import { useQuery } from '@tanstack/react-query';
import { AdminService } from '@/lib/api/generated';

export function useAdminUsers() {
  return useQuery({
    queryKey: ['admin', 'users'],
    queryFn: async () => AdminService.adminControllerGetAllUsers(),
  });
}

