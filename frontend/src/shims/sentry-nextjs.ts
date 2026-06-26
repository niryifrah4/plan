// No-op shim for @sentry/nextjs — the reused root lib/report-error.ts imports
// it, but the Vite SPA bundle has no Next.js Sentry SDK. Errors still hit the
// console via reportError; Sentry capture becomes a no-op in this build.
export function captureException(_e: unknown, _ctx?: unknown): void {}
export function captureMessage(_m: unknown, _ctx?: unknown): void {}
export function init(_opts?: unknown): void {}
export const Sentry = { captureException, captureMessage, init };
