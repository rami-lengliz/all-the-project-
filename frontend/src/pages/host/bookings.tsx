import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { HostLayout } from '@/components/host/HostLayout';
import { useAuth } from '@/lib/auth/AuthProvider';
import { useMyBookings } from '@/lib/api/hooks/useMyBookings';
import { useConfirmBooking } from '@/lib/api/hooks/useConfirmBooking';
import { useRejectBooking } from '@/lib/api/hooks/useRejectBooking';
import { useBookingReviews } from '@/lib/api/hooks/useBookingReviews';
import { ReviewModal } from '@/components/shared/ReviewModal';
import { createConversation } from '@/lib/api/chat';
import { formatTnd } from '@/lib/utils/format';
import { LoadingCard } from '@/components/ui/LoadingCard';
import { InlineError } from '@/components/ui/InlineError';
import { EmptyState } from '@/components/ui/EmptyState';
import { toast } from '@/components/ui/Toaster';
import { TrustBadge } from '@/components/shared/TrustBadge';

function ReviewButton({
  bookingId,
  myId,
  renterName,
  onReview,
}: {
  bookingId: string;
  myId: string | undefined;
  renterName: string;
  onReview: () => void;
}) {
  const reviewsQ = useBookingReviews(bookingId);
  const reviews: any[] = reviewsQ.data ?? [];
  const alreadyReviewed = reviews.some((r: any) => r.authorId === myId);
  if (alreadyReviewed) {
    return (
      <span className="flex items-center gap-1 text-xs text-gray-400 font-medium">
        <i className="fa-solid fa-star text-yellow-400" /> Reviewed
      </span>
    );
  }
  return (
    <button
      onClick={onReview}
      className="flex-1 border border-yellow-400 hover:bg-yellow-50 text-yellow-700 text-sm font-medium py-2 rounded-lg transition text-center"
    >
      <i className="fa-solid fa-star mr-1" />
      Review renter
    </button>
  );
}

export default function HostBookingsPage() {
  const router = useRouter();
  const { user } = useAuth();
  const meId = user?.id;
  const bookingsQuery = useMyBookings();
  const confirm = useConfirmBooking();
  const reject = useRejectBooking();
  const [creatingFor, setCreatingFor] = useState<string | null>(null);
  const [reviewBookingId, setReviewBookingId] = useState<string | null>(null);

  const allBookingsFlat = (bookingsQuery.data as any) ?? [];
  const reviewBooking = allBookingsFlat.find((b: any) => b.id === reviewBookingId);

  const errorMessage = (e: any): string => {
    const body = e?.body ?? e?.response?.data;
    const msg = body?.error?.message ?? body?.message ?? e?.message;
    if (Array.isArray(msg)) return msg.join(', ');
    return msg ? String(msg) : 'Please try again.';
  };

  const handleAccept = async (id: string) => {
    try {
      await confirm.mutateAsync(id);
      toast({
        title: 'Booking accepted',
        message: 'The renter can now pay to confirm the dates.',
        variant: 'success',
      });
    } catch (e: any) {
      toast({
        title: 'Could not accept booking',
        message: errorMessage(e),
        variant: 'error',
      });
    }
  };

  const handleReject = async (id: string) => {
    try {
      await reject.mutateAsync(id);
      toast({
        title: 'Booking declined',
        message: 'The renter has been notified.',
        variant: 'info',
      });
    } catch (e: any) {
      toast({
        title: 'Could not decline booking',
        message: errorMessage(e),
        variant: 'error',
      });
    }
  };

  /** Navigate to the conversation thread, creating one if needed */
  const goToChat = async (b: any) => {
    if (b.conversationId) {
      router.push(`/messages/${b.conversationId}`);
      return;
    }
    try {
      setCreatingFor(b.id);
      const renterId = b.renter?.id ?? b.renterId;
      if (!renterId) { router.push('/messages'); return; }
      const conv = await createConversation(renterId, b.id, b.listing?.id);
      router.push(`/messages/${conv.id}`);
    } catch {
      router.push('/messages');
    } finally {
      setCreatingFor(null);
    }
  };

  const allBookings = allBookingsFlat;
  const hostBookings = meId
    ? allBookings.filter(
        (b: any) =>
          b.host?.id === meId ||
          b.hostId === meId ||
          b.listing?.host?.id === meId,
      )
    : [];

  return (
    <HostLayout
      activeTab="bookings"
      title="Bookings"
      subtitle="Review and manage incoming reservations"
    >
      {reviewBookingId && reviewBooking && (
        <ReviewModal
          bookingId={reviewBookingId}
          targetName={reviewBooking.renter?.name ?? 'Renter'}
          role="host"
          onClose={() => setReviewBookingId(null)}
          onSuccess={() => void bookingsQuery.refetch()}
        />
      )}
      <section id="bookings-overview" className="py-6">
        <div className="max-w-7xl mx-auto px-6">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-2xl font-bold text-gray-900">
              Recent Bookings
            </h2>
            <Link
              href="/host/dashboard"
              className="text-blue-500 font-medium hover:text-blue-600 text-sm"
            >
              ← Back to dashboard
            </Link>
          </div>

          <div className="grid grid-cols-2 gap-6">
            {bookingsQuery.isError ? (
              <div className="col-span-2">
                <InlineError
                  message="Failed to load bookings."
                  onRetry={() => void bookingsQuery.refetch()}
                />
              </div>
            ) : bookingsQuery.isLoading ? (
              <>
                <LoadingCard />
                <LoadingCard />
              </>
            ) : hostBookings.length === 0 ? (
              <div className="col-span-2">
                <EmptyState
                  icon="fa-solid fa-calendar-check"
                  title="No bookings yet"
                  message="Bookings will appear here once renters request your listings."
                />
              </div>
            ) : (
              hostBookings.map((b: any) => {
                const renterName = b.renter?.name ?? '—';
                const listingTitle = b.listing?.title ?? '—';
                const isPending = b.status === 'pending';
                const isActive = b.status === 'confirmed';
                const isCompleted = b.status === 'completed';
                const badge = isPending
                  ? 'bg-orange-100 text-orange-700'
                  : isActive
                    ? 'bg-blue-100 text-blue-700'
                    : isCompleted
                      ? 'bg-gray-200 text-gray-700'
                      : 'bg-green-100 text-green-700';
                const badgeText = isPending
                  ? 'Pending'
                  : isActive
                    ? 'Active'
                    : isCompleted
                      ? 'Completed'
                      : 'Upcoming';

                return (
                  <div
                    key={b.id}
                    className="bg-white rounded-xl border border-gray-200 shadow-sm p-6"
                  >
                    <div className="flex items-start justify-between mb-4">
                      <div className="flex items-center space-x-3">
                        <div className="w-12 h-12 rounded-full overflow-hidden bg-gray-200" />
                        <div>
                          <div className="flex items-center gap-2">
                            <p className="font-semibold text-gray-900">
                              {renterName}
                            </p>
                            {typeof (b as any).renter?.renterTrustScore === 'number' ? (
                              <TrustBadge
                                score={(b as any).renter.renterTrustScore}
                                role="RENTER"
                              />
                            ) : null}
                          </div>
                          <p className="text-sm text-gray-500">
                            Renting: {listingTitle}
                          </p>
                        </div>
                      </div>
                      <span
                        className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-medium ${badge}`}
                      >
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
                        <span className="text-gray-600 ml-2">
                          {formatTnd(Number(b.totalPrice ?? 0))} total
                        </span>
                      </div>
                    </div>

                    {isPending ? (
                      <div className="flex items-center space-x-3 mt-6 pt-4 border-t border-gray-200">
                        <button
                          className="flex-1 bg-green-500 hover:bg-green-600 text-white py-2 rounded-lg text-sm font-medium transition disabled:opacity-60"
                          onClick={() => void handleAccept(b.id)}
                          disabled={confirm.isPending}
                        >
                          {confirm.isPending ? 'Accepting…' : 'Accept booking'}
                        </button>
                        <button
                          className="flex-1 border border-red-300 hover:bg-red-50 text-red-600 py-2 rounded-lg text-sm font-medium transition disabled:opacity-60"
                          onClick={() => void handleReject(b.id)}
                          disabled={reject.isPending}
                        >
                          {reject.isPending ? 'Declining…' : 'Decline'}
                        </button>
                        <button
                          onClick={() => void goToChat(b)}
                          disabled={creatingFor === b.id}
                          className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition text-sm disabled:opacity-60"
                        >
                          {creatingFor === b.id
                            ? <i className="fa-solid fa-spinner fa-spin text-gray-600" />
                            : <i className="fa-solid fa-message text-gray-600" />}
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-center space-x-3 mt-6 pt-4 border-t border-gray-200">
                        <button
                          onClick={() => void goToChat(b)}
                          disabled={creatingFor === b.id}
                          className="flex-1 bg-blue-500 hover:bg-blue-600 disabled:bg-blue-300 text-white py-2 rounded-lg text-sm font-medium transition text-center"
                        >
                          {creatingFor === b.id ? (
                            <><i className="fa-solid fa-spinner fa-spin mr-2" />Opening…</>
                          ) : (
                            <><i className="fa-solid fa-message mr-2" />Message renter</>
                          )}
                        </button>
                        {isCompleted && (
                          <ReviewButton
                            bookingId={b.id}
                            myId={meId}
                            renterName={renterName}
                            onReview={() => setReviewBookingId(b.id)}
                          />
                        )}
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

          {confirm.isError ? (
            <div className="mt-4">
              <InlineError
                title="Could not confirm booking"
                message="Please try again."
              />
            </div>
          ) : null}
        </div>
      </section>
    </HostLayout>
  );
}
