import { useMemo, useState } from 'react';
import { ClientLayout } from '@/components/client/ClientLayout';
import { useAuth } from '@/lib/auth/AuthProvider';
import { useReviewsByUser } from '@/lib/api/hooks/useReviewsByUser';
import { useMyBookings } from '@/lib/api/hooks/useMyBookings';
import { useCreateReview } from '@/lib/api/hooks/useCreateReview';
import { InlineError } from '@/components/ui/InlineError';
import { EmptyState } from '@/components/ui/EmptyState';
import { LoadingCard } from '@/components/ui/LoadingCard';

export default function ClientReviewsPage() {
  const { user } = useAuth();
  const userId = user?.id;

  const reviewsQuery = useReviewsByUser(userId);
  const bookingsQuery = useMyBookings();
  const createReview = useCreateReview();

  const reviews = useMemo(() => {
    const raw = reviewsQuery.data as any;
    return Array.isArray(raw) ? raw : raw?.items ?? [];
  }, [reviewsQuery.data]);

  const completedBookings = useMemo(() => {
    const bs = ((bookingsQuery.data as any) ?? []) as any[];
    return bs.filter((b) => b.status === 'completed');
  }, [bookingsQuery.data]);

  const [bookingId, setBookingId] = useState<string>('');
  const [rating, setRating] = useState<number>(5);
  const [comment, setComment] = useState<string>('');

  const canSubmit = Boolean(bookingId) && rating >= 1 && rating <= 5 && !createReview.isPending;

  return (
    <ClientLayout>
      <section id="reviews-section" className="bg-gray-50 py-12">
        <div className="max-w-7xl mx-auto px-6">
          <div className="flex items-center justify-between mb-8">
            <div>
              <h2 className="text-3xl font-bold text-gray-900 mb-2">Reviews</h2>
              <p className="text-gray-600">What others say about {user?.name ?? 'you'}</p>
            </div>
            <div className="flex items-center space-x-2">
              <button className="w-10 h-10 border border-gray-300 rounded-full flex items-center justify-center hover:bg-white transition">
                <i className="fa-solid fa-chevron-left text-gray-600" />
              </button>
              <button className="w-10 h-10 border border-gray-300 rounded-full flex items-center justify-center hover:bg-white transition">
                <i className="fa-solid fa-chevron-right text-gray-600" />
              </button>
            </div>
          </div>

          {/* Leave a review (styled like design cards) */}
          <div className="mb-6 bg-white rounded-xl p-6 border border-gray-200">
            <div className="flex items-start justify-between mb-4">
              <div>
                <h3 className="font-semibold text-gray-900">Leave a review</h3>
                <p className="text-sm text-gray-500">Select a completed booking and rate your experience</p>
              </div>
              <div className="flex items-center">
                <i className="fa-solid fa-star text-yellow-400 text-sm" />
                <span className="ml-1 font-semibold text-gray-900">{rating.toFixed(1)}</span>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div className="col-span-1">
                <label className="text-xs font-semibold text-gray-700 block mb-2">Booking</label>
                <select
                  className="w-full border border-gray-300 rounded-lg px-4 py-3 text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  value={bookingId}
                  onChange={(e) => setBookingId(e.target.value)}
                >
                  <option value="">Select booking</option>
                  {completedBookings.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.listing?.title ?? 'Listing'} ({String(b.id).slice(0, 6).toUpperCase()})
                    </option>
                  ))}
                </select>
              </div>

              <div className="col-span-1">
                <label className="text-xs font-semibold text-gray-700 block mb-2">Rating</label>
                <div className="flex items-center space-x-2">
                  {[1, 2, 3, 4, 5].map((n) => (
                    <button
                      key={n}
                      type="button"
                      className="w-10 h-10 border border-gray-300 rounded-full flex items-center justify-center hover:bg-gray-50 transition"
                      onClick={() => setRating(n)}
                    >
                      <i className={`fa-solid fa-star ${n <= rating ? 'text-yellow-400' : 'text-gray-300'}`} />
                    </button>
                  ))}
                </div>
              </div>

              <div className="col-span-1">
                <label className="text-xs font-semibold text-gray-700 block mb-2">Comment</label>
                <input
                  className="w-full border border-gray-300 rounded-lg px-4 py-3 text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Write a short comment..."
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                />
              </div>
            </div>

            {createReview.isError ? (
              <div className="mt-3 text-sm text-red-600">Could not submit review. Please try again.</div>
            ) : null}

            <div className="mt-4 flex justify-end">
              <button
                className="bg-blue-500 hover:bg-blue-600 text-white font-medium px-6 py-3 rounded-lg transition disabled:opacity-60"
                disabled={!canSubmit}
                onClick={() => createReview.mutate({ bookingId, rating, comment })}
              >
                Submit review
              </button>
            </div>
          </div>

          {reviewsQuery.isError ? (
            <div className="mb-4">
              <InlineError message="Failed to load reviews." onRetry={() => void reviewsQuery.refetch()} />
            </div>
          ) : null}

          <div className="grid grid-cols-3 gap-6">
            {reviewsQuery.isLoading ? (
              <>
                <LoadingCard />
                <LoadingCard />
                <LoadingCard />
              </>
            ) : reviews.length === 0 ? (
              <div className="col-span-3">
                <EmptyState icon="fa-solid fa-star" title="No reviews yet" message="Reviews will show up here once available." />
              </div>
            ) : (
              reviews.map((r: any) => (
                <div key={r.id} className="bg-white rounded-xl p-6 border border-gray-200">
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex items-center space-x-3">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={r.author?.avatarUrl ?? 'https://storage.googleapis.com/uxpilot-auth.appspot.com/avatars/avatar-5.jpg'}
                        alt="Reviewer"
                        className="w-12 h-12 rounded-full object-cover"
                      />
                      <div>
                        <h4 className="font-semibold text-gray-900">{r.author?.name ?? 'Reviewer'}</h4>
                        <p className="text-sm text-gray-500">{r.createdAt ? String(r.createdAt).slice(0, 10) : '—'}</p>
                      </div>
                    </div>
                    <div className="flex items-center">
                      <i className="fa-solid fa-star text-yellow-400 text-sm" />
                      <span className="ml-1 font-semibold text-gray-900">{Number(r.rating ?? 0).toFixed(1)}</span>
                    </div>
                  </div>
                  <p className="text-gray-700 leading-relaxed">“{r.comment ?? ''}”</p>
                  <div className="mt-4 pt-4 border-t border-gray-100">
                    <span className="text-sm text-gray-500">Rented: {r.booking?.listing?.title ?? '—'}</span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </section>
    </ClientLayout>
  );
}

