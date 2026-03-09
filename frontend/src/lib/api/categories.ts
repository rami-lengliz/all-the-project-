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
/** Timeout in ms for categories fetch — shorter than AI search since it's a simple DB query. */
const CATEGORIES_TIMEOUT_MS = 10_000;

export async function fetchNearbyCategories(
    lat: number,
    lng: number,
    radiusKm: number,
): Promise<NearbyCategory[]> {
    // Clamp to valid backend range: 1–50 km
    const safeRadius = Math.min(50, Math.max(1, radiusKm));

    const params = new URLSearchParams({
        lat: String(lat),
        lng: String(lng),
        radiusKm: String(safeRadius),
    });

    const url = `${API_URL}/api/categories/nearby?${params}`;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), CATEGORIES_TIMEOUT_MS);

    let res: Response;
    try {
        res = await fetch(url, { cache: 'no-store', signal: controller.signal });
    } catch (e: any) {
        if (e?.name === 'AbortError') {
            throw new Error('Categories request timed out. Please try again.');
        }
        throw new Error('Could not reach the server. Check your connection and try again.');
    } finally {
        clearTimeout(timer);
    }

    if (!res.ok) {
        throw new Error(`Failed to load categories (${res.status} ${res.statusText})`);
    }

    const json = await res.json();

    // Backend wraps responses in { data: [...] } via TransformInterceptor
    return (json?.data ?? json) as NearbyCategory[];
}
