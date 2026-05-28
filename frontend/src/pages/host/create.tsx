import { useState, useRef, useCallback, useEffect } from 'react';
import { useRouter } from 'next/router';
import { HostLayout } from '@/components/host/HostLayout';
import { api } from '@/lib/api/http';
import { InlineError } from '@/components/ui/InlineError';
import { toast } from '@/components/ui/Toaster';
import { useCategories } from '@/lib/api/hooks/useCategories';
import { defaultBookingType } from '@/lib/categoryPricingUnits';
import type { Category } from '@/lib/api/types';
import { CategoriesService } from '@/lib/api/generated';
import { useMutation } from '@tanstack/react-query';
import PriceSuggestionCard from '@/components/host/PriceSuggestionCard';
import LocationPicker from '@/components/shared/LocationPicker';

interface ImagePreview {
  file: File;
  preview: string;
}

export default function HostCreatePage() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const categoriesQuery = useCategories();
  const categories = (categoriesQuery.data ?? []).filter(
    (cat): cat is Category =>
      typeof cat?.id === 'string' &&
      cat.id.trim().length > 0 &&
      typeof cat?.name === 'string' &&
      cat.name.trim().length > 0,
  );
  const [images, setImages] = useState<ImagePreview[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [aiCategory, setAiCategory] = useState<{
    categorySlug: string;
    label: string;
    confidence: number;
    categoryId: string;
  } | null>(null);
  const [isClassifying, setIsClassifying] = useState(false);
  const [titleSuggestions, setTitleSuggestions] = useState<string[]>([]);
  const [isGeneratingTitles, setIsGeneratingTitles] = useState(false);
  const [isEnhancingDescription, setIsEnhancingDescription] = useState(false);
  const [previousDescription, setPreviousDescription] = useState<string | null>(null);
  // Ref so the classification callback always sees fresh categories without re-creating the callback
  const categoriesRef = useRef<Category[]>([]);
  useEffect(() => { categoriesRef.current = categories; }, [categories]);
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    categoryId: '',
    pricePerDay: '',
    address: '',
    latitude: '',
    longitude: '',
    rules: '',
    bookingType: 'DAILY' as 'DAILY' | 'SLOT',
  });

  // Slot config (only used when bookingType === 'SLOT')
  const [slotConfig, setSlotConfig] = useState({
    slotDurationMinutes: 60,
    operatingStart: '08:00',
    operatingEnd: '22:00',
    pricePerSlot: '',
    minBookingSlots: 1,
    bufferMinutes: 0,
  });

  const [isRequestModalOpen, setIsRequestModalOpen] = useState(false);
  const [requestData, setRequestData] = useState({ proposedName: '', reason: '' });

  // ── Wizard state ──────────────────────────────────────────────────────────
  const WIZARD_STEPS = [
    { key: 'photos', label: 'Photos', icon: 'fa-camera' },
    { key: 'about', label: 'About', icon: 'fa-pen' },
    { key: 'pricing', label: 'Pricing', icon: 'fa-tag' },
    { key: 'location', label: 'Location', icon: 'fa-location-dot' },
    { key: 'review', label: 'Review', icon: 'fa-check' },
  ] as const;
  type StepKey = (typeof WIZARD_STEPS)[number]['key'];
  const STEP_INDEX: Record<StepKey, number> = {
    photos: 0,
    about: 1,
    pricing: 2,
    location: 3,
    review: 4,
  };
  const [currentStep, setCurrentStep] = useState<StepKey>('photos');
  const [stepError, setStepError] = useState<string | null>(null);

  // Clear the validation banner as soon as the host starts fixing the input that
  // triggered it. Watching all three sources covers any field on any step.
  useEffect(() => {
    if (stepError) setStepError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formData, slotConfig, images.length]);

  // ── Draft autosave to localStorage ────────────────────────────────────────
  // Photos can't be serialized but everything else can; we restore on mount.
  const DRAFT_KEY = 'host:create:draft:v1';
  const [draftRestored, setDraftRestored] = useState<boolean>(false);
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(DRAFT_KEY);
      if (raw) {
        const draft = JSON.parse(raw);
        if (draft?.formData) setFormData((prev) => ({ ...prev, ...draft.formData }));
        if (draft?.slotConfig) setSlotConfig((prev) => ({ ...prev, ...draft.slotConfig }));
        setDraftRestored(true);
      }
    } catch {
      /* ignore corrupt drafts */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // Save on any change (debounced via React batching)
  useEffect(() => {
    try {
      window.localStorage.setItem(
        DRAFT_KEY,
        JSON.stringify({ formData, slotConfig, savedAt: Date.now() }),
      );
    } catch {
      /* quota etc. — silent */
    }
  }, [formData, slotConfig]);

  const clearDraft = () => {
    try {
      window.localStorage.removeItem(DRAFT_KEY);
    } catch {
      /* ignore */
    }
  };

  // ── Step validation — returns null if valid, message otherwise ───────────
  const validateStep = (step: StepKey): string | null => {
    if (step === 'photos') {
      if (images.length === 0) return 'Upload at least one photo to continue.';
      return null;
    }
    if (step === 'about') {
      if (!formData.title.trim()) return 'Add a title before continuing.';
      if (formData.title.trim().length < 8) return 'Title is too short — at least 8 characters.';
      if (!formData.description.trim()) return 'Add a description before continuing.';
      if (formData.description.trim().length < 30) return 'Description is too short — at least 30 characters helps renters trust your listing.';
      if (!formData.categoryId) return 'Pick a category before continuing.';
      return null;
    }
    if (step === 'pricing') {
      if (!formData.pricePerDay || parseFloat(formData.pricePerDay) <= 0) return 'Set a price before continuing.';
      if (formData.bookingType === 'SLOT') {
        if (!slotConfig.pricePerSlot || parseFloat(slotConfig.pricePerSlot) <= 0) {
          return 'Set a price per slot for slot-based bookings.';
        }
        if (slotConfig.operatingStart >= slotConfig.operatingEnd) {
          return 'Closing time must be after opening time.';
        }
      }
      return null;
    }
    if (step === 'location') {
      if (!formData.address.trim()) return 'Add an address before continuing.';
      if (!formData.latitude || !formData.longitude) return 'Pick the exact location on the map.';
      return null;
    }
    return null;
  };

  const goToStep = (step: StepKey) => {
    setStepError(null);
    setCurrentStep(step);
    if (typeof window !== 'undefined') {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const nextStep = () => {
    const err = validateStep(currentStep);
    if (err) {
      setStepError(err);
      return;
    }
    const idx = STEP_INDEX[currentStep];
    if (idx < WIZARD_STEPS.length - 1) {
      goToStep(WIZARD_STEPS[idx + 1].key);
    }
  };

  const prevStep = () => {
    const idx = STEP_INDEX[currentStep];
    if (idx > 0) {
      goToStep(WIZARD_STEPS[idx - 1].key);
    }
  };

  const isStepReachable = (step: StepKey): boolean => {
    // A step is reachable if all earlier steps validate.
    const targetIdx = STEP_INDEX[step];
    for (let i = 0; i < targetIdx; i++) {
      if (validateStep(WIZARD_STEPS[i].key)) return false;
    }
    return true;
  };

  const requestCategoryMutation = useMutation({
    mutationFn: async () => {
      return CategoriesService.categoriesControllerCreateRequest({
        proposedName: requestData.proposedName,
        reason: requestData.reason || undefined,
      });
    },
    onSuccess: () => {
      toast({ title: 'Success', message: 'Category requested successfully! Admins will review it.', variant: 'success' });
      setIsRequestModalOpen(false);
      setRequestData({ proposedName: '', reason: '' });
    },
    onError: (err: any) => {
      toast({ title: 'Error', message: err?.body?.message || err?.message || 'Failed to request category.', variant: 'error' });
    },
  });

  const handleImageSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(e.target.files || []);
      if (files.length === 0) return;

      // Validate file count
      if (images.length + files.length > 5) {
        setError('Maximum 5 images allowed');
        return;
      }

      // Validate file types and sizes
      const validFiles: ImagePreview[] = [];
      for (const file of files) {
        if (!file.type.match(/^image\/(jpeg|jpg|png)$/)) {
          setError(`${file.name}: Only JPEG and PNG images are allowed`);
          continue;
        }
        if (file.size > 5 * 1024 * 1024) {
          setError(`${file.name}: File size must be less than 5MB`);
          continue;
        }
        validFiles.push({
          file,
          preview: URL.createObjectURL(file),
        });
      }

      if (validFiles.length > 0) {
        setImages((prev) => [...prev, ...validFiles]);
        setError(null);

        // Fire AI image classification — pre-fills category field if confident
        setIsClassifying(true);
        const fd = new FormData();
        validFiles.slice(0, 3).forEach((img) => fd.append('images', img.file));
        api
          .post('/ai/classify-images', fd)
          .then((res: any) => {
            const data: { categorySlug: string; label: string; confidence: number } =
              res.data ?? res;
            if (data.confidence >= 0.5) {
              const match = categoriesRef.current.find(
                (c) => c.slug === data.categorySlug,
              );
              if (match) {
                setFormData((prev) => ({
                  ...prev,
                  categoryId: match.id,
                  bookingType: defaultBookingType(match.slug),
                }));
                setAiCategory({
                  categorySlug: data.categorySlug,
                  label: data.label,
                  confidence: data.confidence,
                  categoryId: match.id,
                });
              }
            }
          })
          .catch(() => {/* silent — user selects manually */})
          .finally(() => setIsClassifying(false));
      }

      // Reset input
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    },
    [images.length],
  );

  const handleRemoveImage = useCallback((index: number) => {
    setImages((prev) => {
      const newImages = [...prev];
      URL.revokeObjectURL(newImages[index].preview);
      newImages.splice(index, 1);
      return newImages;
    });
  }, []);

  const handleGenerateTitles = async () => {
    const category = categoriesRef.current.find((c) => c.id === formData.categoryId);
    if (!category) {
      toast({ title: 'Pick a category first', message: 'AI needs the category to suggest titles.', variant: 'info' });
      return;
    }
    // Build keyFeatures from whatever the host has typed so far (description + current title).
    // Backend requires at least one feature; fall back to the category name.
    const fromDesc = formData.description
      .split(/[.\n,;]/)
      .map((s) => s.trim())
      .filter((s) => s.length > 2 && s.length < 60)
      .slice(0, 4);
    const fromTitle = formData.title.trim() ? [formData.title.trim()] : [];
    const keyFeatures = [...fromTitle, ...fromDesc];
    if (keyFeatures.length === 0) keyFeatures.push(category.name);

    setIsGeneratingTitles(true);
    setTitleSuggestions([]);
    try {
      const res: any = await api.post('/ai/generate-titles', {
        category: category.name,
        keyFeatures,
        ...(formData.address.trim() ? { location: formData.address.split(',')[0].trim() } : {}),
      });
      const titles: string[] = (res?.data?.titles ?? res?.titles ?? []) as string[];
      if (!titles.length) {
        toast({ title: 'No suggestions', message: 'AI returned no titles — try again.', variant: 'info' });
        return;
      }
      setTitleSuggestions(titles);
    } catch (err: any) {
      const msg = err?.body?.message || err?.response?.data?.message || err?.message || 'Failed to generate titles';
      toast({ title: 'Error', message: String(msg), variant: 'error' });
    } finally {
      setIsGeneratingTitles(false);
    }
  };

  const handleEnhanceDescription = async () => {
    const category = categoriesRef.current.find((c) => c.id === formData.categoryId);
    if (!category) {
      toast({ title: 'Pick a category first', message: 'AI needs the category to enhance text.', variant: 'info' });
      return;
    }
    if (!formData.description.trim()) {
      toast({ title: 'Write something first', message: 'Type a draft and AI will improve it.', variant: 'info' });
      return;
    }
    setIsEnhancingDescription(true);
    const original = formData.description;
    try {
      const res: any = await api.post('/ai/enhance-description', {
        currentDescription: original,
        category: category.name,
      });
      const enhanced: string = res?.data?.enhancedDescription ?? res?.enhancedDescription ?? '';
      if (!enhanced.trim()) {
        toast({ title: 'No changes', message: 'AI returned empty text — try again.', variant: 'info' });
        return;
      }
      setPreviousDescription(original);
      setFormData((prev) => ({ ...prev, description: enhanced.trim() }));
      toast({ title: 'Description improved', message: 'Tap Undo if you preferred the original.', variant: 'success' });
    } catch (err: any) {
      const msg = err?.body?.message || err?.response?.data?.message || err?.message || 'Failed to enhance description';
      toast({ title: 'Error', message: String(msg), variant: 'error' });
    } finally {
      setIsEnhancingDescription(false);
    }
  };

  const handleUndoEnhance = () => {
    if (previousDescription === null) return;
    setFormData((prev) => ({ ...prev, description: previousDescription }));
    setPreviousDescription(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Guard: Enter key in any input could submit the form mid-wizard. Only
    // actually publish from the Review step; otherwise advance to the next step.
    if (currentStep !== 'review') {
      nextStep();
      return;
    }

    setError(null);

    // Validation
    if (images.length === 0) {
      setError('At least one image is required');
      return;
    }
    if (!formData.title.trim()) {
      setError('Title is required');
      return;
    }
    if (!formData.description.trim()) {
      setError('Description is required');
      return;
    }
    if (!formData.categoryId) {
      setError('Category is required');
      return;
    }
    const selectedCategory = categories.find(
      (cat) => cat.id === formData.categoryId,
    );
    if (!selectedCategory) {
      setError('Please select a valid category');
      return;
    }
    if (!formData.pricePerDay || parseFloat(formData.pricePerDay) <= 0) {
      setError('Valid price is required');
      return;
    }
    if (!formData.address.trim()) {
      setError('Address is required');
      return;
    }
    if (!formData.latitude || !formData.longitude) {
      setError('Location coordinates are required');
      return;
    }

    setIsUploading(true);

    try {
      const isSlot = formData.bookingType === 'SLOT';

      if (isSlot) {
        if (!slotConfig.pricePerSlot || parseFloat(slotConfig.pricePerSlot) <= 0) {
          setError('Valid price per slot is required for slot-based bookings');
          setIsUploading(false);
          return;
        }
        if (slotConfig.operatingStart >= slotConfig.operatingEnd) {
          setError('Closing time must be after opening time');
          setIsUploading(false);
          return;
        }
      }

      // Create FormData
      const submitData = new FormData();
      submitData.append('title', formData.title);
      submitData.append('description', formData.description);
      submitData.append('categoryId', selectedCategory.id);
      submitData.append('pricePerDay', formData.pricePerDay);
      submitData.append('address', formData.address);
      submitData.append('latitude', formData.latitude);
      submitData.append('longitude', formData.longitude);
      submitData.append('bookingType', formData.bookingType);
      if (formData.rules) {
        submitData.append('rules', formData.rules);
      }

      // Append images
      images.forEach((img) => {
        submitData.append('images', img.file);
      });

      const response: any = await api.post('/listings', submitData);
      const createdListing = response?.data ?? response;

      // For SLOT listings, attach the slot configuration as a follow-up call
      if (isSlot && createdListing?.id) {
        const everyday = {
          start: slotConfig.operatingStart,
          end: slotConfig.operatingEnd,
        };
        await api.post(`/listings/${createdListing.id}/slot-configuration`, {
          slotDurationMinutes: slotConfig.slotDurationMinutes,
          operatingHours: {
            monday: everyday,
            tuesday: everyday,
            wednesday: everyday,
            thursday: everyday,
            friday: everyday,
            saturday: everyday,
            sunday: everyday,
          },
          pricePerSlot: parseFloat(slotConfig.pricePerSlot),
          minBookingSlots: slotConfig.minBookingSlots,
          bufferMinutes: slotConfig.bufferMinutes,
        });
      }

      // Clean up preview URLs
      images.forEach((img) => URL.revokeObjectURL(img.preview));

      toast({
        title: 'Listing live!',
        message: 'Your listing is now visible to renters.',
        variant: 'success',
      });

      // Clear draft now that the listing is published
      clearDraft();

      // Redirect to the new listing if we have an id, otherwise to the listings page
      const newId = createdListing?.id;
      router.push(newId ? `/listings/${newId}` : '/host/listings');
    } catch (err: any) {
      const errorMessage =
        err?.response?.data?.message ||
        err?.response?.data?.error ||
        err?.message ||
        'Failed to create listing';
      setError(errorMessage);
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <HostLayout>
      <div className="bg-gray-50 font-sans">
        <section
          id="progress-indicator"
          className="sticky top-0 z-20 bg-white border-b border-gray-200"
        >
          <div className="max-w-4xl mx-auto px-6 py-4">
            <div className="flex items-center justify-between gap-2">
              {WIZARD_STEPS.map((s, i) => {
                const isCurrent = currentStep === s.key;
                const isPast = STEP_INDEX[currentStep] > i;
                const reachable = isStepReachable(s.key) || isPast || isCurrent;
                return (
                  <div key={s.key} className="flex flex-1 items-center">
                    <button
                      type="button"
                      onClick={() => reachable && goToStep(s.key)}
                      disabled={!reachable}
                      title={!reachable ? 'Complete earlier steps first' : `Go to ${s.label}`}
                      className={`flex items-center gap-2 group transition ${
                        reachable ? 'cursor-pointer' : 'cursor-not-allowed'
                      }`}
                    >
                      <span
                        className={`flex h-9 w-9 items-center justify-center rounded-full text-sm font-semibold transition ${
                          isCurrent
                            ? 'bg-blue-500 text-white ring-4 ring-blue-100'
                            : isPast
                              ? 'bg-emerald-500 text-white'
                              : reachable
                                ? 'bg-gray-200 text-gray-600 group-hover:bg-gray-300'
                                : 'bg-gray-100 text-gray-400'
                        }`}
                      >
                        {isPast ? (
                          <i className="fa-solid fa-check text-xs" />
                        ) : (
                          <i className={`fa-solid ${s.icon} text-xs`} />
                        )}
                      </span>
                      <span
                        className={`hidden sm:inline text-sm font-medium ${
                          isCurrent
                            ? 'text-gray-900'
                            : isPast
                              ? 'text-emerald-700'
                              : 'text-gray-500'
                        }`}
                      >
                        {s.label}
                      </span>
                    </button>
                    {i < WIZARD_STEPS.length - 1 && (
                      <div
                        className={`mx-2 h-1 flex-1 rounded ${
                          STEP_INDEX[currentStep] > i ? 'bg-emerald-400' : 'bg-gray-200'
                        }`}
                      />
                    )}
                  </div>
                );
              })}
            </div>
            {draftRestored && currentStep === 'photos' && (
              <div className="mt-3 flex items-center justify-between rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                <span>
                  <i className="fa-solid fa-arrow-rotate-left mr-1.5" />
                  We restored a draft from your last visit. Photos need to be re-uploaded.
                </span>
                <button
                  type="button"
                  onClick={() => {
                    clearDraft();
                    setFormData({ title: '', description: '', categoryId: '', pricePerDay: '', address: '', latitude: '', longitude: '', rules: '', bookingType: 'DAILY' });
                    setSlotConfig({ slotDurationMinutes: 60, operatingStart: '08:00', operatingEnd: '22:00', pricePerSlot: '', minBookingSlots: 1, bufferMinutes: 0 });
                    setDraftRestored(false);
                  }}
                  className="font-semibold text-amber-700 hover:text-amber-900"
                >
                  Discard draft
                </button>
              </div>
            )}
          </div>
        </section>

        <main id="create-listing-main" className="max-w-4xl mx-auto px-6 py-12">
          <form onSubmit={handleSubmit}>
            {/* ─── STEP 1: PHOTOS ─── */}
            <div
              id="step-photos"
              hidden={currentStep !== 'photos'}
              className="bg-white rounded-2xl shadow-sm border border-gray-200 p-8 mb-6"
            >
              <div className="mb-8">
                <h1 className="text-3xl font-bold text-gray-900 mb-2">
                  Add photos of your item
                </h1>
                <p className="text-gray-600">
                  Upload at least 1 photo (up to 5) to help renters see what
                  you're offering
                </p>
              </div>

              {/* Image Previews */}
              {images.length > 0 && (
                <div className="mb-6 grid grid-cols-2 md:grid-cols-3 gap-4">
                  {images.map((img, idx) => (
                    <div key={idx} className="relative group">
                      <img
                        src={img.preview}
                        alt={`Preview ${idx + 1}`}
                        className="w-full h-48 object-cover rounded-lg border border-gray-200"
                      />
                      <button
                        type="button"
                        onClick={() => handleRemoveImage(idx)}
                        className="absolute top-2 right-2 bg-red-500 hover:bg-red-600 text-white rounded-full w-8 h-8 flex items-center justify-center opacity-0 group-hover:opacity-100 transition"
                      >
                        <i className="fa-solid fa-times text-sm"></i>
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {/* Upload Area */}
              <div
                onClick={() => fileInputRef.current?.click()}
                className="border-2 border-dashed border-gray-300 rounded-xl p-12 text-center hover:border-blue-400 transition cursor-pointer bg-gray-50"
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/jpeg,image/jpg,image/png"
                  multiple
                  onChange={handleImageSelect}
                  className="hidden"
                />
                <div className="flex flex-col items-center">
                  <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mb-4">
                    <i className="fa-solid fa-cloud-arrow-up text-blue-500 text-3xl" />
                  </div>
                  <h3 className="text-lg font-semibold text-gray-900 mb-2">
                    Drag and drop your photos here
                  </h3>
                  <p className="text-sm text-gray-500 mb-4">
                    or click to browse from your device
                  </p>
                  <button
                    type="button"
                    className="bg-blue-500 hover:bg-blue-600 text-white px-6 py-3 rounded-lg font-medium transition"
                  >
                    Choose files
                  </button>
                  <p className="text-xs text-gray-400 mt-4">
                    Supported formats: JPG, PNG (max 5MB each, up to 5 images)
                  </p>
                </div>
              </div>
            </div>

            {/* ─── STEPS 2-4: details split by panel ─── */}
            <div
              id="step-details"
              hidden={!['about', 'pricing', 'location'].includes(currentStep)}
              className="bg-white rounded-2xl shadow-sm border border-gray-200 p-8 mb-6"
            >
              <div className="mb-8">
                <h2 className="text-2xl font-bold text-gray-900 mb-2">
                  {currentStep === 'about' && 'Tell us about your item'}
                  {currentStep === 'pricing' && 'How will renters book it?'}
                  {currentStep === 'location' && 'Where is it?'}
                </h2>
                <p className="text-gray-600">
                  {currentStep === 'about' &&
                    "Title, description, and category — these are what renters see first."}
                  {currentStep === 'pricing' &&
                    'Set how renters pay and whether they book by day or by time slot.'}
                  {currentStep === 'location' &&
                    'Pin the exact location and add any house rules.'}
                </p>
              </div>

              <div className="space-y-6">
                {/* ── About panel: title + description + category ── */}
                <div hidden={currentStep !== 'about'} className="space-y-6">
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="block text-sm font-semibold text-gray-700">
                      Title *
                    </label>
                    <button
                      type="button"
                      onClick={handleGenerateTitles}
                      disabled={isGeneratingTitles || !formData.categoryId}
                      className="flex items-center gap-1.5 text-xs font-medium text-blue-600 hover:text-blue-800 disabled:cursor-not-allowed disabled:text-gray-400"
                      title={!formData.categoryId ? 'Pick a category first' : 'Let AI suggest titles'}
                    >
                      {isGeneratingTitles ? (
                        <>
                          <svg className="h-3 w-3 animate-spin" viewBox="0 0 24 24" fill="none">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                          </svg>
                          Generating…
                        </>
                      ) : (
                        <>
                          <i className="fa-solid fa-wand-magic-sparkles" />
                          Suggest titles with AI
                        </>
                      )}
                    </button>
                  </div>
                  <input
                    type="text"
                    value={formData.title}
                    onChange={(e) =>
                      setFormData({ ...formData, title: e.target.value })
                    }
                    placeholder="e.g., Modern 2-Bedroom Apartment in La Marsa"
                    maxLength={60}
                    className="w-full border border-gray-300 rounded-lg px-4 py-3 text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    required
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    {formData.title.length}/60 characters
                  </p>
                  {titleSuggestions.length > 0 && (
                    <div className="mt-3 space-y-1.5">
                      <p className="text-xs font-medium text-gray-500">
                        Tap one to use it:
                      </p>
                      {titleSuggestions.map((title) => (
                        <button
                          key={title}
                          type="button"
                          onClick={() => {
                            setFormData((prev) => ({ ...prev, title: title.slice(0, 60) }));
                            setTitleSuggestions([]);
                          }}
                          className="block w-full text-left rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-gray-800 transition hover:border-blue-400 hover:bg-blue-100"
                        >
                          <i className="fa-solid fa-wand-magic-sparkles mr-2 text-blue-500 text-xs" />
                          {title}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="block text-sm font-semibold text-gray-700">
                      Description *
                    </label>
                    <div className="flex items-center gap-3">
                      {previousDescription !== null && (
                        <button
                          type="button"
                          onClick={handleUndoEnhance}
                          className="flex items-center gap-1 text-xs font-medium text-gray-500 hover:text-gray-700"
                        >
                          <i className="fa-solid fa-rotate-left" />
                          Undo
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={handleEnhanceDescription}
                        disabled={
                          isEnhancingDescription ||
                          !formData.categoryId ||
                          !formData.description.trim()
                        }
                        className="flex items-center gap-1.5 text-xs font-medium text-blue-600 hover:text-blue-800 disabled:cursor-not-allowed disabled:text-gray-400"
                        title={
                          !formData.categoryId
                            ? 'Pick a category first'
                            : !formData.description.trim()
                              ? 'Write a draft first'
                              : 'Let AI polish your draft'
                        }
                      >
                        {isEnhancingDescription ? (
                          <>
                            <svg className="h-3 w-3 animate-spin" viewBox="0 0 24 24" fill="none">
                              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                            </svg>
                            Improving…
                          </>
                        ) : (
                          <>
                            <i className="fa-solid fa-wand-magic-sparkles" />
                            Improve with AI
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                  <textarea
                    value={formData.description}
                    onChange={(e) => {
                      // Manual edits invalidate the undo buffer
                      if (previousDescription !== null) setPreviousDescription(null);
                      setFormData({ ...formData, description: e.target.value });
                    }}
                    placeholder="Describe your item in detail..."
                    rows={6}
                    className="w-full border border-gray-300 rounded-lg px-4 py-3 text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    required
                  />
                </div>

                <div>
                  <div className="flex justify-between items-center mb-2">
                    <label className="block text-sm font-semibold text-gray-700">
                      Category *
                    </label>
                    <button
                      type="button"
                      onClick={() => setIsRequestModalOpen(true)}
                      className="text-sm text-blue-600 hover:text-blue-800 font-medium"
                    >
                      Can't find it? Request a new one
                    </button>
                  </div>
                  <select
                    value={formData.categoryId}
                    onChange={(e) => {
                      const newCatId = e.target.value;
                      const cat = categories.find((c) => c.id === newCatId);
                      const inferred = defaultBookingType(cat?.slug);
                      // Switch to the booking model that fits this category.
                      // Hosts can still override on the pricing step if they want.
                      setFormData({
                        ...formData,
                        categoryId: newCatId,
                        bookingType: inferred,
                      });
                    }}
                    className="w-full border border-gray-300 rounded-lg px-4 py-3 text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    required
                    disabled={categoriesQuery.isLoading}
                  >
                    <option value="">Select a category</option>
                    {categories.map((cat) => (
                      <option key={cat.id} value={cat.id}>
                        {cat.name}
                      </option>
                    ))}
                  </select>

                  {/* AI classification badge */}
                  {isClassifying && (
                    <p className="text-xs text-gray-400 mt-1.5 flex items-center gap-1.5">
                      <svg className="animate-spin h-3 w-3" viewBox="0 0 24 24" fill="none">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
                      </svg>
                      Analyse des photos par IA…
                    </p>
                  )}
                  {!isClassifying && aiCategory && (
                    <p className="text-xs mt-1.5 flex items-center gap-1.5">
                      <span className="inline-flex items-center gap-1 bg-blue-50 text-blue-700 border border-blue-200 rounded-full px-2 py-0.5 font-medium">
                        <svg className="h-3 w-3" viewBox="0 0 20 20" fill="currentColor">
                          <path d="M10 2a8 8 0 100 16A8 8 0 0010 2zm0 14a6 6 0 110-12 6 6 0 010 12zm-1-9a1 1 0 012 0v4a1 1 0 01-2 0V7zm1-2a1 1 0 100-2 1 1 0 000 2z"/>
                        </svg>
                        Détecté par IA
                      </span>
                      <span className="text-gray-600">
                        {aiCategory.label} · <span className="font-medium">{Math.round(aiCategory.confidence * 100)}%</span>
                      </span>
                      {formData.categoryId !== aiCategory.categoryId && (
                        <span className="text-gray-400">(modifié)</span>
                      )}
                    </p>
                  )}

                  {categoriesQuery.isError && (
                    <p className="text-xs text-red-500 mt-1">
                      Failed to load categories
                    </p>
                  )}
                </div>
                </div>
                {/* ── /About panel ── */}

                {/* ── Pricing panel: booking type + price + slot config ── */}
                <div hidden={currentStep !== 'pricing'} className="space-y-6">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    Booking type *
                  </label>
                  <div className="grid grid-cols-2 gap-3">
                    <button
                      type="button"
                      onClick={() =>
                        setFormData({ ...formData, bookingType: 'DAILY' })
                      }
                      className={`rounded-lg border-2 p-4 text-left transition ${
                        formData.bookingType === 'DAILY'
                          ? 'border-blue-500 bg-blue-50'
                          : 'border-gray-200 hover:border-gray-300'
                      }`}
                    >
                      <div className="flex items-center gap-2 mb-1">
                        <i className="fa-solid fa-calendar-days text-blue-500" />
                        <span className="font-semibold text-gray-900">Daily</span>
                      </div>
                      <p className="text-xs text-gray-600">
                        Stays, cars, equipment — rented by the day
                      </p>
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        setFormData({ ...formData, bookingType: 'SLOT' })
                      }
                      className={`rounded-lg border-2 p-4 text-left transition ${
                        formData.bookingType === 'SLOT'
                          ? 'border-blue-500 bg-blue-50'
                          : 'border-gray-200 hover:border-gray-300'
                      }`}
                    >
                      <div className="flex items-center gap-2 mb-1">
                        <i className="fa-solid fa-clock text-blue-500" />
                        <span className="font-semibold text-gray-900">
                          Time slots
                        </span>
                      </div>
                      <p className="text-xs text-gray-600">
                        Padel courts, tennis, studios — rented by the hour
                      </p>
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    {formData.bookingType === 'SLOT'
                      ? 'Reference daily rate (TND) *'
                      : categories.find((c) => c.id === formData.categoryId)?.slug === 'stays'
                        ? 'Price per night (TND) *'
                        : 'Price per day (TND) *'}
                  </label>
                  <input
                    type="number"
                    value={formData.pricePerDay}
                    onChange={(e) =>
                      setFormData({ ...formData, pricePerDay: e.target.value })
                    }
                    placeholder="0.00"
                    min="0"
                    step="0.01"
                    className="w-full border border-gray-300 rounded-lg px-4 py-3 text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    required
                  />
                  {formData.bookingType === 'SLOT' && (
                    <p className="mt-1 text-xs text-gray-500">
                      Used for search ranking. Renters pay the per-slot price below.
                    </p>
                  )}
                </div>

                {formData.bookingType === 'SLOT' && (
                  <div className="rounded-xl border-2 border-blue-100 bg-blue-50/40 p-5">
                    <h3 className="mb-1 flex items-center gap-2 font-semibold text-gray-900">
                      <i className="fa-solid fa-clock text-blue-500" />
                      Slot configuration
                    </h3>
                    <p className="mb-4 text-xs text-gray-600">
                      Same operating hours apply every day. You can fine-tune
                      per-day hours later from your dashboard.
                    </p>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="mb-1 block text-xs font-semibold text-gray-700">
                          Opens at *
                        </label>
                        <input
                          type="time"
                          value={slotConfig.operatingStart}
                          onChange={(e) =>
                            setSlotConfig({
                              ...slotConfig,
                              operatingStart: e.target.value,
                            })
                          }
                          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                      </div>
                      <div>
                        <label className="mb-1 block text-xs font-semibold text-gray-700">
                          Closes at *
                        </label>
                        <input
                          type="time"
                          value={slotConfig.operatingEnd}
                          onChange={(e) =>
                            setSlotConfig({
                              ...slotConfig,
                              operatingEnd: e.target.value,
                            })
                          }
                          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                      </div>
                      <div>
                        <label className="mb-1 block text-xs font-semibold text-gray-700">
                          Slot length *
                        </label>
                        <select
                          value={slotConfig.slotDurationMinutes}
                          onChange={(e) =>
                            setSlotConfig({
                              ...slotConfig,
                              slotDurationMinutes: parseInt(e.target.value, 10),
                            })
                          }
                          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                        >
                          <option value={30}>30 minutes</option>
                          <option value={45}>45 minutes</option>
                          <option value={60}>1 hour</option>
                          <option value={90}>1.5 hours</option>
                          <option value={120}>2 hours</option>
                        </select>
                      </div>
                      <div>
                        <label className="mb-1 block text-xs font-semibold text-gray-700">
                          Price per slot (TND) *
                        </label>
                        <input
                          type="number"
                          value={slotConfig.pricePerSlot}
                          onChange={(e) =>
                            setSlotConfig({
                              ...slotConfig,
                              pricePerSlot: e.target.value,
                            })
                          }
                          placeholder="0.00"
                          min="0"
                          step="0.01"
                          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                      </div>
                      <div>
                        <label className="mb-1 block text-xs font-semibold text-gray-700">
                          Minimum slots per booking
                        </label>
                        <input
                          type="number"
                          value={slotConfig.minBookingSlots}
                          onChange={(e) =>
                            setSlotConfig({
                              ...slotConfig,
                              minBookingSlots: Math.max(
                                1,
                                parseInt(e.target.value, 10) || 1,
                              ),
                            })
                          }
                          min={1}
                          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                      </div>
                      <div>
                        <label className="mb-1 block text-xs font-semibold text-gray-700">
                          Buffer between bookings (min)
                        </label>
                        <input
                          type="number"
                          value={slotConfig.bufferMinutes}
                          onChange={(e) =>
                            setSlotConfig({
                              ...slotConfig,
                              bufferMinutes: Math.max(
                                0,
                                parseInt(e.target.value, 10) || 0,
                              ),
                            })
                          }
                          min={0}
                          max={60}
                          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                      </div>
                    </div>
                  </div>
                )}
                </div>
                {/* ── /Pricing panel ── */}

                {/* ── Location panel: address + AI price + rules ── */}
                <div hidden={currentStep !== 'location'} className="space-y-6">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    Location *
                  </label>
                  <LocationPicker
                    value={{
                      address: formData.address,
                      lat: parseFloat(formData.latitude) || 0,
                      lng: parseFloat(formData.longitude) || 0,
                    }}
                    onChange={({ address, lat, lng }) =>
                      setFormData({
                        ...formData,
                        address,
                        latitude: lat ? String(lat) : '',
                        longitude: lng ? String(lng) : '',
                      })
                    }
                  />
                </div>

                {/* AI Price Suggestion — stays category only, shown after address + coords are filled */}
                {(() => {
                  const selectedCat = categories.find((c) => c.id === formData.categoryId);
                  if (selectedCat?.slug !== 'stays') return null;
                  const city = formData.address.split(',')[0]?.trim() || '';
                  if (!city) return null;
                  return (
                    <PriceSuggestionCard
                      city={city}
                      categorySlug="stays"
                      lat={formData.latitude || undefined}
                      lng={formData.longitude || undefined}
                      onAccept={(price) =>
                        setFormData((prev) => ({ ...prev, pricePerDay: String(price) }))
                      }
                    />
                  );
                })()}

                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    Rules (optional)
                  </label>
                  <textarea
                    value={formData.rules}
                    onChange={(e) =>
                      setFormData({ ...formData, rules: e.target.value })
                    }
                    placeholder="e.g., No smoking, No pets, Check-in after 2 PM..."
                    rows={4}
                    className="w-full border border-gray-300 rounded-lg px-4 py-3 text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                </div>
                {/* ── /Location panel ── */}
              </div>
            </div>

            {/* ─── STEP 5: REVIEW ─── */}
            {currentStep === 'review' && (
              <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-8 mb-6">
                <div className="mb-6">
                  <h2 className="text-2xl font-bold text-gray-900 mb-2">
                    Review and publish
                  </h2>
                  <p className="text-gray-600">
                    Make sure everything looks right. You can go back to edit any
                    section.
                  </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* Preview card */}
                  <div className="rounded-xl border border-gray-200 overflow-hidden">
                    {images[0] && (
                      <img
                        src={images[0].preview}
                        alt="cover"
                        className="h-48 w-full object-cover"
                      />
                    )}
                    <div className="p-4">
                      <p className="text-xs text-gray-500 mb-1">
                        {categories.find((c) => c.id === formData.categoryId)?.name ||
                          'No category'}
                      </p>
                      <h3 className="font-semibold text-gray-900 mb-1">
                        {formData.title || 'Untitled listing'}
                      </h3>
                      <p className="text-sm text-gray-500 mb-2">
                        <i className="fa-solid fa-location-dot mr-1 text-blue-500" />
                        {formData.address.split(',').slice(0, 2).join(',') ||
                          'No address'}
                      </p>
                      <p className="text-lg font-bold text-gray-900">
                        {formData.bookingType === 'SLOT'
                          ? `${slotConfig.pricePerSlot || '0'} TND `
                          : `${formData.pricePerDay || '0'} TND `}
                        <span className="text-sm font-normal text-gray-500">
                          / {formData.bookingType === 'SLOT' ? 'slot' : 'day'}
                        </span>
                      </p>
                    </div>
                  </div>

                  {/* Summary list */}
                  <div className="space-y-3 text-sm">
                    <div className="flex items-start justify-between gap-3">
                      <span className="text-gray-500">Photos</span>
                      <span className="text-right font-medium text-gray-900">
                        {images.length} uploaded
                      </span>
                    </div>
                    <div className="flex items-start justify-between gap-3">
                      <span className="text-gray-500">Booking type</span>
                      <span className="text-right font-medium text-gray-900">
                        {formData.bookingType === 'SLOT' ? 'Time slots' : 'Daily'}
                      </span>
                    </div>
                    {formData.bookingType === 'SLOT' && (
                      <div className="flex items-start justify-between gap-3">
                        <span className="text-gray-500">Hours</span>
                        <span className="text-right font-medium text-gray-900">
                          {slotConfig.operatingStart} – {slotConfig.operatingEnd} ·{' '}
                          {slotConfig.slotDurationMinutes} min slots
                        </span>
                      </div>
                    )}
                    <div className="flex items-start justify-between gap-3">
                      <span className="text-gray-500">Description</span>
                      <span className="text-right font-medium text-gray-900 line-clamp-3 max-w-xs">
                        {formData.description.slice(0, 140)}
                        {formData.description.length > 140 ? '…' : ''}
                      </span>
                    </div>
                    {formData.rules && (
                      <div className="flex items-start justify-between gap-3">
                        <span className="text-gray-500">Rules</span>
                        <span className="text-right font-medium text-gray-900 line-clamp-2 max-w-xs">
                          {formData.rules}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Step error (validation) */}
            {stepError && (
              <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
                <i className="fa-solid fa-triangle-exclamation mr-2" />
                {stepError}
              </div>
            )}

            {/* Submit error (API failure during publish) */}
            {error && (
              <div className="mb-6">
                <InlineError message={error} onRetry={() => setError(null)} />
              </div>
            )}

            {/* ─── Step navigation ─── */}
            <div className="flex flex-wrap items-center justify-between gap-3">
              <button
                type="button"
                onClick={() => {
                  if (currentStep === 'photos') {
                    router.back();
                  } else {
                    prevStep();
                  }
                }}
                disabled={isUploading}
                className="rounded-lg border border-gray-300 px-5 py-3 text-sm font-medium text-gray-700 hover:bg-gray-50 transition disabled:cursor-not-allowed disabled:opacity-50"
              >
                <i className="fa-solid fa-arrow-left mr-1.5" />
                {currentStep === 'photos' ? 'Cancel' : 'Back'}
              </button>

              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-500">
                  Step {STEP_INDEX[currentStep] + 1} of {WIZARD_STEPS.length}
                </span>
                {currentStep !== 'review' ? (
                  <button
                    type="button"
                    onClick={nextStep}
                    className="rounded-lg bg-blue-500 px-6 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-600"
                  >
                    Continue
                    <i className="fa-solid fa-arrow-right ml-1.5" />
                  </button>
                ) : (
                  <button
                    type="submit"
                    disabled={isUploading || images.length === 0}
                    className="rounded-lg bg-emerald-500 px-6 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-600 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {isUploading ? (
                      <>
                        <i className="fa-solid fa-circle-notch fa-spin mr-1.5" />
                        Publishing…
                      </>
                    ) : (
                      <>
                        <i className="fa-solid fa-paper-plane mr-1.5" />
                        Publish listing
                      </>
                    )}
                  </button>
                )}
              </div>
            </div>
          </form>
        </main>
      </div>

      {/* Request Category Modal */}
      {isRequestModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-100 flex justify-between items-center bg-gray-50">
              <h3 className="font-bold text-gray-900">Request a New Category</h3>
              <button onClick={() => setIsRequestModalOpen(false)} className="text-gray-400 hover:text-gray-600">
                <i className="fa-solid fa-times" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <p className="text-sm text-gray-600">
                If the category you need isn't available, please request it here. An admin will review your request.
              </p>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Proposed Name *</label>
                <input
                  type="text"
                  required
                  value={requestData.proposedName}
                  onChange={(e) => setRequestData({ ...requestData, proposedName: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  placeholder="e.g. Electric Scooters"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Reason (Optional)</label>
                <textarea
                  rows={3}
                  value={requestData.reason}
                  onChange={(e) => setRequestData({ ...requestData, reason: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  placeholder="Briefly explain why this category is needed..."
                />
              </div>
            </div>
            <div className="px-6 py-4 bg-gray-50 border-t border-gray-100 flex justify-end gap-3">
              <button
                onClick={() => setIsRequestModalOpen(false)}
                className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-100 transition"
              >
                Cancel
              </button>
              <button
                onClick={() => requestCategoryMutation.mutate()}
                disabled={requestCategoryMutation.isPending || !requestData.proposedName.trim()}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition disabled:opacity-50"
              >
                {requestCategoryMutation.isPending ? 'Submitting...' : 'Submit Request'}
              </button>
            </div>
          </div>
        </div>
      )}
    </HostLayout>
  );
}
