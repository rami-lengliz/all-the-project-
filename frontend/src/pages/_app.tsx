import '@/styles/globals.css';
import type { AppProps } from 'next/app';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import { useEffect, useState } from 'react';
import { AuthProvider, useAuth } from '@/lib/auth/AuthProvider';
import { Toaster } from '@/components/ui/Toaster';
import { useRouter } from 'next/router';
import { configureOpenApi } from '@/lib/api/openapi';
import { isAdminUser, isHostUser } from '@/lib/auth/roleUtils';
import { LoadingCard } from '@/components/ui/LoadingCard';

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
      p.startsWith('/admin');
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
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <RouteGuard>
          <Component {...pageProps} />
        </RouteGuard>
        <Toaster />
      </AuthProvider>
      <ReactQueryDevtools initialIsOpen={false} />
    </QueryClientProvider>
  );
}
