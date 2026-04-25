import { useQuery } from '@tanstack/react-query';
import { ListingsService } from '@/lib/api/generated';

export function useCompareListings(ids: string[]) {
  return useQuery({
    queryKey: ['compare', ids],
    queryFn: async () => {
      const res: any = await ListingsService.listingsControllerCompare(ids as any);
      if (res?.listings) return res;
      return { listings: Array.isArray(res) ? res : (res?.data ?? []), insights: null };
    },
    enabled: ids.length > 0,
  });
}
