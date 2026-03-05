import { useState, useRef } from 'react';
import Head from 'next/head';
import { Layout } from '@/components/layout/Layout';
import {
    fetchAiSearch,
    type AiSearchResponse,
    type AiChip,
    type AiListing,
    type AiFollowUp,
} from '@/lib/api/ai-search';

// ── Small sub-components ──────────────────────────────────────────────────────

function Chip({ chip }: { chip: AiChip }) {
    return (
        <span className="inline-flex items-center rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-xs font-medium text-blue-700">
            <span className="mr-1 font-mono text-blue-400">{chip.key}:</span>
            {chip.label}
        </span>
    );
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Map priceUnit to a readable label */
function priceUnitLabel(unit?: string): string {
    switch (unit?.toUpperCase()) {
        case 'HOUR': return '/hr';
        case 'SLOT': return '/slot';
        case 'DAY':
        default: return '/day';
    }
}

function ListingCard({ listing }: { listing: AiListing }) {
    const locationLabel = listing.city ?? listing.address;
    const categoryLabel = listing.category?.name ?? null;
    const categoryIcon = listing.category?.icon ?? '🏷️';

    return (
        <li className="flex items-start gap-3 rounded-lg border border-gray-200 bg-white p-3 shadow-sm">
            {/* Thumbnail */}
            <div className="h-16 w-20 flex-shrink-0 overflow-hidden rounded-md bg-gray-100">
                {listing.images?.[0] ? (
                    <img
                        src={listing.images[0]}
                        alt={listing.title}
                        className="h-full w-full object-cover"
                        onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                    />
                ) : (
                    <div className="flex h-full w-full items-center justify-center text-2xl">
                        {categoryIcon}
                    </div>
                )}
            </div>

            {/* Info */}
            <div className="min-w-0 flex-1">
                <p className="truncate font-semibold text-gray-800">{listing.title}</p>

                {/* Category + location row */}
                <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5">
                    {categoryLabel && (
                        <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-500">
                            {categoryLabel}
                        </span>
                    )}
                    {locationLabel && (
                        <span className="truncate text-xs text-gray-400">📍 {locationLabel}</span>
                    )}
                </div>

                {listing.description && (
                    <p className="mt-1 line-clamp-1 text-xs text-gray-400">{listing.description}</p>
                )}
            </div>

            {/* Price */}
            <div className="flex-shrink-0 text-right">
                <span className="text-sm font-bold text-gray-800">{listing.pricePerDay}</span>
                <span className="ml-0.5 text-xs text-gray-400">TND{priceUnitLabel(listing.priceUnit)}</span>
            </div>
        </li>
    );
}

function FollowUpSection({
    followUp,
    onAnswer,
    loading,
}: {
    followUp: AiFollowUp;
    onAnswer: (answer: string) => void;
    loading: boolean;
}) {
    const [freeText, setFreeText] = useState('');

    return (
        <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4">
            <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-amber-600">
                Follow-up question
            </p>
            <p className="mb-3 font-medium text-gray-800">{followUp.question}</p>

            {/* Option buttons (when provided) */}
            {followUp.options && followUp.options.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                    {followUp.options.map((opt) => (
                        <button
                            key={opt}
                            id={`followup-opt-${opt.toLowerCase().replace(/\s+/g, '-')}`}
                            disabled={loading}
                            onClick={() => onAnswer(opt)}
                            className="rounded-lg border border-amber-300 bg-white px-4 py-2 text-sm font-medium text-gray-700
                         transition hover:border-amber-500 hover:text-amber-700 disabled:opacity-50"
                        >
                            {opt}
                        </button>
                    ))}
                </div>
            ) : (
                /* Free-text fallback (when no options) */
                <div className="flex gap-2">
                    <input
                        id="followup-freetext"
                        type="text"
                        value={freeText}
                        onChange={(e) => setFreeText(e.target.value)}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter' && freeText.trim()) onAnswer(freeText.trim());
                        }}
                        placeholder={`Answer about ${followUp.field}…`}
                        className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-amber-400"
                    />
                    <button
                        disabled={loading || !freeText.trim()}
                        onClick={() => onAnswer(freeText.trim())}
                        className="rounded-lg bg-amber-500 px-4 py-2 text-sm font-semibold text-white
                       transition hover:bg-amber-600 disabled:opacity-40"
                    >
                        Send
                    </button>
                </div>
            )}
        </div>
    );
}

// ── Skeleton loaders ──────────────────────────────────────────────────────────

function SkeletonChips() {
    return (
        <div className="flex gap-2">
            {[60, 80, 70].map((w) => (
                <span key={w} className={`h-6 w-${w < 70 ? '16' : w < 80 ? '20' : '24'} animate-pulse rounded-full bg-blue-100`} />
            ))}
        </div>
    );
}

function SkeletonCards() {
    return (
        <ul className="space-y-2">
            {[1, 2, 3].map((i) => (
                <li key={i} className="h-20 animate-pulse rounded-lg border border-gray-200 bg-gray-100" />
            ))}
        </ul>
    );
}

// ── Demo preset queries ───────────────────────────────────────────────────────

const PRESETS = [
    'villa avec piscine à Kelibia',
    'terrain de foot pour demain soir',
    'scooter pas cher pour le weekend',
    'logement familial proche plage',
] as const;

// ── Location presets ────────────────────────────────────────────────────────

const LOCATIONS = [
    { label: 'Kelibia', lat: 36.8578, lng: 11.092 },
    { label: 'Tunis', lat: 36.8065, lng: 10.1815 },
] as const;

const RADIUS_OPTIONS: number[] = [5, 10, 20, 50];

// ── Main page ─────────────────────────────────────────────────────────────────

export default function DemoAiSearchPage() {
    const [query, setQuery] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [result, setResult] = useState<AiSearchResponse | null>(null);
    // Location + radius
    const [selectedLocation, setSelectedLocation] = useState<typeof LOCATIONS[number]>(LOCATIONS[0]);
    const [radiusKm, setRadiusKm] = useState<number>(20);
    // true when we sent followUpUsed=true but backend still returned FOLLOW_UP
    const [followUpFallback, setFollowUpFallback] = useState(false);
    // Last request payload — shown in debug panel
    const [lastPayload, setLastPayload] = useState<Record<string, unknown> | null>(null);
    // Track whether we've used the follow-up already (max 1 allowed by backend)
    const followUpUsed = useRef(false);
    const inputRef = useRef<HTMLInputElement>(null);

    // ── Core search call ────────────────────────────────────────────────────────
    async function runSearch(q: string, opts?: { isFollowUp?: boolean; answer?: string }) {
        if (!q.trim()) return;
        setLoading(true);
        setError(null);
        setFollowUpFallback(false);
        const payload = {
            query: q,
            location: selectedLocation.label,
            lat: selectedLocation.lat,
            lng: selectedLocation.lng,
            radiusKm,
            followUpUsed: opts?.isFollowUp ?? false,
            ...(opts?.answer ? { followUpAnswer: opts.answer } : {}),
        };
        setLastPayload(payload);
        try {
            const res = await fetchAiSearch({
                query: q,
                lat: selectedLocation.lat,
                lng: selectedLocation.lng,
                radiusKm,
                followUpUsed: opts?.isFollowUp ?? false,
                ...(opts?.answer ? { followUpAnswer: opts.answer } : {}),
            });

            // ── Infinite-loop guard ────────────────────────────────────────────
            // Backend guardrail (TC-2) should already force RESULT when
            // followUpUsed=true, but we defend client-side too.
            if (opts?.isFollowUp && res.mode === 'FOLLOW_UP') {
                // Override mode so no second follow-up UI can appear
                res.mode = 'RESULT';
                res.followUp = null;
                setFollowUpFallback(true);
            }
            // ─────────────────────────────────────────────────────────────────

            setResult(res);
            if (opts?.isFollowUp) followUpUsed.current = true;
        } catch (e: any) {
            setError(e?.message ?? 'Request failed.');
        } finally {
            setLoading(false);
        }
    }

    // ── Follow-up answer handler ────────────────────────────────────────────────
    function handleFollowUpAnswer(answer: string) {
        runSearch(query, { isFollowUp: true, answer });
    }

    // ── Reset ───────────────────────────────────────────────────────────────────
    function handleReset() {
        setQuery('');
        setResult(null);
        setError(null);
        setFollowUpFallback(false);
        followUpUsed.current = false;
        inputRef.current?.focus();
    }

    const isFollowUp = result?.mode === 'FOLLOW_UP';
    const chips = result?.chips ?? [];
    const listings = result?.results ?? [];

    return (
        <Layout>
            <Head>
                <title>Demo — AI Search | RentAI</title>
            </Head>

            <div className="mx-auto max-w-2xl px-4 py-10">

                {/* ── Header ── */}
                <div className="mb-8">
                    <span className="mb-2 inline-block rounded-full bg-purple-100 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-purple-600">
                        Demo
                    </span>
                    <h1 className="text-2xl font-bold text-gray-900">AI Search</h1>
                    <p className="mt-1 text-sm text-gray-500">
                        Natural-language rental search. AI extracts filters and returns listings.
                        Max 1 follow-up question allowed.
                    </p>
                </div>

                {/* ── Search bar ── */}
                <div className="mb-4">
                    <div className="flex gap-2">
                        <input
                            ref={inputRef}
                            id="ai-search-input"
                            type="text"
                            value={query}
                            onChange={(e) => setQuery(e.target.value)}
                            onKeyDown={(e) => { if (e.key === 'Enter') runSearch(query); }}
                            placeholder="Ex: villa avec piscine à Kelibia pour ce weekend…"
                            disabled={loading}
                            className="flex-1 rounded-xl border border-gray-300 px-4 py-3 text-sm outline-none
                         transition focus:border-purple-400 focus:ring-2 focus:ring-purple-100
                         disabled:bg-gray-50 disabled:text-gray-400"
                        />
                        <button
                            id="ai-search-submit"
                            onClick={() => runSearch(query)}
                            disabled={loading || !query.trim()}
                            className="rounded-xl bg-purple-600 px-5 py-3 text-sm font-semibold text-white
                         transition hover:bg-purple-700 disabled:opacity-40"
                        >
                            {loading ? '…' : 'Search'}
                        </button>
                        {result && (
                            <button
                                id="ai-search-reset"
                                onClick={handleReset}
                                className="rounded-xl border border-gray-200 px-4 py-3 text-sm text-gray-500 hover:bg-gray-50"
                            >
                                Reset
                            </button>
                        )}
                    </div>

                    {/* Location + radius controls */}
                    <div className="mt-3 flex flex-wrap items-center gap-3">
                        {/* City preset buttons */}
                        <div className="flex gap-1.5">
                            {LOCATIONS.map((loc) => (
                                <button
                                    key={loc.label}
                                    id={`location-preset-${loc.label.toLowerCase()}`}
                                    onClick={() => setSelectedLocation(loc)}
                                    className={`rounded-full px-3 py-1 text-xs font-medium transition
                                        ${selectedLocation.label === loc.label
                                            ? 'bg-purple-600 text-white'
                                            : 'border border-gray-200 bg-white text-gray-600 hover:border-purple-300 hover:text-purple-700'
                                        }`}
                                >
                                    📍 {loc.label}
                                </button>
                            ))}
                        </div>

                        {/* Divider */}
                        <span className="hidden text-gray-200 sm:block">|</span>

                        {/* Radius selector */}
                        <div className="flex items-center gap-1.5">
                            <span className="text-xs text-gray-400">Radius:</span>
                            {RADIUS_OPTIONS.map((r) => (
                                <button
                                    key={r}
                                    id={`radius-${r}`}
                                    onClick={() => setRadiusKm(r)}
                                    className={`rounded-full px-2.5 py-1 text-xs font-medium transition
                                        ${radiusKm === r
                                            ? 'bg-purple-100 text-purple-700 font-semibold'
                                            : 'border border-gray-200 bg-white text-gray-500 hover:border-purple-200'
                                        }`}
                                >
                                    {r} km
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Active location + radius label */}
                    <p id="ai-location-label" className="mt-2 text-xs text-gray-400">
                        Searching near{' '}
                        <span className="font-medium text-purple-600">{selectedLocation.label}</span>
                        {' '}within{' '}
                        <span className="font-medium text-purple-600">{radiusKm} km</span>
                        {' '}·{' '}
                        <span className="font-mono">{selectedLocation.lat.toFixed(4)}, {selectedLocation.lng.toFixed(4)}</span>
                    </p>

                    {/* ── Debug panel ───────────────────────────────────────── */}
                    {lastPayload && (
                        <details id="debug-panel" className="mt-2">
                            <summary className="cursor-pointer select-none text-xs text-gray-400 hover:text-gray-600">
                                🔧 Last request payload
                            </summary>
                            <pre
                                className="mt-1 overflow-x-auto rounded-lg border border-gray-200 bg-gray-50 p-3
                                           font-mono text-xs leading-relaxed text-gray-600"
                            >
                                {JSON.stringify(lastPayload, null, 2)}
                            </pre>
                        </details>
                    )}

                    {/* ── Try examples ───────────────────────────────────────── */}
                    {!result && (
                        <div className="mt-3">
                            <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-gray-400">
                                Try examples
                            </p>
                            <div className="flex flex-wrap gap-2">
                                {(['villa near beach under 300', 'football pitch tonight', 'something cheap near me'] as const).map((ex) => (
                                    <button
                                        key={ex}
                                        id={`example-${ex.replace(/\s+/g, '-')}`}
                                        onClick={() => { setQuery(ex); runSearch(ex); }}
                                        className="rounded-full border border-purple-200 bg-purple-50 px-3 py-1
                                                   text-xs text-purple-700 transition hover:bg-purple-100"
                                    >
                                        {ex}
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Presets */}
                    {!result && (
                        <div className="mt-2 flex flex-wrap gap-2">
                            {PRESETS.map((p) => (
                                <button
                                    key={p}
                                    onClick={() => { setQuery(p); runSearch(p); }}
                                    className="rounded-full border border-gray-200 bg-white px-3 py-1 text-xs text-gray-600
                             hover:border-purple-300 hover:text-purple-600 transition"
                                >
                                    {p}
                                </button>
                            ))}
                        </div>
                    )}
                </div>

                {/* ── Error ── */}
                {error && (
                    <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
                        <p className="font-semibold">Search failed</p>
                        <p className="mt-0.5 text-xs text-red-500">{error}</p>
                        <button
                            onClick={() => runSearch(query)}
                            className="mt-2 rounded border border-red-300 bg-white px-3 py-1 text-xs font-medium text-red-600 hover:bg-red-50"
                        >
                            Retry
                        </button>
                    </div>
                )}

                {/* ── Loading skeleton ── */}
                {loading && (
                    <div className="space-y-4">
                        <SkeletonChips />
                        <SkeletonCards />
                    </div>
                )}

                {/* ── Results ── */}
                {!loading && result && (
                    <div id="ai-search-result" className="space-y-5">

                        {/* Mode badge */}
                        <div className="flex items-center gap-2">
                            <span
                                id="ai-search-mode"
                                className={`rounded-full px-3 py-0.5 text-xs font-bold uppercase tracking-wide
                  ${isFollowUp
                                        ? 'bg-amber-100 text-amber-700'
                                        : 'bg-green-100 text-green-700'}`}
                            >
                                {result.mode}
                            </span>
                            {followUpUsed.current && (
                                <span className="text-xs text-gray-400">follow-up used</span>
                            )}
                        </div>

                        {/* Chips */}
                        {chips.length > 0 && (
                            <section id="ai-chips-section" aria-label="Search filters">
                                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">
                                    Extracted filters
                                </p>
                                <div className="flex flex-wrap gap-2">
                                    {chips.map((c) => <Chip key={c.key} chip={c} />)}
                                </div>
                            </section>
                        )}

                        {/* Follow-up fallback warning */}
                        {followUpFallback && (
                            <div
                                id="followup-fallback-warning"
                                className="rounded-lg border border-orange-200 bg-orange-50 px-4 py-3 text-sm"
                            >
                                <p className="font-semibold text-orange-700">
                                    ⚠️ Showing broad results
                                </p>
                                <p className="mt-0.5 text-xs text-orange-500">
                                    The AI requested a second follow-up, which is not allowed.
                                    Displaying the best available results instead.
                                </p>
                            </div>
                        )}

                        {/* Follow-up section — only when genuinely in FOLLOW_UP mode */}
                        {isFollowUp && result.followUp && !followUpFallback && (
                            <FollowUpSection
                                followUp={result.followUp}
                                onAnswer={handleFollowUpAnswer}
                                loading={loading}
                            />
                        )}

                        {/* Listings */}
                        {listings.length > 0 && (
                            <section id="ai-results-section" aria-label="Listings">
                                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">
                                    {listings.length} result{listings.length !== 1 ? 's' : ''}
                                </p>
                                <ul id="ai-results-list" className="space-y-2">
                                    {listings.map((l) => (
                                        <ListingCard key={l.id} listing={l} />
                                    ))}
                                </ul>
                            </section>
                        )}

                        {/* Empty results (RESULT mode but no listings) */}
                        {!isFollowUp && listings.length === 0 && (
                            <div className="rounded-lg border border-gray-200 bg-white p-8 text-center text-gray-500">
                                <span className="block text-4xl">📭</span>
                                <p className="mt-3 font-medium">No matches found</p>
                                <p className="mt-1 text-sm text-gray-400">
                                    Try rephrasing your query or broadening the radius.
                                </p>
                                <button
                                    id="ai-search-edit-query"
                                    onClick={() => inputRef.current?.focus()}
                                    className="mt-3 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-600 hover:border-purple-400 hover:text-purple-600 transition"
                                >
                                    ✏️ Edit query
                                </button>
                            </div>
                        )}

                    </div>
                )}

                {/* ── Initial empty state ── */}
                {!loading && !result && !error && (
                    <div className="mt-8 rounded-xl border border-dashed border-gray-200 p-10 text-center text-gray-400">
                        <span className="block text-4xl">🔍</span>
                        <p className="mt-3 text-sm">Type a query or pick a preset above to start.</p>
                    </div>
                )}

            </div>
        </Layout>
    );
}
