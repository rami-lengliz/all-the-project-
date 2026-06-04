/**
 * Visible reminder that bookings are only protected when paid through the
 * platform. Used on listing detail pages and inside the booking flow to
 * counter off-platform leakage. Variant lets us pick between a compact
 * single-line badge and a fuller card.
 */

interface Props {
  variant?: 'badge' | 'card';
}

export function BookingProtectionBadge({ variant = 'badge' }: Props) {
  if (variant === 'badge') {
    return (
      <div className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-medium text-emerald-700">
        <i className="fa-solid fa-shield-halved" aria-hidden="true" />
        Booking protection — only when you pay through us
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
      <div className="flex items-start gap-3">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
          <i className="fa-solid fa-shield-halved" aria-hidden="true" />
        </div>
        <div className="text-sm text-emerald-900">
          <div className="font-semibold">Your booking is protected</div>
          <p className="mt-1 text-emerald-800">
            Pay through RentAI and we'll back you if the rental
            doesn't match the listing. Bookings paid outside the platform
            (cash on the side, direct bank transfer, WhatsApp) are
            <strong> not covered</strong>.
          </p>
        </div>
      </div>
    </div>
  );
}
