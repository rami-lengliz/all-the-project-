import Link from 'next/link';
import { useRouter } from 'next/router';
import { useEffect, useRef, useState } from 'react';
import { CategoryStrip } from '@/components/shared/CategoryStrip';
import { LocationCityPicker } from '@/components/shared/LocationCityPicker';
import { useAuth } from '@/lib/auth/AuthProvider';
import { isAdminUser } from '@/lib/auth/roleUtils';
import { useQuery } from '@tanstack/react-query';
import { fetchUnreadCount } from '@/lib/api/chat';
import { useUserLocation } from '@/lib/hooks/useUserLocation';
import { useHostMode } from '@/lib/hooks/useHostMode';
import { NotificationBell } from '@/components/shared/NotificationBell';

export function Header() {
  const router = useRouter();
  const { user, logout } = useAuth();
  const [isMounted, setIsMounted] = useState(false);
  const {
    cityName,
    loading: locLoading,
    isDefault,
    fromSavedHome,
    isManual,
    requestLocation,
    resetLocation,
    setManualLocation,
  } = useUserLocation();
  const { mode, setMode, canSwitch } = useHostMode();
  const isHostMode = canSwitch && mode === 'host';
  const [locMenuOpen, setLocMenuOpen] = useState(false);
  const [locPickerOpen, setLocPickerOpen] = useState(false);
  const locMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  useEffect(() => {
    if (!locMenuOpen) return;
    const handler = (e: MouseEvent) => {
      if (locMenuRef.current && !locMenuRef.current.contains(e.target as Node)) {
        setLocMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [locMenuOpen]);

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
          {isHostMode ? (
            <>
              <Link
                href="/host/dashboard"
                className={`text-sm font-medium hover:text-slate-900 ${
                  router.pathname === '/host/dashboard' ? 'text-slate-900' : 'text-slate-700'
                }`}
              >
                Dashboard
              </Link>
              <Link
                href="/host/listings"
                className={`text-sm font-medium hover:text-slate-900 ${
                  router.pathname.startsWith('/host/listings') ? 'text-slate-900' : 'text-slate-700'
                }`}
              >
                My listings
              </Link>
              <Link
                href="/host/bookings"
                className={`text-sm font-medium hover:text-slate-900 ${
                  router.pathname === '/host/bookings' ? 'text-slate-900' : 'text-slate-700'
                }`}
              >
                Bookings
              </Link>
              <Link
                href="/host/create"
                className="rounded-full bg-blue-50 px-3 py-1.5 text-sm font-semibold text-blue-700 hover:bg-blue-100"
              >
                <i className="fa-solid fa-plus mr-1 text-xs" />
                New listing
              </Link>
            </>
          ) : (
            <>
              <Link
                href="/search"
                className={`text-sm font-medium hover:text-slate-900 ${
                  router.pathname === '/search' ? 'text-slate-900' : 'text-slate-700'
                }`}
              >
                {router.locale === 'ar' ? 'بحث' : 'Search'}
              </Link>
              <Link
                href="/map"
                className={`text-sm font-medium hover:text-slate-900 ${
                  router.pathname === '/map' ? 'text-slate-900' : 'text-slate-700'
                }`}
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
            </>
          )}
        </nav>

        <div className="flex items-center gap-3">
          {/* Active-location chip with dropdown — GPS refresh, manual pick, reset */}
          {isMounted && !locLoading && (
            <div ref={locMenuRef} className="relative hidden md:block">
              <button
                type="button"
                onClick={() => setLocMenuOpen(o => !o)}
                title={
                  isDefault
                    ? 'Click to set your location'
                    : isManual
                      ? `Manually set to ${cityName}`
                      : fromSavedHome
                        ? `Using your saved home (${cityName})`
                        : `Browsing near ${cityName}`
                }
                className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-medium transition ${
                  isDefault
                    ? 'border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100'
                    : 'border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100'
                }`}
              >
                <i className={`fa-solid ${isManual ? 'fa-location-pin' : fromSavedHome ? 'fa-house' : 'fa-location-dot'} text-xs ${isDefault ? 'text-amber-500' : 'text-blue-500'}`} />
                <span className="max-w-[140px] truncate">{cityName}</span>
                {isDefault && <span className="text-[10px] uppercase tracking-wide text-amber-600">default</span>}
                {isManual && <span className="text-[10px] uppercase tracking-wide text-blue-500">manual</span>}
                {fromSavedHome && !isManual && <span className="text-[10px] uppercase tracking-wide text-blue-500">home</span>}
                <i className="fa-solid fa-chevron-down text-[9px] opacity-50" />
              </button>

              {locMenuOpen && (
                <div className="absolute right-0 top-full z-50 mt-1.5 w-56 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg">
                  <div className="border-b border-slate-100 px-4 py-2.5">
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Location</p>
                    <p className="mt-0.5 truncate text-sm font-medium text-slate-800">{cityName}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => { setLocMenuOpen(false); setLocPickerOpen(true); }}
                    className="flex w-full items-center gap-3 px-4 py-2.5 text-sm text-slate-700 hover:bg-slate-50"
                  >
                    <i className="fa-solid fa-pen-to-square text-blue-500 w-4 text-center" />
                    Pick a city manually
                  </button>
                  <button
                    type="button"
                    onClick={() => { requestLocation(); setLocMenuOpen(false); }}
                    className="flex w-full items-center gap-3 px-4 py-2.5 text-sm text-slate-700 hover:bg-slate-50"
                  >
                    <i className="fa-solid fa-rotate text-blue-500 w-4 text-center" />
                    Use my GPS location
                  </button>
                  {(isManual || !isDefault) && (
                    <button
                      type="button"
                      onClick={() => { resetLocation(); setLocMenuOpen(false); }}
                      className="flex w-full items-center gap-3 border-t border-slate-100 px-4 py-2.5 text-sm text-slate-700 hover:bg-slate-50"
                    >
                      <i className="fa-solid fa-xmark text-slate-400 w-4 text-center" />
                      Reset to default
                    </button>
                  )}
                </div>
              )}
            </div>
          )}

          <LocationCityPicker
            open={locPickerOpen}
            onClose={() => setLocPickerOpen(false)}
            onPick={(loc) => setManualLocation(loc)}
          />

          {canSwitch ? (
            // Mode toggle for hosts — switches the entire UI context
            <div
              className="hidden md:flex items-center gap-1 rounded-full border border-slate-200 bg-slate-50 p-1"
              role="group"
              aria-label="Switch between renter and host mode"
            >
              <button
                type="button"
                onClick={() => setMode('rent')}
                className={`rounded-full px-3 py-1 text-xs font-semibold transition ${
                  mode === 'rent'
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'text-slate-500 hover:text-slate-700'
                }`}
                aria-pressed={mode === 'rent'}
              >
                <i className="fa-solid fa-bag-shopping mr-1 text-[10px]" />
                Renting
              </button>
              <button
                type="button"
                onClick={() => setMode('host')}
                className={`rounded-full px-3 py-1 text-xs font-semibold transition ${
                  mode === 'host'
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'text-slate-500 hover:text-slate-700'
                }`}
                aria-pressed={mode === 'host'}
              >
                <i className="fa-solid fa-house-chimney mr-1 text-[10px]" />
                Hosting
              </button>
            </div>
          ) : (
            // Non-hosts see the "Become a host" CTA
            <Link
              href={user ? '/profile?onboard=host' : '/auth/register?next=/profile?onboard=host'}
              className="hidden md:inline-flex rounded-full px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100"
            >
              {router.locale === 'ar' ? 'كن مضيفاً' : 'Become a host'}
            </Link>
          )}

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
              {/* Notification bell (in-app notifications) */}
              <NotificationBell />

              {/* Wishlist */}
              <Link
                href="/wishlist"
                className="rounded-full p-2 text-slate-700 hover:bg-slate-100 transition"
                aria-label="Wishlist"
                title="Wishlist"
              >
                <i className="fa-regular fa-heart text-base" />
              </Link>

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

              {isAdminUser(user) && (
                <Link
                  href="/admin/dashboard"
                  className="rounded-full border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-700 hover:bg-rose-100"
                >
                  <i className="fa-solid fa-shield-halved mr-1 text-xs" />
                  Admin
                </Link>
              )}
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

      {!isHostMode && (
        <div className="mx-auto max-w-7xl px-6 pb-3">
          <CategoryStrip />
        </div>
      )}
    </header>
  );
}
