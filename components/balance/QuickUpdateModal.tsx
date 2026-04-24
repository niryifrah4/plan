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
  { key: "cash",       icon: "💰", label: "עו״ש ומזומן" },
  { key: "investments", icon: "📈", label: "השקעות" },
  { key: "pension",    icon: "🏦", label: "פנסיה וגמל" },
  { key: "realestate", icon: "🏠", label: "נדל״ן" },
  { key: "goals",      icon: "🎯", label: "יעדים" },
];

const LIAB_ROWS: Row[] = [
  { key: "debt",      icon: "➖", label: "חובות",    negative: true },
  { key: "mortgages", icon: "➖", label: "משכנתא",   negative: true },
];

export function QuickUpdateModal({ onClose, onSaved }: Props) {
  const [note, setNote] = useState("");
  const { status, pulse } = useSaveStatus();

  // Snapshot the live values once when the modal opens
  const breakdown = useMemo<NetWorthBreakdown>(
    () => computeCurrentNetWorth(),
    [],
  );

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
      style={{ background: "rgba(1, 45, 29, 0.55)" }}
      onClick={onClose}
      dir="rtl"
    >
      <div
        className="v-card rounded-organic shadow-soft w-full max-w-lg p-6 max-h-[90vh] overflow-y-auto"
        style={{ background: "#fff" }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between mb-2">
          <div>
            <h2 className="text-lg font-extrabold text-verdant-ink">
              עדכון מהיר — צילום מצב נוכחי
            </h2>
            <p className="text-xs text-verdant-muted mt-1 leading-relaxed">
              סקירה של כל הנכסים והחובות שלך כרגע.
              <br />
              לחץ על &quot;שמור snapshot&quot; כדי לתעד את הרגע.
            </p>
          </div>
          <SaveStatus status={status} />
        </div>

        {/* Breakdown grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2 mt-4">
          {ASSET_ROWS.map(r => (
            <div
              key={r.key}
              className="flex items-center justify-between p-3 rounded-lg"
              style={{ background: "#f4f7ed", border: "1px solid #eef2e8" }}
            >
              <span className="text-sm font-bold text-verdant-ink">
                <span className="ml-1">{r.icon}</span>
                {r.label}
              </span>
              <span className="text-sm font-extrabold tabular text-verdant-emerald">
                {fmtILS(breakdown[r.key])}
              </span>
            </div>
          ))}
          {LIAB_ROWS.map(r => (
            <div
              key={r.key}
              className="flex items-center justify-between p-3 rounded-lg"
              style={{ background: "#fef2f2", border: "1px solid #fecaca" }}
            >
              <span className="text-sm font-bold text-verdant-ink">
                <span className="ml-1">{r.icon}</span>
                {r.label}
              </span>
              <span
                className="text-sm font-extrabold tabular"
                style={{ color: "#dc2626" }}
              >
                {fmtILS(breakdown[r.key])}
              </span>
            </div>
          ))}
        </div>

        {/* Totals summary */}
        <div className="mt-4 pt-4 border-t v-divider flex items-center justify-between">
          <div className="text-xs text-verdant-muted">
            נכסים {fmtILS(totalAssets)} · חובות {fmtILS(totalLiab)}
          </div>
        </div>
        <div
          className="mt-2 p-4 rounded-xl text-center"
          style={{
            background: "linear-gradient(135deg, #1B4332, #2B694D)",
            color: "#fff",
          }}
        >
          <div className="text-[10px] uppercase tracking-[0.2em] font-bold opacity-80 mb-1">
            שווי נקי
          </div>
          <div className="text-2xl font-extrabold tabular">{fmtILS(netWorth)}</div>
        </div>

        {/* Note */}
        <label className="block mt-4">
          <div className="text-xs font-bold text-verdant-ink mb-1">
            הערה לצילום — מה קרה החודש?
          </div>
          <textarea
            value={note}
            onChange={e => setNote(e.target.value)}
            rows={2}
            placeholder="לא חובה — לדוגמה: 'בונוס שנתי', 'תשלום משכנתא מוקדם'..."
            className="w-full p-2 text-sm rounded-lg border"
            style={{ borderColor: "#d8e0d0", background: "#fff" }}
          />
        </label>

        {/* Buttons */}
        <div className="flex items-center gap-3 mt-5">
          <button
            type="button"
            onClick={handleSave}
            className="btn-botanical flex-1 text-sm"
          >
            שמור snapshot
          </button>
          <button
            type="button"
            onClick={onClose}
            className="btn-botanical-ghost text-sm"
          >
            ביטול
          </button>
        </div>
      </div>
    </div>
  );
}
