import axios from 'axios';
import { toast } from '@/components/ui/Toaster';
import { readAuth, clearAuth } from '@/lib/auth/storage';

// Re-export for backward compatibility (used by openapi.ts)
export { AUTH_STORAGE_KEY } from '@/lib/auth/storage';

const baseURL = 'http://localhost:3000/api';

export const api = axios.create({
  baseURL,
  timeout: 15000,
});

/* ------------------------------------------------------------------
 *  Module-scoped refresh queue.
 *  Only ONE refresh call runs at a time; concurrent 401s share it.
 * ------------------------------------------------------------------ */
let refreshPromise: Promise<string> | null = null;

/* ------------------------------------------------------------------
 *  Request interceptor — attach Bearer token from localStorage
 * ------------------------------------------------------------------ */
api.interceptors.request.use((config) => {
  if (typeof window === 'undefined') return config;
  const { accessToken } = readAuth();
  if (accessToken) {
    config.headers = config.headers ?? {};
    config.headers.Authorization = `Bearer ${accessToken}`;
  }
  return config;
});

/* ------------------------------------------------------------------
 *  Response interceptor — 401 → refresh → retry (once)
 * ------------------------------------------------------------------ */
api.interceptors.response.use(
  (r) => r,
  async (error) => {
    const status = error?.response?.status;
    const originalRequest = error?.config;

    /* ---- Non-401 errors: show toast and reject ---- */
    if (status !== 401 || typeof window === 'undefined') {
      const message =
        error?.response?.data?.message ||
        error?.response?.data?.error ||
        error?.message ||
        'Request failed';
      if (message !== 'canceled') {
        toast({ title: 'Request error', message: String(message), variant: 'error' });
      }
      return Promise.reject(error);
    }

    /* ---- 401 on auth endpoints: never retry (avoid loop) ---- */
    const url = originalRequest?.url ?? '';
    if (
      url.includes('/auth/login') ||
      url.includes('/auth/register') ||
      url.includes('/auth/refresh')
    ) {
      return Promise.reject(error);
    }

    /* ---- Already retried this request: force logout ---- */
    if (originalRequest?._retry) {
      clearAuth();
      window.dispatchEvent(new CustomEvent('auth:logout'));
      return Promise.reject(error);
    }

    /* ---- Attempt token refresh + retry original request ---- */
    originalRequest._retry = true;

    try {
      if (!refreshPromise) {
        // Dynamic import breaks the circular dep with refresh.ts
        refreshPromise = import('@/lib/auth/refresh').then(
          ({ refreshAccessToken }) => refreshAccessToken(),
        );
      }
      const newToken = await refreshPromise;

      // Retry with the fresh token
      originalRequest.headers.Authorization = `Bearer ${newToken}`;
      return api(originalRequest);
    } catch {
      // Refresh failed — clear everything and notify AuthProvider
      clearAuth();
      window.dispatchEvent(new CustomEvent('auth:logout'));
      return Promise.reject(error);
    } finally {
      refreshPromise = null;
    }
  },
);
