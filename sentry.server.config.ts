/**
 * Sentry — Node/server SDK init for API routes + server components.
 * Same pattern as client: silent unless SENTRY_DSN is set.
 */

import * as Sentry from "@sentry/nextjs";

const dsn = process.env.SENTRY_DSN || process.env.NEXT_PUBLIC_SENTRY_DSN;

if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env.VERCEL_ENV || process.env.NODE_ENV,
    tracesSampleRate: 0.1,
    // Server: skip noisy errors that don't reflect product bugs.
    ignoreErrors: ["ECONNRESET", "AbortError", /^NEXT_NOT_FOUND$/],
  });
}
