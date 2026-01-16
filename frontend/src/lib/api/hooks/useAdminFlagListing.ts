import { useMutation, useQueryClient } from '@tanstack/react-query';
import { AdminService } from '@/lib/api/generated';
import type { FlagListingDto } from '@/lib/api/generated/models/FlagListingDto';

export function useAdminFlagListing() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (dto: FlagListingDto) => AdminService.adminControllerFlagListing(dto),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['admin', 'listings'] });
      await qc.invalidateQueries({ queryKey: ['admin', 'logs'] });
    },
  });
}

