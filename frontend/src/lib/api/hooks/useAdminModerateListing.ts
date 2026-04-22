import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api/http';

export interface ModerateListingVariables {
  listingId: string;
  action: 'approve' | 'suspend';
  reason?: string;
}

export function useAdminModerateListing() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ listingId, action, reason }: ModerateListingVariables) => {
      const res = await api.patch(`/admin/listings/${listingId}/${action}`, { reason });
      return res.data;
    },
    onSuccess: async (_, vars) => {
      await qc.invalidateQueries({ queryKey: ['admin', 'listings'] });
      await qc.invalidateQueries({ queryKey: ['admin', 'listings', vars.listingId] });
      await qc.invalidateQueries({ queryKey: ['admin', 'listings', vars.listingId, 'logs'] });
      await qc.invalidateQueries({ queryKey: ['admin', 'logs'] });
    },
  });
}
