import Link from 'next/link';
import { useRouter } from 'next/router';
import { useAuth } from '@/lib/auth/AuthProvider';

export function ClientLayout({
  children,
}: {
  children: React.ReactNode;
}) {
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
                <span className="text-xl font-bold text-gray-900">RentLocal</span>
              </Link>
            </div>

            <div className="flex items-center space-x-4">
              <button
                className="text-sm font-medium text-gray-700 hover:text-gray-900 px-4 py-2 rounded-full hover:bg-gray-100 transition"
                onClick={() => router.push('/host/create')}
              >
                Become a host
              </button>
              <button className="flex items-center justify-center w-10 h-10 rounded-full hover:bg-gray-100 transition">
                <i className="fa-solid fa-globe text-gray-600" />
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
                  {user?.avatarUrl ? <img src={user.avatarUrl} alt="User" className="w-full h-full object-cover" /> : null}
                </div>
              </div>
            </div>
          </div>
        </div>
      </header>

      {children}

      <footer id="footer" className="bg-gray-900 text-white py-12 mt-16">
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

