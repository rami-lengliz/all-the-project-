import { useQuery } from '@tanstack/react-query';
import {
    fetchNearbyCategories,
    type NearbyCategory,
} from '@/lib/api/categories';

// Re-export the type so existing consumers don't need to change their imports
export type { NearbyCategory };

export interface UseCategoriesNearbyParams {
    lat: number;
    lng: number;
    radiusKm: number;
    enabled?: boolean;
}

export function useCategoriesNearby({
    lat,
    lng,
    radiusKm,
    enabled = true,
}: UseCategoriesNearbyParams) {
    return useQuery<NearbyCategory[]>({
        queryKey: ['categories', 'nearby', lat, lng, radiusKm],
        queryFn: () => fetchNearbyCategories(lat, lng, radiusKm),
        enabled,
        staleTime: 30_000,
    });
}
