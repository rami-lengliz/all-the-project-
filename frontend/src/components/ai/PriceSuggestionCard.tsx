/**
 * PriceSuggestionCard.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Displays the AI price suggestion result inside the Create Listing review step.
 *
 * Usage:
 *   <PriceSuggestionCard
 *     loading={suggestionLoading}
 *     error={suggestionError}
 *     suggestion={suggestion}
 *     cityName={cityName}
 *     unit={suggestion?.unit ?? 'per_night'}
 *     onRetry={handleGetSuggestion}
 *   />
 * ─────────────────────────────────────────────────────────────────────────────
 */

import type { PriceSuggestionResponse, Confidence } from '@/lib/api/price-suggestion';

// ── Unit labels ────────────────────────────────────────────────────────────────
const UNIT_LABEL: Record<string, string> = {
  per_night: '/night',
  per_hour:  '/hour',
  per_day:   '/day',
  per_session: '/session',
};

// ── Confidence styles ──────────────────────────────────────────────────────────
const CONF_STYLE: Record<Confidence, { badge: string; bar: string; label: string }> = {
  high:   { badge: 'bg-emerald-50 text-emerald-700 border-emerald-200', bar: 'bg-emerald-400', label: '✦ High confidence' },
  medium: { badge: 'bg-amber-50   text-amber-700   border-amber-200',   bar: 'bg-amber-400',   label: '◈ Medium confidence' },
  low:    { badge: 'bg-orange-50  text-orange-700  border-orange-200',  bar: 'bg-orange-400',  label: '⚠ Low confidence'  },
};

// ── Props ─────────────────────────────────────────────────────────────────────
interface Props {
  loading:    boolean;
  error:      string | null;
  suggestion: PriceSuggestionResponse | null;
  cityName:   string;
  onRetry:    () => void;
}

// ── Skeleton ──────────────────────────────────────────────────────────────────
function Skeleton() {
  return (
    <div className="animate-pulse space-y-4" aria-busy="true" aria-label="Loading AI price suggestion">
      {/* Price row */}
      <div className="flex items-end justify-between">
        <div>
          <div className="h-10 w-36 bg-gray-200 rounded-lg mb-1" />
          <div className="h-3  w-28 bg-gray-100 rounded" />
        </div>
        <div className="h-6 w-24 bg-gray-200 rounded-full" />
      </div>
      {/* Range bar */}
      <div className="h-2 bg-gray-200 rounded-full" />
      {/* Bullets */}
      <div className="space-y-2 pt-1">
        {[0, 1, 2].map((i) => (
          <div key={i} className="flex items-start gap-2">
            <div className="w-4 h-4 bg-gray-200 rounded-full flex-shrink-0 mt-0.5" />
            <div className={`h-3 bg-gray-100 rounded flex-1 ${i === 2 ? 'w-3/4' : 'w-full'}`} />
          </div>
        ))}
      </div>
      <p className="text-xs text-gray-400 animate-pulse">Analysing comparable listings…</p>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export function PriceSuggestionCard({ loading, error, suggestion, cityName, onRetry }: Props) {

  // ── Loading ───────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="rounded-2xl border border-blue-100 bg-gradient-to-br from-blue-50 to-indigo-50 p-5 mb-6">
        <div className="flex items-center gap-2 mb-4">
          <span className="w-2 h-2 rounded-full bg-blue-400 animate-ping" />
          <p className="text-sm font-semibold text-blue-700">AI is analysing {cityName || 'your area'}…</p>
        </div>
        <Skeleton />
      </div>
    );
  }

  // ── Error ─────────────────────────────────────────────────────────────────
  if (error && !suggestion) {
    return (
      <div className="rounded-2xl border border-red-200 bg-red-50 p-5 mb-6">
        <div className="flex items-start gap-3">
          <i className="fa-solid fa-circle-exclamation text-red-500 text-lg mt-0.5 flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-red-700 mb-0.5">AI suggestion unavailable</p>
            <p className="text-xs text-red-600 break-words">{error}</p>
            <p className="text-xs text-red-500 mt-2">
              Enter a price manually below — you can always update it later.
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={onRetry}
          className="mt-3 text-xs font-semibold text-red-600 underline underline-offset-2 hover:text-red-700 transition"
        >
          ↻ Try again
        </button>
      </div>
    );
  }

  // ── No result yet (canSuggest false) ──────────────────────────────────────
  if (!suggestion) return null;

  // ── Success ───────────────────────────────────────────────────────────────
  const conf      = suggestion.confidence;
  const confStyle = CONF_STYLE[conf] ?? CONF_STYLE.low;
  const unitLabel = UNIT_LABEL[suggestion.unit] ?? '';

  // Range bar: position dot at recommended within [min, max]
  const rangeSpan  = Math.max(suggestion.range.max - suggestion.range.min, 1);
  const dotPct     = Math.min(100, Math.max(0,
    ((suggestion.recommended - suggestion.range.min) / rangeSpan) * 100,
  ));

  return (
    <div className="rounded-2xl border border-blue-200 bg-gradient-to-br from-blue-50 to-indigo-50 p-5 mb-6 space-y-4">

      {/* ── Header: price + confidence badge ──────────────────────────────── */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <p className="text-4xl font-extrabold text-gray-900 leading-none tracking-tight">
            {suggestion.recommended.toFixed(2)}
            <span className="text-lg font-medium text-gray-500 ml-1">TND{unitLabel}</span>
          </p>
          <p className="text-xs text-gray-500 mt-1">
            Range&nbsp;
            <span className="font-medium text-gray-700">
              {suggestion.range.min.toFixed(2)}
            </span>
            &nbsp;–&nbsp;
            <span className="font-medium text-gray-700">
              {suggestion.range.max.toFixed(2)} TND
            </span>
          </p>
        </div>

        <span className={`text-xs font-semibold px-3 py-1.5 rounded-full border whitespace-nowrap ${confStyle.badge}`}>
          {confStyle.label}
        </span>
      </div>

      {/* ── Range bar ─────────────────────────────────────────────────────── */}
      <div>
        <div className="relative h-2 rounded-full bg-blue-100 overflow-visible">
          <div className={`absolute inset-y-0 left-0 rounded-full opacity-40 ${confStyle.bar}`}
               style={{ width: '100%' }} />
          {/* Dot at recommended */}
          <div
            className={`absolute top-1/2 -translate-y-1/2 w-4 h-4 rounded-full border-2 border-white shadow-md ${confStyle.bar}`}
            style={{ left: `${dotPct}%`, transform: `translate(-50%, -50%)` }}
            title={`Recommended: ${suggestion.recommended.toFixed(2)} TND`}
          />
        </div>
        <div className="flex justify-between text-[10px] text-gray-400 mt-1.5 px-0.5">
          <span>{suggestion.range.min.toFixed(0)}</span>
          <span>{suggestion.range.max.toFixed(0)}</span>
        </div>
      </div>

      {/* ── Low-confidence warning ─────────────────────────────────────────── */}
      {conf === 'low' && (
        <div className="flex items-start gap-2 rounded-lg bg-orange-50 border border-orange-200 px-3 py-2 text-xs text-orange-700">
          <i className="fa-solid fa-triangle-exclamation mt-0.5 flex-shrink-0" />
          <span>
            Only <strong>{suggestion.compsUsed}</strong> comparable listing{suggestion.compsUsed !== 1 ? 's' : ''} found
            in {cityName}. Consider verifying the price against similar listings manually.
          </span>
        </div>
      )}

      {/* ── Explanation bullets ────────────────────────────────────────────── */}
      <ul className="space-y-2">
        {suggestion.explanation.map((pt, i) => (
          <li key={i} className="flex items-start gap-2 text-sm text-gray-700 leading-snug">
            <i className="fa-solid fa-circle-check text-blue-400 mt-0.5 flex-shrink-0 text-[13px]" />
            <span>{pt}</span>
          </li>
        ))}
      </ul>

      {/* ── Footer ────────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between pt-1 border-t border-blue-100">
        <p className="text-[11px] text-gray-400">
          Based on <strong>{suggestion.compsUsed}</strong> listing{suggestion.compsUsed !== 1 ? 's' : ''} · {suggestion.currency}
        </p>
        <button
          type="button"
          onClick={onRetry}
          className="text-[11px] font-semibold text-blue-500 hover:text-blue-700 underline underline-offset-2 transition"
        >
          ↻ Re-run
        </button>
      </div>
    </div>
  );
}
