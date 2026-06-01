import Link from 'next/link';
import Head from 'next/head';
import type { GetServerSideProps } from 'next';
import { Layout } from '@/components/layout/Layout';
import { useRouter } from 'next/router';
import { useListing } from '@/lib/api/hooks/useListing';
import { useListingReviews } from '@/lib/api/hooks/useListingReviews';
import { useSimilarListings } from '@/lib/api/hooks/useSimilarListings';
import { ListingCard } from '@/components/shared/ListingCard';
import { formatTnd } from '@/lib/utils/format';
import { LoadingCard } from '@/components/ui/LoadingCard';
import { InlineError } from '@/components/ui/InlineError';
import { EmptyState } from '@/components/ui/EmptyState';
import { useState, useEffect, useMemo } from 'react';
import { BookingProtectionBadge } from '@/components/shared/BookingProtectionBadge';
import { WishlistButton } from '@/components/shared/WishlistButton';
import ListingMap from '@/components/shared/ListingMap';

interface SeoData {
  title: string;
  description: string;
  image: string | null;
  url: string;
  pricePerDay: number | null;
  ratingAvg: number;
  ratingCount: number;
  jsonLd: string;
}

interface PageProps {
  seo: SeoData | null;
}

// ── cancellation policy display helpers ──────────────────────────────────────
function cancellationPolicyRules(
  policy: 'FLEXIBLE' | 'MODERATE' | 'STRICT',
): string[] {
  switch (policy) {
    case 'FLEXIBLE':
      return [
        'Full refund up to 24h before start',
        'No refund within 24h of start',
      ];
    case 'STRICT':
      return [
        '50% refund up to 7 days before start',
        'No refund within 7 days',
      ];
    case 'MODERATE':
    default:
      return [
        'Full refund up to 5 days before start',
        '50% refund up to 24h before',
        'No refund within 24h',
      ];
  }
}

// ── calendar helpers ──────────────────────────────────────────────────────────
function toYMD(d: Date) {
  return d.toISOString().split('T')[0];
}
function daysInMonth(year: number, month: number) {
  return new Date(year, month + 1, 0).getDate();
}
function firstDayOfMonth(year: number, month: number) {
  // 0=Sun…6=Sat; convert so Mon=0
  return (new Date(year, month, 1).getDay() + 6) % 7;
}
function daysBetween(a: string, b: string) {
  if (!a || !b) return 0;
  return Math.max(0, Math.round((new Date(b).getTime() - new Date(a).getTime()) / 86400000));
}

export default function ListingDetailsPage({ seo }: PageProps) {
  const router = useRouter();
  const id = router.query.id as string | undefined;
  const listingQuery = useListing(id);
  const listing = listingQuery.data as any;
  const reviewsQuery = useListingReviews(listing?.id);
  const reviews: any[] = reviewsQuery.data ?? [];
  const similarQuery = useSimilarListings(listing?.id, 4);
  const [showAllPhotos, setShowAllPhotos] = useState(false);
  const [descExpanded, setDescExpanded] = useState(false);
  const [showAllReviews, setShowAllReviews] = useState(false);

  // ── booking state ───────────────────────────────────────────────────────────
  const today = toYMD(new Date());
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  // ── calendar navigation ─────────────────────────────────────────────────────
  const [calDate, setCalDate] = useState(() => new Date());
  const calYear = calDate.getFullYear();
  const calMonth = calDate.getMonth();

  // ── slot state (SLOT booking type) ──────────────────────────────────────────
  const [slotDay, setSlotDay] = useState('');
  const [availableSlots, setAvailableSlots] = useState<any[]>([]);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [selectedSlot, setSelectedSlot] = useState<{ startTime: string; endTime: string } | null>(null);

  const isSlot = listing?.bookingType === 'SLOT';
  const isDaily = !isSlot;

  // fetch time slots when slotDay changes
  useEffect(() => {
    if (!isSlot || !slotDay || !id) return;
    setSlotsLoading(true);
    setAvailableSlots([]);
    setSelectedSlot(null);
    const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';
    fetch(`${apiUrl}/api/listings/${id}/available-slots?date=${slotDay}`)
      .then((r) => r.json())
      .then((j) => setAvailableSlots(j?.data ?? j ?? []))
      .catch(() => setAvailableSlots([]))
      .finally(() => setSlotsLoading(false));
  }, [isSlot, slotDay, id]);

  // ── price calculation ───────────────────────────────────────────────────────
  const nightsCount = useMemo(() => {
    if (isSlot) return selectedSlot ? 1 : 0;
    return daysBetween(startDate, endDate);
  }, [isSlot, startDate, endDate, selectedSlot]);

  const basePrice = isSlot
    ? Number(listing?.slotConfiguration?.pricePerSlot ?? listing?.pricePerDay ?? 0)
    : Number(listing?.pricePerDay ?? 0);

  const subtotal = nightsCount * basePrice;
  const serviceFee = Math.round(subtotal * 0.10 * 100) / 100;
  const total = subtotal + serviceFee;

  // ── calendar helpers ────────────────────────────────────────────────────────
  const firstDay = firstDayOfMonth(calYear, calMonth);
  const totalDays = daysInMonth(calYear, calMonth);
  const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

  function handleDayClick(dayStr: string) {
    if (dayStr < today) return;
    if (!startDate || (startDate && endDate)) {
      setStartDate(dayStr);
      setEndDate('');
    } else {
      if (dayStr < startDate) {
        setEndDate(startDate);
        setStartDate(dayStr);
      } else {
        setEndDate(dayStr);
      }
    }
  }

  function dayClass(dayStr: string): string {
    if (dayStr < today) return 'text-gray-300 cursor-not-allowed';
    if (dayStr === startDate || dayStr === endDate)
      return 'bg-blue-500 text-white rounded-full cursor-pointer';
    if (startDate && endDate && dayStr > startDate && dayStr < endDate)
      return 'bg-blue-100 text-blue-800 cursor-pointer';
    return 'hover:bg-gray-100 cursor-pointer rounded-full text-gray-900';
  }

  // ── book button handler ─────────────────────────────────────────────────────
  function handleBook() {
    if (isSlot) {
      if (!slotDay || !selectedSlot) return;
      void router.push(
        `/booking/${id}?startDate=${slotDay}&endDate=${slotDay}&startTime=${selectedSlot.startTime}&endTime=${selectedSlot.endTime}`,
      );
    } else {
      if (!startDate || !endDate) return;
      void router.push(`/booking/${id}?startDate=${startDate}&endDate=${endDate}`);
    }
  }

  const images = listing?.images || [];
  const displayImages = showAllPhotos ? images : images.slice(0, 5);

  return (
    <Layout>
      {seo ? (
        <Head>
          <title>{seo.title}</title>
          <meta name="description" content={seo.description} />
          <link rel="canonical" href={seo.url} />
          <meta property="og:type" content="product" />
          <meta property="og:title" content={seo.title} />
          <meta property="og:description" content={seo.description} />
          <meta property="og:url" content={seo.url} />
          {seo.image ? <meta property="og:image" content={seo.image} /> : null}
          <meta name="twitter:card" content="summary_large_image" />
          <meta name="twitter:title" content={seo.title} />
          <meta name="twitter:description" content={seo.description} />
          {seo.image ? <meta name="twitter:image" content={seo.image} /> : null}
          <script
            type="application/ld+json"
            dangerouslySetInnerHTML={{ __html: seo.jsonLd }}
          />
        </Head>
      ) : null}
      {listingQuery.isLoading ? (
        <div className="mx-auto max-w-7xl px-6 py-8">
          <LoadingCard />
        </div>
      ) : listingQuery.isError ? (
        <div className="mx-auto max-w-7xl px-6 py-8">
          <InlineError
            message="Failed to load listing."
            onRetry={() => void listingQuery.refetch()}
          />
        </div>
      ) : listing ? (
        <>
          {/* Breadcrumb Navigation */}
          <section
            id="breadcrumb-nav"
            className="border-b border-gray-100 bg-white"
          >
            <div className="mx-auto max-w-7xl px-6 py-3">
              <div className="flex items-center justify-between gap-4">
                <div className="flex items-center text-sm text-gray-600">
                  <Link href="/" className="transition hover:text-gray-900">
                    Home
                  </Link>
                  <i className="fa-solid fa-chevron-right mx-2 text-xs"></i>
                  <Link
                    href={
                      listing.category?.slug
                        ? `/search?categorySlug=${listing.category.slug}`
                        : '/search'
                    }
                    className="transition hover:text-gray-900"
                  >
                    {listing.category?.name || 'Listings'}
                  </Link>
                  <i className="fa-solid fa-chevron-right mx-2 text-xs"></i>
                  <span className="truncate font-medium text-gray-900">
                    {listing.title}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => router.back()}
                  className="hidden shrink-0 items-center gap-1.5 text-sm text-gray-500 transition hover:text-gray-900 md:flex"
                >
                  <i className="fa-solid fa-arrow-left text-xs" />
                  Back
                </button>
              </div>
            </div>
          </section>

          {/* Listing Header */}
          <section id="listing-header" className="bg-white py-6">
            <div className="mx-auto max-w-7xl px-6">
              <div className="flex items-start justify-between">
                <div>
                  <h1 className="mb-2 text-3xl font-bold text-gray-900">
                    {listing.title}
                  </h1>
                  <div className="flex items-center space-x-4 text-sm">
                    {reviews.length > 0 ? (
                      <div className="flex items-center">
                        <i className="fa-solid fa-star mr-1 text-yellow-400"></i>
                        <span className="font-semibold">
                          {Number(listing.ratingAvg ?? 0).toFixed(1)}
                        </span>
                        <span className="ml-1 text-gray-500">
                          ({reviews.length}{' '}
                          {reviews.length === 1 ? 'review' : 'reviews'})
                        </span>
                      </div>
                    ) : (
                      <span className="text-sm text-gray-400">No reviews yet</span>
                    )}
                    <span className="text-gray-400">•</span>
                    <div className="flex items-center text-gray-700">
                      <i className="fa-solid fa-location-dot mr-1 text-blue-500"></i>
                      <span>{listing.address || 'Tunis, Tunisia'}</span>
                    </div>
                  </div>
                </div>
                <div className="flex items-center space-x-3">
                  <button
                    type="button"
                    onClick={() => {
                      if (typeof navigator !== 'undefined' && navigator.share) {
                        navigator
                          .share({
                            title: listing.title,
                            url: typeof window !== 'undefined' ? window.location.href : '',
                          })
                          .catch(() => undefined);
                      } else if (typeof navigator !== 'undefined' && navigator.clipboard) {
                        navigator.clipboard.writeText(window.location.href).catch(() => undefined);
                      }
                    }}
                    className="flex items-center space-x-2 rounded-lg px-4 py-2 transition hover:bg-gray-100"
                  >
                    <i className="fa-solid fa-share-nodes text-gray-700"></i>
                    <span className="text-sm font-medium">Share</span>
                  </button>
                  <WishlistButton listingId={listing.id} variant="inline" />
                </div>
              </div>
            </div>
          </section>

          {/* Image Gallery */}
          <section id="image-gallery" className="bg-white pb-8">
            <div className="mx-auto max-w-7xl px-6">
              {images.length > 0 ? (
                <div className="grid h-[500px] grid-cols-4 gap-2 overflow-hidden rounded-2xl">
                  {displayImages.map((img: string, idx: number) => (
                    <div
                      key={idx}
                      className={`${idx === 0 ? 'col-span-2 row-span-2' : ''
                        } cursor-pointer overflow-hidden transition hover:brightness-95`}
                    >
                      <img
                        className="h-full w-full object-cover"
                        src={
                          img.startsWith('http') || img.startsWith('/')
                            ? img
                            : `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000'}${img}`
                        }
                        alt={`${listing.title} ${idx + 1}`}
                        onError={(e) => {
                          e.currentTarget.src = '/placeholder.png';
                          e.currentTarget.onerror = null;
                        }}
                      />
                    </div>
                  ))}
                  {images.length > 5 && !showAllPhotos && (
                    <div className="relative">
                      <img
                        className="h-full w-full object-cover"
                        src={
                          images[5].startsWith('http') ||
                            images[5].startsWith('/')
                            ? images[5]
                            : `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000'}${images[5]}`
                        }
                        alt={`${listing.title} 6`}
                        onError={(e) => {
                          e.currentTarget.src = '/placeholder.png';
                          e.currentTarget.onerror = null;
                        }}
                      />
                      <button
                        onClick={() => setShowAllPhotos(true)}
                        className="absolute inset-0 flex items-center justify-center bg-black bg-opacity-40 transition hover:bg-opacity-50"
                      >
                        <span className="flex items-center text-white font-semibold">
                          <i className="fa-solid fa-images mr-2"></i>
                          Show all {images.length} photos
                        </span>
                      </button>
                    </div>
                  )}
                </div>
              ) : (
                <div className="flex h-[500px] items-center justify-center rounded-2xl bg-gray-100">
                  <i className="fa-solid fa-image text-6xl text-gray-400"></i>
                </div>
              )}
            </div>
          </section>

          {/* Main Content */}
          <section id="listing-content" className="bg-gray-50 py-8">
            <div className="mx-auto max-w-7xl px-6">
              <div className="grid grid-cols-3 gap-8">
                <div className="col-span-2 space-y-8">
                  {/* Host Overview */}
                  <div
                    id="listing-overview"
                    className="rounded-2xl border border-gray-200 bg-white p-8"
                  >
                    <div className="mb-6 flex items-start justify-between">
                      <div>
                        <h2 className="mb-2 text-2xl font-bold text-gray-900">
                          {listing.category?.name || 'Item'} hosted by{' '}
                          {listing.host?.name || 'Host'}
                        </h2>
                        <div className="flex items-center space-x-4 text-gray-600">
                          <span>{listing.category?.name || 'Item'}</span>
                        </div>
                      </div>
                      {listing.host?.avatarUrl && (
                        <div className="h-14 w-14 overflow-hidden rounded-full">
                          <img
                            src={listing.host.avatarUrl}
                            alt={listing.host.name}
                            className="h-full w-full object-cover"
                            onError={(e) => {
                              e.currentTarget.src = '/placeholder.png';
                              e.currentTarget.onerror = null;
                            }}
                          />
                        </div>
                      )}
                    </div>

                    <div className="space-y-6 border-t border-gray-200 pt-6">
                      <div className="flex items-start space-x-4">
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-blue-100">
                          <i className="fa-solid fa-gauge-high text-blue-500"></i>
                        </div>
                        <div>
                          <h3 className="mb-1 font-semibold text-gray-900">
                            Great performance
                          </h3>
                          <p className="text-sm text-gray-600">
                            High-quality item in excellent condition
                          </p>
                        </div>
                      </div>

                      <div className="flex items-start space-x-4">
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-green-100">
                          <i className="fa-solid fa-shield-halved text-green-500"></i>
                        </div>
                        <div>
                          <h3 className="mb-1 font-semibold text-gray-900">
                            Insurance included
                          </h3>
                          <p className="text-sm text-gray-600">
                            Full coverage for peace of mind during your rental
                          </p>
                        </div>
                      </div>

                      <div className="flex items-start space-x-4">
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-purple-100">
                          <i className="fa-solid fa-calendar-check text-purple-500"></i>
                        </div>
                        <div>
                          <h3 className="mb-1 font-semibold text-gray-900">
                            Flexible booking
                          </h3>
                          <p className="text-sm text-gray-600">
                            Free cancellation up to 24 hours before pickup
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Description */}
                  <div
                    id="listing-description"
                    className="rounded-2xl border border-gray-200 bg-white p-8"
                  >
                    <h2 className="mb-4 text-xl font-bold text-gray-900">
                      About this{' '}
                      {listing.category?.name?.toLowerCase() || 'item'}
                    </h2>
                    <p className={`mb-4 leading-relaxed text-gray-700 ${!descExpanded && (listing.description?.length ?? 0) > 300 ? 'line-clamp-4' : ''}`}>
                      {listing.description || 'No description available.'}
                    </p>
                    {(listing.description?.length ?? 0) > 300 && (
                      <button
                        type="button"
                        onClick={() => setDescExpanded(v => !v)}
                        className="mt-3 font-medium text-blue-500 transition hover:underline"
                      >
                        {descExpanded ? 'Show less' : 'Show more'}
                      </button>
                    )}
                  </div>

                  {/* Features */}
                  <div
                    id="listing-features"
                    className="rounded-2xl border border-gray-200 bg-white p-8"
                  >
                    <h2 className="mb-6 text-xl font-bold text-gray-900">
                      What&apos;s included
                    </h2>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="flex items-center space-x-3">
                        <i className="fa-solid fa-check text-green-500"></i>
                        <span className="text-gray-700">
                          All accessories included
                        </span>
                      </div>
                      <div className="flex items-center space-x-3">
                        <i className="fa-solid fa-check text-green-500"></i>
                        <span className="text-gray-700">
                          Instruction manual
                        </span>
                      </div>
                      <div className="flex items-center space-x-3">
                        <i className="fa-solid fa-check text-green-500"></i>
                        <span className="text-gray-700">
                          Delivery available
                        </span>
                      </div>
                      <div className="flex items-center space-x-3">
                        <i className="fa-solid fa-check text-green-500"></i>
                        <span className="text-gray-700">24/7 support</span>
                      </div>
                    </div>
                  </div>

                  {/* Availability Calendar */}
                  <div
                    id="listing-calendar"
                    className="rounded-2xl border border-gray-200 bg-white p-8"
                  >
                    <h2 className="mb-2 text-xl font-bold text-gray-900">
                      Availability
                    </h2>
                    <p className="mb-6 text-sm text-gray-500">
                      {isDaily ? 'Select your check-in and check-out dates below.' : 'Pick a date then choose a time slot.'}
                    </p>

                    {isDaily ? (
                      <div className="rounded-xl border border-gray-200 p-6">
                        {/* Month navigation */}
                        <div className="mb-4 flex items-center justify-between">
                          <button
                            onClick={() => setCalDate(new Date(calYear, calMonth - 1, 1))}
                            className="rounded-lg p-2 transition hover:bg-gray-100"
                          >
                            <i className="fa-solid fa-chevron-left text-gray-600"></i>
                          </button>
                          <h3 className="font-semibold text-gray-900">
                            {MONTH_NAMES[calMonth]} {calYear}
                          </h3>
                          <button
                            onClick={() => setCalDate(new Date(calYear, calMonth + 1, 1))}
                            className="rounded-lg p-2 transition hover:bg-gray-100"
                          >
                            <i className="fa-solid fa-chevron-right text-gray-600"></i>
                          </button>
                        </div>

                        {/* Day headers */}
                        <div className="grid grid-cols-7 gap-1 text-center">
                          {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d) => (
                            <div key={d} className="py-2 text-xs font-medium text-gray-500">{d}</div>
                          ))}

                          {/* Empty cells before first day */}
                          {Array.from({ length: firstDay }).map((_, i) => (
                            <div key={`e${i}`} />
                          ))}

                          {/* Day cells */}
                          {Array.from({ length: totalDays }, (_, i) => {
                            const dayNum = i + 1;
                            const dayStr = `${calYear}-${String(calMonth + 1).padStart(2, '0')}-${String(dayNum).padStart(2, '0')}`;
                            return (
                              <div
                                key={dayNum}
                                onClick={() => handleDayClick(dayStr)}
                                className={`flex h-9 w-9 mx-auto items-center justify-center text-sm transition ${dayClass(dayStr)}`}
                              >
                                {dayNum}
                              </div>
                            );
                          })}
                        </div>

                        {/* Legend */}
                        <div className="mt-4 flex items-center space-x-6 border-t border-gray-200 pt-4 text-xs text-gray-500">
                          <div className="flex items-center space-x-2">
                            <div className="h-4 w-4 rounded-full bg-blue-500" />
                            <span>Selected</span>
                          </div>
                          <div className="flex items-center space-x-2">
                            <div className="h-4 w-4 rounded-full bg-blue-100" />
                            <span>In range</span>
                          </div>
                          {startDate && endDate && (
                            <span className="ml-auto font-medium text-blue-600">
                              {daysBetween(startDate, endDate)} night{daysBetween(startDate, endDate) !== 1 ? 's' : ''} selected
                            </span>
                          )}
                        </div>
                      </div>
                    ) : (
                      /* SLOT listing — date + slot picker */
                      <div className="space-y-4">
                        <div>
                          <label className="mb-1 block text-xs font-semibold text-gray-700">Select date</label>
                          <input
                            type="date"
                            min={today}
                            value={slotDay}
                            onChange={(e) => setSlotDay(e.target.value)}
                            className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                          />
                        </div>
                        {slotDay && (
                          <div>
                            <label className="mb-2 block text-xs font-semibold text-gray-700">Available slots</label>
                            {slotsLoading ? (
                              <p className="text-sm text-gray-500">Loading slots…</p>
                            ) : availableSlots.length === 0 ? (
                              <p className="text-sm text-gray-500">No slots available for this date.</p>
                            ) : (
                              <div className="grid grid-cols-3 gap-2">
                                {availableSlots.map((slot: any) => (
                                  <button
                                    key={slot.startTime}
                                    onClick={() => setSelectedSlot(slot)}
                                    className={`rounded-lg border px-3 py-2 text-sm transition ${selectedSlot?.startTime === slot.startTime
                                        ? 'border-blue-500 bg-blue-50 text-blue-700 font-medium'
                                        : 'border-gray-300 hover:border-blue-300'
                                      }`}
                                  >
                                    {slot.startTime}–{slot.endTime}
                                  </button>
                                ))}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Location */}
                  <div
                    id="listing-location"
                    className="rounded-2xl border border-gray-200 bg-white p-8"
                  >
                    <h2 className="mb-2 text-xl font-bold text-gray-900">
                      Location
                    </h2>
                    <p className="mb-6 text-gray-600">
                      {listing.address || 'Tunis, Tunisia'}
                    </p>
                    <div
                      className="relative overflow-hidden rounded-xl border border-gray-200"
                      style={{ height: '350px' }}
                    >
                      {listing.lat && listing.lng ? (
                        <ListingMap
                          listings={[listing]}
                          center={[Number(listing.lat), Number(listing.lng)]}
                          zoom={14}
                          height="350px"
                        />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center bg-gray-100">
                          <i className="fa-solid fa-map text-4xl text-gray-300"></i>
                        </div>
                      )}
                    </div>
                    <p className="mt-4 text-sm text-gray-600">
                      Exact location will be provided after booking confirmation
                    </p>
                  </div>

                  {/* Reviews */}
                  <div
                    id="listing-reviews"
                    className="rounded-2xl border border-gray-200 bg-white p-8"
                  >
                    <div className="mb-6 flex items-center justify-between">
                      <h2 className="flex items-center text-xl font-bold text-gray-900">
                        <i className="fa-solid fa-star mr-2 text-yellow-400"></i>
                        {reviews.length > 0
                          ? `${Number(listing.ratingAvg ?? 0).toFixed(1)} · ${reviews.length} ${reviews.length === 1 ? 'review' : 'reviews'}`
                          : 'No reviews yet'}
                      </h2>
                    </div>

                    {reviews.length === 0 ? (
                      <p className="text-sm text-gray-400">
                        No reviews yet. Be the first to review this listing after your stay!
                      </p>
                    ) : (
                      <>
                        <div className="space-y-6">
                          {(showAllReviews ? reviews : reviews.slice(0, 3)).map((review: any) => (
                            <div
                              key={review.id}
                              className="border-b border-gray-200 pb-6 last:border-b-0"
                            >
                              <div className="flex items-start space-x-4">
                                <div className="h-12 w-12 shrink-0 overflow-hidden rounded-full">
                                  <img
                                    src={review.author?.avatarUrl || '/placeholder.png'}
                                    alt={review.author?.name}
                                    className="h-full w-full object-cover"
                                    onError={(e) => {
                                      e.currentTarget.src = '/placeholder.png';
                                      e.currentTarget.onerror = null;
                                    }}
                                  />
                                </div>
                                <div className="flex-1">
                                  <div className="mb-1 flex items-center justify-between">
                                    <h4 className="font-semibold text-gray-900">
                                      {review.author?.name || 'Anonymous'}
                                    </h4>
                                    <span className="text-sm text-gray-500">
                                      {new Date(review.createdAt).toLocaleDateString()}
                                    </span>
                                  </div>
                                  <div className="mb-2 flex items-center">
                                    {Array.from({ length: 5 }, (_, i) => (
                                      <i
                                        key={i}
                                        className={`fa-solid fa-star text-xs ${i < review.rating ? 'text-yellow-400' : 'text-gray-300'
                                          }`}
                                      ></i>
                                    ))}
                                  </div>
                                  <p className="leading-relaxed text-sm text-gray-700">
                                    {review.comment}
                                  </p>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                        {reviews.length > 3 && (
                          <button
                            type="button"
                            onClick={() => setShowAllReviews(v => !v)}
                            className="mt-6 w-full rounded-lg border-2 border-gray-900 py-3 font-medium transition hover:bg-gray-50"
                          >
                            {showAllReviews ? 'Show fewer reviews' : `Show all ${reviews.length} reviews`}
                          </button>
                        )}
                      </>
                    )}
                  </div>

                  {/* Host Info */}
                  {listing.host && (
                    <div
                      id="host-info"
                      className="rounded-2xl border border-gray-200 bg-white p-8"
                    >
                      <h2 className="mb-6 text-xl font-bold text-gray-900">
                        Meet your host
                      </h2>
                      <div className="flex items-start space-x-6">
                        <div className="shrink-0">
                          <div className="h-24 w-24 overflow-hidden rounded-full border-4 border-blue-100">
                            <img
                              src={listing.host.avatarUrl || '/placeholder.png'}
                              alt={listing.host.name}
                              className="h-full w-full object-cover"
                              onError={(e) => {
                                e.currentTarget.src = '/placeholder.png';
                                e.currentTarget.onerror = null;
                              }}
                            />
                          </div>
                          <div className="mt-2 text-center">
                            {Number(listing.host?.ratingCount ?? 0) > 0 ? (
                              <>
                                <div className="flex items-center justify-center text-sm">
                                  <i className="fa-solid fa-star mr-1 text-yellow-400"></i>
                                  <span className="font-semibold">
                                    {Number(listing.host.ratingAvg ?? 0).toFixed(1)}
                                  </span>
                                </div>
                                <p className="mt-1 text-xs text-gray-500">
                                  {listing.host.ratingCount}{' '}
                                  {Number(listing.host.ratingCount) === 1 ? 'review' : 'reviews'}
                                </p>
                              </>
                            ) : (
                              <p className="text-xs text-gray-400">New host</p>
                            )}
                          </div>
                        </div>
                        <div className="flex-1">
                          <h3 className="mb-2 text-2xl font-bold text-gray-900">
                            {listing.host.name}
                          </h3>
                          <p className="mb-4 text-gray-600">
                            {listing.host.createdAt
                              ? `Joined in ${new Date(listing.host.createdAt).getFullYear()}`
                              : 'Host'}
                          </p>
                          <div className="mb-6 space-y-3 text-sm text-gray-700">
                            <div className="flex items-center">
                              <i className="fa-solid fa-shield-halved mr-3 text-gray-400"></i>
                              <span>Identity verified</span>
                            </div>
                            <div className="flex items-center">
                              <i className="fa-solid fa-medal mr-3 text-gray-400"></i>
                              <span>Superhost</span>
                            </div>
                            <div className="flex items-center">
                              <i className="fa-solid fa-comment mr-3 text-gray-400"></i>
                              <span>Response rate: 100%</span>
                            </div>
                            <div className="flex items-center">
                              <i className="fa-solid fa-clock mr-3 text-gray-400"></i>
                              <span>Response time: within an hour</span>
                            </div>
                          </div>
                          <Link
                            href={`/messages?hostId=${listing.host.id}`}
                            className="rounded-lg border-2 border-gray-900 px-6 py-3 font-medium transition hover:bg-gray-50 inline-block"
                          >
                            Contact host
                          </Link>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Rental Rules */}
                  <div
                    id="rental-rules"
                    className="rounded-2xl border border-gray-200 bg-white p-8"
                  >
                    <h2 className="mb-6 text-xl font-bold text-gray-900">
                      Things to know
                    </h2>
                    <div className="grid grid-cols-3 gap-8">
                      <div>
                        <h3 className="mb-3 font-semibold text-gray-900">
                          Rental rules
                        </h3>
                        <ul className="space-y-2 text-sm text-gray-700">
                          <li>Valid ID required</li>
                          <li>Minimum age: 18 years</li>
                          <li>Return in same condition</li>
                          <li>Follow usage guidelines</li>
                        </ul>
                      </div>
                      <div>
                        <h3 className="mb-3 font-semibold text-gray-900">
                          Cancellation —{' '}
                          <span className="text-gray-600 capitalize">
                            {(listing.cancellationPolicy ?? 'MODERATE').toLowerCase()}
                          </span>
                        </h3>
                        <ul className="space-y-2 text-sm text-gray-700">
                          {cancellationPolicyRules(
                            listing.cancellationPolicy ?? 'MODERATE',
                          ).map((line, i) => (
                            <li key={i}>{line}</li>
                          ))}
                        </ul>
                      </div>
                      <div>
                        <h3 className="mb-3 font-semibold text-gray-900">
                          Safety
                        </h3>
                        <ul className="space-y-2 text-sm text-gray-700">
                          <li>Insurance included</li>
                          <li>24/7 support available</li>
                          <li>Secure payment</li>
                        </ul>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Booking Card */}
                <div className="col-span-1">
                  <div
                    id="booking-card"
                    className="sticky top-6 rounded-2xl border border-gray-200 bg-white p-6 shadow-lg"
                  >
                    <div className="mb-6">
                      <div className="mb-2 flex items-baseline">
                        <span className="text-3xl font-bold text-gray-900">
                          {formatTnd(listing.pricePerDay)}
                        </span>
                        <span className="ml-2 text-gray-600">/ day</span>
                      </div>
                      {Number(listing.ratingCount ?? 0) > 0 ? (
                        <div className="flex items-center text-sm">
                          <i className="fa-solid fa-star mr-1 text-yellow-400"></i>
                          <span className="mr-1 font-semibold">
                            {Number(listing.ratingAvg ?? 0).toFixed(1)}
                          </span>
                          <span className="text-gray-500">
                            ({listing.ratingCount}{' '}
                            {Number(listing.ratingCount) === 1 ? 'review' : 'reviews'}
                            )
                          </span>
                        </div>
                      ) : (
                        <div className="text-xs text-gray-400">No reviews yet</div>
                      )}
                    </div>

                    <div className="mb-6 space-y-3">
                      {isDaily ? (
                        <div className="rounded-lg border border-gray-300">
                          <div className="flex border-b border-gray-300">
                            <div className="flex-1 p-3">
                              <label className="mb-1 block text-xs font-semibold text-gray-700">
                                CHECK-IN
                              </label>
                              <input
                                type="date"
                                min={today}
                                value={startDate}
                                onChange={(e) => {
                                  setStartDate(e.target.value);
                                  if (endDate && endDate <= e.target.value) setEndDate('');
                                }}
                                className="w-full text-sm text-gray-900 focus:outline-none"
                              />
                            </div>
                            <div className="flex-1 border-l border-gray-300 p-3">
                              <label className="mb-1 block text-xs font-semibold text-gray-700">
                                CHECK-OUT
                              </label>
                              <input
                                type="date"
                                min={startDate || today}
                                value={endDate}
                                onChange={(e) => setEndDate(e.target.value)}
                                className="w-full text-sm text-gray-900 focus:outline-none"
                                disabled={!startDate}
                              />
                            </div>
                          </div>
                        </div>
                      ) : (
                        /* SLOT booking card */
                        <div className="rounded-lg border border-gray-300 p-3 space-y-3">
                          <div>
                            <label className="mb-1 block text-xs font-semibold text-gray-700">DATE</label>
                            <input
                              type="date"
                              min={today}
                              value={slotDay}
                              onChange={(e) => setSlotDay(e.target.value)}
                              className="w-full text-sm text-gray-900 focus:outline-none"
                            />
                          </div>
                          {slotDay && (
                            <div>
                              <label className="mb-1 block text-xs font-semibold text-gray-700">TIME SLOT</label>
                              {slotsLoading ? (
                                <p className="text-xs text-gray-400">Loading…</p>
                              ) : availableSlots.length === 0 ? (
                                <p className="text-xs text-gray-400">No slots available.</p>
                              ) : (
                                <select
                                  value={selectedSlot ? `${selectedSlot.startTime}-${selectedSlot.endTime}` : ''}
                                  onChange={(e) => {
                                    const slot = availableSlots.find(
                                      (s: any) => `${s.startTime}-${s.endTime}` === e.target.value,
                                    );
                                    setSelectedSlot(slot || null);
                                  }}
                                  className="w-full rounded border border-gray-300 px-2 py-1 text-sm focus:outline-none"
                                >
                                  <option value="">Select a slot</option>
                                  {availableSlots.map((s: any) => (
                                    <option key={s.startTime} value={`${s.startTime}-${s.endTime}`}>
                                      {s.startTime} – {s.endTime}
                                    </option>
                                  ))}
                                </select>
                              )}
                            </div>
                          )}
                        </div>
                      )}
                    </div>

                    <button
                      onClick={handleBook}
                      disabled={isDaily ? (!startDate || !endDate) : (!slotDay || !selectedSlot)}
                      className="mb-4 w-full rounded-lg bg-blue-500 py-4 font-semibold text-white transition hover:bg-blue-600 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      Request to book
                    </button>

                    <p className="mb-6 text-center text-xs text-gray-500">
                      You won&apos;t be charged yet
                    </p>

                    {nightsCount > 0 && (
                      <div className="space-y-3 border-b border-gray-200 pb-6 text-sm">
                        <div className="flex items-center justify-between">
                          <span className="text-gray-700">
                            {formatTnd(basePrice)} × {nightsCount} {isSlot ? 'slot' : 'night'}{nightsCount !== 1 ? 's' : ''}
                          </span>
                          <span className="text-gray-900">{formatTnd(subtotal)}</span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-gray-700">Service fee (10%)</span>
                          <span className="text-gray-900">{formatTnd(serviceFee)}</span>
                        </div>
                      </div>
                    )}

                    <div className="flex items-center justify-between pt-6 font-semibold">
                      <span className="text-gray-900">Total</span>
                      <span className="text-lg text-gray-900">
                        {nightsCount > 0 ? formatTnd(total) : '—'}
                      </span>
                    </div>

                    <div className="pt-6">
                      <BookingProtectionBadge variant="card" />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* "You might also like" — content similarity from listing embeddings */}
          {(similarQuery.data ?? []).length > 0 && (
            <section id="similar-listings" className="bg-gray-50 py-12">
              <div className="mx-auto max-w-7xl px-6">
                <div className="mb-6">
                  <h2 className="text-2xl font-bold text-gray-900">You might also like</h2>
                  <p className="mt-1 text-sm text-gray-500">
                    Listings similar to this one, picked by our recommendation engine.
                  </p>
                </div>
                <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
                  {(similarQuery.data ?? []).map((l) => (
                    <ListingCard key={l.id} listing={l as any} />
                  ))}
                </div>
              </div>
            </section>
          )}
        </>
      ) : (
        <div className="mx-auto max-w-7xl px-6 py-8">
          <EmptyState
            icon="fa-solid fa-circle-question"
            title="Not found"
            message="This listing no longer exists."
            cta={{ label: 'Browse listings', href: '/search' }}
          />
        </div>
      )}
    </Layout>
  );
}

/**
 * Server-side fetch so the HTML response carries real meta tags + JSON-LD.
 * Without this the page renders an empty shell for crawlers and we miss
 * all organic search traffic — the highest-converting acquisition channel
 * for a marketplace.
 *
 * Falls back to `seo: null` (no per-page tags, _app.tsx defaults kick in)
 * if the API is unreachable. Never crashes the page render.
 */
export const getServerSideProps: GetServerSideProps<PageProps> = async (ctx) => {
  const id = ctx.params?.id as string | undefined;
  if (!id) return { props: { seo: null } };

  const apiBase =
    process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, '') ||
    process.env.API_INTERNAL_URL?.replace(/\/$/, '') ||
    'http://localhost:3001';
  const siteBase =
    process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, '') ||
    'https://renteverything.tn';

  try {
    const res = await fetch(`${apiBase}/api/listings/${encodeURIComponent(id)}`, {
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) return { props: { seo: null } };
    const body = await res.json();
    const listing = body?.data ?? body;
    if (!listing?.id) return { props: { seo: null } };

    const title =
      `${listing.title} — ${formatCity(listing.address)} | RentEverything`.slice(0, 70);
    const description =
      (listing.description ?? '')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 160) || `Rent ${listing.title} on RentEverything.`;
    const url = `${siteBase}/listings/${listing.id}`;
    const image = Array.isArray(listing.images) && listing.images[0]
      ? (String(listing.images[0]).startsWith('http')
        ? listing.images[0]
        : `${apiBase}${listing.images[0]}`)
      : null;

    const jsonLd = JSON.stringify({
      '@context': 'https://schema.org',
      '@type': 'Product',
      name: listing.title,
      description,
      image: image ? [image] : undefined,
      url,
      offers: listing.pricePerDay
        ? {
          '@type': 'Offer',
          priceCurrency: 'TND',
          price: Number(listing.pricePerDay),
          availability: listing.isActive
            ? 'https://schema.org/InStock'
            : 'https://schema.org/OutOfStock',
          url,
        }
        : undefined,
      aggregateRating:
        Number(listing.ratingAvg) > 0 && Number(listing.ratingCount ?? 0) > 0
          ? {
            '@type': 'AggregateRating',
            ratingValue: Number(listing.ratingAvg),
            reviewCount: Number(listing.ratingCount),
          }
          : undefined,
    });

    return {
      props: {
        seo: {
          title,
          description,
          image,
          url,
          pricePerDay: listing.pricePerDay ? Number(listing.pricePerDay) : null,
          ratingAvg: Number(listing.ratingAvg ?? 0),
          ratingCount: Number(listing.ratingCount ?? 0),
          jsonLd,
        },
      },
    };
  } catch {
    return { props: { seo: null } };
  }
};

function formatCity(address: string | null | undefined): string {
  if (!address) return 'Tunisia';
  const parts = address.split(',').map((s) => s.trim()).filter(Boolean);
  return parts[parts.length - 1] || 'Tunisia';
}
