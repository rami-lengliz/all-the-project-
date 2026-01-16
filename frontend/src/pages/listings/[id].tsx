import Link from 'next/link';
import { Layout } from '@/components/layout/Layout';
import { useRouter } from 'next/router';
import { useListing } from '@/lib/api/hooks/useListing';
import { useReviewsByUser } from '@/lib/api/hooks/useReviewsByUser';
import { formatTnd } from '@/lib/utils/format';
import { LoadingCard } from '@/components/ui/LoadingCard';
import { InlineError } from '@/components/ui/InlineError';
import { EmptyState } from '@/components/ui/EmptyState';
import { useState } from 'react';

export default function ListingDetailsPage() {
  const router = useRouter();
  const id = router.query.id as string | undefined;
  const listingQuery = useListing(id);
  const listing = listingQuery.data as any;
  const reviewsQuery = useReviewsByUser(listing?.host?.id);
  const reviews = (reviewsQuery.data as any)?.data || [];
  const [showAllPhotos, setShowAllPhotos] = useState(false);

  const images = listing?.images || [];
  const displayImages = showAllPhotos ? images : images.slice(0, 5);

  return (
    <Layout>
      {listingQuery.isLoading ? (
        <div className="mx-auto max-w-7xl px-6 py-8">
          <LoadingCard />
        </div>
      ) : listingQuery.isError ? (
        <div className="mx-auto max-w-7xl px-6 py-8">
          <InlineError message="Failed to load listing." onRetry={() => void listingQuery.refetch()} />
        </div>
      ) : listing ? (
        <>
          {/* Breadcrumb Navigation */}
          <section id="breadcrumb-nav" className="border-b border-gray-100 bg-white">
            <div className="mx-auto max-w-7xl px-6 py-3">
              <div className="flex items-center text-sm text-gray-600">
                <Link href="/" className="transition hover:text-gray-900">
                  Home
                </Link>
                <i className="fa-solid fa-chevron-right mx-2 text-xs"></i>
                <Link href="/search" className="transition hover:text-gray-900">
                  {listing.category?.name || 'Listings'}
                </Link>
                <i className="fa-solid fa-chevron-right mx-2 text-xs"></i>
                <span className="font-medium text-gray-900">{listing.title}</span>
              </div>
            </div>
          </section>

          {/* Listing Header */}
          <section id="listing-header" className="bg-white py-6">
            <div className="mx-auto max-w-7xl px-6">
              <div className="flex items-start justify-between">
                <div>
                  <h1 className="mb-2 text-3xl font-bold text-gray-900">{listing.title}</h1>
                  <div className="flex items-center space-x-4 text-sm">
                    <div className="flex items-center">
                      <i className="fa-solid fa-star mr-1 text-yellow-400"></i>
                      <span className="font-semibold">4.8</span>
                      <span className="ml-1 text-gray-500">({reviews.length} reviews)</span>
                    </div>
                    <span className="text-gray-400">•</span>
                    <div className="flex items-center text-gray-700">
                      <i className="fa-solid fa-location-dot mr-1 text-blue-500"></i>
                      <span>{listing.address || 'Tunis, Tunisia'}</span>
                    </div>
                  </div>
                </div>
                <div className="flex items-center space-x-3">
                  <button className="flex items-center space-x-2 rounded-lg px-4 py-2 transition hover:bg-gray-100">
                    <i className="fa-solid fa-share-nodes text-gray-700"></i>
                    <span className="text-sm font-medium">Share</span>
                  </button>
                  <button className="flex items-center space-x-2 rounded-lg px-4 py-2 transition hover:bg-gray-100">
                    <i className="fa-regular fa-heart text-gray-700"></i>
                    <span className="text-sm font-medium">Save</span>
                  </button>
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
                      className={`${
                        idx === 0 ? 'col-span-2 row-span-2' : ''
                      } cursor-pointer overflow-hidden transition hover:brightness-95`}
                    >
                      <img
                        className="h-full w-full object-cover"
                        src={img.startsWith('http') ? img : `http://localhost:3000${img}`}
                        alt={`${listing.title} ${idx + 1}`}
                      />
                    </div>
                  ))}
                  {images.length > 5 && !showAllPhotos && (
                    <div className="relative">
                      <img
                        className="h-full w-full object-cover"
                        src={images[5]}
                        alt={`${listing.title} 6`}
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
                  <div id="listing-overview" className="rounded-2xl border border-gray-200 bg-white p-8">
                    <div className="mb-6 flex items-start justify-between">
                      <div>
                        <h2 className="mb-2 text-2xl font-bold text-gray-900">
                          {listing.category?.name || 'Item'} hosted by {listing.host?.name || 'Host'}
                        </h2>
                        <div className="flex items-center space-x-4 text-gray-600">
                          <span>{listing.category?.name || 'Item'}</span>
                        </div>
                      </div>
                      {listing.host?.avatarUrl && (
                        <div className="h-14 w-14 overflow-hidden rounded-full">
                          <img src={listing.host.avatarUrl} alt={listing.host.name} className="h-full w-full object-cover" />
                        </div>
                      )}
                    </div>

                    <div className="space-y-6 border-t border-gray-200 pt-6">
                      <div className="flex items-start space-x-4">
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-blue-100">
                          <i className="fa-solid fa-gauge-high text-blue-500"></i>
                        </div>
                        <div>
                          <h3 className="mb-1 font-semibold text-gray-900">Great performance</h3>
                          <p className="text-sm text-gray-600">High-quality item in excellent condition</p>
                        </div>
                      </div>

                      <div className="flex items-start space-x-4">
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-green-100">
                          <i className="fa-solid fa-shield-halved text-green-500"></i>
                        </div>
                        <div>
                          <h3 className="mb-1 font-semibold text-gray-900">Insurance included</h3>
                          <p className="text-sm text-gray-600">Full coverage for peace of mind during your rental</p>
                        </div>
                      </div>

                      <div className="flex items-start space-x-4">
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-purple-100">
                          <i className="fa-solid fa-calendar-check text-purple-500"></i>
                        </div>
                        <div>
                          <h3 className="mb-1 font-semibold text-gray-900">Flexible booking</h3>
                          <p className="text-sm text-gray-600">Free cancellation up to 24 hours before pickup</p>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Description */}
                  <div id="listing-description" className="rounded-2xl border border-gray-200 bg-white p-8">
                    <h2 className="mb-4 text-xl font-bold text-gray-900">About this {listing.category?.name?.toLowerCase() || 'item'}</h2>
                    <p className="mb-4 leading-relaxed text-gray-700">{listing.description || 'No description available.'}</p>
                    <button className="mt-3 font-medium text-blue-500 transition hover:underline">Show more</button>
                  </div>

                  {/* Features */}
                  <div id="listing-features" className="rounded-2xl border border-gray-200 bg-white p-8">
                    <h2 className="mb-6 text-xl font-bold text-gray-900">What&apos;s included</h2>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="flex items-center space-x-3">
                        <i className="fa-solid fa-check text-green-500"></i>
                        <span className="text-gray-700">All accessories included</span>
                      </div>
                      <div className="flex items-center space-x-3">
                        <i className="fa-solid fa-check text-green-500"></i>
                        <span className="text-gray-700">Instruction manual</span>
                      </div>
                      <div className="flex items-center space-x-3">
                        <i className="fa-solid fa-check text-green-500"></i>
                        <span className="text-gray-700">Delivery available</span>
                      </div>
                      <div className="flex items-center space-x-3">
                        <i className="fa-solid fa-check text-green-500"></i>
                        <span className="text-gray-700">24/7 support</span>
                      </div>
                    </div>
                  </div>

                  {/* Availability Calendar */}
                  <div id="listing-calendar" className="rounded-2xl border border-gray-200 bg-white p-8">
                    <h2 className="mb-6 text-xl font-bold text-gray-900">Availability</h2>
                    <div className="rounded-xl border border-gray-200 p-6">
                      <div className="mb-4 flex items-center justify-between">
                        <button className="rounded-lg p-2 transition hover:bg-gray-100">
                          <i className="fa-solid fa-chevron-left text-gray-600"></i>
                        </button>
                        <h3 className="font-semibold text-gray-900">January 2024</h3>
                        <button className="rounded-lg p-2 transition hover:bg-gray-100">
                          <i className="fa-solid fa-chevron-right text-gray-600"></i>
                        </button>
                      </div>
                      <div className="grid grid-cols-7 gap-2 text-center">
                        {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((day) => (
                          <div key={day} className="py-2 text-xs font-medium text-gray-500">
                            {day}
                          </div>
                        ))}
                        {Array.from({ length: 31 }, (_, i) => i + 1).map((day) => (
                          <div
                            key={day}
                            className={`py-2 text-sm ${
                              day >= 4 && day <= 14
                                ? 'cursor-pointer rounded-lg bg-gray-200'
                                : day >= 15 && day <= 25
                                  ? 'cursor-pointer rounded-lg text-gray-900 transition hover:bg-gray-100'
                                  : 'text-gray-400'
                            }`}
                          >
                            {day}
                          </div>
                        ))}
                      </div>
                      <div className="mt-4 flex items-center justify-between border-t border-gray-200 pt-4 text-sm">
                        <div className="flex items-center space-x-2">
                          <div className="h-4 w-4 rounded bg-gray-200"></div>
                          <span className="text-gray-600">Booked</span>
                        </div>
                        <div className="flex items-center space-x-2">
                          <div className="h-4 w-4 rounded border-2 border-gray-300"></div>
                          <span className="text-gray-600">Available</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Location */}
                  <div id="listing-location" className="rounded-2xl border border-gray-200 bg-white p-8">
                    <h2 className="mb-2 text-xl font-bold text-gray-900">Location</h2>
                    <p className="mb-6 text-gray-600">{listing.address || 'Tunis, Tunisia'}</p>
                    <div className="relative overflow-hidden rounded-xl border border-gray-200" style={{ height: '350px' }}>
                      <img
                        className="h-full w-full object-cover"
                        src="https://storage.googleapis.com/uxpilot-auth.appspot.com/e61652dc21-cab20e8e19405eef87bb.png"
                        alt="map view showing location"
                      />
                      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2">
                        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-blue-500 shadow-lg">
                          <i className="fa-solid fa-location-dot text-2xl text-white"></i>
                        </div>
                      </div>
                    </div>
                    <p className="mt-4 text-sm text-gray-600">Exact location will be provided after booking confirmation</p>
                  </div>

                  {/* Reviews */}
                  {reviews.length > 0 && (
                    <div id="listing-reviews" className="rounded-2xl border border-gray-200 bg-white p-8">
                      <div className="mb-6 flex items-center justify-between">
                        <h2 className="flex items-center text-xl font-bold text-gray-900">
                          <i className="fa-solid fa-star mr-2 text-yellow-400"></i>
                          4.8 · {reviews.length} reviews
                        </h2>
                      </div>

                      <div className="space-y-6">
                        {reviews.slice(0, 3).map((review: any) => (
                          <div key={review.id} className="border-b border-gray-200 pb-6 last:border-b-0">
                            <div className="flex items-start space-x-4">
                              <div className="h-12 w-12 shrink-0 overflow-hidden rounded-full">
                                <img
                                  src={review.author?.avatarUrl || 'https://via.placeholder.com/48'}
                                  alt={review.author?.name}
                                  className="h-full w-full object-cover"
                                />
                              </div>
                              <div className="flex-1">
                                <div className="mb-1 flex items-center justify-between">
                                  <h4 className="font-semibold text-gray-900">{review.author?.name || 'Anonymous'}</h4>
                                  <span className="text-sm text-gray-500">
                                    {new Date(review.createdAt).toLocaleDateString()}
                                  </span>
                                </div>
                                <div className="mb-2 flex items-center">
                                  {Array.from({ length: 5 }, (_, i) => (
                                    <i
                                      key={i}
                                      className={`fa-solid fa-star text-xs ${
                                        i < review.rating ? 'text-yellow-400' : 'text-gray-300'
                                      }`}
                                    ></i>
                                  ))}
                                </div>
                                <p className="leading-relaxed text-sm text-gray-700">{review.comment}</p>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>

                      <button className="mt-6 w-full rounded-lg border-2 border-gray-900 py-3 font-medium transition hover:bg-gray-50">
                        Show all {reviews.length} reviews
                      </button>
                    </div>
                  )}

                  {/* Host Info */}
                  {listing.host && (
                    <div id="host-info" className="rounded-2xl border border-gray-200 bg-white p-8">
                      <h2 className="mb-6 text-xl font-bold text-gray-900">Meet your host</h2>
                      <div className="flex items-start space-x-6">
                        <div className="shrink-0">
                          <div className="h-24 w-24 overflow-hidden rounded-full border-4 border-blue-100">
                            <img
                              src={listing.host.avatarUrl || 'https://via.placeholder.com/96'}
                              alt={listing.host.name}
                              className="h-full w-full object-cover"
                            />
                          </div>
                          <div className="mt-2 text-center">
                            <div className="flex items-center justify-center text-sm">
                              <i className="fa-solid fa-star mr-1 text-yellow-400"></i>
                              <span className="font-semibold">4.9</span>
                            </div>
                            <p className="mt-1 text-xs text-gray-500">{reviews.length} reviews</p>
                          </div>
                        </div>
                        <div className="flex-1">
                          <h3 className="mb-2 text-2xl font-bold text-gray-900">{listing.host.name}</h3>
                          <p className="mb-4 text-gray-600">Joined in 2022</p>
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
                          <button className="rounded-lg border-2 border-gray-900 px-6 py-3 font-medium transition hover:bg-gray-50">
                            Contact host
                          </button>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Rental Rules */}
                  <div id="rental-rules" className="rounded-2xl border border-gray-200 bg-white p-8">
                    <h2 className="mb-6 text-xl font-bold text-gray-900">Things to know</h2>
                    <div className="grid grid-cols-3 gap-8">
                      <div>
                        <h3 className="mb-3 font-semibold text-gray-900">Rental rules</h3>
                        <ul className="space-y-2 text-sm text-gray-700">
                          <li>Valid ID required</li>
                          <li>Minimum age: 18 years</li>
                          <li>Return in same condition</li>
                          <li>Follow usage guidelines</li>
                        </ul>
                      </div>
                      <div>
                        <h3 className="mb-3 font-semibold text-gray-900">Cancellation</h3>
                        <ul className="space-y-2 text-sm text-gray-700">
                          <li>Free cancellation 24h before</li>
                          <li>50% refund within 24h</li>
                          <li>No refund after pickup</li>
                        </ul>
                      </div>
                      <div>
                        <h3 className="mb-3 font-semibold text-gray-900">Safety</h3>
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
                  <div id="booking-card" className="sticky top-6 rounded-2xl border border-gray-200 bg-white p-6 shadow-lg">
                    <div className="mb-6">
                      <div className="mb-2 flex items-baseline">
                        <span className="text-3xl font-bold text-gray-900">{formatTnd(listing.pricePerDay)}</span>
                        <span className="ml-2 text-gray-600">/ day</span>
                      </div>
                      <div className="flex items-center text-sm">
                        <i className="fa-solid fa-star mr-1 text-yellow-400"></i>
                        <span className="mr-1 font-semibold">4.8</span>
                        <span className="text-gray-500">({reviews.length} reviews)</span>
                      </div>
                    </div>

                    <div className="mb-6 space-y-3">
                      <div className="rounded-lg border border-gray-300">
                        <div className="flex border-b border-gray-300">
                          <div className="flex-1 p-3">
                            <label className="mb-1 block text-xs font-semibold text-gray-700">PICKUP</label>
                            <input
                              type="text"
                              placeholder="Select date"
                              className="w-full text-sm text-gray-900 focus:outline-none"
                            />
                          </div>
                          <div className="flex-1 border-l border-gray-300 p-3">
                            <label className="mb-1 block text-xs font-semibold text-gray-700">RETURN</label>
                            <input
                              type="text"
                              placeholder="Select date"
                              className="w-full text-sm text-gray-900 focus:outline-none"
                            />
                          </div>
                        </div>
                        <div className="p-3">
                          <label className="mb-1 block text-xs font-semibold text-gray-700">TIME</label>
                          <select className="w-full text-sm text-gray-900 focus:outline-none">
                            <option>10:00 AM</option>
                            <option>11:00 AM</option>
                            <option>12:00 PM</option>
                            <option>1:00 PM</option>
                          </select>
                        </div>
                      </div>
                    </div>

                    <button
                      onClick={() => router.push(`/booking/${listing.id}`)}
                      className="mb-4 w-full rounded-lg bg-blue-500 py-4 font-semibold text-white transition hover:bg-blue-600"
                    >
                      Request to book
                    </button>

                    <p className="mb-6 text-center text-xs text-gray-500">You won&apos;t be charged yet</p>

                    <div className="space-y-3 border-b border-gray-200 pb-6 text-sm">
                      <div className="flex items-center justify-between">
                        <span className="text-gray-700">{formatTnd(listing.pricePerDay)} × 3 days</span>
                        <span className="text-gray-900">{formatTnd(listing.pricePerDay * 3)}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-gray-700">Service fee</span>
                        <span className="text-gray-900">{formatTnd(listing.pricePerDay * 0.1)}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-gray-700">Insurance</span>
                        <span className="text-gray-900">{formatTnd(listing.pricePerDay * 0.05)}</span>
                      </div>
                    </div>

                    <div className="flex items-center justify-between pt-6 font-semibold">
                      <span className="text-gray-900">Total</span>
                      <span className="text-lg text-gray-900">
                        {formatTnd(listing.pricePerDay * 3 + listing.pricePerDay * 0.1 + listing.pricePerDay * 0.05)}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </section>
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
