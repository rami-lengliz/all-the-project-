import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api/http';
import type { RecommendedListing } from './useRecommendedListings';

/**
 * Content-similarity carousel for the listing detail page.
 * Returns listings semantically close to the current one (by Gemini embedding).
 * Falls back to same-category top-quality listings if embeddings aren't ready.
 */
export function useSimilarListings(listingId: string | undefined, limit = 6) {
  return useQuery<RecommendedListing[]>({
    queryKey: ['listings', 'similar', listingId, limit],
    enabled: !!listingId,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const res = await api.get<RecommendedListing[]>(
        `/listings/${listingId}/similar`,
        { params: { limit: String(limit) } },
      );
      return Array.isArray(res.data) ? res.data : [];
    },
  });
}
