import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "./AuthProvider";
import { getSupabase } from "~/lib/supabase";

/**
 * Route guard — specifically for advisors.
 * Checks if the current user exists in the advisors table.
 */
export function RequireAdvisor({ children }: { children: ReactNode }) {
  const { user, loading: authLoading } = useAuth();
  const location = useLocation();
  const [isAdvisor, setIsAdvisor] = useState<boolean | null>(null);

  useEffect(() => {
    if (!user) {
      setIsAdvisor(false);
      return;
    }

    const checkAdvisor = async () => {
      const sb = getSupabase();
      if (!sb) {
        setIsAdvisor(false);
        return;
      }
      
      const { data } = await sb
        .from("advisors")
        .select("id")
        .eq("id", user.id)
        .maybeSingle();

      setIsAdvisor(!!data);
    };

    checkAdvisor();
  }, [user]);

  if (authLoading || isAdvisor === null) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <span className="material-symbols-outlined animate-spin text-[32px] text-morning-forest">
          progress_activity
        </span>
      </div>
    );
  }

  if (!user) {
    const redirect = encodeURIComponent(location.pathname + location.search);
    return <Navigate to={`/login?redirect=${redirect}`} replace />;
  }

  if (isAdvisor === false) {
    return <Navigate to="/dashboard" replace />;
  }

  return <>{children}</>;
}
