import { Leaf, FileText, Users, Loader2, LogOut } from "lucide-react";
import { useClients } from "~/hooks/useClients";
import { useAuth } from "~/auth/AuthProvider";
import { Button } from "~/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";

/**
 * CRM clients dashboard — Lovable idiom: shadcn primitives + lucide icons +
 * TanStack Query (useClients). Exercises the full slice: browser session ->
 * Bearer token -> Express requireUser/requireAdvisor -> RLS query.
 */
export function DashboardPage() {
  const { user, signOut } = useAuth();
  const { data: households = [], isLoading, error } = useClients();

  return (
    <div dir="rtl" className="min-h-screen bg-background p-6 font-sans text-foreground">
      <header className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Leaf className="text-primary" />
          <div>
            <h1 className="text-2xl font-bold text-primary">לקוחות פעילים</h1>
            <p className="text-sm text-muted-foreground">{user?.email}</p>
          </div>
        </div>
        <Button variant="outline" onClick={signOut}>
          <LogOut />
          התנתקות
        </Button>
      </header>

      {isLoading && (
        <div className="flex items-center gap-2 text-muted-foreground">
          <Loader2 className="animate-spin" />
          טוען…
        </div>
      )}

      {error && (
        <Card className="border-destructive">
          <CardContent className="pt-6 text-sm text-destructive">
            שגיאה: {(error as Error).message}
          </CardContent>
        </Card>
      )}

      {!isLoading && !error && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {households.length === 0 && (
            <p className="text-muted-foreground">אין לקוחות להצגה.</p>
          )}
          {households.map((h) => (
            <Card key={h.id}>
              <CardHeader className="flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle>{h.family_name}</CardTitle>
                <span className="rounded-full bg-secondary px-2 py-0.5 text-xs text-secondary-foreground">
                  {h.stage}
                </span>
              </CardHeader>
              <CardContent>
                <dl className="space-y-1 text-sm text-muted-foreground">
                  <div className="flex justify-between">
                    <dt>שווי נקי</dt>
                    <dd className="tabular-nums text-foreground">
                      {h.net_worth != null ? `₪${h.net_worth.toLocaleString("he-IL")}` : "—"}
                    </dd>
                  </div>
                  <div className="flex items-center justify-between">
                    <dt className="flex items-center gap-1">
                      <FileText className="size-3.5" /> מסמכים
                    </dt>
                    <dd className="tabular-nums text-foreground">{h.docs_uploaded}</dd>
                  </div>
                  <div className="flex items-center justify-between">
                    <dt className="flex items-center gap-1">
                      <Users className="size-3.5" /> נפשות
                    </dt>
                    <dd className="tabular-nums text-foreground">{h.members_count}</dd>
                  </div>
                </dl>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
