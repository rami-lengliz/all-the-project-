/**
 * env.ts — central place to read and validate NEXT_PUBLIC_* env vars
 *
 * Import this instead of accessing process.env directly so that
 * missing vars are caught with a clear error message.
 */

/**
 * Base URL of the backend API.
 *
 * Local dev  : http://localhost:3000  (Next.js proxy rewrites /api/* → localhost:3001)
 * Production : https://your-api.up.railway.app  (or Render URL)
 *
 * Set in .env.local:
 *   NEXT_PUBLIC_API_URL=http://localhost:3000
 */
export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? '';

/**
 * Returns true when the env var is present and non-empty.
 * Used by the runtime EnvCheck component.
 */
export const isApiUrlConfigured = (): boolean =>
    typeof process.env.NEXT_PUBLIC_API_URL === 'string' &&
    process.env.NEXT_PUBLIC_API_URL.trim().length > 0;
