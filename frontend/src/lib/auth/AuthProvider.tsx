import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { api, AUTH_STORAGE_KEY } from '@/lib/api/http';
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

const STORAGE_KEY = AUTH_STORAGE_KEY;

function readStored(): AuthState {
  if (typeof window === 'undefined') return { accessToken: null, refreshToken: null, user: null };
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return { accessToken: null, refreshToken: null, user: null };
    const parsed = JSON.parse(raw) as AuthState;
    return {
      accessToken: parsed.accessToken ?? null,
      refreshToken: parsed.refreshToken ?? null,
      user: parsed.user ?? null,
    };
  } catch {
    return { accessToken: null, refreshToken: null, user: null };
  }
}

function writeStored(state: AuthState) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function isAuthed(state: AuthState) {
  return Boolean(state.accessToken);
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  // IMPORTANT:
  // For SSR + hydration correctness, the initial render MUST NOT depend on localStorage.
  // We always start from a neutral unauthenticated state and then restore from storage on mount.
  const [state, setState] = useState<AuthState>({ accessToken: null, refreshToken: null, user: null });
  const [hasHydrated, setHasHydrated] = useState(false);
  const [authReady, setAuthReady] = useState(false);
  const refreshingRef = useRef<Promise<string | null> | null>(null);
  const router = useRouter();

  // Hydration-safe restore:
  // On the server, `readStored()` can't access localStorage, so initial state is null.
  // On the client we re-sync once on mount so refresh keeps the user logged in.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const stored = readStored();
      if (cancelled) return;
      setState(stored);
      setHasHydrated(true);

      // IMPORTANT: Route guards need to wait for user restoration, otherwise they may redirect
      // while `user` is temporarily null even though a valid accessToken exists.
      if (stored.accessToken && !stored.user) {
        try {
          const me = await api.get('/users/me');
          const u = me.data?.data ?? me.data ?? null;
          if (!cancelled && u) {
            setState((s) => ({ ...s, user: u }));
          }
        } catch {
          // If token is invalid, axios interceptor will handle 401 -> logout redirect.
        } finally {
          if (!cancelled) setAuthReady(true);
        }
        return;
      }

      if (!cancelled) setAuthReady(true);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    writeStored(state);
  }, [state]);

  // Keep state in sync if another part of the app clears tokens (e.g. 401 interceptor)
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const onStorage = (e: StorageEvent) => {
      if (!e.key || e.key === STORAGE_KEY) {
        setState(readStored());
      }
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const setTokens = useCallback((accessToken: string, refreshToken: string) => {
    setState((s) => ({ ...s, accessToken, refreshToken }));
  }, []);

  const logout = useCallback(() => {
    if (typeof window !== 'undefined') {
      try {
        window.localStorage.removeItem(STORAGE_KEY);
        window.dispatchEvent(new StorageEvent('storage', { key: STORAGE_KEY } as any));
      } catch {
        // ignore
      }
    }
    setState({ accessToken: null, refreshToken: null, user: null });
    setHasHydrated(true);
    setAuthReady(true);
    toast({ title: 'Signed out', variant: 'info' });
    router.push('/auth/login');
  }, []);

  const refreshAccessToken = useCallback(async (): Promise<string | null> => {
    if (!state.refreshToken) return null;
    if (refreshingRef.current) return refreshingRef.current;

    refreshingRef.current = (async () => {
      try {
        const res = await api.post('/auth/refresh', { refreshToken: state.refreshToken });
        const accessToken = res.data?.data?.accessToken ?? res.data?.accessToken ?? null;
        if (accessToken) {
          setState((s) => ({ ...s, accessToken }));
        }
        return accessToken;
      } catch {
        return null;
      } finally {
        refreshingRef.current = null;
      }
    })();

    return refreshingRef.current;
  }, [state.refreshToken]);

  const refreshUser = useCallback(async () => {
    setState((s) => {
      if (!s.accessToken) return s;
      return s;
    });
    try {
      const me = await api.get('/users/me');
      const user = me.data?.data ?? me.data ?? null;
      if (user) {
        setState((s) => {
          const updated = { ...s, user };
          writeStored(updated);
          return updated;
        });
      }
    } catch {
      // If token is invalid, axios interceptor will handle 401 -> logout redirect.
    }
  }, []);

  // Silent restore: if we have an access token but no user object, fetch /users/me once.
  useEffect(() => {
    if (!isAuthed(state) || state.user) return;
    let cancelled = false;
    (async () => {
      try {
        const me = await api.get('/users/me');
        const user = me.data?.data ?? me.data;
        if (!cancelled && user) {
          setState((s) => ({ ...s, user }));
        }
      } catch {
        // If token is invalid, axios interceptor will handle 401 -> logout redirect.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [state.accessToken]);

  const login = useCallback(async (input: { emailOrPhone: string; password: string }) => {
    const res = await api.post('/auth/login', input);
    const payload = res.data?.data ?? res.data;
    // If backend doesn't include user in login response, fetch it.
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
    setState({
      accessToken: payload?.accessToken ?? null,
      refreshToken: payload?.refreshToken ?? null,
      user,
    });
    setHasHydrated(true);
    setAuthReady(true);

    // Persist immediately (do not wait for effect) to make UI + storage consistent right after login.
    writeStored({
      accessToken: payload?.accessToken ?? null,
      refreshToken: payload?.refreshToken ?? null,
      user,
    });
    toast({ title: 'Welcome back', variant: 'success' });
  }, []);

  const register = useCallback(
    async (input: { name: string; email?: string; phone?: string; password: string }) => {
      const res = await api.post('/auth/register', input);
      const payload = res.data?.data ?? res.data;
      const next = {
        accessToken: payload?.accessToken ?? null,
        refreshToken: payload?.refreshToken ?? null,
        user: payload?.user ?? null,
      };
      setState(next);
      setHasHydrated(true);
      setAuthReady(true);
      writeStored(next);
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

