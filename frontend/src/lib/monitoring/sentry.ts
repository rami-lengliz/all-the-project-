/**
 * Client-side error monitoring (Sentry).
 *
 * Dormant until a DSN is configured: with no `NEXT_PUBLIC_SENTRY_DSN`,
 * `initMonitoring()` returns before the SDK is ever loaded, so local dev and
 * the build are unaffected — and crucially, because the `@sentry/react` import
 * is *dynamic*, the SDK is code-split into its own chunk that is never fetched
 * while dormant. No DSN ⇒ zero added bytes on first load. Add a DSN in
 * production and the SDK lazy-loads on app mount, capturing client render
 * errors and unhandled rejections with no further code change.
 *
 * Uses the lightweight `@sentry/react` SDK rather than `@sentry/nextjs` on
 * purpose — we don't want build-time webpack instrumentation hooking into the
 * Next.js config on a bleeding-edge Next 16 + React 19 setup.
 */
type SentryModule = typeof import('@sentry/react');

let sentry: SentryModule | null = null;
let initStarted = false;

export async function initMonitoring(): Promise<void> {
  if (initStarted) return;
  if (typeof window === 'undefined') return;

  const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;
  if (!dsn) return; // dormant — SDK chunk is never loaded

  initStarted = true;
  try {
    const mod = await import('@sentry/react');
    mod.init({
      dsn,
      environment:
        process.env.NEXT_PUBLIC_SENTRY_ENV ??
        process.env.NODE_ENV ??
        'development',
      release: process.env.NEXT_PUBLIC_APP_VERSION || undefined,
      // Error reporting only — no performance tracing or session replay, to
      // keep things light and avoid sampling cost.
      tracesSampleRate: 0,
      // Browser noise that isn't actionable.
      ignoreErrors: [
        'ResizeObserver loop limit exceeded',
        'ResizeObserver loop completed with undelivered notifications.',
        'Non-Error promise rejection captured',
      ],
    });
    sentry = mod;
  } catch {
    // Monitoring must never break the app it is monitoring.
    initStarted = false;
  }
}

export function captureException(
  error: unknown,
  context?: Record<string, unknown>,
): void {
  if (!sentry) return;
  try {
    sentry.captureException(error, context ? { extra: context } : undefined);
  } catch {
    /* swallow — never throw from the error reporter */
  }
}

export function isMonitoringActive(): boolean {
  return sentry !== null;
}
