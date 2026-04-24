"use client";

import { useEffect } from "react";
import { Sidebar } from "@/components/Sidebar";
import { ClientSwitcher } from "@/components/ClientSwitcher";
import { useClient } from "@/lib/client-context";
import { startSessionWatcher } from "@/lib/session-security";
import { isSupabaseConfigured } from "@/lib/supabase/browser";

export function ClientShell({ children }: { children: React.ReactNode }) {
  const { familyName, membersCount, loading } = useClient();

  // Start idle-timeout watcher (only when real auth is active — skip in demo mode)
  useEffect(() => {
    if (!isSupabaseConfigured()) return;
    const stop = startSessionWatcher(() => {
      // Optional: show a banner/toast "Your session expires in 1 minute"
      console.warn("[session] idle timeout warning");
    });
    return stop;
  }, []);

  return (
    <>
      <Sidebar
        familyName={loading ? "טוען..." : familyName}
        membersCount={membersCount}
        advisorName="ניר יפרח"
      />
      <main className="mr-[280px] min-h-screen px-10 py-8">
        <div className="flex justify-start mb-6">
          <ClientSwitcher />
        </div>
        {children}
      </main>
    </>
  );
}
