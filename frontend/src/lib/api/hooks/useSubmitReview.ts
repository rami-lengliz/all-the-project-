import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api/http';

interface ReviewPayload {
  bookingId: string;
  rating: number;
  comment?: string;
}

export function useSubmitReview() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: ReviewPayload) => {
      const res = await api.post('/reviews', payload);
      return res.data;
    },
    onSuccess: (_data, vars) => {
      void qc.invalidateQueries({ queryKey: ['reviews', 'booking', vars.bookingId] });
      void qc.invalidateQueries({ queryKey: ['reviews', 'listing'] });
      void qc.invalidateQueries({ queryKey: ['reviews', 'user'] });
    },
  });
}
