/**
 * Refresh the access token using the stored refresh token.
 *
 * Called by the axios 401-interceptor (http.ts).
 * Writes updated tokens to localStorage via writeAuth().
 * Throws if no refresh token is available or the call fails.
 */
import { api } from '@/lib/api/http';
import { readAuth, writeAuth } from './storage';

export async function refreshAccessToken(): Promise<string> {
    const { refreshToken } = readAuth();
    if (!refreshToken) {
        throw new Error('No refresh token available');
    }

    const res = await api.post('/auth/refresh', { refreshToken });
    const payload = res.data?.data ?? res.data;
    const newAccessToken: string | undefined = payload?.accessToken;

    if (!newAccessToken) {
        throw new Error('Refresh response missing accessToken');
    }

    // Persist new tokens (merge — keeps user intact)
    writeAuth({
        accessToken: newAccessToken,
        ...(payload.refreshToken ? { refreshToken: payload.refreshToken } : {}),
        ...(payload.user ? { user: payload.user } : {}),
    });

    return newAccessToken;
}
