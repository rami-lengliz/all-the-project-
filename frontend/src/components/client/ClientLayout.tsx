import Link from 'next/link';
import { useRouter } from 'next/router';
import { useAuth } from '@/lib/auth/AuthProvider';

export function ClientLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { user, logout } = useAuth();

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

            <div className="flex items-center space-x-4">
              <button
                className="text-sm font-medium text-gray-700 hover:text-gray-900 px-4 py-2 rounded-full hover:bg-gray-100 transition"
                onClick={() => router.push('/host/create')}
              >
                Become a host
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

      {children}

      <footer className="border-t border-gray-200 bg-white py-6 mt-16">
        <div className="max-w-7xl mx-auto px-6 flex items-center justify-between text-sm text-gray-500">
          <span>RentAI · © {new Date().getFullYear()} · Tunisia</span>
          <div className="flex items-center gap-4">
            <Link href="/help" className="hover:text-gray-700">
              Help
            </Link>
            <Link href="/profile" className="hover:text-gray-700">
              Profile
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
