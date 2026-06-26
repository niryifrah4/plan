import { config } from "dotenv";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

// Load backend/.env first (if present), then fall back to the repo-root .env
// so the migration reuses the existing Supabase secrets without duplication.
const __dirname = dirname(fileURLToPath(import.meta.url));
config({ quiet: true }); // backend cwd .env
config({ path: resolve(__dirname, "../../.env"), quiet: true }); // repo-root .env
config({ path: resolve(__dirname, "../../.env.local"), override: false, quiet: true });

/**
 * Centralized env access for the backend.
 * In the Next.js app these were NEXT_PUBLIC_* (exposed to the client).
 * On the backend the anon URL/key stay server-side; the frontend has its
 * own copy via Vite's VITE_* vars.
 */
function req(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required env var: ${name}`);
  return v;
}

export const env = {
  SUPABASE_URL: process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "",
  SUPABASE_ANON_KEY:
    process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "",
  SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY || "",
  PORT: Number(process.env.PORT || 3001),
  // Comma-separated list of allowed CORS origins (the Vite dev + prod URLs).
  CORS_ORIGINS: (process.env.CORS_ORIGINS || "http://localhost:5173").split(","),
  // Where OAuth flows (Google Calendar) redirect the browser back to — the
  // SPA origin, not the backend. Falls back to the first CORS origin.
  FRONTEND_URL:
    process.env.FRONTEND_URL ||
    (process.env.CORS_ORIGINS || "http://localhost:5173").split(",")[0],
  NODE_ENV: process.env.NODE_ENV || "development",
};

/** Cookie options for cross-origin token cookies (gcal). Dev: lax/insecure
 *  (same-origin via Vite proxy). Prod: SameSite=None + Secure so the SPA's
 *  credentialed fetches send them cross-origin. */
export function crossSiteCookie(maxAgeMs: number, httpOnly = true) {
  const prod = (process.env.NODE_ENV || "development") === "production";
  return {
    httpOnly,
    secure: prod,
    sameSite: prod ? ("none" as const) : ("lax" as const),
    path: "/",
    maxAge: maxAgeMs,
  };
}

export function assertSupabaseEnv() {
  if (!env.SUPABASE_URL || !env.SUPABASE_ANON_KEY) {
    throw new Error(
      "Supabase env missing: set SUPABASE_URL and SUPABASE_ANON_KEY (or NEXT_PUBLIC_* equivalents)."
    );
  }
}

export { req };
