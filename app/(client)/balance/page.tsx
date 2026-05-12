"use client";

/**
 * /balance — 2026-04-28: page split per Nir.
 *
 * BEFORE: 4 tabs (מאזן/חשבונות/מסמכים/תור פענוח).
 * AFTER:  /balance has only 2 tabs (מאזן + חשבונות). The other 2 moved to
 *         /files where they live as 2 stacked sections under the new title
 *         "קבצים במיפוי". Old `?tab=documents`/`?tab=queue` URLs auto-
 *         redirect to /files for back-compat.
 */

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { WealthTab } from "./WealthTab";
import { AccountsTab } from "./AccountsTab";
import { DailyCashflowTab } from "./DailyCashflowTab";

type Tab = "wealth" | "accounts" | "daily";

const TABS: { key: Tab; label: string; icon: string }[] = [
  { key: "wealth", label: "מאזן נכסים", icon: "insights" },
  { key: "accounts", label: "חשבונות", icon: "credit_card" },
  { key: "daily", label: "תזרים יומי", icon: "calendar_month" },
];

export default function BalancePage() {
  const [tab, setTab] = useState<Tab>("wealth");
  const router = useRouter();

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const t = params.get("tab");
    // Back-compat: redirect documents/queue to the new /files page.
    if (t === "documents" || t === "queue") {
      router.replace("/files");
      return;
    }
    if (t === "wealth" || t === "accounts" || t === "daily") setTab(t);
  }, [router]);

  return (
    <div className="mx-auto max-w-6xl" dir="rtl">
      {/* Tab bar — only 2 tabs now. */}
      <div className="mb-6 flex gap-1 rounded-xl p-1" style={{ background: "rgba(1,45,29,0.04)" }}>
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`flex flex-1 items-center justify-center gap-2 rounded-lg py-2.5 text-sm font-bold transition-all ${
              tab === t.key
                ? "bg-white text-verdant-ink shadow-sm"
                : "text-verdant-muted hover:text-verdant-ink"
            }`}
            style={tab === t.key ? { boxShadow: "0 1px 3px rgba(1,45,29,0.08)" } : undefined}
          >
            <span className="material-symbols-outlined text-[18px]">{t.icon}</span>
            {t.label}
          </button>
        ))}
      </div>

      {tab === "wealth" && <WealthTab />}
      {tab === "accounts" && <AccountsTab />}
      {tab === "daily" && <DailyCashflowTab />}
    </div>
  );
}
