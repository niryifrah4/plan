import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { getSupabase, isSupabaseConfigured } from "~/lib/supabase";

/**
 * Client-side auth state. Replaces the server-side session reads that the
 * Next.js RSC layouts did via cookies(). Here the SPA subscribes to Supabase
 * auth changes and exposes { user, loading } to the route guard + UI.
 */
interface AuthCtx {
  user: User | null;
  session: Session | null;
  loading: boolean;
  configured: boolean;
  signOut: () => Promise<void>;
}

const Ctx = createContext<AuthCtx | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const localBypass =
    typeof window !== "undefined" && window.localStorage.getItem("e2e:auth-bypass") === "1";
  const devBypass =
    import.meta.env.DEV && (import.meta.env.VITE_DEV_AUTH_BYPASS === "1" || localBypass);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(!devBypass);
  const configured = isSupabaseConfigured();

  const devUser = devBypass
    ? ({
        id: "e2e-local-user",
        email: "e2e@localhost",
        aud: "authenticated",
        role: "authenticated",
      } as User)
    : null;

  useEffect(() => {
    if (devBypass) return;
    const sb = getSupabase();
    if (!sb) {
      setLoading(false);
      return;
    }
    sb.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });
    const {
      data: { subscription },
    } = sb.auth.onAuthStateChange((_event, s) => setSession(s));
    return () => subscription.unsubscribe();
  }, []);

  const signOut = async () => {
    await getSupabase()?.auth.signOut();
    window.location.href = "/login";
  };

  return (
    <Ctx.Provider
      value={{ user: devUser ?? session?.user ?? null, session, loading, configured, signOut }}
    >
      {children}
    </Ctx.Provider>
  );
}

export function useAuth(): AuthCtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
