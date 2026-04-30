/**
 * Sentry — browser SDK init.
 *
 * Activated only when SENTRY_DSN is set, so local dev (without DSN) stays
 * silent. Captures unhandled errors, runtime exceptions, and structured
 * messages from `Sentry.captureException(err)` calls inside the app.
 *
 * Built 2026-04-30 ahead of go-live: without error tracking we'd ship blind.
 */

import * as Sentry from "@sentry/nextjs";

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env.NEXT_PUBLIC_VERCEL_ENV || process.env.NODE_ENV,
    // 10% sampling in prod is plenty for a 50-user beta — adjust later.
    tracesSampleRate: 0.1,
    // Replay only on errors so we don't stream every session.
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: 1.0,
    integrations: [
      Sentry.replayIntegration({
        maskAllText: true,       // never leak PII (names, balances)
        blockAllMedia: true,
      }),
    ],
    // Strip URL query strings — they may contain household ids or symbols.
    beforeSend(event) {
      if (event.request?.url) {
        try {
          const u = new URL(event.request.url);
          event.request.url = u.origin + u.pathname;
        } catch {}
      }
      return event;
    },
  });
}
