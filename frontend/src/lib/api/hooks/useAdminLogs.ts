import { useQuery } from '@tanstack/react-query';
import { AdminService } from '@/lib/api/generated';

export function useAdminLogs(limit = 50) {
  return useQuery({
    queryKey: ['admin', 'logs', limit],
    queryFn: async () => AdminService.adminControllerGetLogs(limit),
  });
}

