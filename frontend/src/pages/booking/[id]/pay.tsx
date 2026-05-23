import Link from 'next/link';
import { useRouter } from 'next/router';
import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Layout } from '@/components/layout/Layout';
import { api } from '@/lib/api/http';
import { formatTnd } from '@/lib/utils/format';
import { LoadingCard } from '@/components/ui/LoadingCard';
import { InlineError } from '@/components/ui/InlineError';
import { toast } from '@/components/ui/Toaster';

type ProviderKey = 'flouci' | 'konnect' | 'd17';

interface ProviderOption {
  key: ProviderKey;
  label: string;
  blurb: string;
  icon: string;
  comingSoon?: boolean;
}

const PROVIDERS: ProviderOption[] = [
  {
    key: 'flouci',
    label: 'Flouci',
    blurb: 'Bank card, mobile money, or e-Dinar via the Flouci gateway.',
    icon: 'fa-solid fa-credit-card',
  },
  {
    key: 'konnect',
    label: 'Konnect',
    blurb: 'Pay with any Tunisian bank card.',
    icon: 'fa-solid fa-wallet',
    comingSoon: true,
  },
  {
    key: 'd17',
    label: 'D17',
    blurb: 'Pay directly from the BIAT D17 mobile app.',
    icon: 'fa-solid fa-mobile-screen',
    comingSoon: true,
  },
];

export default function BookingPayPage() {
  const router = useRouter();
  const bookingId = router.query.id as string | undefined;
  const outcome = router.query.outcome as
    | 'success'
    | 'failed'
    | 'pending'
    | undefined;

  const [submitting, setSubmitting] = useState<ProviderKey | null>(null);
  const [error, setError] = useState<string | null>(null);

  const bookingQuery = useQuery({
    queryKey: ['booking', bookingId],
    enabled: !!bookingId,
    queryFn: async () => {
      const res = await api.get(`/bookings/${bookingId}`);
      return res.data as { id: string; status: string; totalAmount?: number };
    },
  });

  const bookingStatus = bookingQuery.data?.status;
  const isConfirmed = bookingStatus === 'confirmed';

  const intentQuery = useQuery({
    queryKey: ['payment-intent', bookingId],
    enabled: !!bookingId && isConfirmed,
    queryFn: async () => {
      const res = await api.post(`/payments/booking/${bookingId}`);
      return res.data;
    },
  });

  const providersQuery = useQuery({
    queryKey: ['payment-providers'],
    queryFn: async () => {
      const res = await api.get('/payments/providers');
      return res.data as { providers: ProviderKey[] };
    },
  });

  // Surface the outcome from the redirect once
  useEffect(() => {
    if (!router.isReady) return;
    if (outcome === 'success') {
      toast({
        title: 'Payment confirmed',
        message: 'Your booking is paid.',
        variant: 'success',
      });
    } else if (outcome === 'failed') {
      toast({
        title: 'Payment failed',
        message: 'No money was charged. Try again.',
        variant: 'error',
      });
    } else if (outcome === 'pending') {
      toast({
        title: 'Payment is still pending',
        message: 'Refresh in a moment to see the latest status.',
        variant: 'info',
      });
    }
  }, [router.isReady, outcome]);

  const startCheckout = async (provider: ProviderKey) => {
    if (!bookingId) return;
    setSubmitting(provider);
    setError(null);
    try {
      const res = await api.post(`/payments/booking/${bookingId}/checkout`, {
        provider,
      });
      const url = res.data?.redirectUrl;
      if (!url) throw new Error('No redirect URL returned');
      window.location.href = url;
    } catch (e: any) {
      setSubmitting(null);
      setError(
        e?.response?.data?.message ??
          e?.message ??
          'Could not start the payment. Try again.',
      );
    }
  };

  const intent = intentQuery.data;
  const isPaid = intent?.status === 'captured' || bookingStatus === 'paid';

  if (bookingQuery.isLoading) {
    return (
      <Layout>
        <div className="mx-auto max-w-2xl px-6 py-10">
          <LoadingCard />
        </div>
      </Layout>
    );
  }

  if (bookingQuery.isError) {
    return (
      <Layout>
        <div className="mx-auto max-w-2xl px-6 py-10">
          <InlineError message="Could not load this booking." />
          <Link
            href="/client/bookings"
            className="mt-4 inline-block font-semibold text-primary hover:underline"
          >
            ← Back to my bookings
          </Link>
        </div>
      </Layout>
    );
  }

  if (bookingStatus === 'pending') {
    return (
      <Layout>
        <div className="mx-auto max-w-2xl px-6 py-10">
          <h1 className="text-2xl font-bold text-slate-900">Booking request sent</h1>
          <p className="mt-1 text-slate-600">
            Your request was sent to the host. Payment becomes available after approval.
          </p>
          <div className="mt-6 rounded-2xl border border-amber-200 bg-amber-50 p-6">
            <div className="flex items-start gap-3">
              <i className="fa-solid fa-clock mt-0.5 text-amber-500 text-lg" />
              <div>
                <p className="font-semibold text-amber-900">Waiting for host approval</p>
                <p className="mt-1 text-sm text-amber-800">
                  You will be notified once the host confirms your request. You can then return here to pay.
                </p>
              </div>
            </div>
          </div>
          <div className="mt-4">
            <Link
              href="/client/bookings"
              className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 transition"
            >
              <i className="fa-solid fa-list-check" />
              View my bookings
            </Link>
          </div>
        </div>
      </Layout>
    );
  }

  if (intentQuery.isLoading && isConfirmed) {
    return (
      <Layout>
        <div className="mx-auto max-w-2xl px-6 py-10">
          <LoadingCard />
        </div>
      </Layout>
    );
  }

  if (intentQuery.isError || (!intent && isConfirmed)) {
    return (
      <Layout>
        <div className="mx-auto max-w-2xl px-6 py-10">
          <InlineError message="Could not load this booking's payment details." />
          <Link
            href="/client/bookings"
            className="mt-4 inline-block font-semibold text-primary hover:underline"
          >
            ← Back to my bookings
          </Link>
        </div>
      </Layout>
    );
  }

  const availableProviders = providersQuery.data?.providers ?? [];

  return (
    <Layout>
      <div className="mx-auto max-w-2xl px-6 py-10">
        <h1 className="text-2xl font-bold text-slate-900">
          {isPaid ? 'Payment received' : 'Confirm payment'}
        </h1>
        <p className="mt-1 text-slate-600">
          {isPaid
            ? 'Your booking is paid. You can message the host to coordinate.'
            : 'Pick a payment method to complete your booking.'}
        </p>

        <div className="mt-6 rounded-2xl border border-border bg-white p-6">
          <div className="flex items-baseline justify-between border-b border-border pb-4">
            <span className="text-sm font-medium text-slate-600">Total to pay</span>
            <span className="text-3xl font-bold text-slate-900">
              {formatTnd(Number(intent.amount))}
            </span>
          </div>

          {isPaid ? (
            <div className="mt-6 rounded-xl bg-green-50 p-4 text-sm text-green-800">
              <div className="font-semibold">
                <i className="fa-solid fa-circle-check mr-2" />
                Booking paid in full
              </div>
              <p className="mt-1">
                The host has been notified. You'll find this booking in{' '}
                <Link href="/client/bookings" className="font-semibold underline">
                  My bookings
                </Link>
                .
              </p>
            </div>
          ) : (
            <>
              <div className="mt-6 space-y-3">
                {PROVIDERS.map((p) => {
                  const live =
                    !p.comingSoon && availableProviders.includes(p.key);
                  return (
                    <button
                      key={p.key}
                      type="button"
                      onClick={() => live && startCheckout(p.key)}
                      disabled={!live || submitting !== null}
                      className="flex w-full items-center justify-between gap-4 rounded-xl border-2 border-gray-200 p-4 text-left transition hover:border-primary disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:border-gray-200"
                    >
                      <div className="flex items-center gap-4">
                        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                          <i className={p.icon} />
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-slate-900">
                              {p.label}
                            </span>
                            {!live && (
                              <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">
                                {p.comingSoon ? 'Coming soon' : 'Unavailable'}
                              </span>
                            )}
                          </div>
                          <p className="mt-0.5 text-xs text-slate-600">{p.blurb}</p>
                        </div>
                      </div>
                      <div>
                        {submitting === p.key ? (
                          <i className="fa-solid fa-circle-notch fa-spin text-primary" />
                        ) : (
                          <i className="fa-solid fa-arrow-right text-slate-400" />
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>

              {error ? (
                <p className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                  {error}
                </p>
              ) : null}

              <p className="mt-6 text-xs text-slate-500">
                Payments are processed by a third-party provider. Your card and
                banking details never touch our servers. A 10% platform fee is
                included in the amount above.
              </p>
            </>
          )}
        </div>

        <div className="mt-4 text-sm text-slate-600">
          <Link href="/client/bookings" className="font-semibold text-primary hover:underline">
            ← Back to my bookings
          </Link>
        </div>
      </div>
    </Layout>
  );
}
