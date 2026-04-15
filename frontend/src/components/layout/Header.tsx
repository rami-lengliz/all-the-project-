import Link from 'next/link';
import { useRouter } from 'next/router';
import { useEffect, useState } from 'react';
import { CategoryStrip } from '@/components/shared/CategoryStrip';
import { useAuth } from '@/lib/auth/AuthProvider';
import { useQuery } from '@tanstack/react-query';
import { fetchUnreadCount } from '@/lib/api/chat';
import { api } from '@/lib/api/http';
import { isHostUser } from '@/lib/auth/roleUtils';

export function Header() {
  const router = useRouter();
  const { user, logout, refreshUser } = useAuth();
  const [isMounted, setIsMounted] = useState(false);
  const [becomingHost, setBecomingHost] = useState(false);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  /** Promote user to host (idempotent), then go to /host/create */
  const handleBecomeHost = async () => {
    if (becomingHost) return;
    setBecomingHost(true);
    try {
      // If already a host, skip the API call
      if (!isHostUser(user)) {
        await api.post('/users/me/become-host');
        await refreshUser(); // update cached user object with isHost: true
      }
      router.push('/host/create');
    } catch {
      // Even if it fails (e.g. not logged in), redirect; HostLayout will gate
      router.push('/host/create');
    } finally {
      setBecomingHost(false);
    }
  };

  const { data: unreadCount = 0 } = useQuery({
    queryKey: ['chat', 'unread'],
    queryFn: fetchUnreadCount,
    enabled: isMounted && !!user,
    refetchInterval: 10000,
    staleTime: 5000,
  });

  return (
    <header className="border-b border-slate-200 bg-white">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
        <Link
          href="/"
          className="flex items-center gap-2"
          aria-label="RentEverything home"
        >
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-primary-600 text-white">
            RE
          </div>
          <span className="text-xl font-extrabold text-slate-900">
            RentEverything
          </span>
        </Link>

        <nav className="hidden items-center gap-4 md:flex">
          <Link
            href="/search"
            className="text-sm font-medium text-slate-700 hover:text-slate-900"
          >
            {router.locale === 'ar' ? 'بحث' : 'Search'}
          </Link>
          <Link
            href="/map"
            className="text-sm font-medium text-slate-700 hover:text-slate-900"
          >
            {router.locale === 'ar' ? 'الخريطة' : 'Map'}
          </Link>
          <Link
            href="/help"
            className="text-sm font-medium text-slate-700 hover:text-slate-900"
          >
            {router.locale === 'ar' ? 'مساعدة' : 'Help'}
          </Link>
          <div className="mx-2 h-4 w-px bg-slate-300"></div>
          <Link href="/demo/ai-search" className="text-sm font-bold text-purple-600 hover:text-purple-800">
            ✨ AI Demo
          </Link>
          <Link href="/demo/categories" className="text-sm font-medium text-purple-600 hover:text-purple-800">
            📍 Categories Demo
          </Link>
        </nav>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={handleBecomeHost}
            disabled={becomingHost}
            className="rounded-full px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100 disabled:opacity-60 flex items-center gap-1.5"
          >
            {becomingHost && <span className="w-3 h-3 rounded-full border-2 border-slate-400 border-t-slate-700 animate-spin" />}
            {router.locale === 'ar' ? 'كن مضيفاً' : 'Become a host'}
          </button>

          <button
            type="button"
            className="rounded-full px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100"
            aria-label="Language toggle"
            onClick={() =>
              router.push(router.pathname, router.asPath, {
                locale: router.locale === 'ar' ? 'en' : 'ar',
              })
            }
          >
            🌐
          </button>

          {isMounted && user ? (
            <div className="flex items-center gap-2">
              {/* Messages icon with unread badge */}
              <Link
                href="/messages"
                className="relative rounded-full p-2 text-slate-700 hover:bg-slate-100 transition"
                aria-label="Messages"
              >
                <i className="fa-solid fa-message text-base" />
                {unreadCount > 0 && (
                  <span className="absolute -top-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-white text-[10px] font-bold leading-none">
                    {unreadCount > 9 ? '9+' : unreadCount}
                  </span>
                )}
              </Link>

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
