import { getSupabase } from "./supabase";

/**
 * Authenticated fetch wrapper.
 *
 * Migration note: the Next.js app relied on Supabase cookies being sent
 * automatically with same-origin requests. In the SPA split we instead read
 * the current access token from the Supabase client and attach it as a
 * Bearer header — that's what backend/src/middleware/auth.ts validates.
 *
 * URLs are relative ("/api/..."); Vite's dev proxy forwards them to the
 * Express backend, and in prod the frontend is served behind the same origin
 * (or VITE_API_BASE points at the backend host).
 */
const API_BASE = (import.meta.env.VITE_API_BASE as string | undefined) ?? "";

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
    this.name = "ApiError";
  }
}

async function authHeader(): Promise<Record<string, string>> {
  const sb = getSupabase();
  if (!sb) return {};
  const {
    data: { session },
  } = await sb.auth.getSession();
  if (!session?.access_token) return {};
  return { Authorization: `Bearer ${session.access_token}` };
}

export async function apiFetch<T = unknown>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(await authHeader()),
    ...((options.headers as Record<string, string>) ?? {}),
  };

  // credentials: "include" so cookie-based flows (e.g. Google Calendar tokens)
  // round-trip to the backend. CORS on the backend allows the SPA origin.
  const res = await fetch(`${API_BASE}${path}`, {
    credentials: "include",
    ...options,
    headers,
  });

  if (res.status === 401) {
    // Token expired / missing — bounce to login, preserving where we were.
    const here = window.location.pathname + window.location.search;
    window.location.href = `/login?redirect=${encodeURIComponent(here)}`;
    throw new ApiError(401, "unauthenticated");
  }

  const text = await res.text();
  const body = text ? JSON.parse(text) : null;

  if (!res.ok) {
    throw new ApiError(res.status, body?.error || res.statusText);
  }
  return body as T;
}

export const api = {
  get: <T = unknown>(path: string) => apiFetch<T>(path),
  post: <T = unknown>(path: string, data?: unknown) =>
    apiFetch<T>(path, { method: "POST", body: data ? JSON.stringify(data) : undefined }),
  put: <T = unknown>(path: string, data?: unknown) =>
    apiFetch<T>(path, { method: "PUT", body: data ? JSON.stringify(data) : undefined }),
  del: <T = unknown>(path: string) => apiFetch<T>(path, { method: "DELETE" }),
};
