import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api } from '@/lib/api/http';
import { readAuth, writeAuth, clearAuth, AUTH_STORAGE_KEY } from '@/lib/auth/storage';
import { toast } from '@/components/ui/Toaster';
import { useRouter } from 'next/router';

type AuthState = {
  accessToken: string | null;
  refreshToken: string | null;
  user: any | null;
};

type AuthContextValue = AuthState & {
  hasHydrated: boolean;
  authReady: boolean;
  login: (input: { emailOrPhone: string; password: string }) => Promise<void>;
  register: (input: { name: string; email?: string; phone?: string; password: string }) => Promise<void>;
  logout: () => void;
  refreshAccessToken: () => Promise<string | null>;
  setTokens: (accessToken: string, refreshToken: string) => void;
  refreshUser: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  // SSR-safe: always start unauthenticated, restore from localStorage on mount.
  const [state, setState] = useState<AuthState>({ accessToken: null, refreshToken: null, user: null });
  const [hasHydrated, setHasHydrated] = useState(false);
  const [authReady, setAuthReady] = useState(false);
  const router = useRouter();

  /* ---------------------------------------------------------------
   * Hydration-safe restore on mount
   * --------------------------------------------------------------- */
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const stored = readAuth();
      if (cancelled) return;
      setState(stored);
      setHasHydrated(true);

      // If we have a token but no user object cached, fetch the profile
      if (stored.accessToken && !stored.user) {
        try {
          const me = await api.get('/users/me');
          const u = me.data?.data ?? me.data ?? null;
          if (!cancelled && u) {
            setState((s) => ({ ...s, user: u }));
            writeAuth({ user: u });
          }
        } catch {
          // 401 → interceptor handles refresh or forced logout
        } finally {
          if (!cancelled) setAuthReady(true);
        }
        return;
      }

      if (!cancelled) setAuthReady(true);
    })();
    return () => { cancelled = true; };
  }, []);

  /* ---------------------------------------------------------------
   * Cross-tab sync via StorageEvent (fires in OTHER tabs)
   * --------------------------------------------------------------- */
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const onStorage = (e: StorageEvent) => {
      if (!e.key || e.key === AUTH_STORAGE_KEY) {
        setState(readAuth());
      }
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  /* ---------------------------------------------------------------
   * Forced logout event from axios 401 interceptor
   * --------------------------------------------------------------- */
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const onForcedLogout = () => {
      // clearAuth() was already called by the interceptor
      setState({ accessToken: null, refreshToken: null, user: null });
      setHasHydrated(true);
      setAuthReady(true);
      toast({ title: 'Session expired', variant: 'info' });
      router.push('/auth/login');
    };
    window.addEventListener('auth:logout', onForcedLogout);
    return () => window.removeEventListener('auth:logout', onForcedLogout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ---------------------------------------------------------------
   * Silent user restore: if token exists but user is null
   * --------------------------------------------------------------- */
  useEffect(() => {
    if (!state.accessToken || state.user) return;
    let cancelled = false;
    (async () => {
      try {
        const me = await api.get('/users/me');
        const user = me.data?.data ?? me.data;
        if (!cancelled && user) {
          setState((s) => ({ ...s, user }));
          writeAuth({ user });
        }
      } catch {
        // interceptor handles 401
      }
    })();
    return () => { cancelled = true; };
  }, [state.accessToken]);

  /* ---------------------------------------------------------------
   * Actions
   * --------------------------------------------------------------- */
  const setTokens = useCallback((accessToken: string, refreshToken: string) => {
    const next = { accessToken, refreshToken };
    setState((s) => ({ ...s, ...next }));
    writeAuth(next);
  }, []);

  const logout = useCallback(() => {
    clearAuth();
    if (typeof window !== 'undefined') {
      // Notify other tabs
      window.dispatchEvent(new StorageEvent('storage', { key: AUTH_STORAGE_KEY } as any));
    }
    setState({ accessToken: null, refreshToken: null, user: null });
    setHasHydrated(true);
    setAuthReady(true);
    toast({ title: 'Signed out', variant: 'info' });
    router.push('/auth/login');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const refreshAccessToken = useCallback(async (): Promise<string | null> => {
    try {
      const { refreshAccessToken: doRefresh } = await import('@/lib/auth/refresh');
      const newToken = await doRefresh();
      setState((s) => ({ ...s, accessToken: newToken }));
      return newToken;
    } catch {
      return null;
    }
  }, []);

  const refreshUser = useCallback(async () => {
    try {
      const me = await api.get('/users/me');
      const user = me.data?.data ?? me.data ?? null;
      if (user) {
        setState((s) => ({ ...s, user }));
        writeAuth({ user });
      }
    } catch {
      // interceptor handles 401
    }
  }, []);

  const login = useCallback(async (input: { emailOrPhone: string; password: string }) => {
    const res = await api.post('/auth/login', input);
    const payload = res.data?.data ?? res.data;
    let user = payload?.user ?? null;
    if (!user && payload?.accessToken) {
      try {
        const me = await api.get('/users/me', {
          headers: { Authorization: `Bearer ${payload.accessToken}` },
        });
        user = me.data?.data ?? me.data ?? null;
      } catch {
        user = null;
      }
    }
    const next: AuthState = {
      accessToken: payload?.accessToken ?? null,
      refreshToken: payload?.refreshToken ?? null,
      user,
    };
    setState(next);
    setHasHydrated(true);
    setAuthReady(true);
    writeAuth(next);
    toast({ title: 'Welcome back', variant: 'success' });
  }, []);

  const register = useCallback(
    async (input: { name: string; email?: string; phone?: string; password: string }) => {
      const res = await api.post('/auth/register', input);
      const payload = res.data?.data ?? res.data;
      const next: AuthState = {
        accessToken: payload?.accessToken ?? null,
        refreshToken: payload?.refreshToken ?? null,
        user: payload?.user ?? null,
      };
      setState(next);
      setHasHydrated(true);
      setAuthReady(true);
      writeAuth(next);
      toast({ title: 'Account created', variant: 'success' });
    },
    [],
  );

  const value = useMemo<AuthContextValue>(
    () => ({ ...state, hasHydrated, authReady, login, register, logout, refreshAccessToken, setTokens, refreshUser }),
    [state, hasHydrated, authReady, login, register, logout, refreshAccessToken, setTokens, refreshUser],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
