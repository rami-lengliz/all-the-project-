import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api/http';

export function useListingReviews(listingId: string | undefined) {
  return useQuery({
    queryKey: ['reviews', 'listing', listingId],
    queryFn: async () => {
      const res = await api.get(`/reviews/listing/${listingId}`);
      return (res.data?.data ?? res.data) as any[];
    },
    enabled: !!listingId,
  });
}
