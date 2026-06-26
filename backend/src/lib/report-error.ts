/**
 * report-error — single error-reporting entry point (backend).
 * Ported from lib/report-error.ts. Sentry is wired via @sentry/node later
 * (task: cleanup); for now this logs and never re-throws.
 */
export function reportError(scope: string, e: unknown): void {
  try {
    console.warn(`[${scope}]`, e);
  } catch {
    /* console unavailable */
  }
}
