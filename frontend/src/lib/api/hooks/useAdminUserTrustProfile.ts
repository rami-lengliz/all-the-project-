import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api/http';

export interface TrustEvent {
  id: string;
  eventType: string;
  severity: string;
  reasonCode: string;
  createdAt: string;
  metadata: any;
  conversationId: string | null;
}

export interface UserTrustProfile {
  userId: string;
  tier: string;
  reasons: string[];
  suggestedRestrictions: string[];
  manualTier: string | null;
  reviewedAt: string | null;
  suspendedAt: string | null;
  events: TrustEvent[];
}

export function useAdminUserTrustProfile(userId: string) {
  return useQuery({
    queryKey: ['admin', 'users', userId, 'trust'],
    queryFn: async () => {
      const res = await api.get<UserTrustProfile>(`/admin/users/${userId}/trust`);
      return res.data;
    },
    enabled: !!userId,
  });
}
