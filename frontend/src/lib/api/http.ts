import axios from 'axios';
import { toast } from '@/components/ui/Toaster';

export const AUTH_STORAGE_KEY = 're_auth_v1';

const baseURL = 'http://localhost:3000/api';

export const api = axios.create({
  baseURL,
  timeout: 15000,
});

api.interceptors.request.use((config) => {
  if (typeof window === 'undefined') return config;
  try {
    const raw = window.localStorage.getItem(AUTH_STORAGE_KEY);
    if (!raw) return config;
    const parsed = JSON.parse(raw) as { accessToken?: string | null };
    const token = parsed?.accessToken;
    if (token) {
      config.headers = config.headers ?? {};
      config.headers.Authorization = `Bearer ${token}`;
    }
  } catch {
    // ignore
  }

  // Defensive logging in dev mode: log become-host request body
  if (process.env.NODE_ENV === 'development' && config.url?.includes('/become-host')) {
    console.log('[http interceptor] POST /become-host request body:', JSON.stringify(config.data, null, 2));
  }

  return config;
});

api.interceptors.response.use(
  (r) => r,
  (error) => {
    const status = error?.response?.status;

    if (status === 401 && typeof window !== 'undefined') {
      try {
        window.localStorage.removeItem(AUTH_STORAGE_KEY);
        // notify listeners (AuthProvider) that auth changed
        window.dispatchEvent(new StorageEvent('storage', { key: AUTH_STORAGE_KEY } as any));
      } catch {
        // ignore
      }
      window.location.href = '/auth/login';
      return Promise.reject(error);
    }

    const message =
      error?.response?.data?.message || error?.response?.data?.error || error?.message || 'Request failed';
    if (message !== 'canceled') {
      toast({ title: 'Request error', message: String(message), variant: 'error' });
    }
    return Promise.reject(error);
  },
);

