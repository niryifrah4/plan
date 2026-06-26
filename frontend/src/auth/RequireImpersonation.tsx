import type { ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { useImpersonation } from "@/lib/impersonation-context";

/**
 * Route guard — specifically for the /plan canvas.
 * Checks if there is an active impersonation session. Since ClientLayout
 * ensures only advisors can have impersonation !== null, this effectively
 * guards the route to "advisors who are actively working on a client".
 * Real clients (impersonation = null) are redirected to /dashboard.
 */
export function RequireImpersonation({ children }: { children: ReactNode }) {
  const impersonation = useImpersonation();

  if (!impersonation) {
    return <Navigate to="/dashboard" replace />;
  }

  return <>{children}</>;
}
