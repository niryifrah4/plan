import { useEffect, useState } from "react";
import { Outlet, useNavigate } from "react-router-dom";
import { MobileBootstrap } from "@/app/m/MobileBootstrap";
import { MobileTabBar } from "@/app/m/MobileTabBar";
import { ErrorBoundary } from "./ErrorBoundary";

type Impersonation = { householdId: string; familyName: string } | null;

export function MobileLayout() {
  const [impersonation, setImpersonation] = useState<Impersonation>(null);
  const [resolved, setResolved] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    let cancelled = false;
    const fetchImp = async () => {
      try {
        const res = await fetch("/api/crm/impersonate/status");
        if (res.status === 403 || res.status === 401) {
          if (!cancelled) {
            setImpersonation(null);
            setResolved(true);
          }
          return;
        }
        if (res.ok) {
          const data = await res.json();
          if (data.impersonating) {
            if (!cancelled) {
              setImpersonation({ householdId: data.householdId, familyName: data.familyName });
              setResolved(true);
            }
          } else {
            if (!cancelled) {
              setImpersonation(null);
              setResolved(true);
            }
          }
        } else {
          if (!cancelled) navigate("/login", { replace: true });
        }
      } catch (e) {
        if (!cancelled) navigate("/login", { replace: true });
      }
    };
    fetchImp();
    return () => {
      cancelled = true;
    };
  }, [navigate]);

  if (!resolved) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <span className="material-symbols-outlined animate-spin text-[32px] text-morning-forest">
          progress_activity
        </span>
      </div>
    );
  }

  return (
    <MobileBootstrap householdId={impersonation?.householdId ?? null}>
      <div
        className="mx-auto w-full"
        style={{
          maxWidth: 480,
          minHeight: "100vh",
          background: "var(--morning-bg)",
          paddingTop: "env(safe-area-inset-top)",
          paddingBottom: "calc(88px + env(safe-area-inset-bottom))",
          position: "relative",
        }}
      >
        <ErrorBoundary>
          <Outlet />
        </ErrorBoundary>
        <MobileTabBar />
      </div>
    </MobileBootstrap>
  );
}
