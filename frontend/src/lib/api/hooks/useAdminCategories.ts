import { useQuery } from '@tanstack/react-query';
import { CategoriesService } from '@/lib/api/generated';

export function useAdminCategories() {
  return useQuery({
    queryKey: ['admin', 'categories'],
    queryFn: async () => {
      const res = await CategoriesService.categoriesControllerFindAllAdmin();
      return Array.isArray(res) ? res : ((res as any)?.data ?? []);
    },
  });
}
