/**
 * price-suggestion.ts — API client for POST /api/ai/price-suggestion
 */
import { api } from '@/lib/api/http';

// ── Types ─────────────────────────────────────────────────────────────────────

export type PricingCategory =
  | 'accommodation'
  | 'sports_facility'
  | 'tool'
  | 'vehicle'
  | 'event_space';

export type PricingUnit = 'per_night' | 'per_hour' | 'per_day' | 'per_session';

export type AssetCondition = 'new' | 'excellent' | 'good' | 'fair';
export type PricingSeason   = 'peak' | 'off_peak' | 'shoulder';
export type PropertyType    = 'villa' | 'house' | 'apartment';
export type Confidence      = 'high' | 'medium' | 'low';

export interface PriceSuggestionRequest {
  city: string;
  category: PricingCategory;
  unit: PricingUnit;
  lat?: number;
  lng?: number;
  /** PostGIS search radius in km. Defaults to 25 on the backend. */
  radiusKm?: number;
  area_sqm?: number;
  capacity?: number;
  amenities?: string[];
  condition?: AssetCondition;
  season?: PricingSeason;
  /** Accommodation only */
  propertyType?: PropertyType;
  /** Accommodation only — distance to sea in km */
  distanceToSeaKm?: number;
}

export interface PriceSuggestionResponse {
  recommended: number;
  range: { min: number; max: number };
  confidence: Confidence;
  explanation: [string, string, string];
  compsUsed: number;
  currency: string;
  unit: string;
  /** Row ID of the suggestion log — send back on listing publish to link finalPrice */
  logId?: string;
}

// ── Client function ───────────────────────────────────────────────────────────

export async function fetchPriceSuggestion(
  req: PriceSuggestionRequest,
): Promise<PriceSuggestionResponse> {
  const { data } = await api.post<{ data: PriceSuggestionResponse } | PriceSuggestionResponse>(
    '/ai/price-suggestion',
    req,
  );
  // Handle TransformInterceptor envelope OR bare response
  return ('data' in data && typeof (data as any).data === 'object')
    ? (data as any).data
    : (data as PriceSuggestionResponse);
}
