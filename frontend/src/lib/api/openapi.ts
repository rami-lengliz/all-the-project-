import { OpenAPI } from '@/lib/api/generated';
import { AUTH_STORAGE_KEY } from '@/lib/api/http';

export function configureOpenApi() {
  // Backend paths already include `/api/api/*` in the OpenAPI spec.
  OpenAPI.BASE = 'http://localhost:3000';
  OpenAPI.TOKEN = async () => {
    if (typeof window === 'undefined') return '';
    try {
      const raw = window.localStorage.getItem(AUTH_STORAGE_KEY);
      if (!raw) return '';
      const parsed = JSON.parse(raw) as { accessToken?: string | null };
      return parsed?.accessToken ?? '';
    } catch {
      return '';
    }
  };
}

