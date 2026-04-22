import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api/http';

export interface SuspiciousUser {
  id: string;
  name: string;
  email: string;
  suspendedAt: string | null;
  trustTier: string;
  reasons: string[];
  eventCount: number;
}

export function useAdminSuspiciousUsers() {
  return useQuery({
    queryKey: ['admin', 'trust', 'suspicious'],
    queryFn: async () => {
      const res = await api.get<SuspiciousUser[]>('/admin/trust/suspicious');
      return res.data;
    },
  });
}
