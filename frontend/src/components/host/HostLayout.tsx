import Link from 'next/link';
import { useRouter } from 'next/router';
import { useAuth } from '@/lib/auth/AuthProvider';
import { isHostUser } from '@/lib/auth/roleUtils';

type HostTab = 'dashboard' | 'listings' | 'bookings';

export function HostLayout({
  children,
  activeTab = 'listings',
  title,
  subtitle,
}: {
  children: React.ReactNode;
  activeTab?: HostTab;
  title?: string;
  subtitle?: string;
}) {
  const router = useRouter();
  const { user, logout } = useAuth();

  // Access rule (design requirement): host/admin only, else redirect to /profile
  if (typeof window !== 'undefined' && user && !isHostUser(user)) {
    router.replace('/profile');
    return null;
  }

  return (
    <div className="bg-gray-50 font-sans">
      <header id="header" className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-8">
              <Link href="/" className="flex items-center space-x-2">
                <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-blue-600 rounded-xl flex items-center justify-center">
                  <i className="fa-solid fa-circle-nodes text-white text-lg" />
                </div>
                <span className="text-xl font-bold text-gray-900">
                  RentAI
                </span>
              </Link>
            </div>

            <nav className="flex items-center space-x-6">
              <Link
                href="/host/dashboard"
                className={
                  activeTab === 'dashboard'
                    ? 'text-sm font-medium text-blue-600 border-b-2 border-blue-600 pb-1'
                    : 'text-sm font-medium text-gray-600 hover:text-gray-900'
                }
              >
                Dashboard
              </Link>
              <Link
                href="/host/listings"
                className={
                  activeTab === 'listings'
                    ? 'text-sm font-medium text-blue-600 border-b-2 border-blue-600 pb-1'
                    : 'text-sm font-medium text-gray-600 hover:text-gray-900'
                }
              >
                Listings
              </Link>
              <Link
                href="/host/bookings"
                className={
                  activeTab === 'bookings'
                    ? 'text-sm font-medium text-blue-600 border-b-2 border-blue-600 pb-1'
                    : 'text-sm font-medium text-gray-600 hover:text-gray-900'
                }
              >
                Bookings
              </Link>
            </nav>

            <div className="flex items-center space-x-4">
              <button
                className="text-sm font-medium text-gray-700 hover:text-gray-900 px-4 py-2 rounded-full hover:bg-gray-100 transition"
                onClick={() => router.push('/profile')}
              >
                Switch to renter
              </button>
              <div
                className="flex items-center border border-gray-300 rounded-full pl-3 pr-1 py-1 shadow-sm hover:shadow-md transition cursor-pointer"
                onClick={logout}
                role="button"
                tabIndex={0}
              >
                <i className="fa-solid fa-bars text-gray-600 text-sm mr-3" />
                <div className="w-8 h-8 bg-blue-500 rounded-full overflow-hidden">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  {user?.avatarUrl ? (
                    <img
                      src={user.avatarUrl}
                      alt="User"
                      className="w-full h-full object-cover"
                    />
                  ) : null}
                </div>
              </div>
            </div>
          </div>
        </div>
      </header>

      {title ? (
        <section
          id="dashboard-hero"
          className="bg-gradient-to-br from-blue-50 to-white py-8"
        >
          <div className="max-w-7xl mx-auto px-6">
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-3xl font-bold text-gray-900 mb-2">
                  {title}
                </h1>
                <p className="text-gray-600">{subtitle}</p>
              </div>
              <Link
                href="/host/create"
                className="bg-blue-500 hover:bg-blue-600 text-white px-6 py-3 rounded-lg font-medium shadow-md transition flex items-center"
              >
                <i className="fa-solid fa-plus mr-2" />
                Create new listing
              </Link>
            </div>
          </div>
        </section>
      ) : null}

      {children}

      <footer className="border-t border-gray-200 bg-white py-6 mt-12">
        <div className="max-w-7xl mx-auto px-6 flex items-center justify-between text-sm text-gray-500">
          <span>RentAI · Host · © {new Date().getFullYear()}</span>
          <div className="flex items-center gap-4">
            <Link href="/host/dashboard" className="hover:text-gray-700">
              Dashboard
            </Link>
            <Link href="/help" className="hover:text-gray-700">
              Help
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
