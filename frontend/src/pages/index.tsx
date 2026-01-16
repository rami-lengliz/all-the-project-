import Link from 'next/link';
import { Layout } from '@/components/layout/Layout';
import { useRouter } from 'next/router';
import { useState } from 'react';
import { useDebounce } from '@/lib/utils/useDebounce';
import { useListings } from '@/lib/api/hooks/useListings';
import { ListingCard } from '@/components/shared/ListingCard';
import { LoadingCard } from '@/components/ui/LoadingCard';
import { InlineError } from '@/components/ui/InlineError';
import { EmptyState } from '@/components/ui/EmptyState';
import { formatTnd } from '@/lib/utils/format';

export default function HomePage() {
  const router = useRouter();
  const { push } = router;
  const [q, setQ] = useState('');
  const [where, setWhere] = useState('Tunis, Tunisia');
  const dq = useDebounce(q, 350);
  const { data, isLoading, isError } = useListings({
    q: dq || undefined,
    lat: 36.8578,
    lng: 11.092,
    radiusKm: 10,
    limit: 12,
    sortBy: 'distance',
  });

  const featuredListings = data?.items?.slice(0, 4) || [];

  return (
    <Layout>
      {/* Hero Search Section */}
      <section id="hero-search" className="bg-white">
        <div className="mx-auto max-w-7xl px-6 py-12">
          <div className="mx-auto mb-8 max-w-3xl text-center">
            <h1 className="mb-4 text-5xl font-bold text-gray-900">Rent anything, locally</h1>
            <p className="text-lg text-gray-600">From homes to vehicles, sports gear to tools — discover what's available near you</p>
          </div>

          <div id="search-bar" className="mx-auto max-w-4xl">
            <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-lg">
              <div className="flex items-stretch">
                <div className="flex-1 border-r border-gray-200 p-5">
                  <label className="mb-1 block text-xs font-semibold text-gray-700">What</label>
                  <input
                    type="text"
                    value={q}
                    onChange={(e) => setQ(e.target.value)}
                    placeholder="What do you want to rent?"
                    className="w-full text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none"
                  />
                </div>

                <div className="flex-1 border-r border-gray-200 p-5">
                  <label className="mb-1 block text-xs font-semibold text-gray-700">Where</label>
                  <div className="flex items-center">
                    <i className="fa-solid fa-location-dot text-blue-500 mr-2"></i>
                    <input
                      type="text"
                      value={where}
                      onChange={(e) => setWhere(e.target.value)}
                      placeholder="Tunis, Tunisia"
                      className="w-full text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none"
                    />
                  </div>
                </div>

                <div className="flex items-center px-4">
                  <button
                    type="button"
                    onClick={() =>
                      push({
                        pathname: '/search',
                        query: { q: dq || q || undefined, where: where || undefined },
                      })
                    }
                    className="flex h-14 w-14 items-center justify-center rounded-full bg-blue-500 text-white shadow-md transition hover:bg-blue-600"
                  >
                    <i className="fa-solid fa-search text-lg"></i>
                  </button>
                </div>
              </div>
            </div>

            <div className="mt-4 flex items-center justify-center space-x-4">
              <button
                type="button"
                onClick={() => push({ pathname: '/search', query: { lat: 36.8578, lng: 11.092, radiusKm: 10 } })}
                className="flex items-center text-sm text-gray-600 transition hover:text-gray-900"
              >
                <i className="fa-solid fa-location-crosshairs mr-2 text-blue-500"></i>
                Use my current location
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* Categories Section - Only show 3 allowed categories */}
      <section id="categories" className="bg-gray-50 py-8">
        <div className="mx-auto max-w-7xl px-6">
          <h2 className="mb-6 text-2xl font-bold text-gray-900">Popular categories in Tunis</h2>

          <div className="grid grid-cols-3 gap-4">
            <Link
              href="/search?categorySlug=accommodation"
              className="group cursor-pointer rounded-xl border border-gray-200 bg-white p-6 transition hover:shadow-lg"
            >
              <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-blue-100 transition group-hover:bg-blue-500">
                <i className="fa-solid fa-house text-xl text-blue-500 transition group-hover:text-white"></i>
              </div>
              <h3 className="text-sm font-semibold text-gray-900">Accommodation</h3>
              <p className="mt-1 text-xs text-gray-500">Houses & Apartments</p>
            </Link>

            <Link
              href="/search?categorySlug=mobility"
              className="group cursor-pointer rounded-xl border border-gray-200 bg-white p-6 transition hover:shadow-lg"
            >
              <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-green-100 transition group-hover:bg-green-500">
                <i className="fa-solid fa-car text-xl text-green-500 transition group-hover:text-white"></i>
              </div>
              <h3 className="text-sm font-semibold text-gray-900">Mobility</h3>
              <p className="mt-1 text-xs text-gray-500">Vehicles & Scooters</p>
            </Link>

            <Link
              href="/search?categorySlug=water-beach-activities"
              className="group cursor-pointer rounded-xl border border-gray-200 bg-white p-6 transition hover:shadow-lg"
            >
              <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-orange-100 transition group-hover:bg-orange-500">
                <i className="fa-solid fa-water text-xl text-orange-500 transition group-hover:text-white"></i>
              </div>
              <h3 className="text-sm font-semibold text-gray-900">Water & Beach</h3>
              <p className="mt-1 text-xs text-gray-500">Activities & Equipment</p>
            </Link>
          </div>
        </div>
      </section>

      {/* Map Preview Section */}
      <section id="map-preview" className="bg-white py-12">
        <div className="mx-auto max-w-7xl px-6">
          <div className="mb-6 flex items-center justify-between">
            <h2 className="text-2xl font-bold text-gray-900">Available nearby</h2>
            <Link href="/map" className="flex items-center font-medium text-blue-500 transition hover:text-blue-600">
              View full map
              <i className="fa-solid fa-arrow-right ml-2"></i>
            </Link>
          </div>

          <div className="relative overflow-hidden rounded-2xl border border-gray-200 shadow-lg" style={{ height: '400px' }}>
            <img
              className="h-full w-full object-cover"
              src="https://storage.googleapis.com/uxpilot-auth.appspot.com/e61652dc21-cab20e8e19405eef87bb.png"
              alt="interactive map view of Tunis city with location pins showing rental items"
            />

            <div className="absolute top-4 left-4 flex items-center space-x-2 rounded-full bg-white px-4 py-2 shadow-md">
              <i className="fa-solid fa-filter text-gray-600"></i>
              <span className="text-sm font-medium">Filters</span>
            </div>

            <div className="absolute top-4 right-4 flex flex-col space-y-2">
              <button className="rounded-lg bg-white p-3 shadow-md transition hover:bg-gray-50">
                <i className="fa-solid fa-plus text-gray-700"></i>
              </button>
              <button className="rounded-lg bg-white p-3 shadow-md transition hover:bg-gray-50">
                <i className="fa-solid fa-minus text-gray-700"></i>
              </button>
              <button className="rounded-lg bg-white p-3 shadow-md transition hover:bg-gray-50">
                <i className="fa-solid fa-location-crosshairs text-gray-700"></i>
              </button>
            </div>

            {/* Sample map pins */}
            {data?.items?.slice(0, 5).map((listing, idx) => {
              const positions = [
                { top: '24%', left: '32%' },
                { top: '48%', left: '64%' },
                { top: '32%', right: '48%' },
                { bottom: '32%', left: '48%' },
                { bottom: '24%', right: '32%' },
              ];
              const pos = positions[idx % positions.length];
              return (
                <div
                  key={listing.id}
                  className="absolute cursor-pointer rounded-full bg-blue-500 px-3 py-1 text-sm font-medium text-white shadow-lg transition hover:bg-blue-600"
                  style={pos}
                >
                  {formatTnd(listing.pricePerDay)}/day
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Featured Listings Section */}
      <section id="featured-listings" className="bg-gray-50 py-12">
        <div className="mx-auto max-w-7xl px-6">
          <div className="mb-6 flex items-center justify-between">
            <h2 className="text-2xl font-bold text-gray-900">Recommended for you</h2>
            <Link href="/search" className="font-medium text-blue-500 transition hover:text-blue-600">
              View all
            </Link>
          </div>

          {isLoading ? (
            <div className="grid grid-cols-4 gap-6">
              {Array.from({ length: 4 }).map((_, i) => (
                <LoadingCard key={i} />
              ))}
            </div>
          ) : isError ? (
            <InlineError
              message="Failed to load listings. Please check your connection and try again."
              onRetry={() => void push(router.asPath)}
            />
          ) : featuredListings.length > 0 ? (
            <div className="grid grid-cols-4 gap-6">
              {featuredListings.map((listing) => (
                <Link
                  key={listing.id}
                  href={`/listings/${listing.id}`}
                  className="group cursor-pointer overflow-hidden rounded-xl border border-gray-200 bg-white transition hover:shadow-lg"
                >
                  <div className="relative h-48 overflow-hidden">
                    {listing.images?.[0] ? (
                      <img className="h-full w-full object-cover" src={listing.images[0]} alt={listing.title} />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center bg-gray-100 text-gray-400">
                        <i className="fa-solid fa-image text-3xl"></i>
                      </div>
                    )}
                    <button className="absolute top-3 right-3 flex h-8 w-8 items-center justify-center rounded-full bg-white shadow-md transition hover:scale-110">
                      <i className="fa-regular fa-heart text-gray-700"></i>
                    </button>
                  </div>
                  <div className="p-4">
                    <div className="mb-2 flex items-center justify-between">
                      <h3 className="font-semibold text-gray-900">{listing.title}</h3>
                      <div className="flex items-center">
                        <i className="fa-solid fa-star text-xs text-yellow-400"></i>
                        <span className="ml-1 text-sm font-medium">4.8</span>
                      </div>
                    </div>
                    <p className="mb-2 text-sm text-gray-600">{listing.address?.split(',')[0] || 'Tunis'}</p>
                    <p className="mb-3 text-sm text-gray-500">{listing.category?.name || 'Item'}</p>
                    <div className="flex items-baseline">
                      <span className="text-lg font-bold text-gray-900">{formatTnd(listing.pricePerDay)}</span>
                      <span className="ml-1 text-sm text-gray-500">/day</span>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          ) : (
            <EmptyState
              icon="fa-solid fa-magnifying-glass"
              title="No listings found"
              message="Try a different search or broaden the area."
              cta={{ label: 'Browse all', href: '/search' }}
            />
          )}
        </div>
      </section>

      {/* How It Works Section */}
      <section id="how-it-works" className="bg-white py-16">
        <div className="mx-auto max-w-7xl px-6">
          <div className="mb-12 text-center">
            <h2 className="mb-3 text-3xl font-bold text-gray-900">How it works</h2>
            <p className="text-lg text-gray-600">Rent or offer items in three simple steps</p>
          </div>

          <div className="grid grid-cols-3 gap-12">
            <div className="text-center">
              <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-blue-100">
                <i className="fa-solid fa-search text-2xl text-blue-500"></i>
              </div>
              <h3 className="mb-2 text-xl font-semibold text-gray-900">Search & Discover</h3>
              <p className="text-gray-600">Find what you need nearby using our smart search or explore the map</p>
            </div>

            <div className="text-center">
              <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-green-100">
                <i className="fa-solid fa-calendar-check text-2xl text-green-500"></i>
              </div>
              <h3 className="mb-2 text-xl font-semibold text-gray-900">Book Instantly</h3>
              <p className="text-gray-600">Select your dates, confirm the booking, and connect with the host</p>
            </div>

            <div className="text-center">
              <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-purple-100">
                <i className="fa-solid fa-handshake text-2xl text-purple-500"></i>
              </div>
              <h3 className="mb-2 text-xl font-semibold text-gray-900">Rent & Enjoy</h3>
              <p className="text-gray-600">Pick up the item, use it, and return it when done. Rate your experience</p>
            </div>
          </div>
        </div>
      </section>
    </Layout>
  );
}
