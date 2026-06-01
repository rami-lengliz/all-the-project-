// Geo helpers — call the backend proxy so we can apply User-Agent + cache + rate-limit
// on the server side, instead of leaking each user's IP to Nominatim.
import { api } from './http';

export interface GeoSearchResult {
  place_id: number;
  display_name: string;
  lat: string;
  lon: string;
}

export interface GeoReverseResult {
  display_name?: string;
  address?: {
    city?: string;
    town?: string;
    village?: string;
    county?: string;
  };
}

export async function geoSearch(
  query: string,
  opts: { limit?: number; countryCode?: string } = {},
): Promise<GeoSearchResult[]> {
  try {
    const params: Record<string, string> = { q: query };
    if (opts.limit) params.limit = String(opts.limit);
    if (opts.countryCode) params.countrycodes = opts.countryCode;
    const res = await api.get<GeoSearchResult[]>('/geo/search', { params });
    const data = res.data;
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

export async function geoReverse(
  lat: number,
  lng: number,
  zoom = 10,
): Promise<GeoReverseResult | null> {
  try {
    const res = await api.get<GeoReverseResult>('/geo/reverse', {
      params: { lat, lng, zoom },
    });
    return res.data ?? null;
  } catch {
    return null;
  }
}
