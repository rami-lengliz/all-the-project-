import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api/http';
import { useAuth } from '@/lib/auth/AuthProvider';

const QUERY_KEY = ['wishlist', 'ids'];

/** Returns the set of wishlisted listing IDs for the current user. One request per page load — shared across all WishlistButton instances. */
export function useWishlistIds(): Set<string> {
  const { user } = useAuth();
  const { data } = useQuery<string[]>({
    queryKey: QUERY_KEY,
    queryFn: async () => {
      const res = await api.get<{ id: string }[]>('/wishlist');
      return (res.data ?? []).map((l) => l.id);
    },
    enabled: !!user,
    staleTime: 30_000,
  });
  return new Set(data ?? []);
}

/** Invalidate the shared wishlist cache (call after add/remove). */
export function useInvalidateWishlist() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: QUERY_KEY });
}
