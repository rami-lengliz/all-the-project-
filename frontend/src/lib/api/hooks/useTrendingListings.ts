import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api/http';
import type { RecommendedListing } from './useRecommendedListings';

/**
 * "Trending this week" — most-booked listings over the last 7 days.
 * Public; falls back to top-quality listings when booking activity is thin.
 */
export function useTrendingListings(opts: { limit?: number; enabled?: boolean } = {}) {
  const { limit = 8, enabled = true } = opts;
  return useQuery<RecommendedListing[]>({
    queryKey: ['listings', 'trending', { limit }],
    enabled,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const res = await api.get<RecommendedListing[]>('/feed/trending', {
        params: { limit: String(limit) },
      });
      return Array.isArray(res.data) ? res.data : [];
    },
  });
}
