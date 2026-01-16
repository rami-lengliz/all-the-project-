import Link from 'next/link';
import { useRouter } from 'next/router';
import { Layout } from '@/components/layout/Layout';
import { useAuth } from '@/lib/auth/AuthProvider';
import { useProfile } from '@/lib/api/hooks/useProfile';
import { useBecomeHost } from '@/lib/api/hooks/useBecomeHost';
import { useVerifyUser } from '@/lib/api/hooks/useVerifyUser';
import { useMyBookings } from '@/lib/api/hooks/useMyBookings';
import { useReviewsByUser } from '@/lib/api/hooks/useReviewsByUser';
import { LoadingCard } from '@/components/ui/LoadingCard';
import { InlineError } from '@/components/ui/InlineError';
import { EmptyState } from '@/components/ui/EmptyState';
import { toast } from '@/components/ui/Toaster';

export default function ProfilePage() {
  const router = useRouter();
  const { user, refreshUser } = useAuth();
  const query = useProfile();
  const becomeHostMutation = useBecomeHost();
  const verifyUserMutation = useVerifyUser();
  const bookingsQuery = useMyBookings();
  const reviewsQuery = useReviewsByUser(user?.id || query.data?.id);

  const handleBecomeHost = async () => {
    try {
      await becomeHostMutation.mutateAsync();
      await refreshUser();
      await new Promise((resolve) => setTimeout(resolve, 100));
      toast({ title: 'You are now a host!', variant: 'success' });
      router.push('/host/dashboard');
    } catch (error: any) {
      console.error('[Profile] Full error object:', error);
      let message = 'Failed to become a host. Please try again.';
      const errorBody = error?.body || error?.response?.data;
      if (errorBody) {
        if (typeof errorBody === 'string') {
          message = errorBody;
        } else if (errorBody.message) {
          message = Array.isArray(errorBody.message) ? errorBody.message.join(', ') : errorBody.message;
        } else if (errorBody.error) {
          message = Array.isArray(errorBody.error) ? errorBody.error.join(', ') : errorBody.error;
        }
      } else if (error?.message && error.message !== 'Bad Request') {
        message = error.message;
      }
      toast({ title: 'Error', message, variant: 'error' });
    }
  };

  const profileData = query.data as any;
  const isHost = profileData?.isHost || user?.isHost;
  const isVerified = Boolean(
    profileData?.verifiedEmail || profileData?.verifiedPhone || user?.verifiedEmail || user?.verifiedPhone
  );

  const handleVerifyAccount = async () => {
    try {
      await verifyUserMutation.mutateAsync();
      await query.refetch();
      await refreshUser();
      toast({ title: 'Account verified!', message: 'Your email and phone have been verified.', variant: 'success' });
    } catch (error: any) {
      const message = error?.response?.data?.message || error?.message || 'Failed to verify account. Please try again.';
      toast({ title: 'Error', message, variant: 'error' });
    }
  };

  // Calculate stats
  const bookings = (bookingsQuery.data as any) || [];
  const totalRentals = bookings.length;
  const completedRentals = bookings.filter((b: any) => b.status === 'completed' || b.status === 'confirmed').length;
  const activeRentals = bookings.filter((b: any) => b.status === 'confirmed' || b.status === 'pending').length;

  const reviews = (reviewsQuery.data as any)?.data || [];
  const averageRatingRaw = profileData?.ratingAvg ?? user?.ratingAvg ?? 4.8;
  const averageRating = typeof averageRatingRaw === 'number' ? averageRatingRaw : parseFloat(String(averageRatingRaw)) || 4.8;
  const reviewsCountRaw = reviews.length || profileData?.ratingCount || user?.ratingCount || 0;
  const reviewsCount = typeof reviewsCountRaw === 'number' ? reviewsCountRaw : parseInt(String(reviewsCountRaw), 10) || 0;

  const memberSince = profileData?.createdAt
    ? new Date(profileData.createdAt).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
    : 'Jan 2024';

  if (query.isLoading) {
    return (
      <Layout>
        <div className="mx-auto max-w-7xl px-6 py-8">
          <LoadingCard />
        </div>
      </Layout>
    );
  }

  if (query.isError) {
    return (
      <Layout>
        <div className="mx-auto max-w-7xl px-6 py-8">
          <InlineError message="Failed to load profile." onRetry={() => void query.refetch()} />
        </div>
      </Layout>
    );
  }

  if (!query.data && !user) {
    return (
      <Layout>
        <div className="mx-auto max-w-7xl px-6 py-8">
          <EmptyState icon="fa-solid fa-user" title="Not signed in" message="Please log in to view your profile." />
        </div>
      </Layout>
    );
  }

  const displayUser = profileData || user;
  const displayName = displayUser?.name || 'User';
  const displayLocation = displayUser?.address?.split(',')?.slice(-2)?.join(',')?.trim() || 'Tunis, Tunisia';
  const displayAvatar = displayUser?.avatarUrl || 'https://via.placeholder.com/128';

  return (
    <Layout>
      {/* Profile Hero Section */}
      <section id="profile-hero" className="border-b border-gray-200 bg-white py-8">
        <div className="mx-auto max-w-7xl px-6">
          <div className="flex items-start justify-between">
            <div className="flex items-start space-x-6">
              <div className="relative">
                <div className="h-32 w-32 overflow-hidden rounded-full border-4 border-white shadow-lg">
                  <img src={displayAvatar} alt="Profile" className="h-full w-full object-cover" />
                </div>
                <button className="absolute bottom-0 right-0 flex h-10 w-10 items-center justify-center rounded-full bg-blue-500 shadow-lg transition hover:bg-blue-600">
                  <i className="fa-solid fa-camera text-sm text-white"></i>
                </button>
              </div>

              <div>
                <h1 className="mb-2 text-3xl font-bold text-gray-900">{displayName}</h1>
                <div className="mb-3 flex items-center space-x-4">
                  <div className="flex items-center">
                    <i className="fa-solid fa-star mr-1 text-yellow-400"></i>
                    <span className="font-semibold text-gray-900">{averageRating.toFixed(1)}</span>
                    <span className="ml-1 text-gray-500">({reviewsCount} reviews)</span>
                  </div>
                  <span className="text-gray-400">•</span>
                  <div className="flex items-center text-gray-600">
                    <i className="fa-solid fa-location-dot mr-1"></i>
                    <span>{displayLocation}</span>
                  </div>
                </div>
                <div className="mb-4 flex items-center space-x-2">
                  <div className="flex items-center rounded-full bg-blue-100 px-4 py-1 text-sm font-medium text-blue-700">
                    <i className="fa-solid fa-user mr-2"></i>
                    Currently a {isHost ? 'Host' : 'Renter'}
                  </div>
                  <span className="text-gray-400">•</span>
                  <span className="text-sm text-gray-600">Member since {memberSince}</span>
                </div>
                <p className="max-w-2xl text-gray-600">
                  {displayUser?.description ||
                    'Passionate about exploring local experiences and connecting with the community. Love traveling and discovering new places.'}
                </p>
              </div>
            </div>

            {!isHost && (
              <div>
                {!isVerified && (
                  <div className="mb-4 rounded-lg border border-yellow-300 bg-yellow-50 p-4">
                    <p className="mb-3 text-sm text-yellow-800">
                      <i className="fa-solid fa-exclamation-triangle mr-2"></i>
                      Your account needs to be verified before you can become a host.
                    </p>
                    <button
                      onClick={handleVerifyAccount}
                      disabled={verifyUserMutation.isPending}
                      className="flex items-center rounded-lg bg-yellow-500 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-yellow-600 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <i className="fa-solid fa-check-circle mr-2"></i>
                      {verifyUserMutation.isPending ? 'Verifying...' : 'Verify Account'}
                    </button>
                  </div>
                )}

                {isVerified && (
                  <button
                    onClick={handleBecomeHost}
                    disabled={becomeHostMutation.isPending}
                    className="flex items-center rounded-xl bg-blue-500 px-6 py-3 font-medium text-white shadow-md transition hover:bg-blue-600 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <i className="fa-solid fa-home mr-2"></i>
                    {becomeHostMutation.isPending ? 'Processing...' : 'Become a host'}
                  </button>
                )}

                {becomeHostMutation.isError && (
                  <div className="mt-3">
                    <InlineError
                      message={
                        (becomeHostMutation.error as any)?.body?.message ||
                        (becomeHostMutation.error as any)?.response?.data?.message ||
                        'Failed to become a host. Please try again.'
                      }
                      onRetry={handleBecomeHost}
                    />
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </section>

      {/* Profile Stats Section */}
      <section id="profile-stats" className="bg-gray-50 py-6">
        <div className="mx-auto max-w-7xl px-6">
          <div className="grid grid-cols-4 gap-6">
            <div className="rounded-xl border border-gray-200 bg-white p-6">
              <div className="mb-2 flex items-center justify-between">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-blue-100">
                  <i className="fa-solid fa-calendar-check text-xl text-blue-500"></i>
                </div>
              </div>
              <h3 className="mb-1 text-2xl font-bold text-gray-900">{totalRentals}</h3>
              <p className="text-sm text-gray-600">Total Rentals</p>
            </div>

            <div className="rounded-xl border border-gray-200 bg-white p-6">
              <div className="mb-2 flex items-center justify-between">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-green-100">
                  <i className="fa-solid fa-star text-xl text-green-500"></i>
                </div>
              </div>
              <h3 className="mb-1 text-2xl font-bold text-gray-900">{averageRating.toFixed(1)}</h3>
              <p className="text-sm text-gray-600">Average Rating</p>
            </div>

            <div className="rounded-xl border border-gray-200 bg-white p-6">
              <div className="mb-2 flex items-center justify-between">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-purple-100">
                  <i className="fa-solid fa-message text-xl text-purple-500"></i>
                </div>
              </div>
              <h3 className="mb-1 text-2xl font-bold text-gray-900">{reviewsCount}</h3>
              <p className="text-sm text-gray-600">Reviews Received</p>
            </div>

            <div className="rounded-xl border border-gray-200 bg-white p-6">
              <div className="mb-2 flex items-center justify-between">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-orange-100">
                  <i className="fa-solid fa-heart text-xl text-orange-500"></i>
                </div>
              </div>
              <h3 className="mb-1 text-2xl font-bold text-gray-900">0</h3>
              <p className="text-sm text-gray-600">Saved Items</p>
            </div>
          </div>
        </div>
      </section>

      {/* Profile Navigation Section */}
      <section id="profile-navigation" className="bg-white py-8">
        <div className="mx-auto max-w-7xl px-6">
          <div className="grid grid-cols-3 gap-6">
            <Link
              href="/client/bookings"
              className="group cursor-pointer rounded-2xl border border-blue-200 bg-gradient-to-br from-blue-50 to-blue-100 p-8 transition hover:shadow-lg"
            >
              <div className="mb-4 flex items-start justify-between">
                <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-blue-500 transition group-hover:scale-110">
                  <i className="fa-solid fa-calendar-days text-2xl text-white"></i>
                </div>
                <i className="fa-solid fa-arrow-right text-xl text-blue-500 transition group-hover:translate-x-1"></i>
              </div>
              <h3 className="mb-2 text-2xl font-bold text-gray-900">My Rentals</h3>
              <p className="mb-4 text-gray-600">View and manage your current and past bookings</p>
              <div className="flex items-center space-x-2">
                <span className="rounded-full bg-blue-500 px-3 py-1 text-xs font-semibold text-white">
                  {activeRentals} Active
                </span>
                <span className="text-sm text-gray-600">{completedRentals} Completed</span>
              </div>
            </Link>

            {isHost ? (
              <Link
                href="/host/listings"
                className="group cursor-pointer rounded-2xl border border-green-200 bg-gradient-to-br from-green-50 to-green-100 p-8 transition hover:shadow-lg"
              >
                <div className="mb-4 flex items-start justify-between">
                  <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-green-500 transition group-hover:scale-110">
                    <i className="fa-solid fa-box text-2xl text-white"></i>
                  </div>
                  <i className="fa-solid fa-arrow-right text-xl text-green-500 transition group-hover:translate-x-1"></i>
                </div>
                <h3 className="mb-2 text-2xl font-bold text-gray-900">My Listings</h3>
                <p className="mb-4 text-gray-600">Manage items you&apos;re offering for rent</p>
                <div className="flex items-center space-x-2">
                  <span className="rounded-full bg-gray-200 px-3 py-1 text-xs font-semibold text-gray-600">
                    View listings
                  </span>
                </div>
              </Link>
            ) : (
              <div className="group cursor-pointer rounded-2xl border border-green-200 bg-gradient-to-br from-green-50 to-green-100 p-8 transition hover:shadow-lg">
                <div className="mb-4 flex items-start justify-between">
                  <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-green-500 transition group-hover:scale-110">
                    <i className="fa-solid fa-box text-2xl text-white"></i>
                  </div>
                  <i className="fa-solid fa-arrow-right text-xl text-green-500 transition group-hover:translate-x-1"></i>
                </div>
                <h3 className="mb-2 text-2xl font-bold text-gray-900">My Listings</h3>
                <p className="mb-4 text-gray-600">Manage items you&apos;re offering for rent</p>
                <div className="flex items-center space-x-2">
                  <span className="rounded-full bg-gray-200 px-3 py-1 text-xs font-semibold text-gray-600">
                    No listings yet
                  </span>
                </div>
              </div>
            )}

            <div className="group cursor-pointer rounded-2xl border border-purple-200 bg-gradient-to-br from-purple-50 to-purple-100 p-8 transition hover:shadow-lg">
              <div className="mb-4 flex items-start justify-between">
                <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-purple-500 transition group-hover:scale-110">
                  <i className="fa-solid fa-gear text-2xl text-white"></i>
                </div>
                <i className="fa-solid fa-arrow-right text-xl text-purple-500 transition group-hover:translate-x-1"></i>
              </div>
              <h3 className="mb-2 text-2xl font-bold text-gray-900">Settings</h3>
              <p className="mb-4 text-gray-600">Update your profile and preferences</p>
              <div className="flex items-center space-x-2">
                <span className="text-sm text-gray-600">Account · Privacy · Notifications</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Reviews Section */}
      {reviews.length > 0 && (
        <section id="reviews-section" className="bg-gray-50 py-12">
          <div className="mx-auto max-w-7xl px-6">
            <div className="mb-8 flex items-center justify-between">
              <div>
                <h2 className="mb-2 text-3xl font-bold text-gray-900">Reviews</h2>
                <p className="text-gray-600">What others say about {displayName}</p>
              </div>
              <div className="flex items-center space-x-2">
                <button className="flex h-10 w-10 items-center justify-center rounded-full border border-gray-300 transition hover:bg-white">
                  <i className="fa-solid fa-chevron-left text-gray-600"></i>
                </button>
                <button className="flex h-10 w-10 items-center justify-center rounded-full border border-gray-300 transition hover:bg-white">
                  <i className="fa-solid fa-chevron-right text-gray-600"></i>
                </button>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-6">
              {reviews.slice(0, 3).map((review: any) => (
                <div key={review.id} className="rounded-xl border border-gray-200 bg-white p-6">
                  <div className="mb-4 flex items-start justify-between">
                    <div className="flex items-center space-x-3">
                      <img
                        src={review.author?.avatarUrl || 'https://via.placeholder.com/48'}
                        alt={review.author?.name || 'Reviewer'}
                        className="h-12 w-12 rounded-full object-cover"
                      />
                      <div>
                        <h4 className="font-semibold text-gray-900">{review.author?.name || 'Anonymous'}</h4>
                        <p className="text-sm text-gray-500">
                          {new Date(review.createdAt).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center">
                      <i className="fa-solid fa-star text-sm text-yellow-400"></i>
                      <span className="ml-1 font-semibold text-gray-900">{review.rating}</span>
                    </div>
                  </div>
                  <p className="leading-relaxed text-gray-700">&quot;{review.comment}&quot;</p>
                  {review.booking?.listing && (
                    <div className="mt-4 border-t border-gray-100 pt-4">
                      <span className="text-sm text-gray-500">
                        Rented: {review.booking.listing.title || review.booking.listing.category?.name || 'Item'}
                      </span>
                    </div>
                  )}
                </div>
              ))}
            </div>

            {reviews.length > 3 && (
              <div className="mt-8 text-center">
                <Link
                  href="/client/reviews"
                  className="mx-auto flex items-center justify-center font-medium text-blue-500 transition hover:text-blue-600"
                >
                  View all {reviews.length} reviews
                  <i className="fa-solid fa-arrow-right ml-2"></i>
                </Link>
              </div>
            )}
          </div>
        </section>
      )}

      {/* Verification & Trust Section */}
      <section id="verification-section" className="bg-white py-12">
        <div className="mx-auto max-w-7xl px-6">
          <h2 className="mb-8 text-3xl font-bold text-gray-900">Verification & Trust</h2>

          <div className="grid grid-cols-2 gap-8">
            <div className="rounded-2xl border border-gray-200 bg-gray-50 p-8">
              <h3 className="mb-6 text-xl font-bold text-gray-900">Verified Information</h3>
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center">
                    <div
                      className={`mr-3 flex h-10 w-10 items-center justify-center rounded-full ${
                        isVerified ? 'bg-green-100' : 'bg-gray-200'
                      }`}
                    >
                      <i
                        className={`fa-solid ${isVerified ? 'fa-check text-green-500' : 'fa-times text-gray-400'}`}
                      ></i>
                    </div>
                    <span className="text-gray-700">Email address</span>
                  </div>
                  {isVerified ? (
                    <span className="text-sm font-medium text-green-600">Verified</span>
                  ) : (
                    <button
                      onClick={handleVerifyAccount}
                      disabled={verifyUserMutation.isPending}
                      className="text-sm font-medium text-blue-500 transition hover:text-blue-600 disabled:opacity-50"
                    >
                      {verifyUserMutation.isPending ? 'Verifying...' : 'Verify'}
                    </button>
                  )}
                </div>

                <div className="flex items-center justify-between">
                  <div className="flex items-center">
                    <div
                      className={`mr-3 flex h-10 w-10 items-center justify-center rounded-full ${
                        isVerified ? 'bg-green-100' : 'bg-gray-200'
                      }`}
                    >
                      <i
                        className={`fa-solid ${isVerified ? 'fa-check text-green-500' : 'fa-times text-gray-400'}`}
                      ></i>
                    </div>
                    <span className="text-gray-700">Phone number</span>
                  </div>
                  {isVerified ? (
                    <span className="text-sm font-medium text-green-600">Verified</span>
                  ) : (
                    <button
                      onClick={handleVerifyAccount}
                      disabled={verifyUserMutation.isPending}
                      className="text-sm font-medium text-blue-500 transition hover:text-blue-600 disabled:opacity-50"
                    >
                      {verifyUserMutation.isPending ? 'Verifying...' : 'Verify'}
                    </button>
                  )}
                </div>

                <div className="flex items-center justify-between">
                  <div className="flex items-center">
                    <div className="mr-3 flex h-10 w-10 items-center justify-center rounded-full bg-gray-200">
                      <i className="fa-solid fa-times text-gray-400"></i>
                    </div>
                    <span className="text-gray-700">Identity document</span>
                  </div>
                  <span className="text-sm font-medium text-gray-500">Not verified</span>
                </div>

                <div className="flex items-center justify-between">
                  <div className="flex items-center">
                    <div className="mr-3 flex h-10 w-10 items-center justify-center rounded-full bg-gray-200">
                      <i className="fa-solid fa-times text-gray-400"></i>
                    </div>
                    <span className="text-gray-700">Payment method</span>
                  </div>
                  <button className="text-sm font-medium text-blue-500 transition hover:text-blue-600">Add</button>
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-gray-200 bg-gray-50 p-8">
              <h3 className="mb-6 text-xl font-bold text-gray-900">Trust Badges</h3>
              <div className="space-y-4">
                <div className="flex items-start">
                  <div className="mr-3 flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-blue-100">
                    <i className="fa-solid fa-shield-halved text-blue-500"></i>
                  </div>
                  <div>
                    <h4 className="mb-1 font-semibold text-gray-900">Trusted Member</h4>
                    <p className="text-sm text-gray-600">Active member with verified identity and positive reviews</p>
                  </div>
                </div>

                {averageRating >= 4.5 && (
                  <div className="flex items-start">
                    <div className="mr-3 flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-purple-100">
                      <i className="fa-solid fa-award text-purple-500"></i>
                    </div>
                    <div>
                      <h4 className="mb-1 font-semibold text-gray-900">Top Renter</h4>
                      <p className="text-sm text-gray-600">Consistent 5-star ratings and responsible rental history</p>
                    </div>
                  </div>
                )}

                <div className="flex items-start">
                  <div className="mr-3 flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-green-100">
                    <i className="fa-solid fa-clock text-green-500"></i>
                  </div>
                  <div>
                    <h4 className="mb-1 font-semibold text-gray-900">Quick Responder</h4>
                    <p className="text-sm text-gray-600">Usually responds within an hour</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>
    </Layout>
  );
}
