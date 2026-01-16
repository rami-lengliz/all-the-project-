import Link from 'next/link';
import { HostLayout } from '@/components/host/HostLayout';
import { useAuth } from '@/lib/auth/AuthProvider';
import { useMyBookings } from '@/lib/api/hooks/useMyBookings';
import { useConfirmBooking } from '@/lib/api/hooks/useConfirmBooking';
import { formatTnd } from '@/lib/utils/format';
import { LoadingCard } from '@/components/ui/LoadingCard';
import { InlineError } from '@/components/ui/InlineError';
import { EmptyState } from '@/components/ui/EmptyState';

export default function HostBookingsPage() {
  const { user } = useAuth();
  const meId = user?.id;
  const bookingsQuery = useMyBookings();
  const confirm = useConfirmBooking();

  const allBookings = (bookingsQuery.data as any) ?? [];
  const hostBookings = meId
    ? allBookings.filter((b: any) => b.host?.id === meId || b.hostId === meId || b.listing?.host?.id === meId)
    : [];

  return (
    <HostLayout activeTab="bookings" title="Bookings" subtitle="Review and manage incoming reservations">
      <section id="bookings-overview" className="py-6">
        <div className="max-w-7xl mx-auto px-6">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-2xl font-bold text-gray-900">Recent Bookings</h2>
            <Link href="/host/dashboard" className="text-blue-500 font-medium hover:text-blue-600 text-sm">
              ← Back to dashboard
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
              hostBookings.map((b: any) => {
                const renterName = b.renter?.name ?? '—';
                const listingTitle = b.listing?.title ?? '—';
                const isPending = b.status === 'pending';
                const isActive = b.status === 'confirmed';
                const isCompleted = b.status === 'completed';
                const badge =
                  isPending
                    ? 'bg-orange-100 text-orange-700'
                    : isActive
                      ? 'bg-blue-100 text-blue-700'
                      : isCompleted
                        ? 'bg-gray-200 text-gray-700'
                        : 'bg-green-100 text-green-700';
                const badgeText = isPending ? 'Pending' : isActive ? 'Active' : isCompleted ? 'Completed' : 'Upcoming';

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

                    {isPending ? (
                      <div className="flex items-center space-x-3 mt-6 pt-4 border-t border-gray-200">
                        <button
                          className="flex-1 bg-green-500 hover:bg-green-600 text-white py-2 rounded-lg text-sm font-medium transition disabled:opacity-60"
                          onClick={() => confirm.mutate(b.id)}
                          disabled={confirm.isPending}
                        >
                          {confirm.isPending ? 'Accepting…' : 'Accept booking'}
                        </button>
                        <button className="flex-1 border border-gray-300 hover:bg-gray-50 text-gray-700 py-2 rounded-lg text-sm font-medium transition">
                          Decline
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-center space-x-3 mt-6 pt-4 border-t border-gray-200">
                        <button className="flex-1 bg-blue-500 hover:bg-blue-600 text-white py-2 rounded-lg text-sm font-medium transition">
                          Message renter
                        </button>
                        <button className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition">
                          <i className="fa-solid fa-ellipsis-vertical text-gray-600" />
                        </button>
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>

          {confirm.isError ? <div className="mt-4"><InlineError title="Could not confirm booking" message="Please try again." /></div> : null}
        </div>
      </section>
    </HostLayout>
  );
}

