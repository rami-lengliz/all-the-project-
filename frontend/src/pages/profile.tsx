import Link from 'next/link';
import { useRouter } from 'next/router';
import { useEffect, useRef, useState } from 'react';
import { Layout } from '@/components/layout/Layout';
import { useAuth } from '@/lib/auth/AuthProvider';
import { useProfile } from '@/lib/api/hooks/useProfile';
import { useBecomeHost } from '@/lib/api/hooks/useBecomeHost';
import { useMyBookings } from '@/lib/api/hooks/useMyBookings';
import { useReviewsByUser } from '@/lib/api/hooks/useReviewsByUser';
import { useWishlistIds } from '@/lib/api/hooks/useWishlist';
import { LoadingCard } from '@/components/ui/LoadingCard';
import { InlineError } from '@/components/ui/InlineError';
import { EmptyState } from '@/components/ui/EmptyState';
import { toast } from '@/components/ui/Toaster';
import { VerifyAccountModal } from '@/components/auth/VerifyAccountModal';
import { BecomeHostModal } from '@/components/host/BecomeHostModal';
import { PendingReviewsCard } from '@/components/reviews/PendingReviewsCard';
import { KycUploadCard } from '@/components/host/KycUploadCard';
import { TrustBadge } from '@/components/shared/TrustBadge';
import { useDebounce } from '@/lib/utils/useDebounce';
import { useUserLocation } from '@/lib/hooks/useUserLocation';
import { UsersService } from '@/lib/api/generated/services/UsersService';
import { geoSearch } from '@/lib/api/geo';

export default function ProfilePage() {
  const router = useRouter();
  const { user, refreshUser } = useAuth();
  const query = useProfile();
  const becomeHostMutation = useBecomeHost();
  const [verifyModalOpen, setVerifyModalOpen] = useState(false);
  const [becomeHostModalOpen, setBecomeHostModalOpen] = useState(false);
  const [becomeHostError, setBecomeHostError] = useState<string | null>(null);
  const bookingsQuery = useMyBookings();
  const reviewsQuery = useReviewsByUser(user?.id || query.data?.id);
  const wishlistQuery = useWishlistIds();

  // ── Saved home location ─────────────────────────────────────
  const userLocation = useUserLocation();
  const savedHomeCity = (user as any)?.homeCityName as string | undefined;
  const hasSavedHome = !!(user as any)?.homeLat && !!(user as any)?.homeLng;

  interface PlaceSuggestion { place_id: number; display_name: string; lat: string; lon: string; }
  const [homeInput, setHomeInput] = useState('');
  const [homeSuggestions, setHomeSuggestions] = useState<PlaceSuggestion[]>([]);
  const [homeShowSugg, setHomeShowSugg] = useState(false);
  const [homeSelected, setHomeSelected] = useState<{ lat: number; lng: number; cityName: string } | null>(null);
  const [homeSaving, setHomeSaving] = useState(false);
  const homeInputRef = useRef<HTMLDivElement>(null);

  // Avatar upload — the camera button on the avatar bubble triggers this.
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const handleAvatarPick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 4 * 1024 * 1024) {
      toast({
        title: 'File too large',
        message: 'Maximum 4 MB.',
        variant: 'error',
      });
      if (avatarInputRef.current) avatarInputRef.current.value = '';
      return;
    }
    setAvatarUploading(true);
    try {
      const { api } = await import('@/lib/api/http');
      const form = new FormData();
      form.append('avatar', file);
      await api.post('/users/me/avatar', form);
      await refreshUser();
      toast({ title: 'Photo updated', variant: 'success' });
    } catch (e: any) {
      toast({
        title: 'Upload failed',
        message: e?.response?.data?.message ?? 'Please try again.',
        variant: 'error',
      });
    } finally {
      setAvatarUploading(false);
      if (avatarInputRef.current) avatarInputRef.current.value = '';
    }
  };
  const dHome = useDebounce(homeInput, 350);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (homeInputRef.current && !homeInputRef.current.contains(e.target as Node)) {
        setHomeShowSugg(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  // Auto-open the become-host modal when arriving from the register page with
  // ?promptHost=1. Strip the param afterwards so a refresh doesn't re-open it.
  useEffect(() => {
    if (!router.isReady) return;
    if (router.query.promptHost !== '1') return;
    if ((user as any)?.isHost) return;
    setBecomeHostError(null);
    setBecomeHostModalOpen(true);
    const { promptHost: _drop, ...rest } = router.query;
    void router.replace({ pathname: router.pathname, query: rest }, undefined, { shallow: true });
  }, [router.isReady, router.query.promptHost, user]);

  useEffect(() => {
    if (dHome.length < 2 || homeSelected) { setHomeSuggestions([]); return; }
    let cancelled = false;
    geoSearch(dHome, { limit: 5, countryCode: 'tn' })
      .then((data) => {
        if (!cancelled) { setHomeSuggestions(data as PlaceSuggestion[]); setHomeShowSugg(data.length > 0); }
      })
      .catch(() => { });
    return () => { cancelled = true; };
  }, [dHome, homeSelected]);

  const handleSaveCurrentAsHome = async () => {
    if (userLocation.isDefault) {
      toast({ title: 'No location detected', message: 'Allow GPS or pick a city below first.', variant: 'error' });
      return;
    }
    setHomeSaving(true);
    try {
      await UsersService.usersControllerUpdateProfile({
        homeLat: userLocation.lat,
        homeLng: userLocation.lng,
        homeCityName: userLocation.cityName,
      } as any);
      await refreshUser();
      // Also apply as the active session location so the chip + every page updates now
      userLocation.setManualLocation({
        lat: userLocation.lat,
        lng: userLocation.lng,
        cityName: userLocation.cityName,
      });
      toast({ title: 'Home saved and applied', message: userLocation.cityName, variant: 'success' });
    } catch {
      toast({ title: 'Save failed', variant: 'error' });
    } finally {
      setHomeSaving(false);
    }
  };

  const handleSavePickedHome = async () => {
    if (!homeSelected) return;
    setHomeSaving(true);
    const picked = homeSelected;
    try {
      await UsersService.usersControllerUpdateProfile({
        homeLat: picked.lat,
        homeLng: picked.lng,
        homeCityName: picked.cityName,
      } as any);
      await refreshUser();
      // Apply as the active session location so the chip + every page updates now
      userLocation.setManualLocation({
        lat: picked.lat,
        lng: picked.lng,
        cityName: picked.cityName,
      });
      setHomeInput('');
      setHomeSelected(null);
      toast({ title: 'Home saved and applied', message: picked.cityName, variant: 'success' });
    } catch {
      toast({ title: 'Save failed', variant: 'error' });
    } finally {
      setHomeSaving(false);
    }
  };

  const handleClearHome = async () => {
    setHomeSaving(true);
    try {
      await UsersService.usersControllerUpdateProfile({
        homeLat: null,
        homeLng: null,
        homeCityName: null,
      } as any);
      await refreshUser();
      // Drop the manual override too so GPS / default takes over again
      userLocation.resetLocation();
      toast({ title: 'Home location cleared', variant: 'success' });
    } catch {
      toast({ title: 'Clear failed', variant: 'error' });
    } finally {
      setHomeSaving(false);
    }
  };

  // Opens the multi-check modal. The actual mutation runs in the modal's onConfirm.
  const handleBecomeHost = () => {
    setBecomeHostError(null);
    setBecomeHostModalOpen(true);
  };

  const confirmBecomeHost = async () => {
    setBecomeHostError(null);
    try {
      await becomeHostMutation.mutateAsync();
      await refreshUser();
      await new Promise((resolve) => setTimeout(resolve, 100));
      toast({ title: 'You are now a host!', variant: 'success' });
      setBecomeHostModalOpen(false);
      router.push('/host/dashboard');
    } catch (error: any) {
      console.error('[Profile] Full error object:', error);
      let message = 'Failed to become a host. Please try again.';
      const errorBody = error?.body || error?.response?.data;
      if (errorBody) {
        if (typeof errorBody === 'string') {
          message = errorBody;
        } else if (errorBody.message) {
          message = Array.isArray(errorBody.message)
            ? errorBody.message.join(', ')
            : errorBody.message;
        } else if (errorBody.error) {
          message = Array.isArray(errorBody.error)
            ? errorBody.error.join(', ')
            : errorBody.error;
        }
      } else if (error?.message && error.message !== 'Bad Request') {
        message = error.message;
      }
      setBecomeHostError(message);
    }
  };

  const profileData = query.data as any;
  const isHost = profileData?.isHost || user?.isHost;
  const isVerified = Boolean(
    profileData?.verifiedEmail ||
    profileData?.verifiedPhone ||
    user?.verifiedEmail ||
    user?.verifiedPhone,
  );

  const handleVerifyAccount = () => setVerifyModalOpen(true);

  const handleVerifiedSuccess = async () => {
    await query.refetch();
    await refreshUser();
  };

  // ── Onboarding / completeness ───────────────────────────────────────────
  const onboardingMode = router.query.onboard === 'host' ? 'host' : null;
  const isEmailVerified = Boolean(
    profileData?.verifiedEmail ?? user?.verifiedEmail,
  );
  const isPhoneVerified = Boolean(
    profileData?.verifiedPhone ?? user?.verifiedPhone,
  );

  // When the user lands here via "Become a host" link/button (?onboard=host),
  // auto-open the modal — otherwise they see a hosting onboarding card with
  // no clear "next" and have to hunt for the second Become-a-host button.
  useEffect(() => {
    if (!router.isReady) return;
    const isHostAlready = profileData?.isHost ?? user?.isHost;
    if (onboardingMode === 'host' && !isHostAlready && !becomeHostModalOpen) {
      setBecomeHostError(null);
      setBecomeHostModalOpen(true);
    }
    // We deliberately only react to the URL flag — opening the modal once per landing.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router.isReady, onboardingMode]);
  const hasHome = Boolean((user as any)?.homeLat && (user as any)?.homeLng);
  const isHostFlag = Boolean(profileData?.isHost ?? user?.isHost);

  const scrollToHomeLocation = () => {
    document
      .getElementById('home-location-section')
      ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const completenessSteps = [
    {
      key: 'verify-contact',
      label:
        isEmailVerified || isPhoneVerified
          ? 'Contact verified'
          : 'Verify your email or phone',
      done: isEmailVerified || isPhoneVerified,
      onClick: () => setVerifyModalOpen(true),
      hint: 'Renters trust verified hosts more.',
    },
    {
      key: 'home',
      label: hasHome ? 'Home city saved' : 'Save your home city',
      done: hasHome,
      onClick: scrollToHomeLocation,
      hint: 'We use it to show you nearby listings first.',
    },
    {
      key: 'become-host',
      label: isHostFlag ? 'Host mode enabled' : 'Become a host',
      done: isHostFlag,
      onClick: handleBecomeHost,
      hint: 'List your first item and start earning.',
    },
  ];
  const doneCount = completenessSteps.filter((s) => s.done).length;
  const totalSteps = completenessSteps.length;
  const completenessPct = Math.round((doneCount / totalSteps) * 100);
  const showCompletenessCard = doneCount < totalSteps || onboardingMode === 'host';

  // Calculate stats
  const bookings = (bookingsQuery.data as any) || [];
  const totalRentals = bookings.length;
  const completedRentals = bookings.filter(
    (b: any) => b.status === 'completed' || b.status === 'confirmed',
  ).length;
  const activeRentals = bookings.filter(
    (b: any) => b.status === 'confirmed' || b.status === 'pending',
  ).length;

  const reviews = (reviewsQuery.data as any)?.data || [];
  const averageRatingRaw = profileData?.ratingAvg ?? user?.ratingAvg ?? 4.8;
  const averageRating =
    typeof averageRatingRaw === 'number'
      ? averageRatingRaw
      : parseFloat(String(averageRatingRaw)) || 4.8;
  const reviewsCountRaw =
    reviews.length || profileData?.ratingCount || user?.ratingCount || 0;
  const reviewsCount =
    typeof reviewsCountRaw === 'number'
      ? reviewsCountRaw
      : parseInt(String(reviewsCountRaw), 10) || 0;

  const memberSince = profileData?.createdAt
    ? new Date(profileData.createdAt).toLocaleDateString('en-US', {
      month: 'short',
      year: 'numeric',
    })
    : 'Jan 2024';

  if (query.isLoading) {
    return (
      <Layout>
        <div className="mx-auto max-w-7xl px-6 py-8">
          <LoadingCard />
        </div>
      </Layout>
    );
  }

  if (query.isError) {
    return (
      <Layout>
        <div className="mx-auto max-w-7xl px-6 py-8">
          <InlineError
            message="Failed to load profile."
            onRetry={() => void query.refetch()}
          />
        </div>
      </Layout>
    );
  }

  if (!query.data && !user) {
    return (
      <Layout>
        <div className="mx-auto max-w-7xl px-6 py-8">
          <EmptyState
            icon="fa-solid fa-user"
            title="Not signed in"
            message="Please log in to view your profile."
          />
        </div>
      </Layout>
    );
  }

  const displayUser = profileData || user;
  const displayName = displayUser?.name || 'User';
  const displayLocation =
    displayUser?.address?.split(',')?.slice(-2)?.join(',')?.trim() ||
    'Tunis, Tunisia';
  const displayAvatar = displayUser?.avatarUrl || '/placeholder.png';

  return (
    <Layout>
      {/* ── Onboarding / Completeness Card ── */}
      {showCompletenessCard && (
        <section className="bg-gradient-to-br from-blue-50 to-indigo-50 border-b border-blue-100">
          <div className="mx-auto max-w-7xl px-6 py-6">
            <div className="rounded-2xl border border-blue-200 bg-white p-6 shadow-sm">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <i className="fa-solid fa-rocket text-blue-500" />
                    <h2 className="text-lg font-bold text-gray-900">
                      {onboardingMode === 'host'
                        ? 'Welcome! Finish setting up your hosting account'
                        : 'Complete your profile'}
                    </h2>
                  </div>
                  <p className="text-sm text-gray-600">
                    {onboardingMode === 'host'
                      ? 'A couple of quick steps and you can publish your first listing.'
                      : 'A complete profile gets better trust and more bookings.'}
                  </p>
                </div>
                <div className="text-right">
                  <div className="text-2xl font-bold text-blue-600">
                    {completenessPct}%
                  </div>
                  <div className="text-xs text-gray-500">
                    {doneCount} of {totalSteps} done
                  </div>
                </div>
              </div>

              {/* progress bar */}
              <div className="mt-4 h-2 w-full overflow-hidden rounded-full bg-gray-100">
                <div
                  className="h-full bg-gradient-to-r from-blue-500 to-indigo-500 transition-all"
                  style={{ width: `${completenessPct}%` }}
                />
              </div>

              {/* step list */}
              <ul className="mt-5 space-y-2.5">
                {completenessSteps.map((s) => (
                  <li
                    key={s.key}
                    className="flex items-start gap-3 rounded-lg border border-gray-100 bg-gray-50/60 p-3"
                  >
                    <span
                      className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${s.done
                        ? 'bg-emerald-100 text-emerald-600'
                        : 'bg-gray-200 text-gray-400'
                        }`}
                    >
                      <i className={`fa-solid ${s.done ? 'fa-check' : 'fa-circle'} text-xs`} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className={`text-sm font-medium ${s.done ? 'text-gray-500 line-through' : 'text-gray-900'}`}>
                        {s.label}
                      </div>
                      {!s.done && (
                        <div className="text-xs text-gray-500 mt-0.5">{s.hint}</div>
                      )}
                    </div>
                    {!s.done && s.onClick && (
                      <button
                        type="button"
                        onClick={s.onClick}
                        className="shrink-0 rounded-lg bg-blue-500 px-3 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-blue-600"
                      >
                        Do this
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>
      )}

      {/* Profile Hero Section */}
      <section
        id="profile-hero"
        className="border-b border-gray-200 bg-white py-8"
      >
        <div className="mx-auto max-w-7xl px-6">
          <div className="flex items-start justify-between">
            <div className="flex items-start space-x-6">
              <div className="relative">
                <div className="h-32 w-32 overflow-hidden rounded-full border-4 border-white shadow-lg">
                  <img
                    src={displayAvatar}
                    alt="Profile"
                    className="h-full w-full object-cover"
                    onError={(e) => {
                      e.currentTarget.src = '/placeholder.png';
                      e.currentTarget.onerror = null;
                    }}
                  />
                </div>
                <input
                  ref={avatarInputRef}
                  type="file"
                  accept="image/jpeg,image/jpg,image/png,image/webp"
                  className="hidden"
                  onChange={handleAvatarPick}
                />
                <button
                  type="button"
                  onClick={() => avatarInputRef.current?.click()}
                  disabled={avatarUploading}
                  aria-label="Change profile photo"
                  className="absolute bottom-0 right-0 flex h-10 w-10 items-center justify-center rounded-full bg-blue-500 shadow-lg transition hover:bg-blue-600 disabled:opacity-60"
                >
                  <i
                    className={`text-sm text-white fa-solid ${avatarUploading ? 'fa-circle-notch fa-spin' : 'fa-camera'}`}
                  ></i>
                </button>
              </div>

              <div>
                <h1 className="mb-2 text-3xl font-bold text-gray-900">
                  {displayName}
                </h1>
                <div className="mb-3 flex items-center space-x-4">
                  <div className="flex items-center">
                    <i className="fa-solid fa-star mr-1 text-yellow-400"></i>
                    <span className="font-semibold text-gray-900">
                      {averageRating.toFixed(1)}
                    </span>
                    <span className="ml-1 text-gray-500">
                      ({reviewsCount} reviews)
                    </span>
                  </div>
                  <span className="text-gray-400">•</span>
                  <div className="flex items-center text-gray-600">
                    <i className="fa-solid fa-location-dot mr-1"></i>
                    <span>{displayLocation}</span>
                  </div>
                </div>
                <div className="mb-4 flex items-center flex-wrap gap-2">
                  <div className="flex items-center rounded-full bg-blue-100 px-4 py-1 text-sm font-medium text-blue-700">
                    <i className="fa-solid fa-user mr-2"></i>
                    Currently a {isHost ? 'Host' : 'Renter'}
                  </div>
                  {typeof (displayUser as any)?.renterTrustScore === 'number' ? (
                    <TrustBadge
                      score={(displayUser as any).renterTrustScore}
                      role="RENTER"
                      force
                      size="md"
                    />
                  ) : null}
                  {isHost && typeof (displayUser as any)?.qualityScore === 'number' ? (
                    <TrustBadge
                      score={(displayUser as any).qualityScore}
                      role="HOST"
                      force
                      size="md"
                    />
                  ) : null}
                  <span className="text-gray-400">•</span>
                  <span className="text-sm text-gray-600">
                    Member since {memberSince}
                  </span>
                </div>
                <p className="max-w-2xl text-gray-600">
                  {displayUser?.description ||
                    'Passionate about exploring local experiences and connecting with the community. Love traveling and discovering new places.'}
                </p>
              </div>
            </div>

            {!isHost && (
              <div>
                {!isVerified && (
                  <div className="mb-4 rounded-lg border border-yellow-300 bg-yellow-50 p-4">
                    <p className="mb-3 text-sm text-yellow-800">
                      <i className="fa-solid fa-exclamation-triangle mr-2"></i>
                      Your account needs to be verified before you can become a
                      host.
                    </p>
                    <button
                      type="button"
                      onClick={handleVerifyAccount}
                      className="flex items-center rounded-lg bg-yellow-500 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-yellow-600"
                    >
                      <i className="fa-solid fa-check-circle mr-2"></i>
                      Verify Account
                    </button>
                  </div>
                )}

                {isVerified && (
                  <button
                    type="button"
                    onClick={handleBecomeHost}
                    disabled={becomeHostMutation.isPending}
                    className="flex items-center rounded-xl bg-blue-500 px-6 py-3 font-medium text-white shadow-md transition hover:bg-blue-600 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <i className="fa-solid fa-home mr-2"></i>
                    {becomeHostMutation.isPending
                      ? 'Processing...'
                      : 'Become a host'}
                  </button>
                )}

                {becomeHostMutation.isError && (
                  <div className="mt-3">
                    <InlineError
                      message={
                        (becomeHostMutation.error as any)?.body?.message ||
                        (becomeHostMutation.error as any)?.response?.data
                          ?.message ||
                        'Failed to become a host. Please try again.'
                      }
                      onRetry={handleBecomeHost}
                    />
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </section>

      {/* Pending reviews — both renter and host get prompted */}
      <section className="bg-gray-50 pt-6">
        <div className="mx-auto max-w-7xl px-6 space-y-4">
          <PendingReviewsCard />
          {isHostFlag ? <KycUploadCard /> : null}
        </div>
      </section>

      {/* Profile Stats Section */}
      <section id="profile-stats" className="bg-gray-50 py-6">
        <div className="mx-auto max-w-7xl px-6">
          <div className="grid grid-cols-4 gap-6">
            <div className="rounded-xl border border-gray-200 bg-white p-6">
              <div className="mb-2 flex items-center justify-between">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-blue-100">
                  <i className="fa-solid fa-calendar-check text-xl text-blue-500"></i>
                </div>
              </div>
              <h3 className="mb-1 text-2xl font-bold text-gray-900">
                {totalRentals}
              </h3>
              <p className="text-sm text-gray-600">Total Rentals</p>
            </div>

            <div className="rounded-xl border border-gray-200 bg-white p-6">
              <div className="mb-2 flex items-center justify-between">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-green-100">
                  <i className="fa-solid fa-star text-xl text-green-500"></i>
                </div>
              </div>
              <h3 className="mb-1 text-2xl font-bold text-gray-900">
                {averageRating.toFixed(1)}
              </h3>
              <p className="text-sm text-gray-600">Average Rating</p>
            </div>

            <div className="rounded-xl border border-gray-200 bg-white p-6">
              <div className="mb-2 flex items-center justify-between">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-purple-100">
                  <i className="fa-solid fa-message text-xl text-purple-500"></i>
                </div>
              </div>
              <h3 className="mb-1 text-2xl font-bold text-gray-900">
                {reviewsCount}
              </h3>
              <p className="text-sm text-gray-600">Reviews Received</p>
            </div>

            <div className="rounded-xl border border-gray-200 bg-white p-6">
              <div className="mb-2 flex items-center justify-between">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-orange-100">
                  <i className="fa-solid fa-heart text-xl text-orange-500"></i>
                </div>
              </div>
              <h3 className="mb-1 text-2xl font-bold text-gray-900">{wishlistQuery.size}</h3>
              <p className="text-sm text-gray-600">Saved Items</p>
            </div>
          </div>
        </div>
      </section>

      {/* Profile Navigation Section */}
      <section id="profile-navigation" className="bg-white py-8">
        <div className="mx-auto max-w-7xl px-6">
          <div className="grid grid-cols-3 gap-6">
            <Link
              href="/client/bookings"
              className="group cursor-pointer rounded-2xl border border-blue-200 bg-gradient-to-br from-blue-50 to-blue-100 p-8 transition hover:shadow-lg"
            >
              <div className="mb-4 flex items-start justify-between">
                <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-blue-500 transition group-hover:scale-110">
                  <i className="fa-solid fa-calendar-days text-2xl text-white"></i>
                </div>
                <i className="fa-solid fa-arrow-right text-xl text-blue-500 transition group-hover:translate-x-1"></i>
              </div>
              <h3 className="mb-2 text-2xl font-bold text-gray-900">
                My Rentals
              </h3>
              <p className="mb-4 text-gray-600">
                View and manage your current and past bookings
              </p>
              <div className="flex items-center space-x-2">
                <span className="rounded-full bg-blue-500 px-3 py-1 text-xs font-semibold text-white">
                  {activeRentals} Active
                </span>
                <span className="text-sm text-gray-600">
                  {completedRentals} Completed
                </span>
              </div>
            </Link>

            {isHost ? (
              <Link
                href="/host/listings"
                className="group cursor-pointer rounded-2xl border border-green-200 bg-gradient-to-br from-green-50 to-green-100 p-8 transition hover:shadow-lg"
              >
                <div className="mb-4 flex items-start justify-between">
                  <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-green-500 transition group-hover:scale-110">
                    <i className="fa-solid fa-box text-2xl text-white"></i>
                  </div>
                  <i className="fa-solid fa-arrow-right text-xl text-green-500 transition group-hover:translate-x-1"></i>
                </div>
                <h3 className="mb-2 text-2xl font-bold text-gray-900">
                  My Listings
                </h3>
                <p className="mb-4 text-gray-600">
                  Manage items you&apos;re offering for rent
                </p>
                <div className="flex items-center space-x-2">
                  <span className="rounded-full bg-gray-200 px-3 py-1 text-xs font-semibold text-gray-600">
                    View listings
                  </span>
                </div>
              </Link>
            ) : (
              <div className="group cursor-pointer rounded-2xl border border-green-200 bg-gradient-to-br from-green-50 to-green-100 p-8 transition hover:shadow-lg">
                <div className="mb-4 flex items-start justify-between">
                  <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-green-500 transition group-hover:scale-110">
                    <i className="fa-solid fa-box text-2xl text-white"></i>
                  </div>
                  <i className="fa-solid fa-arrow-right text-xl text-green-500 transition group-hover:translate-x-1"></i>
                </div>
                <h3 className="mb-2 text-2xl font-bold text-gray-900">
                  My Listings
                </h3>
                <p className="mb-4 text-gray-600">
                  Manage items you&apos;re offering for rent
                </p>
                <div className="flex items-center space-x-2">
                  <span className="rounded-full bg-gray-200 px-3 py-1 text-xs font-semibold text-gray-600">
                    No listings yet
                  </span>
                </div>
              </div>
            )}

            <button
              type="button"
              onClick={() => document.getElementById('verification-section')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
              className="group cursor-pointer rounded-2xl border border-purple-200 bg-gradient-to-br from-purple-50 to-purple-100 p-8 transition hover:shadow-lg text-left w-full"
            >
              <div className="mb-4 flex items-start justify-between">
                <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-purple-500 transition group-hover:scale-110">
                  <i className="fa-solid fa-gear text-2xl text-white"></i>
                </div>
                <i className="fa-solid fa-arrow-right text-xl text-purple-500 transition group-hover:translate-x-1"></i>
              </div>
              <h3 className="mb-2 text-2xl font-bold text-gray-900">
                Settings
              </h3>
              <p className="mb-4 text-gray-600">
                Update your profile and preferences
              </p>
              <div className="flex items-center space-x-2">
                <span className="text-sm text-gray-600">
                  Account · Privacy · Notifications
                </span>
              </div>
            </button>
          </div>
        </div>
      </section>

      {/* Reviews Section */}
      {reviews.length > 0 && (
        <section id="reviews-section" className="bg-gray-50 py-12">
          <div className="mx-auto max-w-7xl px-6">
            <div className="mb-8 flex items-center justify-between">
              <div>
                <h2 className="mb-2 text-3xl font-bold text-gray-900">
                  Reviews
                </h2>
                <p className="text-gray-600">
                  What others say about {displayName}
                </p>
              </div>
              {reviews.length > 3 && (
                <Link
                  href="/client/reviews"
                  className="flex items-center font-medium text-blue-500 transition hover:text-blue-600"
                >
                  View all {reviews.length} reviews
                  <i className="fa-solid fa-arrow-right ml-2"></i>
                </Link>
              )}
            </div>

            <div className="grid grid-cols-3 gap-6">
              {reviews.slice(0, 3).map((review: any) => (
                <div
                  key={review.id}
                  className="rounded-xl border border-gray-200 bg-white p-6"
                >
                  <div className="mb-4 flex items-start justify-between">
                    <div className="flex items-center space-x-3">
                      <img
                        src={review.author?.avatarUrl || '/placeholder.png'}
                        alt={review.author?.name || 'Reviewer'}
                        className="h-12 w-12 rounded-full object-cover"
                        onError={(e) => {
                          e.currentTarget.src = '/placeholder.png';
                          e.currentTarget.onerror = null;
                        }}
                      />
                      <div>
                        <h4 className="font-semibold text-gray-900">
                          {review.author?.name || 'Anonymous'}
                        </h4>
                        <p className="text-sm text-gray-500">
                          {new Date(review.createdAt).toLocaleDateString(
                            'en-US',
                            { month: 'long', year: 'numeric' },
                          )}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center">
                      <i className="fa-solid fa-star text-sm text-yellow-400"></i>
                      <span className="ml-1 font-semibold text-gray-900">
                        {review.rating}
                      </span>
                    </div>
                  </div>
                  <p className="leading-relaxed text-gray-700">
                    &quot;{review.comment}&quot;
                  </p>
                  {review.booking?.listing && (
                    <div className="mt-4 border-t border-gray-100 pt-4">
                      <span className="text-sm text-gray-500">
                        Rented:{' '}
                        {review.booking.listing.title ||
                          review.booking.listing.category?.name ||
                          'Item'}
                      </span>
                    </div>
                  )}
                </div>
              ))}
            </div>

            {reviews.length > 3 && (
              <div className="mt-8 text-center">
                <Link
                  href="/client/reviews"
                  className="mx-auto flex items-center justify-center font-medium text-blue-500 transition hover:text-blue-600"
                >
                  View all {reviews.length} reviews
                  <i className="fa-solid fa-arrow-right ml-2"></i>
                </Link>
              </div>
            )}
          </div>
        </section>
      )}

      {/* Saved Home Location Section */}
      <section id="home-location-section" className="bg-gray-50 py-12">
        <div className="mx-auto max-w-7xl px-6">
          <h2 className="mb-2 text-3xl font-bold text-gray-900">Home location</h2>
          <p className="mb-6 text-gray-600">
            Save a default city so we skip GPS detection on every visit.
          </p>

          <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
            {/* Current saved home */}
            <div className="rounded-2xl border border-gray-200 bg-white p-6">
              <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-500">
                Current saved home
              </h3>
              {hasSavedHome ? (
                <>
                  <div className="mb-4 flex items-center gap-3">
                    <div className="flex h-12 w-12 items-center justify-center rounded-full bg-blue-100">
                      <i className="fa-solid fa-house text-blue-500 text-lg" />
                    </div>
                    <div>
                      <p className="text-lg font-semibold text-gray-900">{savedHomeCity}</p>
                      <p className="text-xs text-gray-400">
                        {(user as any).homeLat?.toFixed(4)}, {(user as any).homeLng?.toFixed(4)}
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={handleClearHome}
                    disabled={homeSaving}
                    className="rounded-lg border border-red-200 px-4 py-2 text-sm font-medium text-red-600 transition hover:bg-red-50 disabled:opacity-50"
                  >
                    <i className="fa-solid fa-trash mr-2" />
                    Clear saved home
                  </button>
                </>
              ) : (
                <div className="text-gray-500">
                  <p className="mb-1 text-sm">No saved home yet.</p>
                  <p className="text-xs">
                    Currently using <strong>{userLocation.cityName}</strong>
                    {userLocation.isDefault ? ' (default)' : ' (detected)'}.
                  </p>
                </div>
              )}
            </div>

            {/* Set / change */}
            <div className="rounded-2xl border border-gray-200 bg-white p-6">
              <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-500">
                {hasSavedHome ? 'Change home' : 'Set home'}
              </h3>

              {/* Use current detected location */}
              {!userLocation.isDefault && (
                <button
                  type="button"
                  onClick={handleSaveCurrentAsHome}
                  disabled={homeSaving}
                  className="mb-4 flex w-full items-center justify-between rounded-lg border border-gray-200 px-4 py-3 text-left transition hover:bg-gray-50 disabled:opacity-50"
                >
                  <span className="flex items-center gap-3">
                    <i className="fa-solid fa-location-crosshairs text-blue-500" />
                    <span>
                      <span className="block text-sm font-semibold text-gray-900">Use current location</span>
                      <span className="block text-xs text-gray-500">{userLocation.cityName}</span>
                    </span>
                  </span>
                  <i className="fa-solid fa-arrow-right text-gray-400" />
                </button>
              )}

              {/* Pick a city */}
              <div className="relative" ref={homeInputRef}>
                <label className="mb-1 block text-xs font-semibold text-gray-700">
                  Or pick another Tunisian city
                </label>
                <div className="flex items-center gap-2 rounded-lg border border-gray-200 px-3 py-2">
                  <i className="fa-solid fa-magnifying-glass text-gray-400 text-sm" />
                  <input
                    type="text"
                    value={homeInput}
                    onChange={(e) => { setHomeInput(e.target.value); setHomeSelected(null); }}
                    onFocus={() => { if (homeSuggestions.length > 0) setHomeShowSugg(true); }}
                    placeholder="Sfax, Sousse, Djerba…"
                    className="w-full text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none"
                  />
                </div>

                {homeShowSugg && homeSuggestions.length > 0 && (
                  <ul className="absolute left-0 top-full z-20 mt-1 w-full overflow-hidden rounded-lg border border-gray-200 bg-white shadow-lg">
                    {homeSuggestions.map((s) => {
                      const parts = s.display_name.split(', ');
                      const primary = parts[0];
                      const secondary = parts.slice(1).join(', ');
                      return (
                        <li
                          key={s.place_id}
                          onMouseDown={(e) => {
                            e.preventDefault();
                            setHomeInput(primary);
                            setHomeSelected({
                              lat: parseFloat(s.lat),
                              lng: parseFloat(s.lon),
                              cityName: primary,
                            });
                            setHomeSuggestions([]);
                            setHomeShowSugg(false);
                          }}
                          className="flex cursor-pointer items-start gap-3 px-4 py-2.5 hover:bg-gray-50"
                        >
                          <i className="fa-solid fa-location-dot mt-0.5 shrink-0 text-gray-400 text-sm" />
                          <span className="min-w-0">
                            <span className="block truncate text-sm font-medium text-gray-900">{primary}</span>
                            <span className="block truncate text-xs text-gray-400">{secondary}</span>
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>

              {homeSelected && (
                <button
                  type="button"
                  onClick={handleSavePickedHome}
                  disabled={homeSaving}
                  className="mt-4 w-full rounded-lg bg-blue-500 py-2 text-sm font-semibold text-white transition hover:bg-blue-600 disabled:opacity-50"
                >
                  {homeSaving ? 'Saving…' : `Save ${homeSelected.cityName} as my home`}
                </button>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* Verification & Trust Section */}
      <section id="verification-section" className="bg-white py-12">
        <div className="mx-auto max-w-7xl px-6">
          <h2 className="mb-8 text-3xl font-bold text-gray-900">
            Verification & Trust
          </h2>

          <div className="grid grid-cols-2 gap-8">
            <div className="rounded-2xl border border-gray-200 bg-gray-50 p-8">
              <h3 className="mb-6 text-xl font-bold text-gray-900">
                Verified Information
              </h3>
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center">
                    <div
                      className={`mr-3 flex h-10 w-10 items-center justify-center rounded-full ${isVerified ? 'bg-green-100' : 'bg-gray-200'
                        }`}
                    >
                      <i
                        className={`fa-solid ${isVerified ? 'fa-check text-green-500' : 'fa-times text-gray-400'}`}
                      ></i>
                    </div>
                    <span className="text-gray-700">Email address</span>
                  </div>
                  {isVerified ? (
                    <span className="text-sm font-medium text-green-600">
                      Verified
                    </span>
                  ) : (
                    <button
                      onClick={handleVerifyAccount}
                      className="text-sm font-medium text-blue-500 transition hover:text-blue-600"
                    >
                      Verify
                    </button>
                  )}
                </div>

                <div className="flex items-center justify-between">
                  <div className="flex items-center">
                    <div
                      className={`mr-3 flex h-10 w-10 items-center justify-center rounded-full ${isVerified ? 'bg-green-100' : 'bg-gray-200'
                        }`}
                    >
                      <i
                        className={`fa-solid ${isVerified ? 'fa-check text-green-500' : 'fa-times text-gray-400'}`}
                      ></i>
                    </div>
                    <span className="text-gray-700">Phone number</span>
                  </div>
                  {isVerified ? (
                    <span className="text-sm font-medium text-green-600">
                      Verified
                    </span>
                  ) : (
                    <button
                      onClick={handleVerifyAccount}
                      className="text-sm font-medium text-blue-500 transition hover:text-blue-600"
                    >
                      Verify
                    </button>
                  )}
                </div>

                <div className="flex items-center justify-between">
                  <div className="flex items-center">
                    <div className="mr-3 flex h-10 w-10 items-center justify-center rounded-full bg-gray-200">
                      <i className="fa-solid fa-times text-gray-400"></i>
                    </div>
                    <span className="text-gray-700">Identity document</span>
                  </div>
                  <span className="text-sm font-medium text-gray-500">
                    Not verified
                  </span>
                </div>

                <div className="flex items-center justify-between">
                  <div className="flex items-center">
                    <div className="mr-3 flex h-10 w-10 items-center justify-center rounded-full bg-gray-200">
                      <i className="fa-solid fa-times text-gray-400"></i>
                    </div>
                    <span className="text-gray-700">Payment method</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => toast({ title: 'Coming soon', message: 'Payment method management will be available soon.', variant: 'info' })}
                    className="text-sm font-medium text-blue-500 transition hover:text-blue-600"
                  >
                    Add
                  </button>
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-gray-200 bg-gray-50 p-8">
              <h3 className="mb-6 text-xl font-bold text-gray-900">
                Trust Badges
              </h3>
              <div className="space-y-4">
                <div className="flex items-start">
                  <div className="mr-3 flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-blue-100">
                    <i className="fa-solid fa-shield-halved text-blue-500"></i>
                  </div>
                  <div>
                    <h4 className="mb-1 font-semibold text-gray-900">
                      Trusted Member
                    </h4>
                    <p className="text-sm text-gray-600">
                      Active member with verified identity and positive reviews
                    </p>
                  </div>
                </div>

                {averageRating >= 4.5 && (
                  <div className="flex items-start">
                    <div className="mr-3 flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-purple-100">
                      <i className="fa-solid fa-award text-purple-500"></i>
                    </div>
                    <div>
                      <h4 className="mb-1 font-semibold text-gray-900">
                        Top Renter
                      </h4>
                      <p className="text-sm text-gray-600">
                        Consistent 5-star ratings and responsible rental history
                      </p>
                    </div>
                  </div>
                )}

                <div className="flex items-start">
                  <div className="mr-3 flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-green-100">
                    <i className="fa-solid fa-clock text-green-500"></i>
                  </div>
                  <div>
                    <h4 className="mb-1 font-semibold text-gray-900">
                      Quick Responder
                    </h4>
                    <p className="text-sm text-gray-600">
                      Usually responds within an hour
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <SecuritySection />

      <VerifyAccountModal
        open={verifyModalOpen}
        onClose={() => setVerifyModalOpen(false)}
        onVerified={handleVerifiedSuccess}
        availableChannels={{
          email: !!displayUser?.email,
          phone: !!displayUser?.phone,
        }}
      />

      <BecomeHostModal
        open={becomeHostModalOpen}
        onClose={() => setBecomeHostModalOpen(false)}
        onConfirm={confirmBecomeHost}
        isPending={becomeHostMutation.isPending}
        errorMessage={becomeHostError}
        emailVerified={isEmailVerified}
        phoneVerified={isPhoneVerified}
        onRequestVerify={() => {
          setBecomeHostModalOpen(false);
          setTimeout(() => setVerifyModalOpen(true), 150);
        }}
      />
    </Layout>
  );
}

function SecuritySection() {
  const { user, logout } = useAuth();
  // Backend now exposes a derived `hasPassword` on /users/me. OAuth-only
  // users have hasPassword === false and can't change a password they don't have.
  const isOauthOnly = !!user && (user as any).hasPassword === false;
  const [signingOut, setSigningOut] = useState(false);
  const [pwOpen, setPwOpen] = useState(false);

  const signOutEverywhere = async () => {
    const ok = window.confirm(
      'Sign out of every device, including this one? You will need to log back in.',
    );
    if (!ok) return;
    setSigningOut(true);
    try {
      const { api } = await import('@/lib/api/http');
      const res = await api.post('/auth/logout-all');
      const count = res.data?.revokedCount ?? 0;
      toast({
        title: 'Signed out everywhere',
        message:
          count > 0
            ? `${count} session${count === 1 ? '' : 's'} revoked.`
            : 'All sessions revoked.',
        variant: 'success',
      });
      logout();
    } catch (e: any) {
      toast({
        title: 'Could not sign out everywhere',
        message: e?.response?.data?.message ?? 'Please try again.',
        variant: 'error',
      });
      setSigningOut(false);
    }
  };

  return (
    <section className="bg-white py-12">
      <div className="mx-auto max-w-7xl px-6">
        <h2 className="mb-8 text-3xl font-bold text-gray-900">Security</h2>

        <div className="space-y-4">
          {/* Change password */}
          <div className="rounded-2xl border border-gray-200 bg-gray-50 p-8">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h3 className="text-lg font-semibold text-gray-900">
                  Change your password
                </h3>
                <p className="mt-1 text-sm text-gray-600">
                  {isOauthOnly
                    ? 'This account signs in with Google and has no password. Use the password reset flow to set one.'
                    : 'You will be asked for your current password. Other devices are signed out on success.'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setPwOpen((v) => !v)}
                disabled={!!isOauthOnly}
                className="shrink-0 rounded-xl border border-gray-300 bg-white px-5 py-3 text-sm font-semibold text-gray-800 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <i className="fa-solid fa-key mr-2" />
                {pwOpen ? 'Close' : 'Change password'}
              </button>
            </div>

            {pwOpen && !isOauthOnly ? (
              <ChangePasswordForm onDone={() => setPwOpen(false)} />
            ) : null}
          </div>

          {/* Sign out everywhere */}
          <div className="rounded-2xl border border-gray-200 bg-gray-50 p-8">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h3 className="text-lg font-semibold text-gray-900">
                  Sign out of every device
                </h3>
                <p className="mt-1 text-sm text-gray-600">
                  If you've lost a phone or shared your computer, revoke every
                  active session. You'll be logged out here too and will need to
                  log back in.
                </p>
              </div>
              <button
                type="button"
                onClick={signOutEverywhere}
                disabled={signingOut}
                className="shrink-0 rounded-xl border border-red-200 bg-white px-5 py-3 text-sm font-semibold text-red-600 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {signingOut ? (
                  <>
                    <i className="fa-solid fa-circle-notch fa-spin mr-2" />
                    Signing out…
                  </>
                ) : (
                  <>
                    <i className="fa-solid fa-right-from-bracket mr-2" />
                    Sign out everywhere
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function ChangePasswordForm({ onDone }: { onDone: () => void }) {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (newPassword.length < 6) {
      setError('New password must be at least 6 characters.');
      return;
    }
    if (newPassword !== confirm) {
      setError("New passwords don't match.");
      return;
    }
    if (newPassword === currentPassword) {
      setError('New password must be different from the current one.');
      return;
    }

    setSubmitting(true);
    try {
      const { api } = await import('@/lib/api/http');
      await api.post('/auth/change-password', { currentPassword, newPassword });
      toast({
        title: 'Password updated',
        message: 'Other devices have been signed out.',
        variant: 'success',
      });
      setCurrentPassword('');
      setNewPassword('');
      setConfirm('');
      onDone();
    } catch (e: any) {
      const status = e?.response?.status;
      const message = e?.response?.data?.message;
      if (status === 401) {
        setError('Current password is incorrect.');
      } else if (status === 429) {
        setError('Too many attempts. Please wait a minute and try again.');
      } else {
        setError(message ?? 'Could not change your password. Please try again.');
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={submit} className="mt-6 grid gap-4 border-t border-gray-200 pt-6">
      <div>
        <label className="text-sm font-medium text-gray-700">Current password</label>
        <input
          type="password"
          autoComplete="current-password"
          value={currentPassword}
          onChange={(e) => setCurrentPassword(e.target.value)}
          required
          className="mt-1 w-full rounded-lg border border-border bg-white px-3 py-2"
        />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="text-sm font-medium text-gray-700">New password</label>
          <input
            type="password"
            autoComplete="new-password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            required
            className="mt-1 w-full rounded-lg border border-border bg-white px-3 py-2"
          />
          <p className="mt-1 text-xs text-gray-500">At least 6 characters.</p>
        </div>
        <div>
          <label className="text-sm font-medium text-gray-700">Confirm new password</label>
          <input
            type="password"
            autoComplete="new-password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            required
            className="mt-1 w-full rounded-lg border border-border bg-white px-3 py-2"
          />
        </div>
      </div>

      {error ? (
        <p className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </p>
      ) : null}

      <div className="flex items-center justify-end gap-3">
        <button
          type="button"
          onClick={onDone}
          className="rounded-xl border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={submitting}
          className="rounded-xl bg-primary px-5 py-2 text-sm font-semibold text-white hover:bg-primary-600 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {submitting ? 'Saving…' : 'Update password'}
        </button>
      </div>
    </form>
  );
}
