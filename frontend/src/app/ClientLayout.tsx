import { useEffect, useState } from "react";
import { Outlet, useNavigate } from "react-router-dom";
import ClientLayoutInner from "@/frontend/src/reused-pages/(client)/ClientLayoutInner";
import { useAuth } from "~/auth/AuthProvider";
import { ErrorBoundary } from "./ErrorBoundary";

type Impersonation = { householdId: string; familyName: string } | null;

/**
 * SPA replacement for reused-pages/(client)/layout.tsx (which was an RSC guard reading
 * cookies). Behaviour preserved 1:1:
 *   - not logged in            → /login (RequireAuth wraps this route)
 *   - advisor w/o impersonation cookie → /crm
 *   - advisor WITH valid cookie → allow + pass impersonation to the shell
 *   - client                    → allow, impersonation = null
 * The impersonation state comes from GET /api/crm/impersonate/status (which
 * re-verifies advisor ownership server-side, same as the old layout query).
 */
export function ClientLayout() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const localBypass =
    typeof window !== "undefined" && window.localStorage.getItem("e2e:auth-bypass") === "1";
  const devBypass =
    import.meta.env.DEV && (import.meta.env.VITE_DEV_AUTH_BYPASS === "1" || localBypass);
  const [resolved, setResolved] = useState(devBypass);
  const [impersonation, setImpersonation] = useState<Impersonation>(null);

  useEffect(() => {
    if (loading || !user) return;
    if (devBypass) {
      setResolved(true);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        // Is the caller an advisor? The impersonate/status route is
        // advisor-gated (403 for clients) and reports the active cookie.
        const res = await fetch("/api/crm/impersonate/status");
        if (res.status === 403) {
          // Client user — allowed into the client area, no impersonation.
          if (!cancelled) {
            setImpersonation(null);
            setResolved(true);
          }
          return;
        }
        const data = await res.json();
        if (cancelled) return;
        if (data?.impersonating) {
          setImpersonation({ householdId: data.householdId, familyName: data.familyName });
          setResolved(true);
        } else {
          // Advisor without an active impersonation cookie → back to CRM.
          navigate("/crm", { replace: true });
        }
      } catch {
        if (!cancelled) setResolved(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [loading, user, navigate, devBypass]);

  if (loading || !resolved) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <span className="material-symbols-outlined animate-spin text-[32px] text-morning-forest">
          progress_activity
        </span>
      </div>
    );
  }

  return (
    <ClientLayoutInner impersonation={impersonation}>
      <ErrorBoundary>
        <Outlet />
      </ErrorBoundary>
    </ClientLayoutInner>
  );
}
