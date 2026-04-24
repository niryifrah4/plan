"use client";

/**
 * PortfolioImport — upload an investment portfolio Excel/CSV, preview parsed
 * holdings, choose merge strategy, and return the rows to the parent.
 *
 * Works with מיטב דש / אקסלנס / Interactive Brokers / בנקים via the
 * generic parser at /api/securities/parse-excel.
 */

import { useRef, useState } from "react";
import { fmtILS } from "@/lib/format";

export interface ImportedRow {
  symbol: string;
  name?: string;
  kind: string;
  broker: string | null;
  currency: string;
  quantity: number;
  avg_cost: number;
  current_price: number;
  fx_rate_to_ils: number;
  cost_basis_ils: number;
  market_value_ils: number;
  unrealized_pnl_ils: number;
  unrealized_pnl_pct: number;
}

interface ParseResponse {
  rows: ImportedRow[];
  warnings: string[];
  stats: { rowCount: number; totalValue: number; sheetCount: number };
  meta: { fileName: string; broker: string | null };
}

interface Props {
  onImport: (rows: ImportedRow[], mode: "append" | "replace") => void;
  onClose: () => void;
}

export function PortfolioImport({ onImport, onClose }: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ParseResponse | null>(null);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [mode, setMode] = useState<"append" | "replace">("append");

  async function handleFile(file: File) {
    setError(null);
    setLoading(true);
    setResult(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/securities/parse-excel", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "שגיאה בעיבוד הקובץ");
        setLoading(false);
        return;
      }
      const r = data as ParseResponse;
      setResult(r);
      setSelected(new Set(r.rows.map((_, i) => i)));
    } catch (e) {
      setError(e instanceof Error ? e.message : "שגיאה בעיבוד הקובץ");
    } finally {
      setLoading(false);
    }
  }

  function toggleRow(i: number) {
    const next = new Set(selected);
    if (next.has(i)) next.delete(i);
    else next.add(i);
    setSelected(next);
  }

  function toggleAll() {
    if (!result) return;
    if (selected.size === result.rows.length) setSelected(new Set());
    else setSelected(new Set(result.rows.map((_, i) => i)));
  }

  function confirmImport() {
    if (!result) return;
    const rows = result.rows.filter((_, i) => selected.has(i));
    onImport(rows, mode);
  }

  const selectedTotal = result
    ? result.rows.filter((_, i) => selected.has(i)).reduce((s, r) => s + r.market_value_ils, 0)
    : 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(1,45,29,0.45)" }}>
      <div className="w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col rounded-2xl bg-white shadow-xl" style={{ border: "1px solid #E8E9E1" }}>
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b" style={{ borderColor: "#E8E9E1", background: "#F9FAF2" }}>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl flex items-center justify-center" style={{ background: "#1B4332" }}>
              <span className="material-symbols-outlined text-[20px] text-white">upload_file</span>
            </div>
            <div>
              <div className="text-[15px] font-extrabold text-verdant-ink">טעינת תיק השקעות מאקסל</div>
              <div className="text-[11px] text-verdant-muted">מיטב דש · אקסלנס · Interactive Brokers · בנקים</div>
            </div>
          </div>
          <button onClick={onClose} className="w-9 h-9 rounded-full flex items-center justify-center hover:bg-gray-100">
            <span className="material-symbols-outlined text-[18px] text-verdant-muted">close</span>
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6">
          {!result && !loading && (
            <div className="flex flex-col items-center justify-center py-12">
              <div
                className="w-full max-w-md rounded-2xl border-2 border-dashed p-10 flex flex-col items-center gap-4 cursor-pointer transition hover:border-[#1B4332]"
                style={{ borderColor: "#E8E9E1", background: "#F9FAF2" }}
                onClick={() => fileRef.current?.click()}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  const f = e.dataTransfer.files?.[0];
                  if (f) handleFile(f);
                }}
              >
                <span className="material-symbols-outlined text-[48px]" style={{ color: "#1B4332" }}>cloud_upload</span>
                <div className="text-center">
                  <div className="text-[14px] font-extrabold text-verdant-ink">גרור קובץ לכאן או לחץ לבחירה</div>
                  <div className="text-[11px] text-verdant-muted mt-1">XLSX, XLS, CSV · עד 10MB</div>
                </div>
              </div>
              {error && (
                <div className="mt-4 px-4 py-2 rounded-xl text-[12px] font-bold" style={{ background: "#fef2f2", color: "#dc2626", border: "1px solid #fecaca" }}>
                  {error}
                </div>
              )}
              <div className="mt-6 text-[11px] text-verdant-muted text-center max-w-md">
                הורד את האקסל מאזור הלקוחות של הברוקר/הבנק ועלה אותו כאן — המערכת תזהה אוטומטית
                את הסימולים, הכמויות, המחירים והשווי.
              </div>
              <input
                ref={fileRef}
                type="file"
                accept=".xlsx,.xls,.csv"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleFile(f);
                  e.target.value = "";
                }}
              />
            </div>
          )}

          {loading && (
            <div className="flex flex-col items-center justify-center py-16 gap-3">
              <span className="material-symbols-outlined text-[40px] animate-spin" style={{ color: "#1B4332" }}>progress_activity</span>
              <div className="text-[13px] font-bold text-verdant-ink">מעבד את הקובץ…</div>
            </div>
          )}

          {result && (
            <div className="space-y-4">
              {/* Stats */}
              <div className="grid grid-cols-3 gap-3">
                <StatCard label="החזקות שנמצאו" value={String(result.stats.rowCount)} />
                <StatCard label="שווי כולל" value={fmtILS(result.stats.totalValue)} />
                <StatCard label="ברוקר מזוהה" value={result.meta.broker || "—"} />
              </div>

              {result.warnings.length > 0 && (
                <div className="px-4 py-3 rounded-xl text-[11px]" style={{ background: "#fefce8", color: "#854d0e", border: "1px solid #fde68a" }}>
                  <div className="font-extrabold mb-1">התראות:</div>
                  <ul className="list-disc list-inside space-y-0.5">
                    {result.warnings.map((w, i) => <li key={i}>{w}</li>)}
                  </ul>
                </div>
              )}

              {/* Table */}
              <div className="rounded-xl overflow-hidden border" style={{ borderColor: "#E8E9E1" }}>
                <table className="w-full text-[12px]">
                  <thead style={{ background: "#F3F4EC" }}>
                    <tr className="text-[10px] uppercase tracking-[0.1em] text-verdant-muted">
                      <th className="px-3 py-2 text-right">
                        <input
                          type="checkbox"
                          checked={selected.size === result.rows.length && result.rows.length > 0}
                          onChange={toggleAll}
                        />
                      </th>
                      <th className="px-3 py-2 text-right">סימול</th>
                      <th className="px-3 py-2 text-right">שם</th>
                      <th className="px-3 py-2 text-right">סוג</th>
                      <th className="px-3 py-2 text-right">כמות</th>
                      <th className="px-3 py-2 text-right">מטבע</th>
                      <th className="px-3 py-2 text-right">שווי (₪)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.rows.map((r, i) => (
                      <tr key={i} className="border-t" style={{ borderColor: "#E8E9E1" }}>
                        <td className="px-3 py-2">
                          <input type="checkbox" checked={selected.has(i)} onChange={() => toggleRow(i)} />
                        </td>
                        <td className="px-3 py-2 font-bold text-verdant-ink" dir="ltr">{r.symbol}</td>
                        <td className="px-3 py-2 text-verdant-muted">{r.name || "—"}</td>
                        <td className="px-3 py-2 text-verdant-muted">{r.kind}</td>
                        <td className="px-3 py-2 tabular">{r.quantity.toLocaleString()}</td>
                        <td className="px-3 py-2">{r.currency}</td>
                        <td className="px-3 py-2 font-bold tabular">{fmtILS(r.market_value_ils)}</td>
                      </tr>
                    ))}
                    {result.rows.length === 0 && (
                      <tr><td colSpan={7} className="px-3 py-6 text-center text-verdant-muted">לא נמצאו החזקות בקובץ</td></tr>
                    )}
                  </tbody>
                </table>
              </div>

              {/* Mode */}
              {result.rows.length > 0 && (
                <div className="flex items-center gap-4 p-4 rounded-xl" style={{ background: "#F9FAF2", border: "1px solid #E8E9E1" }}>
                  <div className="text-[12px] font-extrabold text-verdant-ink">מצב איחוד:</div>
                  <label className="flex items-center gap-2 text-[12px] cursor-pointer">
                    <input type="radio" checked={mode === "append"} onChange={() => setMode("append")} />
                    <span>הוסף (שמור קיים)</span>
                  </label>
                  <label className="flex items-center gap-2 text-[12px] cursor-pointer">
                    <input type="radio" checked={mode === "replace"} onChange={() => setMode("replace")} />
                    <span>החלף (מחק קיים)</span>
                  </label>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        {result && result.rows.length > 0 && (
          <div className="flex items-center justify-between px-6 py-4 border-t" style={{ borderColor: "#E8E9E1", background: "#F9FAF2" }}>
            <div className="text-[12px] text-verdant-muted">
              נבחרו <span className="font-extrabold text-verdant-ink">{selected.size}</span> החזקות ·
              שווי: <span className="font-extrabold text-verdant-ink">{fmtILS(selectedTotal)}</span>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={onClose} className="px-4 py-2 rounded-full text-[12px] font-bold border" style={{ borderColor: "#E8E9E1", color: "#414844" }}>
                ביטול
              </button>
              <button
                onClick={confirmImport}
                disabled={selected.size === 0}
                className="px-5 py-2 rounded-full text-[12px] font-extrabold text-white disabled:opacity-40"
                style={{ background: "#1B4332" }}
              >
                {mode === "replace" ? "החלף תיק" : "הוסף לתיק"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl p-3" style={{ background: "#F3F4EC", border: "1px solid #E8E9E1" }}>
      <div className="text-[10px] uppercase tracking-[0.1em] text-verdant-muted font-bold">{label}</div>
      <div className="text-[15px] font-extrabold text-verdant-ink mt-1">{value}</div>
    </div>
  );
}
