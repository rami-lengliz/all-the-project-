/**
 * Server-side error monitoring (Sentry).
 *
 * Dormant until `SENTRY_DSN` is set: with no DSN, `initSentry()` returns
 * immediately and `captureException()` / `flushSentry()` become no-ops, so
 * local dev and CI are unaffected. Set the DSN in the production environment
 * and 5xx errors start flowing to Sentry with no code change.
 *
 * Error reporting only — no performance tracing — to avoid pulling in
 * OpenTelemetry sampling overhead.
 */
import * as Sentry from '@sentry/node';

let initialized = false;

export function initSentry(): void {
  if (initialized) return;

  const dsn = process.env.SENTRY_DSN;
  if (!dsn) return; // dormant until a DSN is configured

  try {
    Sentry.init({
      dsn,
      environment:
        process.env.SENTRY_ENV ?? process.env.NODE_ENV ?? 'development',
      release: process.env.APP_VERSION || undefined,
      tracesSampleRate: 0,
    });
    initialized = true;
  } catch {
    // Monitoring must never break boot.
  }
}

export function captureException(
  error: unknown,
  context?: Record<string, unknown>,
): void {
  if (!initialized) return;
  try {
    Sentry.captureException(error, context ? { extra: context } : undefined);
  } catch {
    /* swallow — never throw from the error reporter */
  }
}

/**
 * Drain the queue before the process exits so a fatal-boot event isn't lost.
 * No-op when Sentry isn't active.
 */
export async function flushSentry(timeoutMs = 2000): Promise<void> {
  if (!initialized) return;
  try {
    await Sentry.flush(timeoutMs);
  } catch {
    /* swallow */
  }
}

export function isSentryActive(): boolean {
  return initialized;
}
