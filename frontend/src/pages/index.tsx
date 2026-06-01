import Link from 'next/link';
import { Layout } from '@/components/layout/Layout';
import { useRouter } from 'next/router';
import { useState, useEffect } from 'react';
import { useDebounce } from '@/lib/utils/useDebounce';
import { useListings } from '@/lib/api/hooks/useListings';
import { useCategoriesNearby } from '@/lib/api/hooks/useCategoriesNearby';
import { useRecommendedListings } from '@/lib/api/hooks/useRecommendedListings';
import { useTrendingListings } from '@/lib/api/hooks/useTrendingListings';
import { useBecauseYouViewed } from '@/lib/api/hooks/useBecauseYouViewed';
import { useUserLocation } from '@/lib/hooks/useUserLocation';
import { useAuth } from '@/lib/auth/AuthProvider';
import { ListingCard } from '@/components/shared/ListingCard';
import { CategoryRow } from '@/components/shared/CategoryRow';
import { LoadingCard } from '@/components/ui/LoadingCard';
import { InlineError } from '@/components/ui/InlineError';
import { EmptyState } from '@/components/ui/EmptyState';
import ListingMap from '@/components/shared/ListingMap';
import { CityPicker } from '@/components/shared/CityPicker';

const CATEGORY_META: Record<string, { icon: string; colorBg: string; colorIcon: string; colorHover: string; subtitle: string }> = {
  'stays': { icon: 'fa-house', colorBg: 'bg-blue-100', colorIcon: 'text-blue-500', colorHover: 'group-hover:bg-blue-500', subtitle: 'Houses & Villas' },
  'sports-facilities': { icon: 'fa-futbol', colorBg: 'bg-purple-100', colorIcon: 'text-purple-500', colorHover: 'group-hover:bg-purple-500', subtitle: 'Football, Volleyball & Padel' },
  'mobility': { icon: 'fa-car', colorBg: 'bg-green-100', colorIcon: 'text-green-500', colorHover: 'group-hover:bg-green-500', subtitle: 'Vehicles & Scooters' },
  'beach-gear': { icon: 'fa-water', colorBg: 'bg-orange-100', colorIcon: 'text-orange-500', colorHover: 'group-hover:bg-orange-500', subtitle: 'Paddle, Kayak & More' },
};

const RADIUS_KM = 60;

export default function HomePage() {
  const router = useRouter();
  const { push } = router;
  const { user } = useAuth();
  const [q, setQ] = useState('');
  const dq = useDebounce(q, 350);

  const { lat, lng, cityName, loading: locLoading, isDefault, permissionDenied, fromSavedHome, requestLocation, resetLocation } = useUserLocation();

  // "Where" field — syncs to detected city, user can override via autocomplete
  const [where, setWhere] = useState('');
  const [selectedCoords, setSelectedCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [bannerDismissed, setBannerDismissed] = useState(false);

  // Keep "Where" field in sync with detected city name
  useEffect(() => {
    if (!locLoading && cityName) { setWhere(cityName); setSelectedCoords(null); }
  }, [locLoading, cityName]);

  const { data: nearbyCategories, isLoading: catsLoading } = useCategoriesNearby({
    lat,
    lng,
    radiusKm: RADIUS_KM,
    enabled: !locLoading,
  });

  // Map preview keeps the location-sorted feed
  const { data } = useListings({
    q: dq || undefined,
    lat,
    lng,
    radiusKm: RADIUS_KM,
    limit: 12,
    sortBy: 'distance',
  });

  // Personalized "for you" feed — backend handles cold-start fallback for
  // anonymous visitors (quality + location + freshness), and ranks against
  // the user's preference vector once they have a few interactions.
  const recommended = useRecommendedListings({
    limit: 8,
    lat: locLoading || isDefault ? undefined : lat,
    lng: locLoading || isDefault ? undefined : lng,
    enabled: !locLoading,
  });

  // "Trending this week" — public, most-booked recently (quality fallback).
  const trending = useTrendingListings({ limit: 8 });

  // "Because you viewed X" — only meaningful for signed-in users with history.
  const becauseYouViewed = useBecauseYouViewed({ limit: 8, enabled: !!user });
  const byvData = becauseYouViewed.data;

  return (
    <Layout>
      {/* Hero Search Section */}
      <section id="hero-search" className="bg-white">
        <div className="mx-auto max-w-7xl px-6 py-12">
          <div className="re-fade-up mx-auto mb-8 max-w-3xl text-center">
            <h1 className="mb-4 text-5xl font-bold text-gray-900">
              Rent anything, locally
            </h1>
            <p className="text-lg text-gray-600">
              From homes to vehicles, sports gear to tools — discover what's
              available near you
            </p>
          </div>

          <div
            id="search-bar"
            className="re-fade-up mx-auto max-w-4xl"
            style={{ animationDelay: '120ms' }}
          >
            <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-lg">
              <div className="flex items-stretch">
                <div className="flex-1 border-r border-gray-200 p-5">
                  <label className="mb-1 block text-xs font-semibold text-gray-700">
                    What
                  </label>
                  <input
                    type="text"
                    value={q}
                    onChange={(e) => setQ(e.target.value)}
                    placeholder="What do you want to rent?"
                    className="w-full text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none"
                  />
                </div>

                <div className="flex-1 border-r border-gray-200 p-5">
                  <label className="mb-1 block text-xs font-semibold text-gray-700">
                    Where
                  </label>
                  <CityPicker
                    value={locLoading ? '' : where}
                    onChange={(v) => { setWhere(v); setSelectedCoords(null); }}
                    onPick={({ cityName: c, lat: la, lng: lo }) => {
                      setWhere(c);
                      setSelectedCoords({ lat: la, lng: lo });
                    }}
                    placeholder={locLoading ? 'Detecting location…' : 'City or area'}
                    disabled={locLoading}
                    leadingIcon={
                      locLoading ? (
                        <i className="fa-solid fa-location-dot text-blue-400 animate-pulse shrink-0"></i>
                      ) : isDefault ? (
                        <button
                          type="button"
                          onClick={requestLocation}
                          title="Use my location"
                          className="shrink-0 text-gray-400 hover:text-blue-500 transition"
                        >
                          <i className="fa-solid fa-location-crosshairs text-base"></i>
                        </button>
                      ) : fromSavedHome ? (
                        <button
                          type="button"
                          onClick={requestLocation}
                          title="Override saved home — use my current GPS"
                          className="shrink-0 text-blue-500 hover:text-blue-700 transition"
                        >
                          <i className="fa-solid fa-house text-base"></i>
                        </button>
                      ) : (
                        <i className="fa-solid fa-location-dot text-blue-500 shrink-0"></i>
                      )
                    }
                  />
                  {/* Inline reset — visible when we auto-detected a city the user disagrees with */}
                  {!locLoading && !isDefault && !fromSavedHome && (
                    <button
                      type="button"
                      onClick={resetLocation}
                      className="mt-1 text-[11px] text-gray-400 hover:text-blue-500 transition"
                      title="Clear and re-detect"
                    >
                      Wrong? <span className="underline">Reset location</span>
                    </button>
                  )}
                </div>

                <div className="flex items-center px-4">
                  <button
                    type="button"
                    onClick={() => {
                      push({
                        pathname: '/search',
                        query: {
                          q: dq || q || undefined,
                          lat: selectedCoords?.lat ?? lat,
                          lng: selectedCoords?.lng ?? lng,
                          radiusKm: RADIUS_KM,
                        },
                      });
                    }}
                    className="flex h-14 w-14 items-center justify-center rounded-full bg-blue-500 text-white shadow-md transition hover:bg-blue-600"
                  >
                    <i className="fa-solid fa-search text-lg"></i>
                  </button>
                </div>
              </div>
            </div>

            {/* Fallback banner — shown when location couldn't be detected */}
            {!locLoading && isDefault && !bannerDismissed && (
              <div className="mt-3 flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                <i className="fa-solid fa-location-crosshairs text-amber-500 shrink-0 text-base mt-0.5" />
                <span className="flex-1">
                  {permissionDenied ? (
                    <>
                      Location access is <strong>blocked</strong> in your browser.
                      Click the <strong>🔒 lock icon</strong> in the address bar → <em>Site settings</em> → set <strong>Location</strong> to <em>Allow</em>, then refresh.
                    </>
                  ) : (
                    <>
                      Showing results near <strong>Tunis</strong> (default). On desktops, browser geolocation is often inaccurate — pick your city in the Where field for better matches.
                    </>
                  )}
                </span>
                {!permissionDenied && (
                  <button
                    onClick={requestLocation}
                    className="shrink-0 flex items-center gap-1.5 rounded-lg bg-amber-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-amber-600 transition"
                  >
                    <i className="fa-solid fa-location-dot" />
                    Use my location
                  </button>
                )}
                <button
                  onClick={() => setBannerDismissed(true)}
                  className="shrink-0 text-amber-400 hover:text-amber-700 mt-0.5"
                >
                  <i className="fa-solid fa-xmark" />
                </button>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* Categories Section */}
      <section id="categories" className="bg-gray-50 py-8">
        <div className="mx-auto max-w-7xl px-6">
          <h2 className="mb-6 text-2xl font-bold text-gray-900">
            {locLoading
              ? 'Popular categories nearby'
              : `Popular categories in ${cityName}`}
          </h2>

          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            {catsLoading || locLoading
              ? Array.from({ length: 4 }).map((_, i) => (
                <div
                  key={i}
                  className="animate-pulse rounded-xl border border-gray-200 bg-white p-6"
                >
                  <div className="mb-4 h-12 w-12 rounded-full bg-gray-200" />
                  <div className="mb-2 h-4 w-24 rounded bg-gray-200" />
                  <div className="h-3 w-32 rounded bg-gray-100" />
                </div>
              ))
              : (nearbyCategories ?? []).map((cat) => {
                const meta = CATEGORY_META[cat.slug] ?? {
                  icon: 'fa-tag',
                  colorBg: 'bg-gray-100',
                  colorIcon: 'text-gray-500',
                  colorHover: 'group-hover:bg-gray-500',
                  subtitle: cat.name,
                };
                return (
                  <Link
                    key={cat.id}
                    href={`/search?categorySlug=${cat.slug}&lat=${lat}&lng=${lng}&radiusKm=${RADIUS_KM}`}
                    className="group cursor-pointer rounded-xl border border-gray-200 bg-white p-6 transition hover:shadow-lg"
                  >
                    <div
                      className={`mb-4 flex h-12 w-12 items-center justify-center rounded-full ${meta.colorBg} transition ${meta.colorHover}`}
                    >
                      <i
                        className={`fa-solid ${meta.icon} text-xl ${meta.colorIcon} transition group-hover:text-white`}
                      ></i>
                    </div>
                    <h3 className="text-sm font-semibold text-gray-900">
                      {cat.name}
                    </h3>
                    <p className="mt-1 text-xs text-gray-500">
                      {meta.subtitle}
                    </p>
                    {cat.count > 0 && (
                      <p className="mt-2 text-xs font-medium text-blue-500">
                        {cat.count} available
                      </p>
                    )}
                  </Link>
                );
              })}
          </div>
        </div>
      </section>

      {/* Map Preview Section */}
      <section id="map-preview" className="bg-white py-12">
        <div className="mx-auto max-w-7xl px-6">
          <div className="mb-6 flex items-center justify-between">
            <h2 className="text-2xl font-bold text-gray-900">
              Available nearby
            </h2>
            <Link
              href={`/map?lat=${lat}&lng=${lng}&radiusKm=${RADIUS_KM}`}
              className="flex items-center font-medium text-blue-500 transition hover:text-blue-600"
            >
              View full map
              <i className="fa-solid fa-arrow-right ml-2"></i>
            </Link>
          </div>

          <div
            className="overflow-hidden rounded-2xl border border-gray-200 shadow-lg"
            style={{ height: '400px' }}
          >
            <ListingMap
              listings={data?.items ?? []}
              center={[lat, lng]}
              zoom={locLoading ? 12 : isDefault ? 12 : 11}
              height="400px"
            />
          </div>
        </div>
      </section>

      {/* Recommended for you — personalized feed (cold-start fallback for anon) */}
      <section id="featured-listings" className="bg-gray-50 py-12">
        <div className="mx-auto max-w-7xl px-6">
          <div className="mb-6 flex items-center justify-between">
            <div>
              <h2 className="text-2xl font-bold text-gray-900">
                {user ? 'Recommended for you' : 'Popular near you'}
              </h2>
              <p className="mt-1 text-sm text-gray-500">
                {user
                  ? 'Ranked by what you usually like, plus top-rated listings nearby.'
                  : 'Top-rated listings in your area — sign in to see picks tailored to you.'}
              </p>
            </div>
            <Link
              href={`/search?lat=${lat}&lng=${lng}&radiusKm=${RADIUS_KM}`}
              className="font-medium text-blue-500 transition hover:text-blue-600"
            >
              View all
            </Link>
          </div>

          {recommended.isLoading || locLoading ? (
            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <LoadingCard key={i} />
              ))}
            </div>
          ) : recommended.isError ? (
            <InlineError
              message="Failed to load recommendations. Please try again."
              onRetry={() => void recommended.refetch()}
            />
          ) : (recommended.data ?? []).length > 0 ? (
            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
              {(recommended.data ?? []).map((listing) => (
                <ListingCard
                  key={listing.id}
                  listing={listing as any}
                  reason={listing._reasons?.[0]}
                />
              ))}
            </div>
          ) : (
            <EmptyState
              icon="fa-solid fa-magnifying-glass"
              title={isDefault ? "We don't know where you are yet" : 'No listings found nearby'}
              message={
                isDefault
                  ? 'Set your location to see nearby rentals, or browse everything.'
                  : `No rentals found within ${RADIUS_KM}km of ${cityName}. Try browsing all listings.`
              }
              cta={{ label: 'Browse all', href: '/search' }}
            />
          )}
        </div>
      </section>

      {/* Because you viewed — only for signed-in users with view history */}
      {user && byvData && (
        <section id="because-you-viewed" className="bg-white py-12">
          <div className="mx-auto max-w-7xl px-6">
            <div className="mb-6">
              <h2 className="text-2xl font-bold text-gray-900">
                Because you viewed{' '}
                <span className="text-blue-600">{byvData.seed.title}</span>
              </h2>
              <p className="mt-1 text-sm text-gray-500">
                More like the last listing you checked out.
              </p>
            </div>
            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
              {byvData.items.slice(0, 4).map((listing) => (
                <ListingCard key={listing.id} listing={listing as any} />
              ))}
            </div>
          </div>
        </section>
      )}

      {/* Trending this week — public, most-booked recently (quality fallback) */}
      <section id="trending" className="bg-gray-50 py-12">
        <div className="mx-auto max-w-7xl px-6">
          <div className="mb-6 flex items-center justify-between">
            <div>
              <h2 className="flex items-center gap-2 text-2xl font-bold text-gray-900">
                <i className="fa-solid fa-fire text-orange-500" />
                Trending this week
              </h2>
              <p className="mt-1 text-sm text-gray-500">
                The most-booked rentals across the platform right now.
              </p>
            </div>
            <Link
              href="/search?sortBy=popular"
              className="font-medium text-blue-500 transition hover:text-blue-600"
            >
              View all
            </Link>
          </div>

          {trending.isLoading ? (
            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <LoadingCard key={i} />
              ))}
            </div>
          ) : (trending.data ?? []).length > 0 ? (
            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
              {(trending.data ?? []).slice(0, 4).map((listing) => (
                <ListingCard key={listing.id} listing={listing as any} />
              ))}
            </div>
          ) : null}
        </div>
      </section>

      {/* Browse by category — one row of listings per stocked category */}
      {!locLoading && (nearbyCategories ?? []).filter((c) => c.count > 0).length > 0 && (
        <section id="browse-by-category" className="bg-white py-12">
          <div className="mx-auto max-w-7xl px-6">
            <h2 className="mb-8 text-2xl font-bold text-gray-900">Browse by category</h2>
            {(nearbyCategories ?? [])
              .filter((c) => c.count > 0)
              .slice(0, 3)
              .map((cat) => (
                <CategoryRow
                  key={cat.id}
                  category={{ id: cat.id, name: cat.name, slug: cat.slug }}
                  lat={lat}
                  lng={lng}
                  radiusKm={RADIUS_KM}
                />
              ))}
          </div>
        </section>
      )}

      {/* How It Works Section */}
      <section id="how-it-works" className="bg-white py-16">
        <div className="mx-auto max-w-7xl px-6">
          <div className="mb-12 text-center">
            <h2 className="mb-3 text-3xl font-bold text-gray-900">
              How it works
            </h2>
            <p className="text-lg text-gray-600">
              Rent or offer items in three simple steps
            </p>
          </div>

          <div className="grid grid-cols-1 gap-12 md:grid-cols-3">
            <div className="text-center">
              <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-blue-100">
                <i className="fa-solid fa-search text-2xl text-blue-500"></i>
              </div>
              <h3 className="mb-2 text-xl font-semibold text-gray-900">
                Search & Discover
              </h3>
              <p className="text-gray-600">
                Find what you need nearby using our smart search or explore the
                map
              </p>
            </div>

            <div className="text-center">
              <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-green-100">
                <i className="fa-solid fa-calendar-check text-2xl text-green-500"></i>
              </div>
              <h3 className="mb-2 text-xl font-semibold text-gray-900">
                Book Instantly
              </h3>
              <p className="text-gray-600">
                Select your dates, confirm the booking, and connect with the
                host
              </p>
            </div>

            <div className="text-center">
              <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-purple-100">
                <i className="fa-solid fa-handshake text-2xl text-purple-500"></i>
              </div>
              <h3 className="mb-2 text-xl font-semibold text-gray-900">
                Rent & Enjoy
              </h3>
              <p className="text-gray-600">
                Pick up the item, use it, and return it when done. Rate your
                experience
              </p>
            </div>
          </div>
        </div>
      </section>
    </Layout>
  );
}
