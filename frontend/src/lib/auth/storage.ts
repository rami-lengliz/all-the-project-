/**
 * Single source of truth for auth token read/write in localStorage.
 * Key: "re_auth_v1"
 *
 * Hydration-safe: all functions return safe defaults during SSR.
 */

export const AUTH_STORAGE_KEY = 're_auth_v1';

export type AuthData = {
    accessToken: string | null;
    refreshToken: string | null;
    user: any | null;
};

const EMPTY: AuthData = { accessToken: null, refreshToken: null, user: null };

/** Read current auth state from localStorage. Returns nulls during SSR / if missing. */
export function readAuth(): AuthData {
    if (typeof window === 'undefined') return EMPTY;
    try {
        const raw = window.localStorage.getItem(AUTH_STORAGE_KEY);
        if (!raw) return EMPTY;
        const parsed = JSON.parse(raw);
        return {
            accessToken: parsed.accessToken ?? null,
            refreshToken: parsed.refreshToken ?? null,
            user: parsed.user ?? null,
        };
    } catch {
        return EMPTY;
    }
}

/** Merge partial auth data into localStorage (read-modify-write). */
export function writeAuth(partial: Partial<AuthData>): void {
    if (typeof window === 'undefined') return;
    const current = readAuth();
    const merged = { ...current, ...partial };
    window.localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(merged));
}

/** Remove auth data from localStorage entirely. */
export function clearAuth(): void {
    if (typeof window === 'undefined') return;
    window.localStorage.removeItem(AUTH_STORAGE_KEY);
}
