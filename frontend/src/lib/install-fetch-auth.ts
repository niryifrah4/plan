import { getSupabase } from "./supabase";

/**
 * Global fetch interceptor. The reused app/(client) pages + components call
 * `fetch("/api/...")` directly (they were same-origin under Next.js). In the
 * SPA those requests must carry the Supabase access token as a Bearer header
 * and include credentials (for cookie-based flows like gcal/impersonate).
 *
 * Installing this once at boot lets all that existing code run UNCHANGED —
 * we don't have to rewrite hundreds of fetch call sites. Non-/api requests
 * pass through untouched.
 */
const API_BASE = (import.meta.env.VITE_API_BASE as string | undefined) ?? "";

export function installFetchAuth() {
  const original = window.fetch.bind(window);

  window.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url =
      typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;

    // Only touch our own API calls.
    const isApi = url.startsWith("/api/") || (API_BASE && url.startsWith(`${API_BASE}/api/`));
    if (!isApi) return original(input, init);

    const headers = new Headers(init?.headers || (input instanceof Request ? input.headers : undefined));
    if (!headers.has("Authorization")) {
      const sb = getSupabase();
      if (sb) {
        const {
          data: { session },
        } = await sb.auth.getSession();
        if (session?.access_token) headers.set("Authorization", `Bearer ${session.access_token}`);
      }
    }

    // Rebase relative /api onto VITE_API_BASE in production (empty in dev → Vite proxy).
    const target = url.startsWith("/api/") && API_BASE ? `${API_BASE}${url}` : input;

    return original(target, { ...init, headers, credentials: "include" });
  };
}
