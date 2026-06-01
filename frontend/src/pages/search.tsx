import { Layout } from '@/components/layout/Layout';
import { useRouter } from 'next/router';
import { useState, useEffect, useRef } from 'react';
import { ListingCard } from '@/components/shared/ListingCard';
import { LoadingCard } from '@/components/ui/LoadingCard';
import { useUserLocation } from '@/lib/hooks/useUserLocation';
import { CityPicker } from '@/components/shared/CityPicker';
import { useAuth } from '@/lib/auth/AuthProvider';

/**
 * Claude-style time-of-day greeting. Returns "Bonjour" / "Bon après-midi" /
 * "Bonsoir", with the user's first name when signed in. Computed client-side
 * (see effect below) so it never causes an SSR hydration mismatch.
 */
function timeGreeting(name?: string | null): string {
  const h = new Date().getHours();
  const base = h < 12 ? 'Bonjour' : h < 18 ? 'Bon après-midi' : 'Bonsoir';
  const first = name?.trim().split(/\s+/)[0];
  return first ? `${base}, ${first}` : base;
}

const HISTORY_KEY = 'rentai_search_history';
const MAX_HISTORY = 5;

function loadHistory(): string[] {
  if (typeof window === 'undefined') return [];
  try { return JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]'); } catch { return []; }
}
function saveToHistory(query: string) {
  if (!query.trim()) return;
  const prev = loadHistory().filter((q) => q !== query);
  localStorage.setItem(HISTORY_KEY, JSON.stringify([query, ...prev].slice(0, MAX_HISTORY)));
}
function clearHistory() {
  localStorage.removeItem(HISTORY_KEY);
}

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';
const DEFAULT_RADIUS = 60;

type AiMode = 'idle' | 'loading' | 'follow_up' | 'result' | 'error';
interface Chip { key: string; label: string; }
interface FollowUp { question: string; field: string; options?: string[]; }

function getContextualSuggestions() {
  const now   = new Date();
  const hour  = now.getHours();
  const month = now.getMonth(); // 0=Jan … 11=Dec

  const isMorning   = hour >= 6  && hour < 12;
  const isAfternoon = hour >= 12 && hour < 18;
  const isEvening   = hour >= 18 || hour < 6;
  const isSummer    = month >= 5 && month <= 8;   // Jun–Sep
  const isWeekend   = [5, 6].includes(now.getDay()); // Fri/Sat

  const pool: { label: string; icon: string }[] = [];

  // Time-of-day hints
  if (isMorning) {
    pool.push({ label: 'Terrain de padel ce matin', icon: '🎾' });
    pool.push({ label: 'Vélo ou scooter aujourd\'hui', icon: '🛵' });
  }
  if (isAfternoon) {
    pool.push({ label: 'Jet ski ou kayak cet après-midi', icon: '🚤' });
    pool.push({ label: 'Planche de surf aujourd\'hui', icon: '🏄' });
  }
  if (isEvening) {
    pool.push({ label: 'Villa bord de mer ce week-end', icon: '🏖️' });
    pool.push({ label: 'dar kelibia ta7t 500 ce week-end', icon: '🏠' });
  }

  // Summer-specific
  if (isSummer) {
    pool.push({ label: 'Villa avec piscine Kelibia', icon: '🏊' });
    pool.push({ label: 'Parasol et matelas plage', icon: '⛱️' });
    pool.push({ label: 'Jet ski Hammamet demain', icon: '🚤' });
    pool.push({ label: 'Appartement bord de mer moins de 800', icon: '🌊' });
  } else {
    pool.push({ label: 'Appartement Tunis Lac moins de 200', icon: '🏙️' });
    pool.push({ label: 'Voiture Tunis semaine prochaine', icon: '🚗' });
  }

  // Weekend
  if (isWeekend) {
    pool.push({ label: 'Chalet montagne ce week-end', icon: '🏕️' });
  } else {
    pool.push({ label: 'Voiture ce week-end', icon: '🚗' });
  }

  // Always-good
  pool.push({ label: 'Villa bord de mer Kelibia', icon: '🏖️' });
  pool.push({ label: 'Terrain de padel', icon: '🎾' });
  pool.push({ label: 'dar kelibia ta7t 500', icon: '🏠' });

  // Deduplicate and return first 6
  const seen = new Set<string>();
  return pool.filter(({ label }) => {
    if (seen.has(label)) return false;
    seen.add(label);
    return true;
  }).slice(0, 6);
}

const SUGGESTIONS = getContextualSuggestions();

async function fetchListings(params: Record<string, string | number | undefined>) {
  const qs = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== '') qs.set(k, String(v));
  });
  const res = await fetch(`${API}/api/listings?${qs}`);
  if (!res.ok) throw new Error('fetch failed');
  const json = await res.json();
  const raw = json?.data ?? json;
  return Array.isArray(raw) ? raw : (raw?.items ?? []);
}

// Showcase the AI's natural-language range (FR / darija / Arabic) in the idle
// placeholder — cycles every few seconds so the empty search never feels dead.
const SEARCH_EXAMPLES = [
  'villa kelibia bord de mer ta7t 500',
  'padel samedi après-midi',
  'voiture pas chère cette semaine',
  'jet ski hammamet demain',
  'appartement Tunis Lac moins de 200',
  'دار قريبة من البحر في قليبية',
];

/**
 * Claude-style "thinking" stream shown while the AI parses a query. Steps reveal
 * one at a time and tick off as the next begins — purely presentational, so it
 * can never affect the real search. The known city is woven in for realism.
 */
function AiThinking({ city }: { city?: string }) {
  const steps = [
    'Je comprends votre demande',
    'J’extrais les filtres — lieu, prix, dates',
    city ? `Je cherche près de ${city}` : 'Je cherche les meilleures annonces',
    'Je classe par pertinence',
  ];
  const [active, setActive] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setActive((a) => Math.min(a + 1, 3)), 700);
    return () => clearInterval(t);
  }, []);

  return (
    <div className="mb-5 overflow-hidden rounded-2xl border border-blue-100 bg-gradient-to-br from-blue-50 to-white px-5 py-4 shadow-sm">
      <div className="mb-3 flex items-center gap-2">
        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-600">
          <i className="fa-solid fa-robot text-sm text-white" />
        </div>
        <p className="text-sm font-semibold text-blue-900">L’IA réfléchit…</p>
      </div>
      <ul className="space-y-2">
        {steps.slice(0, active + 1).map((label, i) => {
          const done = i < active;
          return (
            <li key={i} className="re-fade-up flex items-center gap-2.5 text-sm">
              <span
                className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] ${
                  done ? 'bg-emerald-500 text-white' : 'bg-blue-100 text-blue-600'
                }`}
              >
                <i className={`fa-solid ${done ? 'fa-check' : 'fa-spinner animate-spin'}`} />
              </span>
              <span className={done ? 'text-gray-500' : 'font-medium text-gray-800'}>
                {label}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export default function SearchPage() {
  const router = useRouter();

  const urlQ            = typeof router.query.q            === 'string' ? router.query.q            : '';
  const urlCategorySlug = typeof router.query.categorySlug === 'string' ? router.query.categorySlug : '';
  const urlCategory     = typeof router.query.category     === 'string' ? router.query.category     : '';

  // URL params take precedence over auto-detected location (e.g. when navigating from homepage)
  const urlLat    = typeof router.query.lat      === 'string' ? parseFloat(router.query.lat)      : undefined;
  const urlLng    = typeof router.query.lng      === 'string' ? parseFloat(router.query.lng)      : undefined;
  const urlRadius = typeof router.query.radiusKm === 'string' ? parseFloat(router.query.radiusKm) : undefined;

  const { lat: hookLat, lng: hookLng, cityName: hookCityName } = useUserLocation();

  const searchLat    = (urlLat    !== undefined && !isNaN(urlLat))    ? urlLat    : hookLat;
  const searchLng    = (urlLng    !== undefined && !isNaN(urlLng))    ? urlLng    : hookLng;
  const searchRadius = (urlRadius !== undefined && !isNaN(urlRadius)) ? urlRadius : DEFAULT_RADIUS;

  // Display name for the active search city — defaults to user's detected city, overridden when picker chooses one
  const [cityDisplay, setCityDisplay] = useState(hookCityName);
  useEffect(() => { setCityDisplay(hookCityName); }, [hookCityName]);

  // Claude-style greeting — computed on the client so the time-of-day text (and
  // the auth-only name) never clashes with the server-rendered HTML on hydration.
  const { user } = useAuth();
  const [greeting, setGreeting] = useState('');
  useEffect(() => {
    setGreeting(timeGreeting(user?.name));
  }, [user]);

  // Rotating example query in the placeholder (idle delight).
  const [phIdx, setPhIdx] = useState(0);
  useEffect(() => {
    const t = setInterval(
      () => setPhIdx((i) => (i + 1) % SEARCH_EXAMPLES.length),
      3200,
    );
    return () => clearInterval(t);
  }, []);

  function pushNewLocation(picked: { lat: number; lng: number; cityName: string }) {
    setCityDisplay(picked.cityName);
    void router.push({
      pathname: '/search',
      query: {
        ...router.query,
        lat: picked.lat,
        lng: picked.lng,
        radiusKm: searchRadius,
      },
    }, undefined, { shallow: false });
  }

  const [inputQ, setInputQ]                   = useState(urlQ);
  const [aiMode, setAiMode]                   = useState<AiMode>('idle');
  const [chips, setChips]                     = useState<Chip[]>([]);
  const [followUp, setFollowUp]               = useState<FollowUp | null>(null);
  const [aiResults, setAiResults]             = useState<any[]>([]);
  const [fallbackResults, setFallbackResults] = useState<any[]>([]);
  const [fallbackLoading, setFallbackLoading] = useState(false);
  const [lastQuery, setLastQuery]             = useState('');
  const [lastFilters, setLastFilters]         = useState<Record<string, any> | null>(null);
  const [relaxedConstraints, setRelaxed]      = useState<string[]>([]);
  const [aiSummary, setAiSummary]             = useState<string>('');
  const [aiSuggestions, setAiSuggestions]     = useState<string[]>([]);
  const [aiReasoning, setAiReasoning]         = useState<string>('');
  const [aiStats, setAiStats]                 = useState<{ minPrice?: number; maxPrice?: number; avgPrice?: number; priceUnit?: string } | null>(null);
  const [showReasoning, setShowReasoning]     = useState(false);
  const [followUpCount, setFollowUpCount]     = useState(0);
  const [history, setHistory]                 = useState<string[]>([]);
  const [showHistory, setShowHistory]         = useState(false);
  const [isListening, setIsListening]         = useState(false);
  const [customFollowUp, setCustomFollowUp]   = useState('');
  const inputRef       = useRef<HTMLInputElement>(null);
  const followUpRef    = useRef<HTMLInputElement>(null);
  const isReady        = useRef(false);

  // Load search history on mount
  useEffect(() => { setHistory(loadHistory()); }, []);

  // Category browse fallback
  useEffect(() => {
    if (!router.isReady || urlQ) return;
    setFallbackLoading(true);
    fetchListings({
      categorySlug: urlCategorySlug || undefined,
      category:     urlCategory     || undefined,
      lat: searchLat, lng: searchLng, radiusKm: searchRadius, limit: 30,
    })
      .then(setFallbackResults)
      .catch(() => setFallbackResults([]))
      .finally(() => setFallbackLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router.isReady, urlCategorySlug, urlCategory, searchLat, searchLng, searchRadius]);

  // Auto-run on ?q=
  useEffect(() => {
    if (!router.isReady || isReady.current) return;
    isReady.current = true;
    if (urlQ) { setInputQ(urlQ); void runAiSearch(urlQ, 0, '', null); }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router.isReady]);

  async function runAiSearch(
    query: string,
    followUpUsed: number,
    followUpAns: string,
    previousFilters?: Record<string, any> | null,
  ) {
    if (!query.trim()) return;
    setAiMode('loading');
    setLastQuery(query);
    try {
      const body: Record<string, any> = {
        query, lat: searchLat, lng: searchLng,
        radiusKm: searchRadius, followUpUsed, followUpAnswer: followUpAns || '',
      };
      if (previousFilters && Object.keys(previousFilters).length > 0) {
        body.previousFilters = previousFilters;
      }
      const res = await fetch(`${API}/api/ai/search`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error('AI error');
      const json = await res.json();
      const data = json?.data ?? json;
      setChips(data.chips ?? []);
      setLastFilters(data.filters ?? null);
      setRelaxed(data.relaxedConstraints ?? []);
      setAiSummary(data.summary ?? '');
      setAiSuggestions(data.suggestions ?? []);
      setAiReasoning(data.reasoning ?? '');
      setAiStats(data.stats ?? null);
      setShowReasoning(false);
      if (data.mode === 'FOLLOW_UP') {
        setFollowUp(data.followUp ?? null);
        setAiResults([]);
        setAiMode('follow_up');
        // Pre-load background results for preview behind the follow-up card
        if (fallbackResults.length === 0) {
          fetchListings({ q: query, lat: searchLat, lng: searchLng, radiusKm: searchRadius, limit: 3 })
            .then(setFallbackResults).catch(() => {});
        }
      } else {
        setFollowUp(null);
        setAiResults(data.results ?? []);
        setAiMode('result');
        // Persist to history only when we get real results
        saveToHistory(query);
        setHistory(loadHistory());
      }
    } catch {
      setAiMode('error');
      setFallbackLoading(true);
      fetchListings({ q: query, lat: searchLat, lng: searchLng, radiusKm: searchRadius, limit: 30 })
        .then(setFallbackResults)
        .catch(() => setFallbackResults([]))
        .finally(() => setFallbackLoading(false));
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!inputQ.trim()) return;
    const isRefinement = chips.length > 0 || aiMode === 'result';
    setFollowUp(null); setFollowUpCount(0); setCustomFollowUp('');
    if (!isRefinement) setChips([]);
    void runAiSearch(inputQ, 0, '', isRefinement ? lastFilters : null);
  }

  function handleSuggestion(label: string) {
    setInputQ(label); setChips([]); setFollowUp(null); setLastFilters(null);
    setRelaxed([]); setFollowUpCount(0); setCustomFollowUp('');
    void runAiSearch(label, 0, '', null);
  }

  function handleFollowUpAnswer(answer: string) {
    const next = followUpCount + 1;
    setFollowUpCount(next);
    setCustomFollowUp('');
    void runAiSearch(lastQuery, next, answer, lastFilters);
  }

  function handleSkipFollowUp() {
    const next = followUpCount + 1;
    setFollowUpCount(next);
    setCustomFollowUp('');
    void runAiSearch(lastQuery, next, '', lastFilters);
  }

  function handleNewSearch() {
    setInputQ(''); setAiMode('idle'); setChips([]); setAiResults([]);
    setLastFilters(null); setFollowUp(null); setRelaxed([]); setFollowUpCount(0);
    setCustomFollowUp('');
    void router.push('/search');
  }

  function handleVoice() {
    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) return;

    const recognition = new SpeechRecognition();
    recognition.lang = 'fr-FR';
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;

    setIsListening(true);
    recognition.start();

    recognition.onresult = (event: any) => {
      const transcript: string = event.results[0][0].transcript;
      setIsListening(false);
      setInputQ(transcript);
      setChips([]); setFollowUp(null); setLastFilters(null); setRelaxed([]); setFollowUpCount(0);
      void runAiSearch(transcript, 0, '', null);
    };

    recognition.onerror = () => setIsListening(false);
    recognition.onend   = () => setIsListening(false);
  }

  const hasSpeechSupport = typeof window !== 'undefined' &&
    ((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition);

  const isAiLoading  = aiMode === 'loading';
  const showAi       = aiMode === 'result' || aiMode === 'follow_up';
  const displayItems = showAi ? aiResults : fallbackResults;
  const isLoading    = isAiLoading || (aiMode === 'idle' && fallbackLoading);
  const isIdle       = aiMode === 'idle' && !urlCategorySlug && !urlQ && !fallbackLoading;
  const resultCount  = displayItems.length;

  return (
    <Layout>
      <div className="mx-auto max-w-4xl px-4 py-10">

        {/* ── Hero heading (idle only) ────────────────────────── */}
        {isIdle && (
          <div className="mb-8 text-center">
            <h1 className="mb-2 text-3xl font-bold tracking-tight text-gray-900 transition-opacity duration-500 sm:text-4xl">
              {greeting || 'Que cherchez-vous ?'}
            </h1>
            <p className="text-sm text-gray-500">
              {greeting
                ? 'Que cherchez-vous aujourd’hui ? L’IA comprend le français, la darija, l’arabe et l’anglais.'
                : 'Cherchez en français, darija, arabe ou anglais — l’IA comprend tout.'}
            </p>
          </div>
        )}

        {/* ── Location row ───────────────────────────────────── */}
        <div className="mb-3 flex items-center gap-3 rounded-2xl border border-gray-200 bg-white px-5 py-3 shadow-sm">
          <i className="fa-solid fa-location-dot text-blue-500 shrink-0" />
          <span className="shrink-0 text-xs font-semibold uppercase tracking-wide text-gray-500">
            Near
          </span>
          <div className="flex-1">
            <CityPicker
              value={cityDisplay}
              onChange={setCityDisplay}
              onPick={pushNewLocation}
              placeholder="City or area"
              inputClassName="py-1"
            />
          </div>
          <span className="shrink-0 text-xs text-gray-400">within {searchRadius} km</span>
        </div>

        {/* ── Search box ─────────────────────────────────────── */}
        <form onSubmit={handleSubmit} className="relative mb-5">
          <div className={`flex items-center gap-2 rounded-2xl border bg-white shadow-md transition-shadow ${isAiLoading ? 'border-blue-400 shadow-blue-100' : 'border-gray-200 hover:shadow-lg'}`}>
            <div className="relative flex-1">
              <i className={`fa-solid fa-magnifying-glass absolute left-4 top-1/2 -translate-y-1/2 text-sm ${isAiLoading ? 'text-blue-400 animate-pulse' : 'text-gray-400'}`} />
              <input
                ref={inputRef}
                type="text"
                value={inputQ}
                onChange={(e) => setInputQ(e.target.value)}
                onFocus={() => { if (history.length > 0) setShowHistory(true); }}
                onBlur={() => setTimeout(() => setShowHistory(false), 150)}
                placeholder={`Ex : « ${SEARCH_EXAMPLES[phIdx]} »`}
                className="w-full rounded-2xl bg-transparent py-4 pl-11 pr-4 text-sm text-gray-900 placeholder-gray-400 transition-all focus:outline-none"
                disabled={isAiLoading}
              />
            </div>
            {hasSpeechSupport && (
              <button
                type="button"
                onClick={handleVoice}
                disabled={isAiLoading || isListening}
                title="Recherche vocale"
                className={`shrink-0 rounded-xl border px-3 py-2.5 text-sm transition mr-1 ${
                  isListening
                    ? 'border-red-300 bg-red-50 text-red-500 animate-pulse'
                    : 'border-gray-200 bg-white text-gray-400 hover:border-blue-300 hover:text-blue-500'
                }`}
              >
                <i className={`fa-solid ${isListening ? 'fa-circle-stop' : 'fa-microphone'}`} />
              </button>
            )}
            <button
              type="submit"
              disabled={isAiLoading || !inputQ.trim()}
              className="m-2 rounded-xl bg-blue-600 px-6 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:opacity-40"
            >
              {isAiLoading ? (
                <span className="flex items-center gap-2">
                  <i className="fa-solid fa-spinner animate-spin text-xs" /> Recherche…
                </span>
              ) : 'Rechercher'}
            </button>
          </div>

          {/* ── History dropdown ──────────────────────────────── */}
          {showHistory && history.length > 0 && !isAiLoading && (
            <div className="absolute left-0 right-0 top-full z-30 mt-1 overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-lg">
              <div className="flex items-center justify-between px-4 py-2 text-xs font-bold uppercase tracking-wide text-gray-400">
                <span><i className="fa-solid fa-clock-rotate-left mr-1.5" />Récentes</span>
                <button
                  type="button"
                  onClick={() => { clearHistory(); setHistory([]); setShowHistory(false); }}
                  className="text-gray-400 hover:text-red-500 transition"
                >
                  Effacer
                </button>
              </div>
              {history.map((q) => (
                <button
                  key={q}
                  type="button"
                  onMouseDown={() => {
                    setInputQ(q);
                    setShowHistory(false);
                    setChips([]); setFollowUp(null); setLastFilters(null); setRelaxed([]); setFollowUpCount(0);
                    void runAiSearch(q, 0, '', null);
                  }}
                  className="flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm text-gray-700 hover:bg-blue-50 hover:text-blue-700 transition"
                >
                  <i className="fa-solid fa-magnifying-glass text-xs text-gray-300" />
                  {q}
                </button>
              ))}
            </div>
          )}
        </form>

        {/* ── Quick suggestions (idle) ───────────────────────── */}
        {isIdle && (
          <div className="mb-10 flex flex-wrap justify-center gap-2">
            {SUGGESTIONS.map((s) => (
              <button
                key={s.label}
                onClick={() => handleSuggestion(s.label)}
                className="flex items-center gap-1.5 rounded-full border border-gray-200 bg-white px-4 py-2 text-sm text-gray-600 shadow-sm transition hover:border-blue-300 hover:bg-blue-50 hover:text-blue-700"
              >
                <span>{s.icon}</span>{s.label}
              </button>
            ))}
          </div>
        )}

        {/* ── AI reasoning stream (Claude-style thinking) ─────── */}
        {isAiLoading && <AiThinking city={cityDisplay} />}

        {/* ── "What I understood" chips ──────────────────────── */}
        {chips.length > 0 && !isAiLoading && (
          <div className="mb-5 flex flex-wrap items-center gap-2">
            <span className="text-xs font-bold uppercase tracking-wide text-gray-400">J&apos;ai compris :</span>
            {chips.map((chip) => (
              <span
                key={chip.key}
                className="flex items-center gap-1 rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-xs font-medium text-blue-700"
              >
                <span className="text-[9px] font-bold uppercase text-blue-400">{chip.key}</span>
                <span className="mx-0.5">·</span>
                {chip.label}
                <button
                  onClick={() => setChips((c) => c.filter((x) => x.key !== chip.key))}
                  className="ml-1 rounded-full p-0.5 hover:bg-blue-200"
                >
                  <i className="fa-solid fa-xmark text-[9px]" />
                </button>
              </span>
            ))}
          </div>
        )}

        {/* ── Follow-up question ────────────────────────────── */}
        {aiMode === 'follow_up' && followUp && (
          <div className="mb-6 overflow-hidden rounded-2xl border border-blue-200 shadow-sm">
            {/* Header with progress */}
            <div className="flex items-center justify-between bg-gradient-to-r from-blue-600 to-indigo-600 px-5 py-3">
              <div className="flex items-center gap-2">
                <i className="fa-solid fa-robot text-sm text-white/90" />
                <span className="text-sm font-semibold text-white">L&apos;IA a besoin d&apos;une précision</span>
              </div>
              <div className="flex items-center gap-1.5">
                {[1, 2].map((step) => (
                  <div
                    key={step}
                    className={`h-2 w-6 rounded-full transition-all ${step <= followUpCount + 1 ? 'bg-white' : 'bg-white/30'}`}
                  />
                ))}
                <span className="ml-1.5 text-xs text-white/70">Question {followUpCount + 1}/2</span>
              </div>
            </div>

            {/* Question body */}
            <div className="bg-gradient-to-br from-blue-50 to-indigo-50 p-5">
              <p className="mb-4 text-sm font-semibold text-gray-900">{followUp.question}</p>

              {/* Option buttons */}
              <div className="flex flex-wrap gap-2 mb-4">
                {(followUp.options ?? []).map((opt) => (
                  <button
                    key={opt}
                    onClick={() => handleFollowUpAnswer(opt)}
                    className="rounded-xl border border-blue-300 bg-white px-4 py-2 text-sm font-medium text-blue-700 shadow-sm transition hover:bg-blue-600 hover:text-white hover:border-blue-600"
                  >
                    {opt}
                  </button>
                ))}
              </div>

              {/* Custom text input */}
              <div className="flex items-center gap-2 border-t border-blue-200 pt-4">
                <input
                  ref={followUpRef}
                  type="text"
                  value={customFollowUp}
                  onChange={(e) => setCustomFollowUp(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && customFollowUp.trim()) handleFollowUpAnswer(customFollowUp.trim());
                  }}
                  placeholder="Ou tapez votre réponse…"
                  className="flex-1 rounded-xl border border-blue-200 bg-white px-4 py-2 text-sm text-gray-800 placeholder-gray-400 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100"
                />
                <button
                  onClick={() => customFollowUp.trim() && handleFollowUpAnswer(customFollowUp.trim())}
                  disabled={!customFollowUp.trim()}
                  className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-blue-700 disabled:opacity-40"
                >
                  Envoyer
                </button>
                <button
                  onClick={handleSkipFollowUp}
                  className="rounded-xl border border-gray-200 bg-white px-4 py-2 text-sm text-gray-400 transition hover:bg-gray-50"
                >
                  Passer →
                </button>
              </div>
            </div>

            {/* Background results (dimmed preview while waiting for answer) */}
            {fallbackResults.length > 0 && (
              <div className="relative border-t border-blue-100 bg-white">
                <div className="pointer-events-none absolute inset-0 z-10 bg-white/70 backdrop-blur-[2px]" />
                <div className="relative z-0 grid gap-4 p-4 sm:grid-cols-2 lg:grid-cols-3">
                  {fallbackResults.slice(0, 3).map((l: any) => (
                    <ListingCard key={l.id} listing={l} />
                  ))}
                </div>
                <p className="relative z-0 pb-3 text-center text-xs text-gray-400">
                  <i className="fa-solid fa-lock mr-1" />
                  Répondez pour affiner ces résultats
                </p>
              </div>
            )}
          </div>
        )}

        {/* ── AI fallback notice ────────────────────────────── */}
        {aiMode === 'error' && (
          <div className="mb-4 flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
            <i className="fa-solid fa-triangle-exclamation" />
            Recherche IA indisponible — résultats par mots-clés.
          </div>
        )}

        {/* ── Results header ─────────────────────────────────── */}
        {!isIdle && !isAiLoading && (aiMode !== 'follow_up') && (
          <div className="mb-4 flex items-center justify-between">
            <p className="text-sm font-semibold text-gray-700">
              {showAi
                ? <><span className="text-blue-600">{resultCount}</span> résultat{resultCount !== 1 ? 's' : ''}</>
                : urlCategorySlug ? `Catégorie : ${urlCategorySlug}` : `Résultats pour « ${lastQuery || urlQ} »`
              }
            </p>
            {(aiMode === 'result' || aiMode === 'error') && (
              <button
                onClick={() => { handleNewSearch(); }}
                className="text-xs text-gray-400 underline hover:text-gray-600"
              >
                Nouvelle recherche
              </button>
            )}
          </div>
        )}

        {/* ── AI summary card (Alibaba-style conversational header) ─── */}
        {aiMode === 'result' && aiSummary && (
          <div className="mb-4 rounded-2xl border border-blue-100 bg-gradient-to-br from-blue-50 to-white px-5 py-4 shadow-sm">
            <div className="flex items-start gap-3">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-blue-600 text-sm text-white">
                <i className="fa-solid fa-sparkles" />
              </div>
              <div className="flex-1">
                <p className="text-sm leading-relaxed text-gray-800">{aiSummary}</p>
                {aiStats && aiStats.minPrice != null && aiStats.maxPrice != null && (
                  <div className="mt-2 flex flex-wrap gap-3 text-xs text-gray-600">
                    <span><i className="fa-solid fa-tag mr-1 text-violet-500" />{aiStats.minPrice}–{aiStats.maxPrice} {aiStats.priceUnit ?? 'TND'}</span>
                    {aiStats.avgPrice != null && <span><i className="fa-solid fa-chart-line mr-1 text-emerald-500" />Moyenne {aiStats.avgPrice} {aiStats.priceUnit ?? 'TND'}</span>}
                  </div>
                )}
                {aiReasoning && (
                  <button
                    onClick={() => setShowReasoning(s => !s)}
                    className="mt-2 text-xs font-medium text-blue-600 hover:underline"
                  >
                    <i className={`fa-solid ${showReasoning ? 'fa-chevron-down' : 'fa-chevron-right'} mr-1`} />
                    {showReasoning ? 'Masquer le raisonnement' : 'Montrer le raisonnement'}
                  </button>
                )}
                {showReasoning && aiReasoning && (
                  <p className="mt-2 rounded-lg bg-white px-3 py-2 text-xs text-gray-600 italic border border-blue-100">
                    {aiReasoning}
                  </p>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ── Suggestion chips (clickable refinements) ─────────── */}
        {aiMode === 'result' && aiSuggestions.length > 0 && (
          <div className="mb-4 flex flex-wrap gap-2">
            {aiSuggestions.map((s, i) => (
              <button
                key={i}
                onClick={() => {
                  // Fire-and-forget telemetry — never block the actual search.
                  fetch(`${API}/api/ai/search/suggestion-click`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ suggestion: s, originalQuery: lastQuery }),
                  }).catch(() => {});
                  setInputQ(s);
                  void runAiSearch(s, 0, '', lastFilters);
                }}
                className="rounded-full border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 transition hover:border-blue-400 hover:bg-blue-50 hover:text-blue-700"
              >
                <i className="fa-solid fa-wand-magic-sparkles mr-1.5 text-blue-500" />{s}
              </button>
            ))}
          </div>
        )}

        {/* ── Relaxed-constraint notice (kept as fallback when summary is missing) ── */}
        {aiMode === 'result' && relaxedConstraints.length > 0 && aiResults.length > 0 && !aiSummary && (
          <div className="mb-4 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            <i className="fa-solid fa-circle-info mt-0.5 shrink-0 text-amber-500" />
            <span>
              Aucun résultat exact —{' '}
              {relaxedConstraints.includes('price')  && 'la limite de prix a été retirée'}
              {relaxedConstraints.includes('radius') && !relaxedConstraints.includes('price') && 'la zone a été élargie'}
              {relaxedConstraints.includes('dates')  && !relaxedConstraints.includes('price') && !relaxedConstraints.includes('radius') && 'la contrainte de date a été retirée'}
              . Voici les résultats les plus proches.
            </span>
          </div>
        )}

        {/* ── Results grid ───────────────────────────────────── */}
        {isLoading ? (
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => <LoadingCard key={i} />)}
          </div>
        ) : displayItems.length > 0 ? (
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {displayItems.map((l: any) => (
              <ListingCard
                key={l.id}
                listing={l}
                matchFilters={showAi && lastFilters ? lastFilters : undefined}
              />
            ))}
          </div>
        ) : aiMode === 'result' ? (
          /* Zero results after AI search */
          <div className="flex flex-col items-center py-20 text-center">
            <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-gray-100 text-3xl">🔍</div>
            <h3 className="mb-2 text-lg font-semibold text-gray-800">Aucun résultat trouvé</h3>
            <p className="mb-6 max-w-sm text-sm text-gray-500">
              Essayez sans limite de prix, avec une ville différente, ou reformulez votre recherche.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => { if (inputRef.current) inputRef.current.focus(); }}
                className="rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-blue-700"
              >
                Modifier la recherche
              </button>
              <button
                onClick={() => { handleNewSearch(); }}
                className="rounded-xl border border-gray-200 bg-white px-5 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Tout effacer
              </button>
            </div>
          </div>
        ) : null}

        {/* ── Idle placeholder ───────────────────────────────── */}
        {isIdle && (
          <div className="mt-4 rounded-2xl border border-dashed border-gray-200 bg-gray-50 py-14 text-center">
            <p className="text-sm text-gray-400">
              Essayez{' '}
              <button className="font-semibold text-blue-500 hover:underline" onClick={() => handleSuggestion('villa bord de mer kelibia ta7t 1000')}>
                &ldquo;villa bord de mer kelibia ta7t 1000&rdquo;
              </button>
              {' '}ou{' '}
              <button className="font-semibold text-blue-500 hover:underline" onClick={() => handleSuggestion('padel')}>
                &ldquo;padel&rdquo;
              </button>
            </p>
          </div>
        )}

      </div>

      <style jsx global>{`
        .dot-bounce {
          animation: dotBounce 1s infinite ease-in-out;
        }
        @keyframes dotBounce {
          0%, 80%, 100% { transform: translateY(0); opacity: 0.6; }
          40% { transform: translateY(-5px); opacity: 1; }
        }
      `}</style>
    </Layout>
  );
}
