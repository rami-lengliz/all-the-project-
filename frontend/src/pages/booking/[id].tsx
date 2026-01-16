import Link from 'next/link';
import { Layout } from '@/components/layout/Layout';
import { useRouter } from 'next/router';
import { useState } from 'react';
import { useCreateBooking } from '@/lib/api/hooks/useCreateBooking';
import { BookingsService } from '@/lib/api/generated';
import { formatTnd } from '@/lib/utils/format';
import { useListing } from '@/lib/api/hooks/useListing';
import { InlineError } from '@/components/ui/InlineError';
import { EmptyState } from '@/components/ui/EmptyState';
import { LoadingCard } from '@/components/ui/LoadingCard';
import { api } from '@/lib/api/http';

export default function BookingPage() {
  const router = useRouter();
  const listingId = router.query.id as string | undefined;
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('card');
  const [acceptTerms, setAcceptTerms] = useState(false);
  const [acceptRules, setAcceptRules] = useState(false);
  const [paid, setPaid] = useState(false);
  const createBooking = useCreateBooking();
  const listingQuery = useListing(listingId);
  const listing = listingQuery.data as any;

  const handleCreateBooking = async () => {
    if (!listingId || !startDate || !endDate || !acceptTerms || !acceptRules) return;
    setPaid(false);
    try {
      await createBooking.mutateAsync({ listingId, startDate, endDate });
    } catch (error) {
      // Error handled by InlineError component
    }
  };

  const handlePayment = async () => {
    if (!createBooking.data) return;
    try {
      // First authorize payment intent
      await api.post(`/payments/booking/${createBooking.data.id}/authorize`, {
        metadata: { paymentToken: 'demo-token' },
      });

      // Then pay the booking (which will capture the payment intent)
      await BookingsService.bookingsControllerPay(createBooking.data.id, {
        paymentToken: 'demo-token',
        receipt: 'demo-receipt',
      });
      setPaid(true);
    } catch (error) {
      console.error('Payment failed:', error);
    }
  };

  const calculateDays = () => {
    if (!startDate || !endDate) return 0;
    const start = new Date(startDate);
    const end = new Date(endDate);
    const diffTime = Math.abs(end.getTime() - start.getTime());
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24)) || 1;
  };

  const days = calculateDays();
  const basePrice = listing ? listing.pricePerDay * days : 0;
  const serviceFee = basePrice * 0.1;
  const insuranceFee = basePrice * 0.05;
  const subtotal = basePrice + serviceFee + insuranceFee;
  const taxes = subtotal * 0.1;
  const total = subtotal + taxes;

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
              <h1 className="text-3xl font-bold text-gray-900">Confirm your booking</h1>
            </div>

            {/* Rental Dates */}
            <section id="booking-dates" className="mb-6 rounded-xl border border-gray-200 bg-white p-6">
              <h2 className="mb-4 text-xl font-semibold text-gray-900">Your rental dates</h2>
              <div className="grid grid-cols-2 gap-4">
                <div className="rounded-lg border border-gray-200 p-4">
                  <label className="mb-1 block text-xs font-semibold text-gray-700">Check-in</label>
                  <input
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="mt-1 w-full text-gray-900 focus:outline-none"
                  />
                  <div className="mt-1 text-sm text-gray-500">After 2:00 PM</div>
                </div>
                <div className="rounded-lg border border-gray-200 p-4">
                  <label className="mb-1 block text-xs font-semibold text-gray-700">Check-out</label>
                  <input
                    type="date"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    className="mt-1 w-full text-gray-900 focus:outline-none"
                  />
                  <div className="mt-1 text-sm text-gray-500">Before 11:00 AM</div>
                </div>
              </div>
              <div className="mt-4 border-t border-gray-200 pt-4">
                <div className="flex items-center justify-between">
                  <span className="font-medium text-gray-700">Total rental period</span>
                  <span className="font-semibold text-gray-900">{days} {days === 1 ? 'day' : 'days'}</span>
                </div>
              </div>
            </section>

            {/* Host Information */}
            {listing?.host && (
              <section id="host-information" className="mb-6 rounded-xl border border-gray-200 bg-white p-6">
                <h2 className="mb-4 text-xl font-semibold text-gray-900">Your host</h2>
                <div className="flex items-start space-x-4">
                  <div className="h-16 w-16 shrink-0 overflow-hidden rounded-full">
                    <img
                      src={listing.host.avatarUrl || 'https://via.placeholder.com/64'}
                      alt={listing.host.name}
                      className="h-full w-full object-cover"
                    />
                  </div>
                  <div className="flex-1">
                    <div className="mb-2 flex items-center justify-between">
                      <div>
                        <h3 className="font-semibold text-gray-900">{listing.host.name}</h3>
                        <p className="text-sm text-gray-500">Joined in 2023</p>
                      </div>
                      <div className="flex items-center">
                        <i className="fa-solid fa-star text-sm text-yellow-400"></i>
                        <span className="ml-1 text-sm font-medium">4.9</span>
                        <span className="ml-1 text-sm text-gray-500">(47 reviews)</span>
                      </div>
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
                      {listing.host.name} has been hosting for 2 years and consistently receives excellent reviews for
                      communication and property quality.
                    </p>
                    <button className="mt-3 text-sm font-medium text-blue-500 transition hover:text-blue-600">
                      Contact host
                    </button>
                  </div>
                </div>
              </section>
            )}

            {/* Rental Rules */}
            <section id="booking-rules" className="mb-6 rounded-xl border border-gray-200 bg-white p-6">
              <h2 className="mb-4 text-xl font-semibold text-gray-900">Rental rules & policies</h2>
              <div className="space-y-4">
                <div className="flex items-start">
                  <i className="fa-solid fa-circle-check mr-3 mt-1 text-green-500"></i>
                  <div>
                    <div className="font-medium text-gray-900">Free cancellation</div>
                    <div className="text-sm text-gray-600">Cancel before pickup for a full refund</div>
                  </div>
                </div>
                <div className="flex items-start">
                  <i className="fa-solid fa-circle-check mr-3 mt-1 text-green-500"></i>
                  <div>
                    <div className="font-medium text-gray-900">No smoking</div>
                    <div className="text-sm text-gray-600">Smoking is not permitted</div>
                  </div>
                </div>
                <div className="flex items-start">
                  <i className="fa-solid fa-circle-check mr-3 mt-1 text-green-500"></i>
                  <div>
                    <div className="font-medium text-gray-900">Security deposit</div>
                    <div className="text-sm text-gray-600">Deposit required, refunded after return</div>
                  </div>
                </div>
                <div className="flex items-start">
                  <i className="fa-solid fa-circle-check mr-3 mt-1 text-green-500"></i>
                  <div>
                    <div className="font-medium text-gray-900">Respect the property</div>
                    <div className="text-sm text-gray-600">Treat the item with care and follow all rules</div>
                  </div>
                </div>
              </div>
            </section>

            {/* Payment Method */}
            <section id="payment-method" className="mb-6 rounded-xl border border-gray-200 bg-white p-6">
              <h2 className="mb-4 text-xl font-semibold text-gray-900">Payment method</h2>
              <div className="space-y-3">
                <button
                  onClick={() => setPaymentMethod('card')}
                  className={`w-full rounded-lg border p-4 transition ${
                    paymentMethod === 'card'
                      ? 'border-blue-500 bg-blue-50'
                      : 'border-gray-300 hover:border-blue-500'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center">
                      <i className="fa-solid fa-credit-card mr-3 text-xl text-blue-500"></i>
                      <div>
                        <div className="font-medium text-gray-900">Credit or debit card</div>
                        <div className="text-sm text-gray-500">Visa, Mastercard, Amex</div>
                      </div>
                    </div>
                    <i
                      className={`fa-solid ${
                        paymentMethod === 'card' ? 'fa-circle-check text-blue-500' : 'fa-circle text-gray-300'
                      }`}
                    ></i>
                  </div>
                </button>
                <button
                  onClick={() => setPaymentMethod('paypal')}
                  className={`w-full rounded-lg border p-4 transition ${
                    paymentMethod === 'paypal'
                      ? 'border-blue-500 bg-blue-50'
                      : 'border-gray-300 hover:border-blue-500'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center">
                      <i className="fa-brands fa-paypal mr-3 text-xl text-blue-600"></i>
                      <div>
                        <div className="font-medium text-gray-900">PayPal</div>
                        <div className="text-sm text-gray-500">Pay with your PayPal account</div>
                      </div>
                    </div>
                    <i
                      className={`fa-regular ${
                        paymentMethod === 'paypal' ? 'fa-circle-check text-blue-500' : 'fa-circle text-gray-300'
                      }`}
                    ></i>
                  </div>
                </button>
                <button
                  onClick={() => setPaymentMethod('bank')}
                  className={`w-full rounded-lg border p-4 transition ${
                    paymentMethod === 'bank'
                      ? 'border-blue-500 bg-blue-50'
                      : 'border-gray-300 hover:border-blue-500'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center">
                      <i className="fa-solid fa-building-columns mr-3 text-xl text-gray-600"></i>
                      <div>
                        <div className="font-medium text-gray-900">Bank transfer</div>
                        <div className="text-sm text-gray-500">Direct bank transfer</div>
                      </div>
                    </div>
                    <i
                      className={`fa-regular ${
                        paymentMethod === 'bank' ? 'fa-circle-check text-blue-500' : 'fa-circle text-gray-300'
                      }`}
                    ></i>
                  </div>
                </button>
              </div>
            </section>

            {/* Booking Agreement */}
            <section id="booking-agreement" className="mb-6 rounded-xl border border-gray-200 bg-white p-6">
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
                    <Link href="#" className="font-medium text-blue-500 transition hover:text-blue-600">
                      rental terms and conditions
                    </Link>
                    ,{' '}
                    <Link href="#" className="font-medium text-blue-500 transition hover:text-blue-600">
                      cancellation policy
                    </Link>
                    , and understand that I am responsible for any damage caused during my rental period.
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
                    I have read and agree to follow the host&apos;s house rules and rental policies.
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
              {createBooking.data && !paid ? (
                <button
                  onClick={handlePayment}
                  disabled={createBooking.isPending}
                  className="rounded-lg bg-blue-500 px-8 py-4 font-semibold text-white shadow-md transition hover:bg-blue-600 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Complete Payment
                </button>
              ) : (
                <button
                  onClick={handleCreateBooking}
                  disabled={!listingId || !startDate || !endDate || !acceptTerms || !acceptRules || createBooking.isPending}
                  className="rounded-lg bg-blue-500 px-8 py-4 font-semibold text-white shadow-md transition hover:bg-blue-600 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {createBooking.isPending ? 'Processing...' : 'Confirm and request booking'}
                </button>
              )}
            </div>

            {createBooking.isError && (
              <div className="mt-4">
                <InlineError
                  title="Booking failed"
                  message="Check dates/availability and try again."
                  onRetry={handleCreateBooking}
                />
              </div>
            )}

            {paid && (
              <div className="mt-6 rounded-xl border border-green-200 bg-green-50 p-4">
                <div className="flex items-center text-green-800">
                  <i className="fa-solid fa-check-circle mr-2"></i>
                  <span className="font-semibold">Payment successful! Your booking is confirmed.</span>
                </div>
                <Link
                  href="/rentals"
                  className="mt-3 inline-block font-medium text-blue-500 transition hover:text-blue-600"
                >
                  View my rentals →
                </Link>
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
                <InlineError message="Failed to load listing summary." onRetry={() => void listingQuery.refetch()} />
              </div>
            ) : listing ? (
              <div id="booking-summary-card" className="sticky top-6 rounded-xl border border-gray-200 bg-white p-6">
                <div className="mb-6 flex">
                  <div className="mr-4 h-24 w-24 shrink-0 overflow-hidden rounded-lg">
                    {listing.images?.[0] ? (
                      <img src={listing.images[0]} alt={listing.title} className="h-full w-full object-cover" />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center bg-gray-100">
                        <i className="fa-solid fa-image text-gray-400"></i>
                      </div>
                    )}
                  </div>
                  <div>
                    <div className="mb-1 text-xs text-gray-500">{listing.category?.name || 'Item'}</div>
                    <h3 className="mb-2 font-semibold text-gray-900">{listing.title}</h3>
                    <div className="flex items-center">
                      <i className="fa-solid fa-star text-xs text-yellow-400"></i>
                      <span className="ml-1 text-sm font-medium">4.9</span>
                      <span className="ml-1 text-sm text-gray-500">(127 reviews)</span>
                    </div>
                  </div>
                </div>

                <div className="mb-4 space-y-3 border-b border-t border-gray-200 py-4">
                  <h3 className="mb-3 font-semibold text-gray-900">Price breakdown</h3>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-700">
                      {formatTnd(listing.pricePerDay)} × {days} {days === 1 ? 'day' : 'days'}
                    </span>
                    <span className="text-gray-900">{formatTnd(basePrice)}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="flex items-center text-gray-700">
                      Service fee
                      <i className="fa-solid fa-circle-info ml-1 text-xs text-gray-400"></i>
                    </span>
                    <span className="text-gray-900">{formatTnd(serviceFee)}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="flex items-center text-gray-700">
                      Insurance fee
                      <i className="fa-solid fa-circle-info ml-1 text-xs text-gray-400"></i>
                    </span>
                    <span className="text-gray-900">{formatTnd(insuranceFee)}</span>
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
                  <span className="text-2xl font-bold text-gray-900">{formatTnd(total)}</span>
                </div>

                <div className="mb-4 rounded-lg border border-green-200 bg-green-50 p-4">
                  <div className="flex items-start">
                    <i className="fa-solid fa-shield-halved mr-2 mt-0.5 text-green-500"></i>
                    <div>
                      <div className="mb-1 text-sm font-medium text-green-800">Protected booking</div>
                      <div className="text-xs text-green-700">Your payment is secure and protected by RentLocal</div>
                    </div>
                  </div>
                </div>

                <div className="text-center text-xs text-gray-500">
                  You won&apos;t be charged yet. The host will review your request first.
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
