import Link from 'next/link';
import { useRouter } from 'next/router';
import { CategoryStrip } from '@/components/shared/CategoryStrip';
import { useAuth } from '@/lib/auth/AuthProvider';

export function Header() {
  const router = useRouter();
  const { user, logout } = useAuth();

  return (
    <header className="border-b border-slate-200 bg-white">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
        <Link href="/" className="flex items-center gap-2" aria-label="RentEverything home">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-primary-600 text-white">
            RE
          </div>
          <span className="text-xl font-extrabold text-slate-900">RentEverything</span>
        </Link>

        <nav className="hidden items-center gap-4 md:flex">
          <Link href="/search" className="text-sm font-medium text-slate-700 hover:text-slate-900">
            {router.locale === 'ar' ? 'بحث' : 'Search'}
          </Link>
          <Link href="/map" className="text-sm font-medium text-slate-700 hover:text-slate-900">
            {router.locale === 'ar' ? 'الخريطة' : 'Map'}
          </Link>
          <Link href="/help" className="text-sm font-medium text-slate-700 hover:text-slate-900">
            {router.locale === 'ar' ? 'مساعدة' : 'Help'}
          </Link>
        </nav>

        <div className="flex items-center gap-3">
          <Link
            href="/host/create"
            className="rounded-full px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100"
          >
            {router.locale === 'ar' ? 'كن مضيفاً' : 'Become a host'}
          </Link>

          <button
            type="button"
            className="rounded-full px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100"
            aria-label="Language toggle"
            onClick={() => router.push(router.pathname, router.asPath, { locale: router.locale === 'ar' ? 'en' : 'ar' })}
          >
            🌐
          </button>

          {user ? (
            <div className="flex items-center gap-2">
              <Link
                href="/profile"
                className="rounded-full border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                {router.locale === 'ar' ? 'الملف' : 'Profile'}
              </Link>
              <button
                type="button"
                onClick={logout}
                className="rounded-full border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                {router.locale === 'ar' ? 'خروج' : 'Logout'}
              </button>
            </div>
          ) : (
            <Link
              href="/auth/login"
              className="rounded-full border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              {router.locale === 'ar' ? 'تسجيل' : 'Login'}
            </Link>
          )}
        </div>
      </div>

      <div className="mx-auto max-w-7xl px-6 pb-3">
        <CategoryStrip />
      </div>
    </header>
  );
}

