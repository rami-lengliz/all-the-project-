import { useQuery } from '@tanstack/react-query';
import { CategoriesService } from '@/lib/api/generated';
import type { Category } from '@/lib/api/types';

export function useCategories() {
  return useQuery({
    queryKey: ['categories'],
    queryFn: async () => {
      const res: any = await CategoriesService.categoriesControllerFindAll();
      return (res.data?.data ?? res.data ?? []) as Category[];
    },
  });
}
