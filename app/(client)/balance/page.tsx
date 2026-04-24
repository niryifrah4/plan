"use client";

import { useState, useEffect } from "react";
import { PageHeader } from "@/components/ui/PageHeader";
import { WealthTab } from "./WealthTab";
import { AccountsTab } from "./AccountsTab";
import { DocumentsTab } from "./DocumentsTab";
import { UnmappedQueueTab } from "./UnmappedQueueTab";
import { scopedKey } from "@/lib/client-scope";

type Tab = "wealth" | "accounts" | "documents" | "queue";

const TABS: { key: Tab; label: string; icon: string }[] = [
  { key: "wealth",    label: "מאזן נכסים", icon: "insights" },
  { key: "accounts",  label: "חשבונות",    icon: "credit_card" },
  { key: "documents", label: "מסמכים",     icon: "fact_check" },
  { key: "queue",     label: "תור פענוח",  icon: "inbox" },
];

const UNMAPPED_KEYS = new Set(["other", "transfers"]);
const CONFIDENCE_THRESHOLD = 0.7;

/** Count of transactions needing triage (unmapped + low-confidence). */
function computeQueueCount(): number {
  if (typeof window === "undefined") return 0;
  try {
    const raw = localStorage.getItem(scopedKey("verdant:parsed_transactions"));
    if (!raw) return 0;
    const arr = JSON.parse(raw) as { category: string; confidence?: number }[];
    if (!Array.isArray(arr)) return 0;
    let n = 0;
    for (const t of arr) {
      if (UNMAPPED_KEYS.has(t.category)) { n++; continue; }
      if (typeof t.confidence === "number" && t.confidence < CONFIDENCE_THRESHOLD) n++;
    }
    return n;
  } catch {
    return 0;
  }
}

export default function BalancePage() {
  const [tab, setTab] = useState<Tab>("wealth");
  const [queueCount, setQueueCount] = useState(0);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const t = params.get("tab") as Tab;
    if (t && TABS.some(x => x.key === t)) setTab(t);
  }, []);

  useEffect(() => {
    const refresh = () => setQueueCount(computeQueueCount());
    refresh();
    window.addEventListener("verdant:parsed_transactions:updated", refresh);
    window.addEventListener("storage", refresh);
    return () => {
      window.removeEventListener("verdant:parsed_transactions:updated", refresh);
      window.removeEventListener("storage", refresh);
    };
  }, []);

  return (
    <div className="max-w-6xl mx-auto" dir="rtl">
      <PageHeader
        subtitle="Balance · מאזן ומסמכים"
        title="מאזן ומסמכים"
        description="נכסים, התחייבויות, חשבונות בנק והמסמכים שהעלית"
      />

      {/* Tab bar */}
      <div className="flex gap-1 mb-6 p-1 rounded-xl" style={{ background: "rgba(1,45,29,0.04)" }}>
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-bold transition-all ${
              tab === t.key
                ? "bg-white text-verdant-ink shadow-sm"
                : "text-verdant-muted hover:text-verdant-ink"
            }`}
            style={tab === t.key ? { boxShadow: "0 1px 3px rgba(1,45,29,0.08)" } : undefined}
          >
            <span className="material-symbols-outlined text-[18px]">{t.icon}</span>
            {t.label}
            {t.key === "queue" && queueCount > 0 && (
              <span className="text-[10px] font-extrabold px-1.5 py-0.5 rounded-full" style={{ background: "#B45309", color: "#fff", minWidth: 18, textAlign: "center" }}>
                {queueCount > 99 ? "99+" : queueCount}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {tab === "wealth"    && <WealthTab />}
      {tab === "accounts"  && <AccountsTab />}
      {tab === "documents" && <DocumentsTab />}
      {tab === "queue"     && <UnmappedQueueTab />}
    </div>
  );
}
