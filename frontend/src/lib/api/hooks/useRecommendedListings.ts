import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api/http';

export interface RecommendedListing {
  id: string;
  title: string;
  description: string;
  pricePerDay: number;
  images: string[];
  address: string;
  ratingAvg: number;
  qualityScore?: number;
  category?: { id: string; name: string; slug: string } | null;
  host?: { id: string; name: string; avatarUrl: string | null; idVerifiedAt: string | null } | null;
  /** Internal score (0-1+) — useful for debugging, hidden in UI. */
  _score?: number;
  /** Human-readable explanation: "Matches what you usually like", "Verified host", etc. */
  _reasons?: string[];
}

/**
 * Personalized listing feed for the home page.
 *
 * Works for both logged-in users (uses preference vector + interaction history)
 * and anonymous users (cold-start fallback: quality + location + freshness).
 * The lat/lng help with proximity scoring; pass user's detected location.
 */
export function useRecommendedListings(opts: {
  limit?: number;
  lat?: number;
  lng?: number;
  enabled?: boolean;
} = {}) {
  const { limit = 12, lat, lng, enabled = true } = opts;
  return useQuery<RecommendedListing[]>({
    queryKey: ['listings', 'recommended', { limit, lat, lng }],
    enabled,
    staleTime: 60_000,
    queryFn: async () => {
      const params: Record<string, string> = { limit: String(limit) };
      if (lat != null) params.lat = String(lat);
      if (lng != null) params.lng = String(lng);
      const res = await api.get<RecommendedListing[]>('/feed/recommended', { params });
      return Array.isArray(res.data) ? res.data : [];
    },
  });
}
