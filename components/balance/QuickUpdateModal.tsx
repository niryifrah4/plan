"use client";

import { useEffect, useMemo, useState } from "react";
import { fmtILS } from "@/lib/format";
import { useSaveStatus } from "@/lib/hooks/useSaveStatus";
import { SaveStatus } from "@/components/ui/SaveStatus";
import {
  buildSnapshotFromCurrent,
  addSnapshot,
  type NetWorthBreakdown,
  computeCurrentNetWorth,
} from "@/lib/balance-history-store";

interface Props {
  onClose: () => void;
  onSaved: () => void;
}

interface Row {
  key: keyof NetWorthBreakdown;
  icon: string;
  label: string;
  negative?: boolean;
}

const ASSET_ROWS: Row[] = [
  { key: "cash", icon: "💰", label: "עו״ש ומזומן" },
  { key: "investments", icon: "📈", label: "השקעות" },
  { key: "pension", icon: "🏦", label: "פנסיה וגמל" },
  { key: "realestate", icon: "🏠", label: "נדל״ן" },
  { key: "goals", icon: "🎯", label: "יעדים" },
];

const LIAB_ROWS: Row[] = [
  { key: "debt", icon: "➖", label: "חובות", negative: true },
  { key: "mortgages", icon: "➖", label: "משכנתא", negative: true },
];

export function QuickUpdateModal({ onClose, onSaved }: Props) {
  const [note, setNote] = useState("");
  const { status, pulse } = useSaveStatus();

  // Snapshot the live values once when the modal opens
  const breakdown = useMemo<NetWorthBreakdown>(() => computeCurrentNetWorth(), []);

  const totalAssets =
    breakdown.cash +
    breakdown.investments +
    breakdown.pension +
    breakdown.realestate +
    breakdown.goals;
  const totalLiab = breakdown.debt + breakdown.mortgages;
  const netWorth = totalAssets - totalLiab;

  // Escape closes
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);

  const handleSave = () => {
    pulse();
    const snap = buildSnapshotFromCurrent(note);
    addSnapshot(snap);
    // Give the user a brief visual confirmation, then close
    setTimeout(() => {
      onSaved();
      onClose();
    }, 600);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(10,25,41,0.55)" }}
      onClick={onClose}
      dir="rtl"
    >
      <div
        className="v-card max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-organic p-6 shadow-soft"
        style={{ background: "#131C2E" }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="mb-2 flex items-start justify-between">
          <div>
            <h2 className="text-lg font-extrabold text-verdant-ink">
              עדכון מהיר — צילום מצב נוכחי
            </h2>
            <p className="mt-1 text-xs leading-relaxed text-verdant-muted">
              סקירה של כל הנכסים והחובות שלך כרגע.
              <br />
              לחץ על &quot;שמור snapshot&quot; כדי לתעד את הרגע.
            </p>
          </div>
          <SaveStatus status={status} />
        </div>

        {/* Breakdown grid */}
        <div className="mt-4 grid grid-cols-1 gap-2 md:grid-cols-2">
          {ASSET_ROWS.map((r) => (
            <div
              key={r.key}
              className="flex items-center justify-between rounded-lg p-3"
              style={{ background: "#1A2438", border: "1px solid #1F2A3F" }}
            >
              <span className="text-sm font-bold text-verdant-ink">
                <span className="ml-1">{r.icon}</span>
                {r.label}
              </span>
              <span className="tabular text-sm font-extrabold text-verdant-emerald">
                {fmtILS(breakdown[r.key])}
              </span>
            </div>
          ))}
          {LIAB_ROWS.map((r) => (
            <div
              key={r.key}
              className="flex items-center justify-between rounded-lg p-3"
              style={{ background: "rgba(248,113,113,0.08)", border: "1px solid rgba(248,113,113,0.20)" }}
            >
              <span className="text-sm font-bold text-verdant-ink">
                <span className="ml-1">{r.icon}</span>
                {r.label}
              </span>
              <span className="tabular text-sm font-extrabold" style={{ color: "#dc2626" }}>
                {fmtILS(breakdown[r.key])}
              </span>
            </div>
          ))}
        </div>

        {/* Totals summary */}
        <div className="v-divider mt-4 flex items-center justify-between border-t pt-4">
          <div className="text-xs text-verdant-muted">
            נכסים {fmtILS(totalAssets)} · חובות {fmtILS(totalLiab)}
          </div>
        </div>
        <div
          className="mt-2 rounded-xl p-4 text-center"
          style={{
            background: "linear-gradient(135deg, #A8E040, #4ADE80)",
            color: "#131C2E",
          }}
        >
          <div className="mb-1 text-[10px] font-bold uppercase tracking-[0.2em] opacity-80">
            שווי נקי
          </div>
          <div className="tabular text-2xl font-extrabold">{fmtILS(netWorth)}</div>
        </div>

        {/* Note */}
        <label className="mt-4 block">
          <div className="mb-1 text-xs font-bold text-verdant-ink">הערה לצילום — מה קרה החודש?</div>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={2}
            placeholder="לא חובה — לדוגמה: 'בונוס שנתי', 'תשלום משכנתא מוקדם'..."
            className="w-full rounded-lg border p-2 text-sm"
            style={{ borderColor: "#1F2A3F", background: "#131C2E" }}
          />
        </label>

        {/* Buttons */}
        <div className="mt-5 flex items-center gap-3">
          <button type="button" onClick={handleSave} className="btn-botanical flex-1 text-sm">
            שמור snapshot
          </button>
          <button type="button" onClick={onClose} className="btn-botanical-ghost text-sm">
            ביטול
          </button>
        </div>
      </div>
    </div>
  );
}
