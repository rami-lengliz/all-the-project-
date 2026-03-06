/**
 * categories.ts — API client for category endpoints
 *
 * Uses NEXT_PUBLIC_API_URL as the base (via centralized env.ts).
 */
import { API_URL } from '@/lib/api/env';

// ── Type ─────────────────────────────────────────────────────────────────────

export type NearbyCategory = {
    id: string;
    slug: string;
    name: string;
    icon?: string | null;
    count: number;
};

// ── Client function ──────────────────────────────────────────────────────────

/**
 * Fetch categories that have active listings within a given radius.
 *
 * @param lat      Latitude of the center point
 * @param lng      Longitude of the center point
 * @param radiusKm Search radius in kilometres (max 50)
 * @returns        Array of categories ordered by listing count desc
 *
 * @example
 *   const cats = await fetchNearbyCategories(36.8578, 11.092, 10);
 */
export async function fetchNearbyCategories(
    lat: number,
    lng: number,
    radiusKm: number,
): Promise<NearbyCategory[]> {
    const params = new URLSearchParams({
        lat: String(lat),
        lng: String(lng),
        radiusKm: String(radiusKm),
    });

    const url = `${API_URL}/api/categories/nearby?${params}`;
    const res = await fetch(url, { cache: 'no-store' });

    if (!res.ok) {
        throw new Error(
            `fetchNearbyCategories failed: ${res.status} ${res.statusText}`,
        );
    }

    const json = await res.json();

    // Backend wraps responses in { data: [...] } via TransformInterceptor
    return (json?.data ?? json) as NearbyCategory[];
}
