/**
 * ═══════════════════════════════════════════════════════════
 *  Auth Helpers — שכבת אימות
 * ═══════════════════════════════════════════════════════════
 *
 * Wraps Supabase Auth for both client and server.
 * Falls back gracefully in demo mode (no Supabase).
 */

import { getSupabaseBrowser, isSupabaseConfigured } from "@/lib/supabase/browser";
import { clearBootstrapState } from "@/lib/sync/bootstrap";

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

/** Get the currently logged-in user, or null.
 *  Role is derived from the `advisors` table — never trusted from
 *  user_metadata, which the user controls (security-agent MEDIUM #2). */
export async function getCurrentUser(): Promise<AppUser | null> {
  if (!isSupabaseConfigured()) return DEMO_USER;

  const sb = getSupabaseBrowser();
  if (!sb) return DEMO_USER;

  const {
    data: { user },
    error,
  } = await sb.auth.getUser();
  if (error || !user) return null;

  const { data: advisorRow } = await sb
    .from("advisors")
    .select("id")
    .eq("id", user.id)
    .maybeSingle();

  return {
    id: user.id,
    email: user.email || "",
    fullName: user.user_metadata?.full_name || user.email || "",
    role: advisorRow ? "advisor" : "client",
    avatarUrl: user.user_metadata?.avatar_url,
  };
}

/** Check if user is authenticated */
export async function isAuthenticated(): Promise<boolean> {
  if (!isSupabaseConfigured()) return true; // demo mode
  const user = await getCurrentUser();
  return user !== null;
}

/** Clear Google Calendar cookies for the current browser session. */
export async function clearGoogleCalendarSession(): Promise<void> {
  if (typeof window === "undefined" || !isSupabaseConfigured()) return;

  try {
    await fetch("/api/gcal/disconnect", {
      method: "POST",
      cache: "no-store",
    });
  } catch {
    // Best effort — logout must continue even if the cookie clear fails.
  }
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

  await clearGoogleCalendarSession();
  clearBootstrapState();
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
      // Re-check advisors table on every auth state change — same reason as
      // getCurrentUser(): role must not be sourced from user_metadata.
      const { data: advisorRow } = await sb
        .from("advisors")
        .select("id")
        .eq("id", u.id)
        .maybeSingle();
      callback({
        id: u.id,
        email: u.email || "",
        fullName: u.user_metadata?.full_name || u.email || "",
        role: advisorRow ? "advisor" : "client",
        avatarUrl: u.user_metadata?.avatar_url,
      });
    } else {
      callback(null);
    }
  });

  return () => subscription.unsubscribe();
}
