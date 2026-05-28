import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api/http';

export function useBookingReviews(bookingId: string | undefined) {
  return useQuery({
    queryKey: ['reviews', 'booking', bookingId],
    queryFn: async () => {
      const res = await api.get(`/reviews/booking/${bookingId}`);
      return (res.data?.data ?? res.data) as any[];
    },
    enabled: !!bookingId,
  });
}
