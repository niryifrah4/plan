import { reportError } from "./report-error.js";

/**
 * safeParse — JSON parse that returns a fallback instead of throwing.
 * Ported from lib/safe-json.ts (server-relevant half only; the localStorage
 * readJSON helper was frontend-only and lives in the SPA).
 */
export function safeParse<T>(
  raw: string | null | undefined,
  fallback: T,
  scope = "safeParse"
): T {
  if (raw == null || raw === "") return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch (e) {
    reportError(scope, e);
    return fallback;
  }
}
