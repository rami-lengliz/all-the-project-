import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ReviewsService } from '@/lib/api/generated';
import type { CreateReviewDto } from '@/lib/api/generated/models/CreateReviewDto';

export function useCreateReview() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (dto: CreateReviewDto) => ReviewsService.reviewsControllerCreate(dto),
    onSuccess: async (_data, variables) => {
      // Best-effort: refresh all review lists (we don't know target user id from dto)
      await qc.invalidateQueries({ queryKey: ['reviews'] });
      await qc.invalidateQueries({ queryKey: ['bookings', 'me'] });
    },
  });
}

