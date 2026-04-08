import { useState } from 'react';
import {
  fetchPriceSuggestion,
  PriceSuggestionResponse,
  PropertyType,
} from '@/lib/api/price-suggestion';
import {
  getApiCategory,
  getApiUnit,
} from '@/lib/categoryPricingUnits';

interface Props {
  city: string;
  /** The category *slug* from the DB (e.g. 'stays', 'sports-facilities', 'mobility') */
  categorySlug: string;
  lat?: string;
  lng?: string;
  onAccept: (price: number) => void;
}

const CONFIDENCE_CONFIG = {
  high: {
    label: 'High confidence',
    color: 'text-emerald-700',
    bg: 'bg-emerald-50',
    border: 'border-emerald-200',
    dot: 'bg-emerald-500',
  },
  medium: {
    label: 'Medium confidence',
    color: 'text-amber-700',
    bg: 'bg-amber-50',
    border: 'border-amber-200',
    dot: 'bg-amber-500',
  },
  low: {
    label: 'Limited data',
    color: 'text-orange-700',
    bg: 'bg-orange-50',
    border: 'border-orange-200',
    dot: 'bg-orange-400',
  },
};

const UNIT_LABEL_MAP: Record<string, string> = {
  per_night: '/night',
  per_hour: '/hour',
  per_day: '/day',
  per_session: '/session',
};

function extractCity(address: string): string {
  return address.split(',')[0]?.trim() || address.trim();
}

const isAccommodation = (slug: string) =>
  ['stays', 'accommodation', 'holiday-rentals'].includes(slug.toLowerCase());

export default function PriceSuggestionCard({
  city,
  categorySlug,
  lat,
  lng,
  onAccept,
}: Props) {
  const [result, setResult]         = useState<PriceSuggestionResponse | null>(null);
  const [loading, setLoading]       = useState(false);
  const [error, setError]           = useState<string | null>(null);
  const [customPrice, setCustomPrice]   = useState('');
  const [showOverride, setShowOverride] = useState(false);

  // Accommodation-specific fields
  const isAccomm = isAccommodation(categorySlug);
  const [propertyType, setPropertyType]       = useState<PropertyType | ''>('');
  const [distanceToSea, setDistanceToSea]     = useState('');

  const cityName = extractCity(city);
  const canFetch = cityName.length >= 2 && categorySlug !== '';

  async function handleFetch() {
    if (!canFetch) return;
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const mappedCategory = getApiCategory(categorySlug);
      const mappedUnit     = getApiUnit(categorySlug);

      const suggestion = await fetchPriceSuggestion({
        city: cityName,
        category: mappedCategory,
        unit: mappedUnit,
        lat: lat ? parseFloat(lat) : undefined,
        lng: lng ? parseFloat(lng) : undefined,
        ...(isAccomm && propertyType   ? { propertyType }                                : {}),
        ...(isAccomm && distanceToSea  ? { distanceToSeaKm: parseFloat(distanceToSea) } : {}),
      });
      setResult(suggestion);
    } catch (err: any) {
      const msg = err?.response?.data?.message || err?.message || 'Failed to get price suggestion';
      setError(msg);
    } finally {
      setLoading(false);
    }
  }

  function handleAcceptSuggested() {
    if (result) onAccept(result.recommended);
  }

  function handleAcceptOverride() {
    const val = parseFloat(customPrice);
    if (!isNaN(val) && val > 0) onAccept(val);
  }

  const conf = result ? CONFIDENCE_CONFIG[result.confidence] : null;

  return (
    <div className="rounded-xl border border-blue-200 bg-gradient-to-br from-blue-50 to-indigo-50 p-6">
      {/* Header */}
      <div className="flex items-center gap-3 mb-4">
        <div className="w-10 h-10 rounded-full bg-blue-500 flex items-center justify-center text-white flex-shrink-0">
          <i className="fa-solid fa-robot text-sm" />
        </div>
        <div>
          <h3 className="text-base font-semibold text-gray-900">AI Price Suggestion</h3>
          <p className="text-xs text-gray-500">
            Let AI suggest the right price based on comparable listings in {cityName || 'your city'}.
          </p>
        </div>
      </div>

      {/* Accommodation-specific inputs */}
      {isAccomm && !result && !loading && (
        <div className="mb-4 space-y-3">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              Property type <span className="text-gray-400">(optional — improves accuracy)</span>
            </label>
            <div className="flex gap-2">
              {(['apartment', 'house', 'villa'] as PropertyType[]).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setPropertyType(propertyType === t ? '' : t)}
                  className={`flex-1 py-1.5 rounded-lg text-xs font-medium border transition capitalize
                    ${propertyType === t
                      ? 'bg-blue-500 text-white border-blue-500'
                      : 'bg-white text-gray-600 border-gray-300 hover:border-blue-300'}`}
                >
                  {t === 'villa' ? '🏛️' : t === 'house' ? '🏠' : '🏢'} {t}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              Distance to sea <span className="text-gray-400">(km — optional, Kelibia)</span>
            </label>
            <input
              type="number"
              value={distanceToSea}
              onChange={(e) => setDistanceToSea(e.target.value)}
              placeholder="e.g. 0.3"
              min="0"
              step="0.1"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>
      )}

      {/* Fetch Button */}
      {!result && !loading && (
        <button
          type="button"
          onClick={handleFetch}
          disabled={!canFetch}
          className="w-full py-3 px-4 rounded-lg bg-blue-500 hover:bg-blue-600 disabled:bg-gray-300 disabled:cursor-not-allowed text-white font-medium text-sm transition flex items-center justify-center gap-2"
        >
          <i className="fa-solid fa-wand-magic-sparkles" />
          Get AI Price Suggestion
        </button>
      )}

      {/* Loading */}
      {loading && (
        <div className="flex flex-col items-center py-6 gap-3">
          <div className="w-10 h-10 rounded-full border-4 border-blue-200 border-t-blue-500 animate-spin" />
          <p className="text-sm text-gray-500">Analysing listings in {cityName}…</p>
        </div>
      )}

      {/* Error */}
      {error && !loading && (
        <div className="mt-2 rounded-lg bg-red-50 border border-red-200 p-3 flex items-start gap-2">
          <i className="fa-solid fa-circle-exclamation text-red-500 mt-0.5 text-sm" />
          <div className="flex-1">
            <p className="text-sm text-red-700">{error}</p>
            <button type="button" onClick={handleFetch} className="text-xs text-red-600 underline mt-1">
              Try again
            </button>
          </div>
        </div>
      )}

      {/* Result */}
      {result && conf && (
        <div className="space-y-4 mt-1">
          {/* Price + Confidence */}
          <div className="flex items-center justify-between">
            <div>
              <p className="text-3xl font-bold text-gray-900">
                {result.recommended.toFixed(2)}{' '}
                <span className="text-lg font-medium text-gray-500">
                  TND{UNIT_LABEL_MAP[result.unit] ?? ''}
                </span>
              </p>
              <p className="text-xs text-gray-500 mt-0.5">
                Range: {result.range.min.toFixed(2)} – {result.range.max.toFixed(2)} TND
              </p>
            </div>
            <span className={`flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full border ${conf.color} ${conf.bg} ${conf.border}`}>
              <span className={`w-1.5 h-1.5 rounded-full ${conf.dot}`} />
              {conf.label}
            </span>
          </div>

          {/* Low-confidence warning */}
          {result.confidence === 'low' && (
            <div className="rounded-lg bg-orange-50 border border-orange-200 p-3 text-xs text-orange-700 flex gap-2">
              <i className="fa-solid fa-triangle-exclamation mt-0.5" />
              <span>
                Only <strong>{result.compsUsed}</strong> comparable listings found. Price estimated from regional benchmarks — consider adjusting.
              </span>
            </div>
          )}

          {/* Explanation bullets */}
          <ul className="space-y-2">
            {result.explanation.map((point, i) => (
              <li key={i} className="flex items-start gap-2 text-sm text-gray-700">
                <i className="fa-solid fa-check-circle text-blue-400 mt-0.5 flex-shrink-0" />
                {point}
              </li>
            ))}
          </ul>

          <p className="text-xs text-gray-400">
            Based on <strong>{result.compsUsed}</strong> comparable listing{result.compsUsed !== 1 ? 's' : ''} in {cityName}.
          </p>

          {/* Actions */}
          <div className="flex flex-col gap-2 pt-1">
            <button
              type="button"
              onClick={handleAcceptSuggested}
              className="w-full py-2.5 rounded-lg bg-blue-500 hover:bg-blue-600 text-white text-sm font-semibold transition"
            >
              Use {result.recommended.toFixed(2)} TND
            </button>

            {!showOverride ? (
              <button
                type="button"
                onClick={() => setShowOverride(true)}
                className="w-full py-2 rounded-lg border border-gray-300 text-gray-600 text-sm hover:bg-gray-50 transition"
              >
                Override price manually
              </button>
            ) : (
              <div className="flex gap-2">
                <input
                  type="number"
                  value={customPrice}
                  onChange={(e) => setCustomPrice(e.target.value)}
                  placeholder="Enter your price (TND)"
                  min="0"
                  step="0.5"
                  className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <button
                  type="button"
                  onClick={handleAcceptOverride}
                  disabled={!customPrice || parseFloat(customPrice) <= 0}
                  className="px-4 py-2 rounded-lg bg-gray-800 hover:bg-gray-900 disabled:bg-gray-300 disabled:cursor-not-allowed text-white text-sm font-medium transition"
                >
                  Set
                </button>
                <button
                  type="button"
                  onClick={() => { setShowOverride(false); setCustomPrice(''); }}
                  className="px-3 py-2 rounded-lg border border-gray-300 text-gray-500 text-sm hover:bg-gray-50 transition"
                >
                  ✕
                </button>
              </div>
            )}

            <button
              type="button"
              onClick={() => { setResult(null); }}
              className="text-xs text-blue-500 hover:underline text-center"
            >
              ↻ Re-run suggestion
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
