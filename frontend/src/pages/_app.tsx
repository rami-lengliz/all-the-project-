import '@/styles/globals.css';
import 'leaflet/dist/leaflet.css';
import type { AppProps } from 'next/app';
import Head from 'next/head';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import { useEffect, useState } from 'react';
import { AuthProvider, useAuth } from '@/lib/auth/AuthProvider';
import { Toaster } from '@/components/ui/Toaster';
import { useRouter } from 'next/router';
import { configureOpenApi } from '@/lib/api/openapi';
import { isAdminUser, isHostUser } from '@/lib/auth/roleUtils';
import { LoadingCard } from '@/components/ui/LoadingCard';
import { EnvCheck } from '@/components/ui/EnvCheck';
import { CompareProvider } from '@/lib/context/CompareContext';
import { ErrorBoundary } from '@/components/shared/ErrorBoundary';
import { initMonitoring } from '@/lib/monitoring/sentry';

function RouteGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { accessToken, user, authReady } = useAuth();

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!authReady) return;
    const p = router.pathname;
    const protectedRoute =
      p === '/profile' ||
      p === '/rentals' ||
      p.startsWith('/host') ||
      p.startsWith('/booking') ||
      p.startsWith('/client') ||
      p.startsWith('/admin') ||
      p.startsWith('/messages');
    const isAuthRoute = p.startsWith('/auth');

    if (protectedRoute && !accessToken && !isAuthRoute) {
      router.replace('/auth/login');
    }

    // Role-based access: host pages require host/admin.
    if (p.startsWith('/host') && accessToken) {
      if (!isHostUser(user)) {
        router.replace('/profile');
      }
    }

    // Role-based access: admin pages require admin.
    if (p.startsWith('/admin') && accessToken) {
      if (!isAdminUser(user)) {
        router.replace('/profile');
      }
    }
  }, [router.pathname, accessToken, authReady, user]);

  if (!authReady) {
    return (
      <div className="bg-gray-50 font-sans">
        <div className="max-w-7xl mx-auto px-6 py-8">
          <LoadingCard />
        </div>
      </div>
    );
  }

  return <>{children}</>;
}

export default function App({ Component, pageProps }: AppProps) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            retry: 1,
            refetchOnWindowFocus: false,
          },
        },
      }),
  );

  useEffect(() => {
    configureOpenApi();
    void initMonitoring(); // no-op (and no SDK fetch) unless NEXT_PUBLIC_SENTRY_DSN is set
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      {/* Default site-wide meta. Per-page <Head> tags override these. */}
      <Head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
        <meta name="theme-color" content="#0284c7" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
        <title>RentAI — Rent stays, cars, sports & beach gear in Tunisia</title>
        <meta
          name="description"
          content="Tunisia's AI-first rental marketplace. Find villas, cars, padel courts, jet skis and beach gear near you. Pay safely with Flouci or D17."
        />
        <meta property="og:type" content="website" />
        <meta property="og:site_name" content="RentAI" />
        <meta property="og:title" content="RentAI — Rent anything in Tunisia" />
        <meta
          property="og:description"
          content="Find villas, cars, padel courts, jet skis and beach gear near you. Pay safely with Flouci or D17."
        />
        <meta property="og:image" content="https://renteverything.tn/og-image.png" />
        <meta property="og:image:width" content="1200" />
        <meta property="og:image:height" content="630" />
        <meta property="og:locale" content="fr_TN" />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:image" content="https://renteverything.tn/og-image.png" />
        <link rel="icon" href="/favicon.ico" />
        <link rel="apple-touch-icon" href="/og-image.png" />
        <link rel="manifest" href="/site.webmanifest" />
      </Head>
      <EnvCheck />
      <AuthProvider>
        <RouteGuard>
          <CompareProvider>
            <ErrorBoundary>
              <Component {...pageProps} />
            </ErrorBoundary>
          </CompareProvider>
        </RouteGuard>
        <Toaster />
      </AuthProvider>
      <ReactQueryDevtools initialIsOpen={false} />
    </QueryClientProvider>
  );
}
