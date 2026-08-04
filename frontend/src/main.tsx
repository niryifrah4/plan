import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "sonner";
import { AuthProvider } from "~/auth/AuthProvider";
import { App } from "~/App";
import { installFetchAuth } from "~/lib/install-fetch-auth";
import "./globals.css";

// Attach Supabase Bearer + credentials to all /api fetches so reused
// app/(client) pages and components work unchanged (see install-fetch-auth).
installFetchAuth();

// A deployment can invalidate an old lazy chunk while a tab still holds the
// previous index.html. Recover once automatically instead of trapping the user
// in the generic content-area error screen.
if (typeof window !== "undefined") {
  const reloadKey = "plan:stale-chunk-reload";
  const recover = (message: string) => {
    if (!/dynamically imported module|Importing a module script failed|Loading chunk/i.test(message)) return;
    if (sessionStorage.getItem(reloadKey)) return;
    sessionStorage.setItem(reloadKey, "1");
    const url = new URL(window.location.href);
    url.searchParams.set("_v", String(Date.now()));
    window.location.replace(url.toString());
  };
  window.addEventListener("error", (event) => recover(String(event.error?.message || event.message || "")));
  window.addEventListener("unhandledrejection", (event) => recover(String((event.reason as Error)?.message || event.reason || "")));
  window.addEventListener("load", () => window.setTimeout(() => sessionStorage.removeItem(reloadKey), 4000), { once: true });
}

// Lovable-idiomatic data layer: a single QueryClient at the root, sensible
// retry/staleness defaults. Per-feature hooks live in src/hooks/*.
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 30_000,
      refetchOnWindowFocus: false,
    },
  },
});

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AuthProvider>
          <App />
          <Toaster position="top-center" richColors dir="rtl" />
        </AuthProvider>
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>
);
