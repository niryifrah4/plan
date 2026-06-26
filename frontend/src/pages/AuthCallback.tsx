import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { getSupabase } from "~/lib/supabase";

export function AuthCallbackPage() {
  const navigate = useNavigate();

  useEffect(() => {
    let cancelled = false;

    async function handleCallback() {
      // 1. Let supabase-js parse the URL and persist the session if present.
      // Usually detectSessionInUrl() handles #access_token=... automatically,
      // but for code-exchange OAuth (like Google), we might need to wait for 
      // the auth state to settle, or handle the `?code=` query param.
      // Supabase JS handles the ?code= automatically if we call getSession().
      const sb = getSupabase();
      if (!sb) {
        if (!cancelled) navigate("/login?error=no-supabase", { replace: true });
        return;
      }
      const { error } = await sb.auth.getSession();
      
      if (error) {
        if (!cancelled) navigate("/login?error=auth-callback-failed", { replace: true });
        return;
      }

      // 2. Call the backend to figure out where this user should land
      // (client vs advisor vs new user onboarding).
      try {
        const res = await fetch("/api/auth/resolve-landing");
        if (res.ok) {
          const { target } = await res.json();
          if (!cancelled) navigate(target || "/dashboard", { replace: true });
        } else {
          if (!cancelled) navigate("/login?error=resolve-failed", { replace: true });
        }
      } catch (e) {
        if (!cancelled) navigate("/login?error=network", { replace: true });
      }
    }

    handleCallback();

    return () => {
      cancelled = true;
    };
  }, [navigate]);

  return (
    <div className="flex min-h-screen items-center justify-center">
      <span className="material-symbols-outlined animate-spin text-[32px] text-morning-forest">
        progress_activity
      </span>
    </div>
  );
}
