import Link from 'next/link';
import { Layout } from '@/components/layout/Layout';
import { useRouter } from 'next/router';
import { useState, useEffect } from 'react';
import { useCreateBooking } from '@/lib/api/hooks/useCreateBooking';
import { formatTnd } from '@/lib/utils/format';
import { useListing } from '@/lib/api/hooks/useListing';
import { InlineError } from '@/components/ui/InlineError';
import { EmptyState } from '@/components/ui/EmptyState';
import { LoadingCard } from '@/components/ui/LoadingCard';

export default function BookingPage() {
  const router = useRouter();
  const listingId = router.query.id as string | undefined;
  const [startDate, setStartDate] = useState(
    (router.query.startDate as string) || '',
  );
  const [endDate, setEndDate] = useState(
    (router.query.endDate as string) || '',
  );
  const [startTime, setStartTime] = useState(
    (router.query.startTime as string) || '',
  );
  const [endTime, setEndTime] = useState(
    (router.query.endTime as string) || '',
  );
  const [datesFromListing, setDatesFromListing] = useState(false);

  useEffect(() => {
    if (router.isReady) {
      if (router.query.startDate) setStartDate(router.query.startDate as string);
      if (router.query.endDate) setEndDate(router.query.endDate as string);
      if (router.query.startTime) setStartTime(router.query.startTime as string);
      if (router.query.endTime) setEndTime(router.query.endTime as string);
      if (router.query.startDate && router.query.endDate) setDatesFromListing(true);
    }
  }, [
    router.isReady,
    router.query.startDate,
    router.query.endDate,
    router.query.startTime,
    router.query.endTime,
  ]);

  const [message, setMessage] = useState('');
  const [acceptTerms, setAcceptTerms] = useState(false);
  const [acceptRules, setAcceptRules] = useState(false);
  const createBooking = useCreateBooking();
  const listingQuery = useListing(listingId);
  const listing = listingQuery.data as any;

  const isSlot = listing?.bookingType === 'SLOT';

  const handleCreateBooking = async () => {
    if (!listingId || !startDate || !endDate || !acceptTerms || !acceptRules)
      return;
    if (isSlot && (!startTime || !endTime)) return;
    try {
      await createBooking.mutateAsync({
        listingId,
        startDate,
        endDate,
        ...(isSlot && startTime ? { startTime } : {}),
        ...(isSlot && endTime ? { endTime } : {}),
        ...(message.trim() ? { message: message.trim() } : {}),
      });
    } catch (error) {
      // Error handled by InlineError component
    }
  };

  const calculateDays = () => {
    if (!startDate || !endDate) return 0;
    const start = new Date(startDate);
    const end = new Date(endDate);
    const diffTime = Math.abs(end.getTime() - start.getTime());
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24)) || 1;
  };

  const calculateSlots = () => {
    if (!isSlot || !startTime || !endTime) return 0;
    const slotDuration = Number(listing?.slotConfiguration?.slotDurationMinutes) || 60;
    const [sh, sm] = startTime.split(':').map(Number);
    const [eh, em] = endTime.split(':').map(Number);
    const startMin = sh * 60 + sm;
    const endMin = eh * 60 + em;
    if (endMin <= startMin) return 0;
    return Math.ceil((endMin - startMin) / slotDuration);
  };

  const days = calculateDays();
  const slots = calculateSlots();
  const unitPrice = isSlot
    ? Number(listing?.slotConfiguration?.pricePerSlot) || 0
    : Number(listing?.pricePerDay) || 0;
  const unitCount = isSlot ? slots : days;
  const basePrice = unitPrice * unitCount;
  const serviceFee = basePrice * 0.1;
  const insuranceFee = basePrice * 0.05;
  const subtotal = basePrice + serviceFee + insuranceFee;
  const taxes = subtotal * 0.1;
  const total = subtotal + taxes;

  const bookingErrorMessage = (() => {
    const err = createBooking.error as any;
    const body = err?.body;
    if (body && typeof body === 'object') {
      // Backend HttpExceptionFilter returns { success: false, error: { code, message } }
      const msg = body.error?.message || body.message;
      return Array.isArray(msg) ? msg.join(', ') : msg || 'Booking failed.';
    }
    return err?.message || 'Check dates/availability and try again.';
  })();

  return (
    <Layout>
      <div className="mx-auto max-w-7xl px-6 py-8">
        <div className="grid grid-cols-3 gap-8">
          <div className="col-span-2">
            <div className="mb-6">
              <Link
                href={`/listings/${listingId}`}
                className="mb-4 flex items-center text-gray-600 transition hover:text-gray-900"
              >
                <i className="fa-solid fa-arrow-left mr-2"></i>
                Back to listing
              </Link>
              <h1 className="text-3xl font-bold text-gray-900">
                Confirm your booking
              </h1>
            </div>

            {/* Rental Dates */}
            <section
              id="booking-dates"
              className="mb-6 rounded-xl border border-gray-200 bg-white p-6"
            >
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-xl font-semibold text-gray-900">
                  Your rental dates
                </h2>
                {datesFromListing && (
                  <Link
                    href={`/listings/${listingId}`}
                    className="text-sm font-medium text-blue-500 hover:text-blue-600 transition"
                  >
                    <i className="fa-solid fa-pen mr-1"></i>Edit dates
                  </Link>
                )}
              </div>
              {datesFromListing ? (
                <div className="grid grid-cols-2 gap-4">
                  <div className="rounded-lg border border-gray-100 bg-gray-50 p-4">
                    <div className="mb-1 text-xs font-semibold text-gray-500">
                      Check-in
                    </div>
                    <div className="text-base font-medium text-gray-900">
                      {new Date(startDate + 'T00:00:00').toLocaleDateString('en-GB', {
                        weekday: 'short',
                        day: 'numeric',
                        month: 'short',
                        year: 'numeric',
                      })}
                    </div>
                    <div className="mt-1 text-sm text-gray-500">After 2:00 PM</div>
                  </div>
                  <div className="rounded-lg border border-gray-100 bg-gray-50 p-4">
                    <div className="mb-1 text-xs font-semibold text-gray-500">
                      Check-out
                    </div>
                    <div className="text-base font-medium text-gray-900">
                      {new Date(endDate + 'T00:00:00').toLocaleDateString('en-GB', {
                        weekday: 'short',
                        day: 'numeric',
                        month: 'short',
                        year: 'numeric',
                      })}
                    </div>
                    <div className="mt-1 text-sm text-gray-500">Before 11:00 AM</div>
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-4">
                  <div className="rounded-lg border border-gray-200 p-4">
                    <label className="mb-1 block text-xs font-semibold text-gray-700">
                      Check-in
                    </label>
                    <input
                      type="date"
                      value={startDate}
                      onChange={(e) => setStartDate(e.target.value)}
                      className="mt-1 w-full text-gray-900 focus:outline-none"
                    />
                    <div className="mt-1 text-sm text-gray-500">After 2:00 PM</div>
                  </div>
                  <div className="rounded-lg border border-gray-200 p-4">
                    <label className="mb-1 block text-xs font-semibold text-gray-700">
                      Check-out
                    </label>
                    <input
                      type="date"
                      value={endDate}
                      onChange={(e) => setEndDate(e.target.value)}
                      className="mt-1 w-full text-gray-900 focus:outline-none"
                    />
                    <div className="mt-1 text-sm text-gray-500">Before 11:00 AM</div>
                  </div>
                </div>
              )}
              {isSlot && startTime && endTime && (
                <div className="mt-4 border-t border-gray-200 pt-4">
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-gray-700">Time slot</span>
                    <span className="font-semibold text-gray-900">
                      {startTime} – {endTime}
                    </span>
                  </div>
                  <div className="mt-1 flex items-center justify-between text-sm">
                    <span className="text-gray-500">
                      {slots} {slots === 1 ? 'slot' : 'slots'} ×{' '}
                      {listing?.slotConfiguration?.slotDurationMinutes ?? 60}{' '}
                      min
                    </span>
                  </div>
                </div>
              )}
              {!isSlot && (
                <div className="mt-4 border-t border-gray-200 pt-4">
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-gray-700">
                      Total rental period
                    </span>
                    <span className="font-semibold text-gray-900">
                      {days} {days === 1 ? 'day' : 'days'}
                    </span>
                  </div>
                </div>
              )}
            </section>

            {/* Message to host */}
            <section
              id="message-to-host"
              className="mb-6 rounded-xl border border-gray-200 bg-white p-6"
            >
              <h2 className="mb-1 text-xl font-semibold text-gray-900">
                Message to host
              </h2>
              <p className="mb-3 text-sm text-gray-500">
                Share why you&apos;re booking, your plans, or any questions.
                This is optional — a booking summary will be sent automatically.
              </p>
              <textarea
                id="host-message"
                rows={4}
                maxLength={500}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Hi! I&apos;m planning a weekend trip and would love to know if early check-in is possible..."
                className="w-full resize-none rounded-lg border border-gray-200 p-3 text-sm
                           text-gray-900 placeholder-gray-400 focus:border-blue-400
                           focus:outline-none focus:ring-2 focus:ring-blue-100 transition"
              />
              <div className="mt-1 text-right text-xs text-gray-400">
                {message.length}/500
              </div>
            </section>

            {/* Host Information */}
            {listing?.host && (
              <section
                id="host-information"
                className="mb-6 rounded-xl border border-gray-200 bg-white p-6"
              >
                <h2 className="mb-4 text-xl font-semibold text-gray-900">
                  Your host
                </h2>
                <div className="flex items-start space-x-4">
                  <div className="h-16 w-16 shrink-0 overflow-hidden rounded-full">
                    <img
                      src={
                        listing.host.avatarUrl ||
                        'https://via.placeholder.com/64'
                      }
                      alt={listing.host.name}
                      className="h-full w-full object-cover"
                    />
                  </div>
                  <div className="flex-1">
                    <div className="mb-2 flex items-center justify-between">
                      <div>
                        <h3 className="font-semibold text-gray-900">
                          {listing.host.name}
                        </h3>
                        <p className="text-sm text-gray-500">
                          {listing.host?.createdAt
                            ? `Joined in ${new Date(listing.host.createdAt).getFullYear()}`
                            : 'New host'}
                        </p>
                      </div>
                      {Number(listing.host?.ratingCount ?? 0) > 0 ? (
                        <div className="flex items-center">
                          <i className="fa-solid fa-star text-sm text-yellow-400"></i>
                          <span className="ml-1 text-sm font-medium">
                            {Number(listing.host.ratingAvg ?? 0).toFixed(1)}
                          </span>
                          <span className="ml-1 text-sm text-gray-500">
                            ({listing.host.ratingCount}{' '}
                            {Number(listing.host.ratingCount) === 1
                              ? 'review'
                              : 'reviews'}
                            )
                          </span>
                        </div>
                      ) : (
                        <span className="text-xs text-gray-400">New host</span>
                      )}
                    </div>
                    <div className="mb-3 flex items-center space-x-4 text-sm text-gray-600">
                      <div className="flex items-center">
                        <i className="fa-solid fa-shield-halved mr-1 text-green-500"></i>
                        Verified host
                      </div>
                      <div className="flex items-center">
                        <i className="fa-solid fa-bolt mr-1 text-blue-500"></i>
                        Fast responder
                      </div>
                    </div>
                    <p className="mb-3 text-sm text-gray-600">
                      {listing.host.name} has been hosting for 2 years and
                      consistently receives excellent reviews for communication
                      and property quality.
                    </p>
                    <Link
                      href={`/messages?hostId=${listing.host?.id}`}
                      className="mt-3 inline-block text-sm font-medium text-blue-500 transition hover:text-blue-600"
                    >
                      Contact host
                    </Link>
                  </div>
                </div>
              </section>
            )}

            {/* Rental Rules */}
            <section
              id="booking-rules"
              className="mb-6 rounded-xl border border-gray-200 bg-white p-6"
            >
              <h2 className="mb-4 text-xl font-semibold text-gray-900">
                Rental rules & policies
              </h2>
              <div className="space-y-4">
                <div className="flex items-start">
                  <i className="fa-solid fa-circle-check mr-3 mt-1 text-green-500"></i>
                  <div>
                    <div className="font-medium text-gray-900">
                      Free cancellation
                    </div>
                    <div className="text-sm text-gray-600">
                      Cancel before pickup for a full refund
                    </div>
                  </div>
                </div>
                <div className="flex items-start">
                  <i className="fa-solid fa-circle-check mr-3 mt-1 text-green-500"></i>
                  <div>
                    <div className="font-medium text-gray-900">No smoking</div>
                    <div className="text-sm text-gray-600">
                      Smoking is not permitted
                    </div>
                  </div>
                </div>
                <div className="flex items-start">
                  <i className="fa-solid fa-circle-check mr-3 mt-1 text-green-500"></i>
                  <div>
                    <div className="font-medium text-gray-900">
                      Security deposit
                    </div>
                    <div className="text-sm text-gray-600">
                      Deposit required, refunded after return
                    </div>
                  </div>
                </div>
                <div className="flex items-start">
                  <i className="fa-solid fa-circle-check mr-3 mt-1 text-green-500"></i>
                  <div>
                    <div className="font-medium text-gray-900">
                      Respect the property
                    </div>
                    <div className="text-sm text-gray-600">
                      Treat the item with care and follow all rules
                    </div>
                  </div>
                </div>
              </div>
            </section>

            {/* Booking Agreement */}
            <section
              id="booking-agreement"
              className="mb-6 rounded-xl border border-gray-200 bg-white p-6"
            >
              <div className="space-y-4">
                <div className="flex items-start">
                  <input
                    type="checkbox"
                    id="terms"
                    checked={acceptTerms}
                    onChange={(e) => setAcceptTerms(e.target.checked)}
                    className="mt-1 mr-3 h-4 w-4 rounded border-gray-300 text-blue-500 focus:ring-blue-500"
                  />
                  <label htmlFor="terms" className="text-sm text-gray-700">
                    I agree to the{' '}
                    <Link
                      href="/help"
                      className="font-medium text-blue-500 transition hover:text-blue-600"
                    >
                      rental terms and conditions
                    </Link>
                    ,{' '}
                    <Link
                      href="/help"
                      className="font-medium text-blue-500 transition hover:text-blue-600"
                    >
                      cancellation policy
                    </Link>
                    , and understand that I am responsible for any damage caused
                    during my rental period.
                  </label>
                </div>
                <div className="flex items-start">
                  <input
                    type="checkbox"
                    id="rules"
                    checked={acceptRules}
                    onChange={(e) => setAcceptRules(e.target.checked)}
                    className="mt-1 mr-3 h-4 w-4 rounded border-gray-300 text-blue-500 focus:ring-blue-500"
                  />
                  <label htmlFor="rules" className="text-sm text-gray-700">
                    I have read and agree to follow the host&apos;s house rules
                    and rental policies.
                  </label>
                </div>
              </div>
            </section>

            {/* Action Buttons */}
            <div className="flex items-center justify-between">
              <button
                onClick={() => router.back()}
                className="font-medium text-gray-600 transition hover:text-gray-900"
              >
                Cancel
              </button>
              {!createBooking.data && (
                <button
                  onClick={handleCreateBooking}
                  disabled={
                    !listingId ||
                    !startDate ||
                    !endDate ||
                    (isSlot && (!startTime || !endTime)) ||
                    !acceptTerms ||
                    !acceptRules ||
                    createBooking.isPending
                  }
                  className="rounded-lg bg-blue-500 px-8 py-4 font-semibold text-white shadow-md transition hover:bg-blue-600 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {createBooking.isPending
                    ? 'Processing...'
                    : 'Confirm and request booking'}
                </button>
              )}
            </div>

            {createBooking.isError && (
              <div className="mt-4">
                <InlineError
                  title="Booking failed"
                  message={bookingErrorMessage}
                  onRetry={handleCreateBooking}
                />
              </div>
            )}

            {createBooking.data && (
              <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-5">
                <div className="flex items-start gap-3">
                  <i className="fa-solid fa-clock mt-0.5 text-amber-500 text-lg"></i>
                  <div className="flex-1">
                    <p className="text-sm font-semibold text-amber-900">
                      Booking request sent
                    </p>
                    <p className="mt-1 text-sm text-amber-800">
                      Your request was sent to the host. Payment becomes available after approval.
                    </p>
                    <div className="mt-3">
                      <Link
                        href="/client/bookings"
                        className="inline-flex items-center gap-1.5 rounded-lg bg-amber-600 px-4 py-2 text-sm font-medium text-white hover:bg-amber-700 transition"
                      >
                        <i className="fa-solid fa-list-check" />
                        View my bookings
                      </Link>
                    </div>
                  </div>
                </div>
              </div>
            )}

          </div>

          {/* Booking Summary Card */}
          <div className="col-span-1">
            {listingQuery.isLoading ? (
              <div className="sticky top-6">
                <LoadingCard />
              </div>
            ) : listingQuery.isError ? (
              <div className="sticky top-6">
                <InlineError
                  message="Failed to load listing summary."
                  onRetry={() => void listingQuery.refetch()}
                />
              </div>
            ) : listing ? (
              <div
                id="booking-summary-card"
                className="sticky top-6 rounded-xl border border-gray-200 bg-white p-6"
              >
                <div className="mb-6 flex">
                  <div className="mr-4 h-24 w-24 shrink-0 overflow-hidden rounded-lg">
                    {listing.images?.[0] ? (
                      <img
                        src={
                          listing.images[0].startsWith('http') ||
                            listing.images[0].startsWith('/')
                            ? listing.images[0]
                            : `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000'}${listing.images[0]}`
                        }
                        alt={listing.title}
                        className="h-full w-full object-cover"
                        onError={(e) => {
                          e.currentTarget.src = '/placeholder.png';
                          e.currentTarget.onerror = null;
                        }}
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center bg-gray-100">
                        <i className="fa-solid fa-image text-gray-400"></i>
                      </div>
                    )}
                  </div>
                  <div>
                    <div className="mb-1 text-xs text-gray-500">
                      {listing.category?.name || 'Item'}
                    </div>
                    <h3 className="mb-2 font-semibold text-gray-900">
                      {listing.title}
                    </h3>
                    {Number(listing.ratingCount ?? 0) > 0 ? (
                      <div className="flex items-center">
                        <i className="fa-solid fa-star text-xs text-yellow-400"></i>
                        <span className="ml-1 text-sm font-medium">
                          {Number(listing.ratingAvg ?? 0).toFixed(1)}
                        </span>
                        <span className="ml-1 text-sm text-gray-500">
                          ({listing.ratingCount}{' '}
                          {Number(listing.ratingCount) === 1 ? 'review' : 'reviews'}
                          )
                        </span>
                      </div>
                    ) : (
                      <div className="text-xs text-gray-400">
                        No reviews yet
                      </div>
                    )}
                  </div>
                </div>

                <div className="mb-4 space-y-3 border-b border-t border-gray-200 py-4">
                  <h3 className="mb-3 font-semibold text-gray-900">
                    Price breakdown
                  </h3>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-700">
                      {formatTnd(unitPrice)} × {unitCount}{' '}
                      {isSlot
                        ? unitCount === 1
                          ? 'slot'
                          : 'slots'
                        : unitCount === 1
                          ? 'day'
                          : 'days'}
                    </span>
                    <span className="text-gray-900">
                      {formatTnd(basePrice)}
                    </span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="flex items-center text-gray-700">
                      Service fee
                      <i className="fa-solid fa-circle-info ml-1 text-xs text-gray-400"></i>
                    </span>
                    <span className="text-gray-900">
                      {formatTnd(serviceFee)}
                    </span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="flex items-center text-gray-700">
                      Insurance fee
                      <i className="fa-solid fa-circle-info ml-1 text-xs text-gray-400"></i>
                    </span>
                    <span className="text-gray-900">
                      {formatTnd(insuranceFee)}
                    </span>
                  </div>
                </div>

                <div className="mb-4 border-b border-gray-200 pb-4">
                  <div className="mb-2 flex justify-between text-sm">
                    <span className="text-gray-700">Subtotal</span>
                    <span className="text-gray-900">{formatTnd(subtotal)}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-700">Taxes (10%)</span>
                    <span className="text-gray-900">{formatTnd(taxes)}</span>
                  </div>
                </div>

                <div className="mb-6 flex items-center justify-between">
                  <span className="text-lg font-bold text-gray-900">Total</span>
                  <span className="text-2xl font-bold text-gray-900">
                    {formatTnd(total)}
                  </span>
                </div>

                <div className="mb-4 rounded-lg border border-green-200 bg-green-50 p-4">
                  <div className="flex items-start">
                    <i className="fa-solid fa-shield-halved mr-2 mt-0.5 text-green-500"></i>
                    <div>
                      <div className="mb-1 text-sm font-medium text-green-800">
                        Protected booking
                      </div>
                      <div className="text-xs text-green-700">
                        Your payment is secure and protected by RentLocal
                      </div>
                    </div>
                  </div>
                </div>

                <div className="text-center text-xs text-gray-500">
                  You won&apos;t be charged yet. The host will review your
                  request first.
                </div>
              </div>
            ) : (
              <div className="sticky top-6">
                <EmptyState
                  icon="fa-solid fa-circle-question"
                  title="Listing not found"
                  message="This listing is unavailable."
                  cta={{ label: 'Browse listings', href: '/search' }}
                />
              </div>
            )}
          </div>
        </div>
      </div>
    </Layout>
  );
}
