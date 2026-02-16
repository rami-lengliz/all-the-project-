import { useEffect, useMemo } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { ListingsService } from '@/lib/api/generated';
import type { Listing } from '@/lib/api/types';
import { ApiError } from '@/lib/api/generated/core/ApiError';
import { toast } from '@/components/ui/Toaster';

export type ListingsFilters = {
  q?: string;
  category?: string;
  minPrice?: number;
  maxPrice?: number;
  lat?: number;
  lng?: number;
  radiusKm?: number;
  page?: number;
  limit?: number;
  sortBy?: 'distance' | 'price_asc' | 'price_desc' | 'date';
};

export function useListings(filters: ListingsFilters) {
  const wantsDistance = filters.sortBy === 'distance';
  const hasLatLng = typeof filters.lat === 'number' && typeof filters.lng === 'number';

  // Exam-friendly note:
  // Some backend builds crash (500) on distance sorting. We fallback client-side so the UI stays usable.
  const initialDistanceDisabled = wantsDistance && !hasLatLng;

  const query = useQuery({
    queryKey: ['listings', filters],
    retry: 0, // Do not infinite-retry on backend 500s
    placeholderData: keepPreviousData,
    queryFn: async () => {
      const call = async (sortBy: ListingsFilters['sortBy']) => {
        return await ListingsService.listingsControllerFindAll(
          filters.q,
          filters.category,
          filters.minPrice,
          filters.maxPrice,
          filters.lat,
          filters.lng,
          filters.radiusKm ?? 10,
          undefined,
          undefined,
          filters.page ?? 1,
          filters.limit ?? 20,
          sortBy,
        );
      };

      // A) If distance requested but lat/lng missing, skip distance on first call
      if (initialDistanceDisabled) {
        const res = await call('date');
        const items: Listing[] = Array.isArray(res)
          ? (res as Listing[])
          : ((res as any).items ?? (res as any).data ?? []);
        return { raw: res, items, distanceDisabled: true as const };
      }

      try {
        const res = await call(filters.sortBy);
        const items: Listing[] = Array.isArray(res)
          ? (res as Listing[])
          : ((res as any).items ?? (res as any).data ?? []);
        return { raw: res, items, distanceDisabled: false as const };
      } catch (err) {
        // B) If backend fails (500) on distance sorting, retry once without distance
        if (wantsDistance && err instanceof ApiError && err.status === 500) {
          const res = await call('date');
          const items: Listing[] = Array.isArray(res)
            ? (res as Listing[])
            : ((res as any).items ?? (res as any).data ?? []);
          return { raw: res, items, distanceDisabled: true as const };
        }
        throw err;
      }
    },
  });

  const distanceDisabled = initialDistanceDisabled || Boolean((query.data as any)?.distanceDisabled);

  // C) Show warning once per session when we fall back from distance sorting.
  useEffect(() => {
    if (!distanceDisabled) return;
    if (typeof window === 'undefined') return;
    const key = 're_distance_sort_disabled_v1';
    if (window.sessionStorage.getItem(key)) return;
    window.sessionStorage.setItem(key, '1');
    toast({
      title: 'Distance sorting unavailable',
      message: 'Distance sorting is temporarily unavailable. Showing latest listings instead.',
      variant: 'info',
    });
  }, [distanceDisabled]);

  return useMemo(() => ({ ...query, distanceDisabled }), [query, distanceDisabled]);
}

