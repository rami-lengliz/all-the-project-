import { useQuery } from '@tanstack/react-query';
import { ListingsService } from '@/lib/api/generated';
import type { Listing } from '@/lib/api/types';

export function useListing(id?: string) {
  return useQuery({
    queryKey: ['listing', id],
    enabled: Boolean(id),
    queryFn: async () => (await ListingsService.listingsControllerFindOne(id as string)) as Listing,
  });
}

