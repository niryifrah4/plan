"use client";

/**
 * /clear-storage — one-shot localStorage/sessionStorage/cookie wipe.
 *
 * Used when the dev environment switches Supabase project (plan-dev vs prod)
 * and the browser still holds leftover keys like `verdant:current_hh` pointing
 * at a household that no longer exists. Visiting this URL clears everything
 * for the current origin and bounces back to /login with a fresh state.
 *
 * Public route — listed in middleware PUBLIC_ROUTES so an unauthenticated
 * user can reach it.
 */

import { useEffect, useState } from "react";
import { reportError } from "@/lib/report-error";

export default function ClearStoragePage() {
  const [step, setStep] = useState<"running" | "done">("running");

  useEffect(() => {
    try {
      localStorage.clear();
    } catch (e) { reportError("clear-storage/page", e); }
    try {
      sessionStorage.clear();
    } catch (e) { reportError("clear-storage/page", e); }
    try {
      document.cookie.split(";").forEach((c) => {
        const eq = c.indexOf("=");
        const name = (eq > -1 ? c.substring(0, eq) : c).trim();
        document.cookie =
          name + "=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/";
        document.cookie =
          name +
          "=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/; domain=" +
          location.hostname;
      });
    } catch (e) { reportError("clear-storage/page", e); }
    setStep("done");
    const t = setTimeout(() => {
      window.location.replace("/login");
    }, 1200);
    return () => clearTimeout(t);
  }, []);

  return (
    <div
      dir="rtl"
      className="flex min-h-screen items-center justify-center px-4"
      style={{
        background:
          "linear-gradient(135deg, #F4F5F0 0%, #F0F8E3 60%, #E8F4D1 100%)",
      }}
    >
      <div
        className="w-full max-w-sm rounded-2xl px-8 py-10 text-center"
        style={{
          background: "var(--morning-surface)",
          border: "1px solid var(--morning-border)",
          boxShadow: "var(--morning-shadow-soft)",
        }}
      >
        <div
          className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full"
          style={{
            background: "var(--morning-leaf-tint)",
            color: "var(--morning-forest)",
          }}
        >
          <span className="material-symbols-outlined text-[28px]">
            {step === "done" ? "check_circle" : "delete_sweep"}
          </span>
        </div>
        <h1
          className="text-[20px] font-bold leading-tight"
          style={{
            color: "var(--morning-ink)",
            fontFamily: "Rubik, Heebo, Assistant, system-ui, sans-serif",
          }}
        >
          {step === "done" ? "הכל נוקה ✓" : "מנקה את המטמון..."}
        </h1>
        <p
          className="mt-2 text-[13px]"
          style={{ color: "var(--morning-muted)" }}
        >
          {step === "done"
            ? "מעבירים אותך לדף ההתחברות בריא ונקי..."
            : "localStorage, sessionStorage, cookies"}
        </p>
      </div>
    </div>
  );
}
