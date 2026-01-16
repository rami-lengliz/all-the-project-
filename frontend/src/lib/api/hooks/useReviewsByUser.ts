import { useQuery } from '@tanstack/react-query';
import { ReviewsService } from '@/lib/api/generated';

export function useReviewsByUser(userId?: string) {
  return useQuery({
    queryKey: ['reviews', 'user', userId],
    enabled: Boolean(userId),
    queryFn: async () => ReviewsService.reviewsControllerFindByUser(userId as string),
  });
}

