/**
 * ═══════════════════════════════════════════════════════════
 *  Auth Helpers — שכבת אימות
 * ═══════════════════════════════════════════════════════════
 *
 * Wraps Supabase Auth for both client and server.
 * Falls back gracefully in demo mode (no Supabase).
 */

import { getSupabaseBrowser, isSupabaseConfigured } from "@/lib/supabase/browser";

/* ── Types ── */
export interface AppUser {
  id: string;
  email: string;
  fullName: string;
  role: "advisor" | "client";
  avatarUrl?: string;
}

/* ── Demo user (no Supabase) ── */
const DEMO_USER: AppUser = {
  id: "demo",
  email: "demo@plan.local",
  fullName: "מצב דמו",
  role: "advisor",
};

/* ── Client-side auth ── */

/** Get the currently logged-in user, or null */
export async function getCurrentUser(): Promise<AppUser | null> {
  if (!isSupabaseConfigured()) return DEMO_USER;

  const sb = getSupabaseBrowser();
  if (!sb) return DEMO_USER;

  const {
    data: { user },
    error,
  } = await sb.auth.getUser();
  if (error || !user) return null;

  return {
    id: user.id,
    email: user.email || "",
    fullName: user.user_metadata?.full_name || user.email || "",
    role: (user.user_metadata?.role as AppUser["role"]) || "advisor",
    avatarUrl: user.user_metadata?.avatar_url,
  };
}

/** Check if user is authenticated */
export async function isAuthenticated(): Promise<boolean> {
  if (!isSupabaseConfigured()) return true; // demo mode
  const user = await getCurrentUser();
  return user !== null;
}

/** Get user role */
export async function getUserRole(): Promise<AppUser["role"]> {
  const user = await getCurrentUser();
  return user?.role || "advisor";
}

/** Sign out */
export async function signOut(): Promise<void> {
  if (!isSupabaseConfigured()) {
    window.location.href = "/login";
    return;
  }

  const sb = getSupabaseBrowser();
  if (sb) {
    await sb.auth.signOut();
  }
  window.location.href = "/login";
}

/** Listen to auth state changes */
export function onAuthStateChange(
  callback: (user: AppUser | null) => void
): (() => void) | undefined {
  if (!isSupabaseConfigured()) return undefined;

  const sb = getSupabaseBrowser();
  if (!sb) return undefined;

  const {
    data: { subscription },
  } = sb.auth.onAuthStateChange(async (event, session) => {
    if (session?.user) {
      const u = session.user;
      callback({
        id: u.id,
        email: u.email || "",
        fullName: u.user_metadata?.full_name || u.email || "",
        role: (u.user_metadata?.role as AppUser["role"]) || "advisor",
        avatarUrl: u.user_metadata?.avatar_url,
      });
    } else {
      callback(null);
    }
  });

  return () => subscription.unsubscribe();
}
