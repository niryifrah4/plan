"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { Sidebar } from "@/components/Sidebar";
import { ClientSwitcher } from "@/components/ClientSwitcher";
import { useClient } from "@/lib/client-context";
import { startSessionWatcher } from "@/lib/session-security";
import { isSupabaseConfigured } from "@/lib/supabase/browser";

export function ClientShell({
  children,
  isAdvisor = false,
}: {
  children: React.ReactNode;
  isAdvisor?: boolean;
}) {
  const { familyName, membersCount, loading } = useClient();
  // Mobile: sidebar is a slide-over drawer. Closed by default.
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const pathname = usePathname();
  // Auto-close drawer when route changes (so tapping a link doesn't leave
  // the menu hovering above the new screen).
  useEffect(() => {
    setMobileNavOpen(false);
  }, [pathname]);

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
    const SKIP_TYPES = new Set([
      "checkbox",
      "radio",
      "range",
      "submit",
      "button",
      "color",
      "file",
      "date",
      "datetime-local",
      "month",
      "week",
      "time",
      "password",
      "email",
    ]);
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
          try {
            target.select();
          } catch {}
        });
      } else if (target instanceof HTMLTextAreaElement) {
        if (target.dataset.noAutoselect === "true") return;
        requestAnimationFrame(() => {
          try {
            target.select();
          } catch {}
        });
      }
    };
    document.addEventListener("focusin", handler);
    return () => document.removeEventListener("focusin", handler);
  }, []);

  return (
    <>
      {/* Mobile top bar — hamburger + brand. Hidden on md+ where the sidebar
          is permanently visible. */}
      <header
        className="fixed inset-x-0 top-0 z-20 flex h-14 items-center justify-between px-4 md:hidden"
        style={{
          background: "#012D1D",
          color: "#F9FAF2",
          borderBottom: "1px solid rgba(255,255,255,0.06)",
        }}
        dir="rtl"
      >
        <button
          type="button"
          aria-label="פתח תפריט"
          onClick={() => setMobileNavOpen(true)}
          className="flex h-10 w-10 items-center justify-center rounded-xl active:bg-white/10"
        >
          <span className="material-symbols-outlined text-[24px]">menu</span>
        </button>
        <div className="flex items-center gap-2">
          <span
            style={{ fontSize: 16, fontWeight: 800, fontFamily: "Manrope, Assistant, sans-serif" }}
          >
            פלאן
          </span>
        </div>
        <div className="w-10" />
      </header>

      {/* Backdrop — only on mobile, only when drawer is open. */}
      {mobileNavOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/50 backdrop-blur-sm md:hidden"
          onClick={() => setMobileNavOpen(false)}
          aria-hidden
        />
      )}

      {/* Sidebar wrapper — hidden off-screen on mobile, visible on md+.
          The Sidebar component itself is `fixed`, so we control visibility
          via a translate on a wrapper that becomes a transform context. */}
      <div
        className={
          "transition-transform duration-200 ease-out md:transform-none " +
          (mobileNavOpen ? "translate-x-0" : "translate-x-full md:translate-x-0")
        }
      >
        <Sidebar
          familyName={loading ? "טוען..." : familyName}
          membersCount={membersCount}
          advisorName="ניר יפרח"
          isAdvisor={isAdvisor}
        />
      </div>

      {/* Main content — pad-top on mobile to clear the fixed header,
          right-margin on md+ to clear the fixed sidebar. */}
      <main className="min-h-screen px-3 pb-8 pt-16 sm:px-6 md:mr-[280px] md:px-10 md:pt-8">
        <div className="mb-6 flex justify-start">
          <ClientSwitcher />
        </div>
        {children}
      </main>
    </>
  );
}
