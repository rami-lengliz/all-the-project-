import { useState } from 'react';
import Head from 'next/head';
import { Layout } from '@/components/layout/Layout';
import { useCategoriesNearby } from '@/lib/api/hooks/useCategoriesNearby';
import { type NearbyCategory } from '@/lib/api/categories';

// ── Preset cities ────────────────────────────────────────────────────────────
const CITIES = [
    { label: '📍 Kelibia', lat: 36.8578, lng: 11.092 },
    { label: '🌆 Tunis', lat: 36.8065, lng: 10.1815 },
] as const;

const RADIUS_OPTIONS = [5, 10, 20, 50] as const;

// ── Icon fallback ─────────────────────────────────────────────────────────────
function CategoryIcon({ icon }: { icon?: string | null }) {
    return (
        <span className="text-2xl leading-none" aria-hidden>
            {icon ?? '📦'}
        </span>
    );
}

// ── Category row ──────────────────────────────────────────────────────────────
function CategoryRow({ cat }: { cat: NearbyCategory }) {
    return (
        <li className="flex items-center justify-between rounded-xl border border-gray-200 bg-white px-5 py-4 shadow-sm">
            <div className="flex items-center gap-4">
                <span className="text-3xl leading-none" aria-hidden>{cat.icon ?? '📦'}</span>
                <span className="text-sm font-semibold text-gray-800">{cat.name}</span>
            </div>
            <span className="rounded-full bg-blue-100 px-3.5 py-1 text-sm font-bold text-blue-700">
                {cat.count} listing{cat.count !== 1 ? 's' : ''}
            </span>
        </li>
    );
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default function DemoCategoriesPage() {
    const [selectedCity, setSelectedCity] = useState<(typeof CITIES)[number]>(CITIES[0]);
    const [radiusKm, setRadiusKm] = useState<number>(10);

    const { data, isLoading, isError, error, refetch, dataUpdatedAt } = useCategoriesNearby({
        lat: selectedCity.lat,
        lng: selectedCity.lng,
        radiusKm,
    });

    const categories = data ?? [];

    return (
        <Layout>
            <Head>
                <title>Demo — Location-Aware Categories | RentAI</title>
            </Head>

            <div className="mx-auto max-w-2xl px-4 py-10">

                {/* ── Header ── */}
                <div className="mb-8">
                    <span className="mb-2 inline-block rounded-full bg-blue-100 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-blue-600">
                        Demo
                    </span>
                    <h1 className="text-2xl font-bold text-gray-900">
                        Location-Aware Categories
                    </h1>
                    <p className="mt-1 text-sm text-gray-500">
                        Categories are derived from active listings within the selected radius.
                        Kelibia and Tunis will show different results.
                    </p>
                    {/* Active location pill — always visible at top */}
                    <div className="mt-3 flex items-center gap-2">
                        <span
                            id="active-location-label"
                            className="inline-flex items-center gap-1.5 rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-sm font-medium text-blue-700"
                        >
                            📍 {selectedCity.label.replace(/^\S+\s/, '')}
                        </span>
                        <span className="inline-flex items-center gap-1 rounded-full border border-gray-200 bg-gray-50 px-3 py-1 text-sm font-medium text-gray-600">
                            {radiusKm}&nbsp;km radius
                        </span>
                    </div>
                </div>

                {/* ── Controls ── */}
                <div className="mb-6 space-y-4 rounded-xl border border-gray-200 bg-gray-50 p-4">

                    {/* City presets */}
                    <div>
                        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
                            City
                        </p>
                        <div className="flex gap-2">
                            {CITIES.map((city) => (
                                <button
                                    key={city.label}
                                    id={`city-btn-${city.label.replace(/\s+/g, '-').toLowerCase()}`}
                                    onClick={() => setSelectedCity(city)}
                                    className={`rounded-lg border px-4 py-2 text-sm font-medium transition
                    ${selectedCity.label === city.label
                                            ? 'border-blue-500 bg-blue-500 text-white shadow-sm'
                                            : 'border-gray-300 bg-white text-gray-700 hover:border-blue-400 hover:text-blue-600'
                                        }`}
                                >
                                    {city.label}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Radius selector */}
                    <div>
                        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
                            Radius
                        </p>
                        <div className="flex gap-2">
                            {RADIUS_OPTIONS.map((r) => (
                                <button
                                    key={r}
                                    id={`radius-btn-${r}km`}
                                    onClick={() => setRadiusKm(r)}
                                    className={`rounded-lg border px-3 py-1.5 text-sm font-medium transition
                    ${radiusKm === r
                                            ? 'border-blue-500 bg-blue-500 text-white shadow-sm'
                                            : 'border-gray-300 bg-white text-gray-700 hover:border-blue-400 hover:text-blue-600'
                                        }`}
                                >
                                    {r} km
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Coordinates — useful for devs / jury */}
                    <p className="font-mono text-xs text-gray-400">
                        {selectedCity.lat},&nbsp;{selectedCity.lng}&nbsp;·&nbsp;{radiusKm}&nbsp;km
                    </p>
                </div>

                {/* ── Results ── */}
                <div id="categories-result">

                    {/* Loading */}
                    {isLoading && (
                        <ul className="space-y-2" aria-label="Loading categories">
                            {[1, 2, 3, 4].map((i) => (
                                <li
                                    key={i}
                                    className="h-14 animate-pulse rounded-lg border border-gray-200 bg-gray-100"
                                />
                            ))}
                        </ul>
                    )}

                    {/* Error */}
                    {isError && !isLoading && (
                        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
                            <p className="font-semibold">Failed to load categories</p>
                            <p className="mt-0.5 text-xs text-red-500">
                                {(error as any)?.message ?? 'Check that the backend is running and CORS is configured.'}
                            </p>
                            <button
                                onClick={() => refetch()}
                                className="mt-3 rounded-md border border-red-300 bg-white px-3 py-1 text-xs font-medium text-red-600 hover:bg-red-50"
                            >
                                Retry
                            </button>
                        </div>
                    )}

                    {/* Empty */}
                    {!isLoading && !isError && categories.length === 0 && (
                        <div className="rounded-lg border border-gray-200 bg-white p-8 text-center text-gray-500">
                            <span className="block text-4xl">📭</span>
                            <p className="mt-3 font-medium">No categories found</p>
                            <p className="mt-1 text-sm">
                                No active listings within {radiusKm}&nbsp;km of {selectedCity.label}. Try a larger radius or run{' '}
                                <code className="rounded bg-gray-100 px-1 py-0.5 text-xs">npm run seed:demo</code>.
                            </p>
                        </div>
                    )}

                    {/* Results */}
                    {!isLoading && !isError && categories.length > 0 && (
                        <>
                            <p className="mb-3">
                                <span className="mr-1 text-2xl font-black text-gray-800">{categories.length}</span>
                                <span className="text-sm text-gray-500">
                                    categor{categories.length !== 1 ? 'ies' : 'y'} near {selectedCity.label.replace(/^.*?\s/, '')}
                                </span>
                            </p>
                            <ul className="space-y-2" id="categories-list">
                                {categories.map((cat) => (
                                    <CategoryRow key={cat.id} cat={cat} />
                                ))}
                            </ul>

                            {/* ── Demo Proof ─────────────────────────────────── */}
                            <div
                                id="demo-proof"
                                className="mt-6 rounded-lg border border-dashed border-gray-300 bg-gray-50 px-4 py-3"
                            >
                                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">
                                    Demo Proof
                                </p>
                                <dl className="grid grid-cols-3 gap-3 font-mono text-sm">
                                    <div className="rounded-md bg-white px-3 py-2 text-center shadow-sm">
                                        <dt className="text-xs text-gray-400">Categories</dt>
                                        <dd id="proof-total-categories" className="mt-0.5 text-lg font-bold text-gray-800">
                                            {categories.length}
                                        </dd>
                                    </div>
                                    <div className="rounded-md bg-white px-3 py-2 text-center shadow-sm">
                                        <dt className="text-xs text-gray-400">Listings nearby</dt>
                                        <dd id="proof-total-listings" className="mt-0.5 text-lg font-bold text-gray-800">
                                            {categories.reduce((sum, c) => sum + c.count, 0)}
                                        </dd>
                                    </div>
                                    <div className="rounded-md bg-white px-3 py-2 text-center shadow-sm">
                                        <dt className="text-xs text-gray-400">Last fetch</dt>
                                        <dd id="proof-last-fetch" className="mt-0.5 text-xs font-semibold text-gray-700">
                                            {dataUpdatedAt
                                                ? new Date(dataUpdatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
                                                : '—'}
                                        </dd>
                                    </div>
                                </dl>
                            </div>
                        </>
                    )}
                </div>
            </div>
        </Layout>
    );
}
