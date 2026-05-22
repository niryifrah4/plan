"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Sidebar } from "@/components/Sidebar";
import { useClient } from "@/lib/client-context";
import { startSessionWatcher } from "@/lib/session-security";
import { isSupabaseConfigured } from "@/lib/supabase/browser";
import { getCurrentUser } from "@/lib/auth";

interface ImpersonationInfo {
  householdId: string;
  familyName: string;
}

export function ClientShell({
  children,
  isAdvisor = false,
  impersonation = null,
}: {
  children: React.ReactNode;
  isAdvisor?: boolean;
  impersonation?: ImpersonationInfo | null;
}) {
  const router = useRouter();
  // Impersonation banner — visible only when an advisor is viewing a client's
  // tab via the CRM impersonation cookie. Without this strip the advisor can
  // edit the wrong household by accident (memory: advisor_flow_pitfalls).
  const handleExitImpersonation = async () => {
    try {
      await fetch("/api/crm/impersonate", { method: "DELETE" }).catch(() => {});
    } finally {
      router.push("/crm");
    }
  };
  const { familyName, membersCount, loading } = useClient();
  // Pull the logged-in advisor's name from the auth session so the sidebar
  // footer reflects whoever is signed in (not a hardcoded value).
  const [advisorName, setAdvisorName] = useState<string>("מתכנן");
  useEffect(() => {
    let cancelled = false;
    getCurrentUser()
      .then((u) => {
        if (cancelled || !u) return;
        const name = u.fullName?.trim();
        if (name) setAdvisorName(name);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);
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
      {/* Impersonation banner — full-width strip that ALWAYS shows when an
          advisor is viewing a client's tab. Sits above the mobile header and
          the sidebar so it's unmissable on every screen, every device. */}
      {impersonation && (
        <div
          dir="rtl"
          className="fixed inset-x-0 top-0 z-50 flex items-center justify-between gap-3 px-4 py-2 text-[12px] font-extrabold shadow-sm md:text-[13px]"
          style={{
            background: "#FED7AA",
            color: "#92400E",
            borderBottom: "1px solid #FB923C",
            minHeight: 36,
          }}
        >
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-[16px]">visibility</span>
            <span>
              צפייה כיועץ בתיק <strong className="font-black">{impersonation.familyName}</strong>
            </span>
          </div>
          <button
            type="button"
            onClick={handleExitImpersonation}
            className="rounded-md px-2.5 py-1 text-[11px] font-extrabold transition-colors md:text-[12px]"
            style={{ background: "#92400E", color: "#FED7AA" }}
          >
            יציאה לרשימת לקוחות
          </button>
        </div>
      )}
      {/* Mobile top bar — hamburger + brand. Hidden on md+ where the sidebar
          is permanently visible. */}
      <header
        className={
          "fixed inset-x-0 z-20 flex h-14 items-center justify-between px-4 md:hidden " +
          (impersonation ? "top-9" : "top-0")
        }
        style={{
          background: "#FFFFFF",
          color: "#1A1A1A",
          borderBottom: "1px solid rgba(255,255,255,0.04)",
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
            style={{ fontSize: 18, fontWeight: 700, fontFamily: "Rubik, Heebo, Assistant, sans-serif" }}
          >
            plan
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
          advisorName={advisorName}
          isAdvisor={isAdvisor}
        />
      </div>

      {/* Main content — pad-top on mobile to clear the fixed header,
          right-margin on md+ to clear the fixed sidebar. When the
          impersonation banner is shown, mobile pad-top grows so the
          first content row isn't hidden behind the banner+header stack.
          2026-05-19 per Nir: removed the inline ClientSwitcher — advisors
          switch clients from /crm instead, freeing up screen real estate. */}
      <main
        className={
          "min-h-screen px-3 pb-8 sm:px-6 md:mr-[280px] md:px-10 " +
          (impersonation ? "pt-24 md:pt-16" : "pt-16 md:pt-8")
        }
      >
        {children}
      </main>
    </>
  );
}
