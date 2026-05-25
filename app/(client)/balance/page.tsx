"use client";

/**
 * /balance — 2026-04-28: page split per Nir.
 * 2026-05-25: added "תזרים" (CashflowTab) — fixed/variable × personal/business
 *             breakdown of saved transactions.
 *
 * Tabs:
 *   wealth    — מאזן נכסים (allocation, KPIs)
 *   accounts  — חשבונות בנק וכרטיסי אשראי (auto-synced from mapping)
 *   cashflow  — מה הגיע ולאן הלך (fixed/variable × personal/business matrix)
 *
 * Old `?tab=documents`/`?tab=queue` URLs auto-redirect to /files.
 */

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { WealthTab } from "./WealthTab";
import { AccountsTab } from "./AccountsTab";
import { CashflowTab } from "./CashflowTab";

type Tab = "wealth" | "accounts" | "cashflow";

const TABS: { key: Tab; label: string; icon: string }[] = [
  { key: "wealth", label: "מאזן נכסים", icon: "insights" },
  { key: "accounts", label: "חשבונות", icon: "credit_card" },
  { key: "cashflow", label: "תזרים", icon: "swap_vert" },
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
    // 2026-05-12: daily-cashflow tab moved to /budget where it belongs
    // (cashflow lives with the rest of cashflow, not in net-worth land).
    // Keep a soft redirect so any bookmarks of /balance?tab=daily land
    // on the new home.
    if (t === "daily") {
      router.replace("/budget?tab=daily");
      return;
    }
    if (t === "wealth" || t === "accounts" || t === "cashflow") setTab(t);
  }, [router]);

  return (
    <div className="mx-auto max-w-6xl" dir="rtl">
      <div className="mb-6 flex gap-1 rounded-xl p-1" style={{ background: "rgba(44,122,90,0.06)" }}>
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`flex flex-1 items-center justify-center gap-2 rounded-lg py-2.5 text-sm font-bold transition-all ${
              tab === t.key
                ? "bg-[#FFFFFF] text-verdant-ink shadow-sm"
                : "text-verdant-muted hover:text-verdant-ink"
            }`}
            style={tab === t.key ? { boxShadow: "0 1px 3px rgba(44,122,90,0.10)" } : undefined}
          >
            <span className="material-symbols-outlined text-[18px]">{t.icon}</span>
            {t.label}
          </button>
        ))}
      </div>

      {tab === "wealth" && <WealthTab />}
      {tab === "accounts" && <AccountsTab />}
      {tab === "cashflow" && <CashflowTab />}
    </div>
  );
}
