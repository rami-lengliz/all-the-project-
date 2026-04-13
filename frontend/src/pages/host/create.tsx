import { useState, useRef, useCallback, useEffect } from 'react';
import { useRouter } from 'next/router';
import { HostLayout } from '@/components/host/HostLayout';
import { api } from '@/lib/api/http';
import { InlineError } from '@/components/ui/InlineError';
import { toast } from '@/components/ui/Toaster';
import { useCategories } from '@/lib/api/hooks/useCategories';
import { fetchPriceSuggestion, PriceSuggestionResponse } from '@/lib/api/price-suggestion';
import { getApiCategory, getApiUnit } from '@/lib/categoryPricingUnits';
import { PriceSuggestionCard } from '@/components/ai/PriceSuggestionCard';

// ── Types ──────────────────────────────────────────────────────────────────────
interface ImagePreview { file: File; preview: string; }

type PropertyType = 'villa' | 'house' | 'apartment' | '';


function extractCity(addr: string) { return addr.split(',')[0]?.trim() || addr; }
function isAccomm(slug: string) { return ['stays', 'accommodation', 'holiday-rentals'].includes(slug); }

// ── Page ───────────────────────────────────────────────────────────────────────
export default function HostCreatePage() {
  const router          = useRouter();
  const fileInputRef    = useRef<HTMLInputElement>(null);
  const categoriesQuery = useCategories();
  const reviewRef       = useRef<HTMLDivElement>(null);

  // ── Form state ──────────────────────────────────────────────────────────────
  const [images, setImages]         = useState<ImagePreview[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError]           = useState<string | null>(null);
  const [formData, setFormData]     = useState({
    title: '', description: '', categoryId: '',
    address: '', latitude: '', longitude: '', rules: '',
  });

  // ── Accommodation extras ────────────────────────────────────────────────────
  const [propertyType, setPropertyType]     = useState<PropertyType>('');
  const [distanceToSea, setDistanceToSea]   = useState('');

  // ── Price suggestion state ──────────────────────────────────────────────────
  const [suggestion, setSuggestion]         = useState<PriceSuggestionResponse | null>(null);
  const [suggestionLoading, setSuggestionLoading] = useState(false);
  const [suggestionError, setSuggestionError]     = useState<string | null>(null);
  const [finalPrice, setFinalPrice]         = useState('');   // chosen price (editable)

  // ── Derived ─────────────────────────────────────────────────────────────────
  const selectedCat  = categoriesQuery.data?.find((c) => c.id === formData.categoryId);
  const catSlug      = selectedCat?.slug ?? '';
  const cityName     = extractCity(formData.address);
  const canSuggest   = cityName.length >= 2 && catSlug !== '';

  // ── Image handlers ───────────────────────────────────────────────────────────
  const handleImageSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    if (images.length + files.length > 5) { setError('Maximum 5 images allowed'); return; }
    const validFiles: ImagePreview[] = [];
    for (const file of files) {
      if (!file.type.match(/^image\/(jpeg|jpg|png)$/)) { setError(`${file.name}: Only JPEG/PNG allowed`); continue; }
      if (file.size > 5 * 1024 * 1024)                { setError(`${file.name}: Max 5 MB`); continue; }
      validFiles.push({ file, preview: URL.createObjectURL(file) });
    }
    if (validFiles.length) { setImages((p) => [...p, ...validFiles]); setError(null); }
    if (fileInputRef.current) fileInputRef.current.value = '';
  }, [images.length]);

  const handleRemoveImage = useCallback((i: number) => {
    setImages((p) => { const n = [...p]; URL.revokeObjectURL(n[i].preview); n.splice(i, 1); return n; });
  }, []);

  // ── Step 5: fetch AI suggestion ──────────────────────────────────────────────
  async function handleGetSuggestion() {
    if (!canSuggest) return;
    setSuggestionLoading(true);
    setSuggestionError(null);
    setSuggestion(null);
    setFinalPrice('');
    try {
      const result = await fetchPriceSuggestion({
        city:     cityName,
        category: getApiCategory(catSlug),
        unit:     getApiUnit(catSlug),
        lat:      formData.latitude  ? parseFloat(formData.latitude)  : undefined,
        lng:      formData.longitude ? parseFloat(formData.longitude) : undefined,
        radiusKm: 20,
        ...(isAccomm(catSlug) && propertyType   ? { propertyType }                                 : {}),
        ...(isAccomm(catSlug) && distanceToSea  ? { distanceToSeaKm: parseFloat(distanceToSea) }  : {}),
      });
      setSuggestion(result);
      setFinalPrice(String(result.recommended)); // pre-fill with suggestion
      // Scroll to review panel
      setTimeout(() => reviewRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100);
    } catch (err: any) {
      const rawMsg = err?.response?.data?.message;
      setSuggestionError(
        Array.isArray(rawMsg) ? rawMsg.join(', ') :
        typeof rawMsg === 'string' ? rawMsg :
        err?.message || 'Failed to get suggestion',
      );
    } finally {
      setSuggestionLoading(false);
    }
  }
  // ── Auto-trigger AI suggestion when Step 6 scrolls into view ───────────────
  // Uses IntersectionObserver so the call fires exactly once per session
  // the moment the review panel becomes visible (threshold 20%).
  useEffect(() => {
    const el = reviewRef.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && canSuggest && !suggestion && !suggestionLoading) {
          handleGetSuggestion();
        }
      },
      { threshold: 0.20 },   // fire when 20% of the panel is visible
    );

    observer.observe(el);
    return () => observer.disconnect();
    // Re-subscribe when canSuggest changes (e.g. user fills address/category later)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canSuggest]);


  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!images.length)             { setError('At least one image is required'); return; }
    if (!formData.title.trim())     { setError('Title is required'); return; }
    if (!formData.description.trim()) { setError('Description is required'); return; }
    if (!formData.categoryId)       { setError('Category is required'); return; }
    if (!formData.address.trim())   { setError('Address is required'); return; }
    if (!formData.latitude || !formData.longitude) { setError('Location coordinates are required'); return; }
    const priceVal = parseFloat(finalPrice);
    if (!finalPrice || isNaN(priceVal) || priceVal <= 0) {
      setError('Price is required — get an AI suggestion or enter a price manually');
      return;
    }

    setIsUploading(true);
    try {
      const submitData = new FormData();
      submitData.append('title',       formData.title);
      submitData.append('description', formData.description);
      submitData.append('categoryId',  formData.categoryId);
      submitData.append('pricePerDay', String(priceVal));
      submitData.append('address',     formData.address);
      submitData.append('latitude',    formData.latitude);
      submitData.append('longitude',   formData.longitude);
      if (formData.rules) submitData.append('rules', formData.rules);
      images.forEach((img) => submitData.append('images', img.file));

      const response = await api.post('/listings', submitData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });

      // Patch price suggestion log (non-blocking)
      if (suggestion?.logId && response.data?.data?.id) {
        api.patch(`/ai/price-suggestion/log/${suggestion.logId}`, {
          listingId:      response.data.data.id,
          finalPrice:     priceVal,
          suggestedPrice: suggestion.recommended,
        }).catch(() => { /* non-critical */ });
      }

      images.forEach((img) => URL.revokeObjectURL(img.preview));
      toast({ title: 'Success', message: 'Listing created successfully!', variant: 'success' });
      router.push('/host/listings');
    } catch (err: any) {
      const raw = err?.response?.data?.message ?? err?.response?.data?.error;
      setError(
        Array.isArray(raw)  ? raw.join(', ')        :
        typeof raw === 'string' ? raw               :
        typeof raw === 'object' && raw !== null ? JSON.stringify(raw) :
        err?.message || 'Failed to create listing',
      );
    } finally {
      setIsUploading(false);
    }
  };

  // ── Render ───────────────────────────────────────────────────────────────────
  return (
    <HostLayout>
      <div className="bg-gray-50 font-sans">

        {/* Progress bar (steps 1-6) */}
        <section className="bg-white border-b border-gray-200 sticky top-0 z-10">
          <div className="max-w-3xl mx-auto px-6 py-3">
            <div className="flex items-center gap-1 text-xs font-medium">
              {['Photos', 'Details', 'Location', 'Category', 'AI Price', 'Publish'].map((s, i) => (
                <div key={s} className="flex items-center gap-1">
                  <span className="w-5 h-5 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center text-[10px] font-bold flex-shrink-0">
                    {i + 1}
                  </span>
                  <span className="text-gray-600 hidden sm:inline">{s}</span>
                  {i < 5 && <span className="text-gray-300 mx-1">›</span>}
                </div>
              ))}
            </div>
          </div>
        </section>

        <main className="max-w-3xl mx-auto px-6 py-10">
          <form onSubmit={handleSubmit} className="space-y-6">

            {/* ── Step 1: Photos ─────────────────────────────────────────── */}
            <div id="step-photos" className="bg-white rounded-2xl shadow-sm border border-gray-200 p-8">
              <h1 className="text-2xl font-bold text-gray-900 mb-1">Step 1 — Add photos</h1>
              <p className="text-sm text-gray-500 mb-6">Upload 1–5 photos (JPEG/PNG, max 5 MB each)</p>

              {images.length > 0 && (
                <div className="mb-4 grid grid-cols-2 md:grid-cols-3 gap-3">
                  {images.map((img, idx) => (
                    <div key={idx} className="relative group">
                      <img src={img.preview} alt={`Preview ${idx + 1}`}
                        className="w-full h-40 object-cover rounded-lg border border-gray-200" />
                      <button type="button" onClick={() => handleRemoveImage(idx)}
                        className="absolute top-2 right-2 bg-red-500 hover:bg-red-600 text-white rounded-full w-7 h-7 flex items-center justify-center opacity-0 group-hover:opacity-100 transition">
                        <i className="fa-solid fa-times text-xs" />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              <div onClick={() => fileInputRef.current?.click()}
                className="border-2 border-dashed border-gray-300 rounded-xl p-10 text-center hover:border-blue-400 transition cursor-pointer bg-gray-50">
                <input ref={fileInputRef} type="file" accept="image/jpeg,image/jpg,image/png"
                  multiple onChange={handleImageSelect} className="hidden" />
                <i className="fa-solid fa-cloud-arrow-up text-blue-400 text-3xl mb-3" />
                <p className="text-sm font-medium text-gray-700">Click to upload photos</p>
                <p className="text-xs text-gray-400 mt-1">JPG, PNG — max 5 MB</p>
              </div>
            </div>

            {/* ── Step 2: Title & Description ───────────────────────────── */}
            <div id="step-details" className="bg-white rounded-2xl shadow-sm border border-gray-200 p-8">
              <h2 className="text-2xl font-bold text-gray-900 mb-1">Step 2 — Describe your listing</h2>
              <p className="text-sm text-gray-500 mb-6">Be clear and specific to attract the right renters.</p>
              <div className="space-y-5">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">Title *</label>
                  <input type="text" value={formData.title}
                    onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                    placeholder="e.g., Modern 2-Bedroom Apartment in La Marsa"
                    maxLength={60}
                    className="w-full border border-gray-300 rounded-lg px-4 py-3 text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    required />
                  <p className="text-xs text-gray-400 mt-1">{formData.title.length}/60</p>
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">Description *</label>
                  <textarea value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    placeholder="Describe your item in detail..." rows={5}
                    className="w-full border border-gray-300 rounded-lg px-4 py-3 text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    required />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">Rules (optional)</label>
                  <textarea value={formData.rules}
                    onChange={(e) => setFormData({ ...formData, rules: e.target.value })}
                    placeholder="e.g., No smoking, No pets, Check-in after 2 PM…" rows={3}
                    className="w-full border border-gray-300 rounded-lg px-4 py-3 text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
              </div>
            </div>

            {/* ── Step 3: Location ──────────────────────────────────────── */}
            <div id="step-location" className="bg-white rounded-2xl shadow-sm border border-gray-200 p-8">
              <h2 className="text-2xl font-bold text-gray-900 mb-1">Step 3 — Location</h2>
              <p className="text-sm text-gray-500 mb-6">Used for city-level AI pricing and renter search.</p>
              <div className="space-y-5">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">Address *</label>
                  <input type="text" value={formData.address}
                    onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                    placeholder="e.g., 12 Rue de la Mer, Kelibia, Tunisia"
                    className="w-full border border-gray-300 rounded-lg px-4 py-3 text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500" required />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-1">Latitude *</label>
                    <input type="number" value={formData.latitude}
                      onChange={(e) => setFormData({ ...formData, latitude: e.target.value })}
                      placeholder="36.8578" step="any"
                      className="w-full border border-gray-300 rounded-lg px-4 py-3 text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500" required />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-1">Longitude *</label>
                    <input type="number" value={formData.longitude}
                      onChange={(e) => setFormData({ ...formData, longitude: e.target.value })}
                      placeholder="11.0920" step="any"
                      className="w-full border border-gray-300 rounded-lg px-4 py-3 text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500" required />
                  </div>
                </div>
              </div>
            </div>

            {/* ── Step 4: Category ──────────────────────────────────────── */}
            <div id="step-category" className="bg-white rounded-2xl shadow-sm border border-gray-200 p-8">
              <h2 className="text-2xl font-bold text-gray-900 mb-1">Step 4 — Category</h2>
              <p className="text-sm text-gray-500 mb-6">This sets the pricing unit the AI will use.</p>
              <select value={formData.categoryId}
                onChange={(e) => setFormData({ ...formData, categoryId: e.target.value })}
                className="w-full border border-gray-300 rounded-lg px-4 py-3 text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                required disabled={categoriesQuery.isLoading}>
                <option value="">Select a category</option>
                {categoriesQuery.data?.map((cat) => (
                  <option key={cat.id} value={cat.id}>{cat.icon} {cat.name}</option>
                ))}
              </select>
              {categoriesQuery.isError && <p className="text-xs text-red-500 mt-1">Failed to load categories</p>}

              {/* Accommodation extras (shown only when stays/accommodation selected) */}
              {isAccomm(catSlug) && (
                <div className="mt-5 space-y-4 border-t border-gray-100 pt-5">
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                    Accommodation hints — improves AI accuracy
                  </p>
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-1">Property type</label>
                    <div className="flex gap-2">
                      {(['apartment', 'house', 'villa'] as const).map((t) => (
                        <button key={t} type="button"
                          onClick={() => setPropertyType(propertyType === t ? '' : t)}
                          className={`flex-1 py-2 rounded-lg text-sm font-medium border transition capitalize
                            ${propertyType === t
                              ? 'bg-blue-500 text-white border-blue-500'
                              : 'bg-white text-gray-600 border-gray-300 hover:border-blue-300'}`}>
                          {t === 'villa' ? '🏛️' : t === 'house' ? '🏠' : '🏢'} {t}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-1">
                      Distance to sea (km)
                    </label>
                    <input type="number" value={distanceToSea}
                      onChange={(e) => setDistanceToSea(e.target.value)}
                      placeholder="e.g., 0.3" min="0" step="0.1"
                      className="w-full border border-gray-300 rounded-lg px-4 py-3 text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500" />
                  </div>
                </div>
              )}
            </div>

            {/* ── Step 5: AI Price Suggestion ──────────────────────────── */}
            <div id="step-ai-price" className="bg-white rounded-2xl shadow-sm border border-gray-200 p-8">
              <h2 className="text-2xl font-bold text-gray-900 mb-1">Step 5 — AI Price Suggestion</h2>
              <p className="text-sm text-gray-500 mb-6">
                Based on comparable listings in {cityName || 'your city'}.
                The result will appear in the review step below automatically.
              </p>

              {!canSuggest && (
                <p className="text-sm text-amber-600 bg-amber-50 border border-amber-200 rounded-lg px-4 py-3">
                  ⚡ Complete address and category first to enable the AI suggestion.
                </p>
              )}

              {canSuggest && !suggestion && !suggestionLoading && (
                <button type="button" onClick={handleGetSuggestion}
                  className="w-full py-3 rounded-lg bg-blue-500 hover:bg-blue-600 text-white font-semibold text-sm transition flex items-center justify-center gap-2">
                  <i className="fa-solid fa-wand-magic-sparkles" />
                  Get AI Price Suggestion now
                </button>
              )}

              {suggestionLoading && (
                <p className="text-sm text-blue-600 bg-blue-50 border border-blue-200 rounded-lg px-4 py-2 flex items-center gap-2">
                  <span className="w-3 h-3 rounded-full border-2 border-blue-300 border-t-blue-600 animate-spin flex-shrink-0" />
                  Analysing {cityName}…
                </p>
              )}

              {suggestion && !suggestionLoading && (
                <p className="text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-4 py-2 flex items-center gap-2">
                  <i className="fa-solid fa-circle-check" />
                  AI suggestion ready — scroll down to review.
                </p>
              )}
            </div>

            {/* ── Step 6: Review & Publish ──────────────────────────────── */}
            <div ref={reviewRef} id="step-review"
              className="bg-white rounded-2xl shadow-sm border border-gray-200 p-8">
              <h2 className="text-2xl font-bold text-gray-900 mb-1">Step 6 — Review & Publish</h2>
              <p className="text-sm text-gray-500 mb-6">
                Confirm your price before publishing. You can still edit it below.
              </p>

              {/* AI suggestion card — loading / error / result */}
              <PriceSuggestionCard
                loading={suggestionLoading}
                error={suggestionError}
                suggestion={suggestion}
                cityName={cityName}
                onRetry={handleGetSuggestion}
              />

              {/* Editable final price — always visible at step 6 */}
              <div className="mb-6">
                <label className="block text-sm font-semibold text-gray-700 mb-1">
                  Final price (TND) *
                  {suggestion && (
                    <span className="ml-2 text-xs text-gray-400 font-normal">
                      — pre-filled from AI suggestion, edit if needed
                    </span>
                  )}
                </label>
                <input
                  id="final-price-input"
                  type="number"
                  value={finalPrice}
                  onChange={(e) => setFinalPrice(e.target.value)}
                  placeholder={suggestion ? String(suggestion.recommended) : 'e.g. 150 — or use AI suggestion above'}
                  min="1"
                  step="0.5"
                  className="w-full border border-gray-300 rounded-lg px-4 py-3 text-gray-900 text-lg font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                {!finalPrice && (
                  <p className="text-xs text-amber-600 mt-1">
                    ⚠ Price is required to publish — get an AI suggestion above or enter one manually.
                  </p>
                )}
                {suggestion && finalPrice && Math.abs(parseFloat(finalPrice) - suggestion.recommended) > 0.01 && (
                  <p className="text-xs text-amber-600 mt-1">
                    ✎ You've overridden the AI suggestion ({suggestion.recommended.toFixed(2)} TND → {parseFloat(finalPrice).toFixed(2)} TND)
                  </p>
                )}
              </div>

              {/* Summary review */}
              <div className="rounded-xl bg-gray-50 border border-gray-200 p-4 text-sm text-gray-700 space-y-1 mb-6">
                <div className="flex justify-between"><span className="font-medium">Title</span><span className="text-gray-500 text-right max-w-[60%] truncate">{formData.title || '—'}</span></div>
                <div className="flex justify-between"><span className="font-medium">Category</span><span className="text-gray-500">{selectedCat?.name || '—'}</span></div>
                <div className="flex justify-between"><span className="font-medium">Address</span><span className="text-gray-500 text-right max-w-[60%] truncate">{formData.address || '—'}</span></div>
                <div className="flex justify-between"><span className="font-medium">Photos</span><span className="text-gray-500">{images.length} uploaded</span></div>
                <div className="flex justify-between font-semibold"><span>Price</span><span className="text-blue-600">{finalPrice ? `${parseFloat(finalPrice).toFixed(2)} TND` : '—'}</span></div>
              </div>

              {error && (
                <div className="mb-4">
                  <InlineError message={error} onRetry={() => setError(null)} />
                </div>
              )}

              <div className="flex justify-end gap-3">
                <button type="button" onClick={() => router.back()}
                  disabled={isUploading}
                  className="px-6 py-3 border border-gray-300 rounded-lg font-medium text-gray-700 hover:bg-gray-50 transition">
                  Cancel
                </button>
                <button type="submit"
                  disabled={isUploading || images.length === 0 || !finalPrice}
                  className="px-8 py-3 bg-blue-500 hover:bg-blue-600 text-white rounded-lg font-semibold transition disabled:opacity-50 disabled:cursor-not-allowed"
                  title={!finalPrice ? 'Enter a price to publish' : undefined}>
                  {isUploading ? 'Publishing…' : 'Publish Listing'}
                </button>
              </div>
            </div>

          </form>
        </main>
      </div>
    </HostLayout>
  );
}
