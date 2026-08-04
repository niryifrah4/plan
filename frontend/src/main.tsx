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
