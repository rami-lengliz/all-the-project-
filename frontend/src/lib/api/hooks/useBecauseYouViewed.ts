import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api/http';
import type { RecommendedListing } from './useRecommendedListings';

export interface BecauseYouViewed {
  seed: RecommendedListing;
  items: RecommendedListing[];
}

/**
 * "Because you viewed X" — listings similar to the most recent one the user
 * viewed. Returns null for anonymous users or users with no view history, so
 * the caller can hide the row entirely.
 */
export function useBecauseYouViewed(opts: { limit?: number; enabled?: boolean } = {}) {
  const { limit = 8, enabled = true } = opts;
  return useQuery<BecauseYouViewed | null>({
    queryKey: ['listings', 'because-you-viewed', { limit }],
    enabled,
    staleTime: 60_000,
    queryFn: async () => {
      const res = await api.get<BecauseYouViewed | null>('/feed/because-you-viewed', {
        params: { limit: String(limit) },
      });
      const data = res.data;
      if (!data || !data.seed || !Array.isArray(data.items) || data.items.length === 0) {
        return null;
      }
      return data;
    },
  });
}
