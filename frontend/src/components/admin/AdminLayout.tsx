import Link from 'next/link';
import { useRouter } from 'next/router';
import { useAuth } from '@/lib/auth/AuthProvider';

type AdminTab = 'dashboard' | 'users' | 'listings' | 'logs';

export function AdminLayout({
  children,
  activeTab,
  title,
  subtitle,
}: {
  children: React.ReactNode;
  activeTab: AdminTab;
  title?: string;
  subtitle?: string;
}) {
  const router = useRouter();
  const { user, logout } = useAuth();

  const roles = (user?.roles ?? []).map((r: any) => String(r).toLowerCase());
  const isAdmin = roles.includes('admin') || user?.role === 'ADMIN';

  // Admin-only: redirect non-admin authenticated users to /profile
  if (typeof window !== 'undefined' && user && !isAdmin) {
    router.replace('/profile');
    return null;
  }

  return (
    <div className="bg-gray-50 font-sans">
      <header id="header" className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-8">
              <div className="flex items-center space-x-2">
                <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-blue-600 rounded-xl flex items-center justify-center">
                  <i className="fa-solid fa-circle-nodes text-white text-lg" />
                </div>
                <span className="text-xl font-bold text-gray-900">RentLocal</span>
              </div>
            </div>

            <nav className="flex items-center space-x-6">
              <Link
                href="/admin/dashboard"
                className={
                  activeTab === 'dashboard'
                    ? 'text-sm font-medium text-blue-600 border-b-2 border-blue-600 pb-1'
                    : 'text-sm font-medium text-gray-600 hover:text-gray-900'
                }
              >
                Dashboard
              </Link>
              <Link
                href="/admin/users"
                className={
                  activeTab === 'users'
                    ? 'text-sm font-medium text-blue-600 border-b-2 border-blue-600 pb-1'
                    : 'text-sm font-medium text-gray-600 hover:text-gray-900'
                }
              >
                Users
              </Link>
              <Link
                href="/admin/listings"
                className={
                  activeTab === 'listings'
                    ? 'text-sm font-medium text-blue-600 border-b-2 border-blue-600 pb-1'
                    : 'text-sm font-medium text-gray-600 hover:text-gray-900'
                }
              >
                Listings
              </Link>
              <Link
                href="/admin/logs"
                className={
                  activeTab === 'logs'
                    ? 'text-sm font-medium text-blue-600 border-b-2 border-blue-600 pb-1'
                    : 'text-sm font-medium text-gray-600 hover:text-gray-900'
                }
              >
                Logs
              </Link>
            </nav>

            <div className="flex items-center space-x-4">
              <button
                className="text-sm font-medium text-gray-700 hover:text-gray-900 px-4 py-2 rounded-full hover:bg-gray-100 transition"
                onClick={() => router.push('/profile')}
              >
                Switch to renter
              </button>
              <button className="flex items-center justify-center w-10 h-10 rounded-full hover:bg-gray-100 transition relative">
                <i className="fa-regular fa-bell text-gray-600 text-lg" />
                <span className="absolute top-1 right-1 w-2 h-2 bg-red-500 rounded-full" />
              </button>
              <div
                className="flex items-center border border-gray-300 rounded-full pl-3 pr-1 py-1 shadow-sm hover:shadow-md transition cursor-pointer"
                onClick={logout}
                role="button"
                tabIndex={0}
              >
                <i className="fa-solid fa-bars text-gray-600 text-sm mr-3" />
                <div className="w-8 h-8 bg-blue-500 rounded-full overflow-hidden" />
              </div>
            </div>
          </div>
        </div>
      </header>

      {title ? (
        <section id="dashboard-hero" className="bg-gradient-to-br from-blue-50 to-white py-8">
          <div className="max-w-7xl mx-auto px-6">
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-3xl font-bold text-gray-900 mb-2">{title}</h1>
                <p className="text-gray-600">{subtitle}</p>
              </div>
              <button className="bg-blue-500 hover:bg-blue-600 text-white px-6 py-3 rounded-lg font-medium shadow-md transition flex items-center">
                <i className="fa-solid fa-shield-halved mr-2" />
                Admin actions
              </button>
            </div>
          </div>
        </section>
      ) : null}

      {children}

      <footer id="footer" className="bg-gray-900 text-white py-12 mt-12">
        <div className="max-w-7xl mx-auto px-6">
          <div className="grid grid-cols-4 gap-8 mb-8">
            <div>
              <h4 className="font-semibold mb-4">About</h4>
              <ul className="space-y-2 text-sm text-gray-400">
                <li>
                  <a href="#" className="hover:text-white">
                    How it works
                  </a>
                </li>
                <li>
                  <a href="#" className="hover:text-white">
                    About us
                  </a>
                </li>
                <li>
                  <a href="#" className="hover:text-white">
                    Careers
                  </a>
                </li>
                <li>
                  <a href="#" className="hover:text-white">
                    Press
                  </a>
                </li>
              </ul>
            </div>

            <div>
              <h4 className="font-semibold mb-4">Support</h4>
              <ul className="space-y-2 text-sm text-gray-400">
                <li>
                  <a href="#" className="hover:text-white">
                    Help Center
                  </a>
                </li>
                <li>
                  <a href="#" className="hover:text-white">
                    Safety
                  </a>
                </li>
                <li>
                  <a href="#" className="hover:text-white">
                    Trust & Safety
                  </a>
                </li>
                <li>
                  <a href="#" className="hover:text-white">
                    Contact us
                  </a>
                </li>
              </ul>
            </div>

            <div>
              <h4 className="font-semibold mb-4">Hosting</h4>
              <ul className="space-y-2 text-sm text-gray-400">
                <li>
                  <a href="#" className="hover:text-white">
                    Become a host
                  </a>
                </li>
                <li>
                  <a href="#" className="hover:text-white">
                    Host resources
                  </a>
                </li>
                <li>
                  <a href="#" className="hover:text-white">
                    Community forum
                  </a>
                </li>
                <li>
                  <a href="#" className="hover:text-white">
                    Responsible hosting
                  </a>
                </li>
              </ul>
            </div>

            <div>
              <h4 className="font-semibold mb-4">Legal</h4>
              <ul className="space-y-2 text-sm text-gray-400">
                <li>
                  <a href="#" className="hover:text-white">
                    Terms of Service
                  </a>
                </li>
                <li>
                  <a href="#" className="hover:text-white">
                    Privacy Policy
                  </a>
                </li>
                <li>
                  <a href="#" className="hover:text-white">
                    Cookie Policy
                  </a>
                </li>
                <li>
                  <a href="#" className="hover:text-white">
                    Sitemap
                  </a>
                </li>
              </ul>
            </div>
          </div>

          <div className="border-t border-gray-800 pt-8 flex items-center justify-between">
            <p className="text-sm text-gray-400">© 2024 RentLocal. All rights reserved.</p>
            <div className="flex items-center space-x-4">
              <a href="#" className="text-gray-400 hover:text-white">
                <i className="fa-brands fa-facebook text-xl" />
              </a>
              <a href="#" className="text-gray-400 hover:text-white">
                <i className="fa-brands fa-instagram text-xl" />
              </a>
              <a href="#" className="text-gray-400 hover:text-white">
                <i className="fa-brands fa-twitter text-xl" />
              </a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}

