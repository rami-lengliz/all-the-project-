import { useQuery } from '@tanstack/react-query';
import { CategoriesService } from '@/lib/api/generated';

export function useAdminCategoryRequests(status?: string) {
  return useQuery({
    queryKey: ['admin', 'category-requests', status],
    queryFn: async () => CategoriesService.categoriesControllerFindAllRequests(status as any),
  });
}
