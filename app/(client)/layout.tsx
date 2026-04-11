"use client";

import { Suspense } from "react";
import { ClientProvider } from "@/lib/client-context";
import { ClientShell } from "./ClientShell";

export default function ClientLayout({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center text-verdant-muted">טוען...</div>}>
      <ClientProvider>
        <ClientShell>{children}</ClientShell>
      </ClientProvider>
    </Suspense>
  );
}
