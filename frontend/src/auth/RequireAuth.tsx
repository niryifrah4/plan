import type { ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "./AuthProvider";
import { AppBootScreen } from "~/components/ui/AppBootScreen";

/**
 * Route guard — the SPA equivalent of the proxy.ts auth gate + the RSC layout
 * redirects. Unauthenticated users are sent to /login with a redirect param.
 */
export function RequireAuth({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return <AppBootScreen />;
  }

  if (!user) {
    const redirect = encodeURIComponent(location.pathname + location.search);
    return <Navigate to={`/login?redirect=${redirect}`} replace />;
  }

  return <>{children}</>;
}
