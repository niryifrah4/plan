"use client";

import { useEffect } from "react";
import { Sidebar } from "@/components/Sidebar";
import { ClientSwitcher } from "@/components/ClientSwitcher";
import { useClient } from "@/lib/client-context";
import { startSessionWatcher } from "@/lib/session-security";
import { isSupabaseConfigured } from "@/lib/supabase/browser";

export function ClientShell({ children, isAdvisor = false }: { children: React.ReactNode; isAdvisor?: boolean }) {
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

  // 2026-04-29 per Nir: when the user clicks into an input, the existing
  // value should be selected automatically so they can just type the new
  // number without first clearing the old one. Skip checkboxes, ranges,
  // dates, and password/email fields where select-on-focus is awkward.
  useEffect(() => {
    const SKIP_TYPES = new Set(["checkbox", "radio", "range", "submit", "button", "color", "file", "date", "datetime-local", "month", "week", "time", "password", "email"]);
    const handler = (e: FocusEvent) => {
      const target = e.target as HTMLElement | null;
      if (!target) return;
      // Inputs and textareas only.
      if (target instanceof HTMLInputElement) {
        const t = (target.type || "text").toLowerCase();
        if (SKIP_TYPES.has(t)) return;
        // Skip inputs the developer explicitly marked as no-autoselect.
        if (target.dataset.noAutoselect === "true") return;
        // Defer one tick — Safari sometimes double-fires focus and a sync
        // select() races with the click placing the cursor.
        requestAnimationFrame(() => {
          try { target.select(); } catch {}
        });
      } else if (target instanceof HTMLTextAreaElement) {
        if (target.dataset.noAutoselect === "true") return;
        requestAnimationFrame(() => {
          try { target.select(); } catch {}
        });
      }
    };
    document.addEventListener("focusin", handler);
    return () => document.removeEventListener("focusin", handler);
  }, []);

  return (
    <>
      <Sidebar
        familyName={loading ? "טוען..." : familyName}
        membersCount={membersCount}
        advisorName="ניר יפרח"
        isAdvisor={isAdvisor}
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
