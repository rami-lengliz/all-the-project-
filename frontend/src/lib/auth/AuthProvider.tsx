import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { api } from '@/lib/api/http';
import { toast } from '@/components/ui/Toaster';

type AuthState = {
  accessToken: string | null;
  refreshToken: string | null;
  user: any | null;
};

type AuthContextValue = AuthState & {
  login: (input: { emailOrPhone: string; password: string }) => Promise<void>;
  register: (input: { name: string; email?: string; phone?: string; password: string }) => Promise<void>;
  logout: () => void;
  refreshAccessToken: () => Promise<string | null>;
  setTokens: (accessToken: string, refreshToken: string) => void;
};

const AuthContext = createContext<AuthContextValue | null>(null);

const STORAGE_KEY = 're_auth_v1';

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

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AuthState>(() => readStored());
  const refreshingRef = useRef<Promise<string | null> | null>(null);

  useEffect(() => {
    writeStored(state);
  }, [state]);

  const setTokens = useCallback((accessToken: string, refreshToken: string) => {
    setState((s) => ({ ...s, accessToken, refreshToken }));
  }, []);

  const logout = useCallback(() => {
    setState({ accessToken: null, refreshToken: null, user: null });
    toast({ title: 'Signed out', variant: 'info' });
  }, []);

  const refreshAccessToken = useCallback(async (): Promise<string | null> => {
    if (!state.refreshToken) return null;
    if (refreshingRef.current) return refreshingRef.current;

    refreshingRef.current = (async () => {
      try {
        const res = await api.post('/auth/refresh', { refreshToken: state.refreshToken });
        const accessToken = res.data?.accessToken ?? null;
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

  const login = useCallback(async (input: { emailOrPhone: string; password: string }) => {
    const res = await api.post('/auth/login', input);
    setState({
      accessToken: res.data?.accessToken ?? null,
      refreshToken: res.data?.refreshToken ?? null,
      user: res.data?.user ?? null,
    });
    toast({ title: 'Welcome back', variant: 'success' });
  }, []);

  const register = useCallback(
    async (input: { name: string; email?: string; phone?: string; password: string }) => {
      const res = await api.post('/auth/register', input);
      setState({
        accessToken: res.data?.accessToken ?? null,
        refreshToken: res.data?.refreshToken ?? null,
        user: res.data?.user ?? null,
      });
      toast({ title: 'Account created', variant: 'success' });
    },
    [],
  );

  const value = useMemo<AuthContextValue>(
    () => ({ ...state, login, register, logout, refreshAccessToken, setTokens }),
    [state, login, register, logout, refreshAccessToken, setTokens],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}

