import Link from 'next/link';
import { ClientLayout } from '@/components/client/ClientLayout';
import { useAuth } from '@/lib/auth/AuthProvider';
import { useProfile } from '@/lib/api/hooks/useProfile';
import { useMyBookings } from '@/lib/api/hooks/useMyBookings';
import { LoadingCard } from '@/components/ui/LoadingCard';
import { InlineError } from '@/components/ui/InlineError';

export default function ClientDashboardPage() {
  const { user } = useAuth();
  const profile = useProfile();
  const bookings = useMyBookings();

  const me = (profile.data as any) ?? user;
  const allBookings = (bookings.data as any) ?? [];
  const activeCount = allBookings.filter((b: any) => b.status === 'confirmed' || b.status === 'pending').length;
  const completedCount = allBookings.filter((b: any) => b.status === 'completed').length;

  return (
    <ClientLayout>
      {profile.isError ? (
        <div className="max-w-7xl mx-auto px-6 pt-6">
          <InlineError message="Failed to load your profile." onRetry={() => void profile.refetch()} />
        </div>
      ) : null}

      <section id="profile-hero" className="bg-white border-b border-gray-200 py-8">
        <div className="max-w-7xl mx-auto px-6">
          <div className="flex items-start justify-between">
            <div className="flex items-start space-x-6">
              <div className="relative">
                <div className="w-32 h-32 rounded-full overflow-hidden border-4 border-white shadow-lg bg-blue-500" />
                <button className="absolute bottom-0 right-0 w-10 h-10 bg-blue-500 rounded-full flex items-center justify-center shadow-lg hover:bg-blue-600 transition">
                  <i className="fa-solid fa-camera text-white text-sm" />
                </button>
              </div>

              <div>
                <h1 className="text-3xl font-bold text-gray-900 mb-2">{me?.name ?? 'User'}</h1>
                <div className="flex items-center space-x-4 mb-3">
                  <div className="flex items-center">
                    <i className="fa-solid fa-star text-yellow-400 mr-1" />
                    <span className="font-semibold text-gray-900">{me?.ratingAvg ?? '—'}</span>
                    <span className="text-gray-500 ml-1">({me?.ratingCount ?? 0} reviews)</span>
                  </div>
                  <span className="text-gray-400">•</span>
                  <div className="flex items-center text-gray-600">
                    <i className="fa-solid fa-location-dot mr-1" />
                    <span>Tunis, Tunisia</span>
                  </div>
                </div>
                <div className="flex items-center space-x-2 mb-4">
                  <div className="bg-blue-100 text-blue-700 px-4 py-1 rounded-full text-sm font-medium flex items-center">
                    <i className="fa-solid fa-user mr-2" />
                    Currently a Renter
                  </div>
                  <span className="text-gray-400">•</span>
                  <span className="text-sm text-gray-600">Member since Jan 2024</span>
                </div>
                <p className="text-gray-600 max-w-2xl">Manage your bookings and reviews</p>
              </div>
            </div>

            <Link
              href="/host/create"
              className="bg-blue-500 hover:bg-blue-600 text-white px-6 py-3 rounded-xl font-medium flex items-center shadow-md transition"
            >
              <i className="fa-solid fa-home mr-2" />
              Become a host
            </Link>
          </div>
        </div>
      </section>

      <section id="profile-stats" className="bg-gray-50 py-6">
        <div className="max-w-7xl mx-auto px-6">
          {profile.isLoading || bookings.isLoading ? (
            <div className="grid grid-cols-4 gap-6">
              {Array.from({ length: 4 }).map((_, i) => (
                <LoadingCard key={i} />
              ))}
            </div>
          ) : (
          <div className="grid grid-cols-4 gap-6">
            <div className="bg-white rounded-xl p-6 border border-gray-200">
              <div className="flex items-center justify-between mb-2">
                <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center">
                  <i className="fa-solid fa-calendar-check text-blue-500 text-xl" />
                </div>
              </div>
              <h3 className="text-2xl font-bold text-gray-900 mb-1">{allBookings.length}</h3>
              <p className="text-sm text-gray-600">Total Rentals</p>
            </div>

            <div className="bg-white rounded-xl p-6 border border-gray-200">
              <div className="flex items-center justify-between mb-2">
                <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center">
                  <i className="fa-solid fa-star text-green-500 text-xl" />
                </div>
              </div>
              <h3 className="text-2xl font-bold text-gray-900 mb-1">{me?.ratingAvg ?? '—'}</h3>
              <p className="text-sm text-gray-600">Average Rating</p>
            </div>

            <div className="bg-white rounded-xl p-6 border border-gray-200">
              <div className="flex items-center justify-between mb-2">
                <div className="w-12 h-12 bg-purple-100 rounded-full flex items-center justify-center">
                  <i className="fa-solid fa-message text-purple-500 text-xl" />
                </div>
              </div>
              <h3 className="text-2xl font-bold text-gray-900 mb-1">{me?.ratingCount ?? 0}</h3>
              <p className="text-sm text-gray-600">Reviews Received</p>
            </div>

            <div className="bg-white rounded-xl p-6 border border-gray-200">
              <div className="flex items-center justify-between mb-2">
                <div className="w-12 h-12 bg-orange-100 rounded-full flex items-center justify-center">
                  <i className="fa-solid fa-heart text-orange-500 text-xl" />
                </div>
              </div>
              <h3 className="text-2xl font-bold text-gray-900 mb-1">0</h3>
              <p className="text-sm text-gray-600">Saved Items</p>
            </div>
          </div>
          )}
        </div>
      </section>

      <section id="profile-navigation" className="bg-white py-8">
        <div className="max-w-7xl mx-auto px-6">
          <div className="grid grid-cols-3 gap-6">
            <Link
              href="/client/bookings"
              id="nav-rentals"
              className="bg-gradient-to-br from-blue-50 to-blue-100 rounded-2xl p-8 border border-blue-200 hover:shadow-lg transition cursor-pointer group"
            >
              <div className="flex items-start justify-between mb-4">
                <div className="w-16 h-16 bg-blue-500 rounded-2xl flex items-center justify-center group-hover:scale-110 transition">
                  <i className="fa-solid fa-calendar-days text-white text-2xl" />
                </div>
                <i className="fa-solid fa-arrow-right text-blue-500 text-xl group-hover:translate-x-1 transition" />
              </div>
              <h3 className="text-2xl font-bold text-gray-900 mb-2">My Rentals</h3>
              <p className="text-gray-600 mb-4">View and manage your current and past bookings</p>
              <div className="flex items-center space-x-2">
                <span className="bg-blue-500 text-white text-xs font-semibold px-3 py-1 rounded-full">
                  {activeCount} Active
                </span>
                <span className="text-sm text-gray-600">{completedCount} Completed</span>
              </div>
            </Link>

            <Link
              href="/host/dashboard"
              id="nav-listings"
              className="bg-gradient-to-br from-green-50 to-green-100 rounded-2xl p-8 border border-green-200 hover:shadow-lg transition cursor-pointer group"
            >
              <div className="flex items-start justify-between mb-4">
                <div className="w-16 h-16 bg-green-500 rounded-2xl flex items-center justify-center group-hover:scale-110 transition">
                  <i className="fa-solid fa-box text-white text-2xl" />
                </div>
                <i className="fa-solid fa-arrow-right text-green-500 text-xl group-hover:translate-x-1 transition" />
              </div>
              <h3 className="text-2xl font-bold text-gray-900 mb-2">My Listings</h3>
              <p className="text-gray-600 mb-4">Manage items you're offering for rent</p>
              <div className="flex items-center space-x-2">
                <span className="bg-gray-200 text-gray-600 text-xs font-semibold px-3 py-1 rounded-full">Go to Host</span>
              </div>
            </Link>

            <Link
              href="/client/reviews"
              id="nav-settings"
              className="bg-gradient-to-br from-purple-50 to-purple-100 rounded-2xl p-8 border border-purple-200 hover:shadow-lg transition cursor-pointer group"
            >
              <div className="flex items-start justify-between mb-4">
                <div className="w-16 h-16 bg-purple-500 rounded-2xl flex items-center justify-center group-hover:scale-110 transition">
                  <i className="fa-solid fa-gear text-white text-2xl" />
                </div>
                <i className="fa-solid fa-arrow-right text-purple-500 text-xl group-hover:translate-x-1 transition" />
              </div>
              <h3 className="text-2xl font-bold text-gray-900 mb-2">Reviews</h3>
              <p className="text-gray-600 mb-4">See reviews and leave feedback</p>
              <div className="flex items-center space-x-2">
                <span className="text-sm text-gray-600">Rating · Comments</span>
              </div>
            </Link>
          </div>
        </div>
      </section>
    </ClientLayout>
  );
}

