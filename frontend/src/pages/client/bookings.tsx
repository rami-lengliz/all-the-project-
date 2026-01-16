import { useMemo, useState } from 'react';
import Link from 'next/link';
import { ClientLayout } from '@/components/client/ClientLayout';
import { useMyBookings } from '@/lib/api/hooks/useMyBookings';
import { formatTnd } from '@/lib/utils/format';
import { InlineError } from '@/components/ui/InlineError';
import { EmptyState } from '@/components/ui/EmptyState';
import { LoadingCard } from '@/components/ui/LoadingCard';

type TabKey = 'current' | 'past' | 'cancelled';

export default function ClientBookingsPage() {
  const query = useMyBookings();
  const [tab, setTab] = useState<TabKey>('current');

  const bookings = useMemo(() => ((query.data as any) ?? []) as any[], [query.data]);
  const current = bookings.filter((b) => b.status === 'pending' || b.status === 'confirmed');
  const past = bookings.filter((b) => b.status === 'completed');
  const cancelled = bookings.filter((b) => b.status === 'cancelled');

  const activeList = tab === 'current' ? current : tab === 'past' ? past : cancelled;

  return (
    <ClientLayout>
      <section id="page-header" className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-6 py-8">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-gray-900 mb-2">My Rentals</h1>
              <p className="text-gray-600">Track your current bookings and rental history</p>
            </div>
            <Link
              href="/search"
              className="bg-blue-500 hover:bg-blue-600 text-white font-medium px-6 py-3 rounded-lg transition flex items-center"
            >
              <i className="fa-solid fa-search mr-2" />
              Browse rentals
            </Link>
          </div>
        </div>
      </section>

      <section id="tabs-navigation" className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-6">
          <div className="flex space-x-8">
            <button
              className={
                tab === 'current'
                  ? 'py-4 px-2 border-b-2 border-blue-500 text-blue-500 font-medium text-sm'
                  : 'py-4 px-2 border-b-2 border-transparent text-gray-600 hover:text-gray-900 font-medium text-sm'
              }
              onClick={() => setTab('current')}
            >
              Current bookings ({current.length})
            </button>
            <button
              className={
                tab === 'past'
                  ? 'py-4 px-2 border-b-2 border-blue-500 text-blue-500 font-medium text-sm'
                  : 'py-4 px-2 border-b-2 border-transparent text-gray-600 hover:text-gray-900 font-medium text-sm'
              }
              onClick={() => setTab('past')}
            >
              Past rentals ({past.length})
            </button>
            <button
              className={
                tab === 'cancelled'
                  ? 'py-4 px-2 border-b-2 border-blue-500 text-blue-500 font-medium text-sm'
                  : 'py-4 px-2 border-b-2 border-transparent text-gray-600 hover:text-gray-900 font-medium text-sm'
              }
              onClick={() => setTab('cancelled')}
            >
              Cancelled
            </button>
          </div>
        </div>
      </section>

      <main id="main-content" className="max-w-7xl mx-auto px-6 py-8">
        {query.isError ? <InlineError message="Failed to load bookings." onRetry={() => void query.refetch()} /> : null}

        <div id="current-bookings" className="space-y-6">
          {query.isLoading ? (
            <div className="space-y-6">
              {Array.from({ length: 2 }).map((_, i) => (
                <LoadingCard key={i} />
              ))}
            </div>
          ) : activeList.length === 0 ? (
            <EmptyState
              icon="fa-solid fa-calendar-check"
              title="No bookings yet"
              message="Browse rentals and make your first booking."
              cta={{ label: 'Browse rentals', href: '/search' }}
            />
          ) : (
            activeList.map((b) => {
              const listing = b.listing;
              const title = listing?.title ?? '—';
              const address = listing?.address ?? '';
              const image = listing?.images?.[0];

              const statusPill =
                b.status === 'confirmed'
                  ? 'bg-green-100 text-green-700'
                  : b.status === 'pending'
                    ? 'bg-blue-100 text-blue-700'
                    : b.status === 'completed'
                      ? 'bg-gray-800 bg-opacity-80 text-white'
                      : 'bg-red-100 text-red-700';

              const statusText =
                b.status === 'confirmed'
                  ? 'Confirmed'
                  : b.status === 'pending'
                    ? 'Upcoming'
                    : b.status === 'completed'
                      ? 'Completed'
                      : 'Cancelled';

              return (
                <div key={b.id} className="bg-white rounded-xl border border-gray-200 overflow-hidden hover:shadow-lg transition">
                  <div className="flex">
                    <div className="w-72 h-56 overflow-hidden bg-gray-200 flex items-center justify-center">
                      {image ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={image} alt={title} className="w-full h-full object-cover" />
                      ) : (
                        <i className="fa-solid fa-image text-gray-400 text-3xl" />
                      )}
                    </div>

                    <div className="flex-1 p-6">
                      <div className="flex items-start justify-between mb-4">
                        <div>
                          <div className="flex items-center space-x-2 mb-2">
                            <span className={`${statusPill} text-xs font-semibold px-3 py-1 rounded-full`}>{statusText}</span>
                            <span className="text-sm text-gray-500">Booking ID: #{String(b.id).slice(0, 8).toUpperCase()}</span>
                          </div>
                          <h3 className="text-xl font-bold text-gray-900 mb-1">{title}</h3>
                          <p className="text-gray-600 flex items-center">
                            <i className="fa-solid fa-location-dot text-blue-500 mr-2" />
                            {address || 'Tunisia'}
                          </p>
                        </div>
                        <button className="text-gray-400 hover:text-gray-600">
                          <i className="fa-solid fa-ellipsis-vertical text-xl" />
                        </button>
                      </div>

                      <div className="grid grid-cols-3 gap-4 mb-4">
                        <div>
                          <p className="text-xs text-gray-500 mb-1">Check-in</p>
                          <p className="font-semibold text-gray-900">{b.startDate}</p>
                          <p className="text-sm text-gray-600">—</p>
                        </div>
                        <div>
                          <p className="text-xs text-gray-500 mb-1">Check-out</p>
                          <p className="font-semibold text-gray-900">{b.endDate}</p>
                          <p className="text-sm text-gray-600">—</p>
                        </div>
                        <div>
                          <p className="text-xs text-gray-500 mb-1">Total price</p>
                          <p className="font-bold text-gray-900 text-lg">{formatTnd(Number(b.totalPrice ?? 0))}</p>
                          <p className="text-sm text-gray-600">{b.paid ? 'Paid' : 'Unpaid'}</p>
                        </div>
                      </div>

                      <div className="flex items-center space-x-3">
                        <button className="flex-1 bg-blue-500 hover:bg-blue-600 text-white font-medium py-2.5 px-4 rounded-lg transition">
                          <i className="fa-solid fa-message mr-2" />
                          Contact host
                        </button>
                        <Link
                          href={listing?.id ? `/listings/${listing.id}` : '/search'}
                          className="flex-1 border border-gray-300 hover:bg-gray-50 text-gray-700 font-medium py-2.5 px-4 rounded-lg transition text-center"
                        >
                          <i className="fa-solid fa-map-location-dot mr-2" />
                          View details
                        </Link>
                        <button className="border border-gray-300 hover:bg-gray-50 text-gray-700 font-medium py-2.5 px-4 rounded-lg transition">
                          <i className="fa-solid fa-share-nodes" />
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </main>
    </ClientLayout>
  );
}

