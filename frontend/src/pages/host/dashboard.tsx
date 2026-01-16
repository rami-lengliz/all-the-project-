import Link from 'next/link';
import { HostLayout } from '@/components/host/HostLayout';
import { useAuth } from '@/lib/auth/AuthProvider';
import { useListings } from '@/lib/api/hooks/useListings';
import { useMyBookings } from '@/lib/api/hooks/useMyBookings';
import { formatTnd } from '@/lib/utils/format';
import { LoadingCard } from '@/components/ui/LoadingCard';
import { InlineError } from '@/components/ui/InlineError';
import { EmptyState } from '@/components/ui/EmptyState';

export default function HostDashboardPage() {
  const { user } = useAuth();
  const meId = user?.id;
  const listingsQuery = useListings({ limit: 50, page: 1, sortBy: 'date' });
  const bookingsQuery = useMyBookings();

  const allListings = (listingsQuery.data as any)?.items ?? [];
  const myListings = meId ? allListings.filter((l: any) => l.host?.id === meId || l.hostId === meId) : [];

  const allBookings = (bookingsQuery.data as any) ?? [];
  const hostBookings = meId
    ? allBookings.filter((b: any) => b.host?.id === meId || b.hostId === meId || b.listing?.host?.id === meId)
    : [];

  const activeBookings = hostBookings.filter((b: any) => b.status === 'confirmed' || b.status === 'pending');
  const totalEarnings = hostBookings
    .filter((b: any) => b.paid)
    .reduce((sum: number, b: any) => sum + Number(b.totalPrice ?? 0) - Number(b.commission ?? 0), 0);

  return (
    <HostLayout
      activeTab="dashboard"
      title={`Welcome back, ${user?.name ?? 'Host'}`}
      subtitle="Manage your listings and track your rental activity"
    >
      <section id="earnings-summary" className="py-8">
        <div className="max-w-7xl mx-auto px-6">
          <div className="grid grid-cols-4 gap-6">
            <div id="earnings-card-total" className="bg-white rounded-xl p-6 border border-gray-200 shadow-sm">
              <div className="flex items-center justify-between mb-4">
                <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center">
                  <i className="fa-solid fa-coins text-green-600 text-xl" />
                </div>
                <span className="text-xs text-green-600 font-semibold bg-green-50 px-2 py-1 rounded-full">+0%</span>
              </div>
              <h3 className="text-gray-600 text-sm mb-1">Total Earnings</h3>
              <p className="text-3xl font-bold text-gray-900">{formatTnd(totalEarnings)}</p>
              <p className="text-xs text-gray-500 mt-2">This month</p>
            </div>

            <div id="earnings-card-bookings" className="bg-white rounded-xl p-6 border border-gray-200 shadow-sm">
              <div className="flex items-center justify-between mb-4">
                <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center">
                  <i className="fa-solid fa-calendar-check text-blue-600 text-xl" />
                </div>
                <span className="text-xs text-blue-600 font-semibold bg-blue-50 px-2 py-1 rounded-full">
                  +{activeBookings.length}
                </span>
              </div>
              <h3 className="text-gray-600 text-sm mb-1">Active Bookings</h3>
              <p className="text-3xl font-bold text-gray-900">{activeBookings.length}</p>
              <p className="text-xs text-gray-500 mt-2">Currently rented</p>
            </div>

            <div id="earnings-card-listings" className="bg-white rounded-xl p-6 border border-gray-200 shadow-sm">
              <div className="flex items-center justify-between mb-4">
                <div className="w-12 h-12 bg-purple-100 rounded-lg flex items-center justify-center">
                  <i className="fa-solid fa-layer-group text-purple-600 text-xl" />
                </div>
                <span className="text-xs text-gray-500 font-medium">{myListings.length} active</span>
              </div>
              <h3 className="text-gray-600 text-sm mb-1">Your Listings</h3>
              <p className="text-3xl font-bold text-gray-900">{myListings.length}</p>
              <p className="text-xs text-gray-500 mt-2">0 paused</p>
            </div>

            <div id="earnings-card-rating" className="bg-white rounded-xl p-6 border border-gray-200 shadow-sm">
              <div className="flex items-center justify-between mb-4">
                <div className="w-12 h-12 bg-yellow-100 rounded-lg flex items-center justify-center">
                  <i className="fa-solid fa-star text-yellow-500 text-xl" />
                </div>
                <span className="text-xs text-gray-500 font-medium">— reviews</span>
              </div>
              <h3 className="text-gray-600 text-sm mb-1">Average Rating</h3>
              <p className="text-3xl font-bold text-gray-900">—</p>
              <p className="text-xs text-gray-500 mt-2">Excellent host</p>
            </div>
          </div>
        </div>
      </section>

      <section id="listings-overview" className="py-6">
        <div className="max-w-7xl mx-auto px-6">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-2xl font-bold text-gray-900">Your Listings</h2>
            <div className="flex items-center space-x-3">
              <div className="relative">
                <input
                  type="text"
                  placeholder="Search listings..."
                  className="pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                  disabled
                />
                <i className="fa-solid fa-search absolute left-3 top-3 text-gray-400 text-sm" />
              </div>
              <button className="flex items-center space-x-2 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition text-sm font-medium">
                <i className="fa-solid fa-filter text-gray-600" />
                <span>Filter</span>
              </button>
            </div>
          </div>

          {listingsQuery.isError ? (
            <InlineError message="Failed to load your listings." onRetry={() => void listingsQuery.refetch()} />
          ) : listingsQuery.isLoading ? (
            <LoadingCard variant="table" rows={5} columns={7} />
          ) : myListings.length === 0 ? (
            <EmptyState icon="fa-solid fa-layer-group" title="No listings yet" message="Create your first listing to start hosting." cta={{ label: 'Create new listing', href: '/host/create' }} />
          ) : (
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="text-left px-6 py-4 text-xs font-semibold text-gray-600 uppercase">Listing</th>
                    <th className="text-left px-6 py-4 text-xs font-semibold text-gray-600 uppercase">Status</th>
                    <th className="text-left px-6 py-4 text-xs font-semibold text-gray-600 uppercase">Price/Day</th>
                    <th className="text-left px-6 py-4 text-xs font-semibold text-gray-600 uppercase">Bookings</th>
                    <th className="text-left px-6 py-4 text-xs font-semibold text-gray-600 uppercase">Earnings</th>
                    <th className="text-left px-6 py-4 text-xs font-semibold text-gray-600 uppercase">Rating</th>
                    <th className="text-right px-6 py-4 text-xs font-semibold text-gray-600 uppercase">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {myListings.slice(0, 5).map((l: any) => {
                      const statusActive = l.isActive !== false;
                      const bookingsCount = hostBookings.filter((b: any) => (b.listing?.id ?? b.listingId) === l.id)
                        .length;
                      const earnings = hostBookings
                        .filter((b: any) => (b.listing?.id ?? b.listingId) === l.id && b.paid)
                        .reduce((sum: number, b: any) => sum + Number(b.totalPrice ?? 0) - Number(b.commission ?? 0), 0);

                      return (
                        <tr key={l.id} className="hover:bg-gray-50 transition">
                          <td className="px-6 py-4">
                            <div className="flex items-center space-x-3">
                              <div className="w-16 h-16 rounded-lg overflow-hidden flex-shrink-0 bg-gray-200 flex items-center justify-center">
                                {l.images?.[0] ? (
                                  // eslint-disable-next-line @next/next/no-img-element
                                  <img src={l.images[0]} alt={l.title} className="w-full h-full object-cover" />
                                ) : (
                                  <i className="fa-solid fa-image text-gray-400 text-2xl" />
                                )}
                              </div>
                              <div>
                                <p className="font-semibold text-gray-900">{l.title}</p>
                                <p className="text-sm text-gray-500">{l.address}</p>
                              </div>
                            </div>
                          </td>
                          <td className="px-6 py-4">
                            {statusActive ? (
                              <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-green-100 text-green-700">
                                <span className="w-1.5 h-1.5 bg-green-500 rounded-full mr-2" />
                                Active
                              </span>
                            ) : (
                              <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-gray-200 text-gray-700">
                                <span className="w-1.5 h-1.5 bg-gray-500 rounded-full mr-2" />
                                Paused
                              </span>
                            )}
                          </td>
                          <td className="px-6 py-4">
                            <p className="font-semibold text-gray-900">{formatTnd(Number(l.pricePerDay ?? 0))}</p>
                          </td>
                          <td className="px-6 py-4">
                            <p className="font-medium text-gray-900">{bookingsCount}</p>
                            <p className="text-xs text-gray-500">This month</p>
                          </td>
                          <td className="px-6 py-4">
                            <p className="font-semibold text-gray-900">{formatTnd(earnings)}</p>
                          </td>
                          <td className="px-6 py-4">
                            <div className="flex items-center">
                              <i className="fa-solid fa-star text-yellow-400 text-sm mr-1" />
                              <span className="font-medium text-gray-900">—</span>
                            </div>
                          </td>
                          <td className="px-6 py-4">
                            <div className="flex items-center justify-end space-x-2">
                              <Link href={`/listings/${l.id}`} className="p-2 hover:bg-gray-100 rounded-lg transition">
                                <i className="fa-solid fa-pen text-gray-600 text-sm" />
                              </Link>
                              <button className="p-2 hover:bg-gray-100 rounded-lg transition" type="button">
                                <i className="fa-solid fa-pause text-gray-600 text-sm" />
                              </button>
                              <button className="p-2 hover:bg-gray-100 rounded-lg transition" type="button">
                                <i className="fa-solid fa-ellipsis-vertical text-gray-600 text-sm" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                </tbody>
              </table>
            </div>
          </div>
          )}

          <div className="mt-4">
            <Link href="/host/listings" className="text-blue-500 font-medium hover:text-blue-600 text-sm">
              View all listings
            </Link>
          </div>
        </div>
      </section>

      <section id="bookings-overview" className="py-6">
        <div className="max-w-7xl mx-auto px-6">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-2xl font-bold text-gray-900">Recent Bookings</h2>
            <Link href="/host/bookings" className="text-blue-500 font-medium hover:text-blue-600 text-sm">
              View all bookings
            </Link>
          </div>

          <div className="grid grid-cols-2 gap-6">
            {bookingsQuery.isError ? (
              <div className="col-span-2">
                <InlineError message="Failed to load bookings." onRetry={() => void bookingsQuery.refetch()} />
              </div>
            ) : bookingsQuery.isLoading ? (
              <>
                <LoadingCard />
                <LoadingCard />
              </>
            ) : hostBookings.length === 0 ? (
              <div className="col-span-2">
                <EmptyState icon="fa-solid fa-calendar-check" title="No bookings yet" message="Bookings will appear here once renters request your listings." />
              </div>
            ) : (
              hostBookings.slice(0, 4).map((b: any) => {
                const renterName = b.renter?.name ?? '—';
                const listingTitle = b.listing?.title ?? '—';
                const badge =
                  b.status === 'pending'
                    ? 'bg-orange-100 text-orange-700'
                    : b.status === 'confirmed'
                      ? 'bg-blue-100 text-blue-700'
                      : b.status === 'completed'
                        ? 'bg-gray-200 text-gray-700'
                        : 'bg-green-100 text-green-700';
                const badgeText =
                  b.status === 'pending'
                    ? 'Pending'
                    : b.status === 'confirmed'
                      ? 'Active'
                      : b.status === 'completed'
                        ? 'Completed'
                        : 'Upcoming';

                return (
                  <div key={b.id} className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
                    <div className="flex items-start justify-between mb-4">
                      <div className="flex items-center space-x-3">
                        <div className="w-12 h-12 rounded-full overflow-hidden bg-gray-200" />
                        <div>
                          <p className="font-semibold text-gray-900">{renterName}</p>
                          <p className="text-sm text-gray-500">Renting: {listingTitle}</p>
                        </div>
                      </div>
                      <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-medium ${badge}`}>
                        {badgeText}
                      </span>
                    </div>

                    <div className="space-y-3">
                      <div className="flex items-center text-sm">
                        <i className="fa-solid fa-calendar text-gray-400 w-5" />
                        <span className="text-gray-600 ml-2">
                          {b.startDate} - {b.endDate}
                        </span>
                      </div>
                      <div className="flex items-center text-sm">
                        <i className="fa-solid fa-coins text-gray-400 w-5" />
                        <span className="text-gray-600 ml-2">{formatTnd(Number(b.totalPrice ?? 0))} total</span>
                      </div>
                    </div>

                    <div className="flex items-center space-x-3 mt-6 pt-4 border-t border-gray-200">
                      <button className="flex-1 bg-blue-500 hover:bg-blue-600 text-white py-2 rounded-lg text-sm font-medium transition">
                        Message renter
                      </button>
                      <button className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition">
                        <i className="fa-solid fa-ellipsis-vertical text-gray-600" />
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </section>
    </HostLayout>
  );
}

