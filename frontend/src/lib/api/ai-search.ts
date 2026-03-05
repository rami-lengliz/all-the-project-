/**
 * ai-search.ts — API client for POST /api/ai/search
 */
import { API_URL } from '@/lib/api/env';

// ── Types ─────────────────────────────────────────────────────────────────────

export type AiSearchMode = 'RESULT' | 'FOLLOW_UP';

export type AiChip = {
    key: string;
    label: string;
};

export type AiFollowUp = {
    question: string;
    field: string;
    options?: string[];
};

/** Full listing shape returned inside AI search results */
export type AiListing = {
    id: string;
    title: string;
    description?: string;
    pricePerDay: number;
    priceUnit?: string;          // e.g. 'DAY' | 'HOUR' | 'SLOT'
    address?: string;
    city?: string;
    images?: string[];
    categoryId?: string;
    category?: {
        id?: string;
        name?: string;
        slug?: string;
        icon?: string;
    };
};

export type AiSearchRequest = {
    query: string;
    lat?: number;
    lng?: number;
    radiusKm?: number;
    followUpUsed?: boolean;
    followUpAnswer?: string;
};

export type AiSearchResponse = {
    mode: AiSearchMode;
    filters: Record<string, unknown>;
    chips: AiChip[];
    results: AiListing[];
    followUp?: AiFollowUp | null;
};

// ── Client function ───────────────────────────────────────────────────────────

export async function fetchAiSearch(
    body: AiSearchRequest,
): Promise<AiSearchResponse> {
    const url = `${API_URL}/api/ai/search`;
    const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        cache: 'no-store',
    });

    if (!res.ok) {
        const text = await res.text().catch(() => res.statusText);
        throw new Error(`AI search failed (${res.status}): ${text}`);
    }

    const json = await res.json();
    // Backend wraps in { data: ... } via TransformInterceptor
    return (json?.data ?? json) as AiSearchResponse;
}
