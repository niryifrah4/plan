"use client";

import { useState, useCallback, useRef, useMemo, useEffect } from "react";
import { PageHeader } from "@/components/ui/PageHeader";
import type { ParsedDocument, ParsedTransaction } from "@/lib/doc-parser/types";

type Phase = "idle" | "uploading" | "preview" | "saved";

const fmtILS = (v: number) => "₪" + Math.abs(Math.round(v)).toLocaleString("he-IL");

const CAT_OPTIONS = [
  { key: "food", label: "מזון וצריכה" }, { key: "housing", label: "דיור ומגורים" },
  { key: "transport", label: "תחבורה ורכב" }, { key: "utilities", label: "חשבונות שוטפים" },
  { key: "health", label: "בריאות" }, { key: "education", label: "חינוך וילדים" },
  { key: "insurance", label: "ביטוח" }, { key: "leisure", label: "פנאי ובידור" },
  { key: "shopping", label: "קניות" }, { key: "salary", label: "משכורת" },
  { key: "pension", label: "פנסיה וחיסכון" }, { key: "transfers", label: "העברות" },
  { key: "cash", label: "מזומן" }, { key: "subscriptions", label: "מנויים" },
  { key: "refunds", label: "זיכויים באשראי" },
  { key: "other", label: "אחר" },
];

const CAT_COLORS: Record<string, string> = {
  food: "#10b981", housing: "#0a7a4a", transport: "#3b82f6", utilities: "#f59e0b",
  health: "#ef4444", education: "#8b5cf6", insurance: "#06b6d4", leisure: "#ec4899",
  shopping: "#f97316", salary: "#10b981", pension: "#1a6b42", transfers: "#64748b",
  cash: "#78716c", subscriptions: "#a855f7", refunds: "#059669", other: "#94a3b8",
};

const BANK_ICONS: Record<string, { icon: string; color: string }> = {
  "בנק הפועלים": { icon: "account_balance", color: "#c41230" },
  "בנק לאומי": { icon: "account_balance", color: "#009639" },
  "בנק דיסקונט": { icon: "account_balance", color: "#003399" },
  "מזרחי-טפחות": { icon: "account_balance", color: "#8b0000" },
  "הבינלאומי": { icon: "account_balance", color: "#004d99" },
  "ישראכרט": { icon: "credit_card", color: "#1a237e" },
  "כאל": { icon: "credit_card", color: "#e65100" },
  "מקס": { icon: "credit_card", color: "#0d47a1" },
  "ויזה כאל": { icon: "credit_card", color: "#1a237e" },
  "אמריקן אקספרס": { icon: "credit_card", color: "#006fcf" },
  "לא זוהה": { icon: "help_outline", color: "#94a3b8" },
};

const STORAGE_KEY = "verdant:parsed_transactions";

export default function DocumentsPage() {
  const [phase, setPhase] = useState<Phase>("idle");
  const [doc, setDoc] = useState<ParsedDocument | null>(null);
  const [error, setError] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploadProgress, setUploadProgress] = useState<{ current: number; total: number; name: string } | null>(null);
  const [duplicatesRemoved, setDuplicatesRemoved] = useState(0);
  const [overrides, setOverrides] = useState<Record<number, { key: string; label: string }>>({});
  const [deletedIndices, setDeletedIndices] = useState<Set<number>>(new Set());

  /* ── Effective transactions (with overrides + deletes applied) ── */
  const effectiveTx = useMemo(() => {
    if (!doc) return [];
    return doc.transactions.map((t, i) => {
      if (deletedIndices.has(i)) return null;
      const ov = overrides[i];
      if (ov) {
        const isRefund = ov.key === "refunds";
        const adjustedAmount = isRefund && t.amount > 0 ? -t.amount : t.amount;
        return { ...t, category: ov.key, categoryLabel: ov.label, amount: adjustedAmount };
      }
      return t;
    }).filter(Boolean) as ParsedTransaction[];
  }, [doc, overrides, deletedIndices]);

  /* ── Category override + lateral learning ── */
  const handleCategoryChange = useCallback(async (idx: number, newKey: string) => {
    const cat = CAT_OPTIONS.find(c => c.key === newKey);
    if (!cat || !doc) return;
    const { learnOverride, findSimilarIndices } = await import("@/lib/doc-parser/categorizer");
    const similarIndices = findSimilarIndices(doc.transactions, idx);
    setOverrides(prev => {
      const next = { ...prev };
      for (const i of similarIndices) {
        if (!deletedIndices.has(i)) next[i] = { key: cat.key, label: cat.label };
      }
      return next;
    });
    const desc = doc.transactions[idx]?.description;
    if (desc) learnOverride(desc, newKey);
  }, [doc, deletedIndices]);

  /* ── Delete from preview ── */
  const handleDelete = useCallback((idx: number) => {
    setDeletedIndices(prev => { const next = new Set(prev); next.add(idx); return next; });
    setOverrides(prev => { const next = { ...prev }; delete next[idx]; return next; });
  }, []);

  /* ── BULK UPLOAD ── */
  const uploadFiles = useCallback(async (files: File[]) => {
    setError(""); setOverrides({}); setDeletedIndices(new Set()); setDuplicatesRemoved(0);
    setPhase("uploading");
    try {
      setUploadProgress({ current: 0, total: files.length, name: "" });
      const fd = new FormData();
      for (let i = 0; i < files.length; i++) {
        fd.append("file", files[i]);
        setUploadProgress({ current: i + 1, total: files.length, name: files[i].name });
      }
      const res = await fetch("/api/documents/parse", { method: "POST", body: fd });
      const data = await res.json();
      setUploadProgress(null);
      if (!res.ok) { setError(data.error || "שגיאה"); setPhase("idle"); return; }
      const parsed = data as ParsedDocument & { duplicatesRemoved?: number };
      setDoc(parsed);
      setDuplicatesRemoved(parsed.duplicatesRemoved || 0);
      setPhase("preview");
    } catch {
      setUploadProgress(null);
      setError("שגיאה בהעלאת הקבצים. נסה שוב.");
      setPhase("idle");
    }
  }, []);

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault(); setDragOver(false);
    const files = Array.from(e.dataTransfer.files).filter(f => f.size > 0);
    if (files.length > 0) uploadFiles(files);
  }, [uploadFiles]);

  const onFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []).filter(f => f.size > 0);
    if (files.length > 0) uploadFiles(files);
  }, [uploadFiles]);

  /* ── Save to cashflow (append to localStorage history) ── */
  const handleTransfer = useCallback(() => {
    if (!doc) return;
    try {
      const existing: ParsedTransaction[] = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
      localStorage.setItem(STORAGE_KEY, JSON.stringify([...existing, ...effectiveTx]));
      setPhase("saved");
    } catch { setError("שגיאה בשמירה"); }
  }, [doc, effectiveTx]);

  /* ── Derived ── */
  const overrideCount = Object.keys(overrides).length;
  const deleteCount = deletedIndices.size;
  const bankHint = doc?.bankHint || "לא זוהה";
  const bankIcon = BANK_ICONS[bankHint] || BANK_ICONS["לא זוהה"];

  return (
    <div className="max-w-5xl mx-auto" dir="rtl">
      <PageHeader
        subtitle="Document Upload · טעינת מסמכים"
        title="טעינת דפי חשבון"
        description="העלה קבצי PDF או Excel — תיקון מהיר והעברה לתזרים"
      />

      {/* ═══ IDLE — Drag & Drop ═══ */}
      {(phase === "idle" || phase === "uploading") && (
        <div
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={onDrop}
          onClick={() => inputRef.current?.click()}
          className="cursor-pointer transition-all duration-300 rounded-2xl"
          style={{
            minHeight: 280,
            border: dragOver ? "2px dashed #10b981" : "2px dashed #d8e0d0",
            background: dragOver ? "rgba(16,185,129,0.04)" : "#fff",
            boxShadow: "0 1px 4px rgba(0,0,0,0.04)",
          }}
        >
          <input ref={inputRef} type="file" className="hidden" accept=".pdf,.xlsx,.xls,.csv" multiple onChange={onFileChange} />
          <div className="flex flex-col items-center justify-center h-full py-14">
            {phase === "uploading" ? (
              <>
                <span className="material-symbols-outlined text-[48px] text-verdant-emerald animate-pulse mb-3">cloud_sync</span>
                <div className="text-lg font-extrabold text-verdant-ink mb-1" style={{ fontFamily: "Assistant" }}>מעבד קבצים...</div>
                {uploadProgress && (
                  <div className="text-sm text-verdant-muted">
                    קובץ {uploadProgress.current} מתוך {uploadProgress.total}: <span className="font-bold">{uploadProgress.name}</span>
                  </div>
                )}
              </>
            ) : (
              <>
                <div className="w-16 h-16 rounded-full flex items-center justify-center mb-4" style={{ background: "rgba(16,185,129,0.08)" }}>
                  <span className="material-symbols-outlined text-[32px] text-verdant-emerald">cloud_upload</span>
                </div>
                <div className="text-lg font-extrabold text-verdant-ink mb-1" style={{ fontFamily: "Assistant" }}>גרור לכאן קבצי PDF או Excel</div>
                <div className="text-sm text-verdant-muted mb-1">ניתן להעלות מספר קבצים בו-זמנית</div>
                <div className="text-xs text-verdant-muted mb-5">עו&quot;ש + כרטיס אשראי = איחוד אוטומטי ללא כפילויות</div>
                <button type="button" className="text-white font-bold text-sm py-2.5 px-6 rounded-xl transition-all hover:shadow-lg hover:scale-[0.98]" style={{ background: "linear-gradient(135deg,#012d1d 0%,#0a7a4a 100%)" }}>
                  <span className="flex items-center gap-2">
                    <span className="material-symbols-outlined text-[18px]">upload_file</span>בחר קבצים מהמחשב
                  </span>
                </button>
                <div className="mt-3 flex items-center gap-3 text-[10px] font-bold uppercase tracking-[0.15em] text-verdant-muted">
                  <span>PDF</span><span style={{ color: "#d8e0d0" }}>·</span>
                  <span>XLSX</span><span style={{ color: "#d8e0d0" }}>·</span>
                  <span>CSV</span><span style={{ color: "#d8e0d0" }}>|</span>
                  <span>עד 10MB לקובץ</span>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {error && (
        <div className="mt-4 p-4 rounded-2xl flex items-center gap-3" style={{ background: "#fef2f2", border: "1px solid #fecaca" }}>
          <span className="material-symbols-outlined text-[20px]" style={{ color: "#b91c1c" }}>error</span>
          <span className="text-sm font-bold" style={{ color: "#b91c1c" }}>{error}</span>
          <button onClick={() => { setError(""); setPhase("idle"); }} className="mr-auto text-xs font-bold text-verdant-muted hover:underline">נסה שוב</button>
        </div>
      )}

      {/* ═══ PREVIEW — Quick fix table ═══ */}
      {phase === "preview" && doc && (
        <div className="space-y-4 mt-2">
          {/* Warnings + dedup */}
          {(doc.warnings.length > 0 || duplicatesRemoved > 0) && (
            <div className="p-4 rounded-2xl space-y-1" style={{ background: "#fffbeb", border: "1px solid #fde68a" }}>
              {duplicatesRemoved > 0 && (
                <div className="flex items-center gap-2 text-sm font-bold" style={{ color: "#0a7a4a" }}>
                  <span className="material-symbols-outlined text-[16px]">merge</span>
                  {duplicatesRemoved} כפילויות זוהו והוסרו
                </div>
              )}
              {doc.warnings.map((w, i) => (
                <div key={i} className="flex items-center gap-2 text-sm font-bold" style={{ color: "#92400e" }}>
                  <span className="material-symbols-outlined text-[16px]">warning</span>{w}
                </div>
              ))}
            </div>
          )}

          {/* Summary header card */}
          <div className="p-5 rounded-2xl" style={{ background: "#fff", boxShadow: "0 1px 4px rgba(0,0,0,0.04)" }}>
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: bankIcon.color + "14" }}>
                  <span className="material-symbols-outlined text-[20px]" style={{ color: bankIcon.color }}>{bankIcon.icon}</span>
                </div>
                <div>
                  <div className="text-[10px] uppercase tracking-[0.2em] text-verdant-muted font-bold">תצוגה מקדימה</div>
                  <h2 className="text-base font-extrabold text-verdant-ink" style={{ fontFamily: "Assistant" }}>{doc.filename}</h2>
                </div>
              </div>
              <button onClick={() => { setPhase("idle"); setDoc(null); setOverrides({}); setDeletedIndices(new Set()); }}
                className="text-xs font-bold text-verdant-muted hover:text-verdant-ink transition-colors px-3 py-2 rounded-lg hover:bg-verdant-bg flex items-center gap-1">
                <span className="material-symbols-outlined text-[14px]">refresh</span>החלף קובץ
              </button>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <MiniKPI label="בנק / חברה" value={bankHint} />
              <MiniKPI label="תנועות" value={`${effectiveTx.length}${deleteCount > 0 ? ` (-${deleteCount})` : ""}`} />
              <MiniKPI label="חיובים" value={fmtILS(effectiveTx.filter(t => t.amount > 0).reduce((s, t) => s + t.amount, 0))} color="#b91c1c" />
              <MiniKPI label="זיכויים" value={fmtILS(effectiveTx.filter(t => t.amount < 0).reduce((s, t) => s + Math.abs(t.amount), 0))} color="#10b981" />
            </div>
          </div>

          {/* Quick-fix table */}
          <div className="rounded-2xl overflow-hidden" style={{ background: "#fff", boxShadow: "0 1px 4px rgba(0,0,0,0.04)" }}>
            <div className="px-5 py-3 flex items-center justify-between" style={{ background: "linear-gradient(135deg,#012d1d 0%,#0a7a4a 100%)" }}>
              <h3 className="text-sm font-extrabold text-white" style={{ fontFamily: "Assistant" }}>תיקון מהיר לפני העברה</h3>
              <span className="text-[10px] text-white/60 font-bold">שנה קטגוריה או מחק תנועות שגויות</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead style={{ background: "#f9faf2" }}>
                  <tr className="text-right border-b" style={{ borderColor: "#eef2e8" }}>
                    <th className="px-3 py-2.5 text-[10px] font-bold uppercase tracking-[0.1em] text-verdant-muted w-20">תאריך</th>
                    <th className="px-3 py-2.5 text-[10px] font-bold uppercase tracking-[0.1em] text-verdant-muted">תיאור</th>
                    <th className="px-3 py-2.5 text-[10px] font-bold uppercase tracking-[0.1em] text-verdant-muted w-40">קטגוריה</th>
                    <th className="px-3 py-2.5 text-[10px] font-bold uppercase tracking-[0.1em] text-verdant-muted text-left w-24">סכום</th>
                    <th className="px-3 py-2.5 w-10"></th>
                  </tr>
                </thead>
                <tbody>
                  {doc.transactions.map((t, i) => {
                    if (deletedIndices.has(i)) return null;
                    const ov = overrides[i];
                    const displayTx = ov ? { ...t, category: ov.key, categoryLabel: ov.label } : t;
                    const wasOverridden = !!ov;
                    return (
                      <tr key={i} className={`group transition-colors border-b ${wasOverridden ? "bg-blue-50/30" : "hover:bg-verdant-bg/30"}`} style={{ borderColor: "#f4f7ed" }}>
                        <td className="px-3 py-2 text-xs font-bold text-verdant-ink tabular" dir="ltr">{displayTx.date}</td>
                        <td className="px-3 py-2 text-xs font-bold text-verdant-ink truncate max-w-[220px]">{displayTx.description}</td>
                        <td className="px-3 py-1.5">
                          <select value={displayTx.category} onChange={e => handleCategoryChange(i, e.target.value)}
                            className="w-full text-[11px] font-bold rounded-lg px-2 py-1.5 border outline-none cursor-pointer transition-all focus:ring-2 focus:ring-verdant-accent/30"
                            style={{ borderColor: wasOverridden ? "#93c5fd" : "#d8e0d0", background: wasOverridden ? "#eff6ff" : "#fff", color: CAT_COLORS[displayTx.category] || "#94a3b8" }}>
                            {CAT_OPTIONS.map(c => <option key={c.key} value={c.key}>{c.label}</option>)}
                          </select>
                        </td>
                        <td className="px-3 py-2 text-xs font-extrabold tabular text-left" style={{ color: t.amount > 0 ? "#b91c1c" : "#10b981" }}>
                          {t.amount > 0 ? "-" : "+"}{fmtILS(t.amount)}
                        </td>
                        <td className="px-3 py-2 text-center">
                          <button onClick={() => handleDelete(i)}
                            className="opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded-md hover:bg-red-50" title="מחק">
                            <span className="material-symbols-outlined text-[14px]" style={{ color: "#b91c1c" }}>delete_outline</span>
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {overrideCount > 0 && (
              <div className="px-5 py-2.5 flex items-center gap-2 text-[11px] font-bold" style={{ background: "#eff6ff", color: "#1d4ed8" }}>
                <span className="material-symbols-outlined text-[14px]">auto_fix_high</span>
                {overrideCount} תיקונים · למידה רוחבית פעילה
              </div>
            )}
          </div>

          {/* Action bar */}
          <div className="flex items-center justify-between pt-1">
            <button onClick={() => { setPhase("idle"); setDoc(null); setOverrides({}); setDeletedIndices(new Set()); }}
              className="text-sm font-bold text-verdant-muted hover:text-verdant-ink transition-colors px-4 py-2.5 rounded-xl flex items-center gap-1.5" style={{ background: "#f4f7ed" }}>
              <span className="material-symbols-outlined text-[16px]">close</span>בטל
            </button>
            <button onClick={handleTransfer}
              className="text-white font-extrabold text-sm py-3 px-8 rounded-xl transition-all hover:shadow-lg hover:scale-[0.98] flex items-center gap-2"
              style={{ background: "linear-gradient(135deg,#012d1d 0%,#0a7a4a 100%)", fontFamily: "Assistant" }}>
              <span className="material-symbols-outlined text-[18px]">send</span>
              העבר לתזרים
            </button>
          </div>
        </div>
      )}

      {/* ═══ SAVED — Success ═══ */}
      {phase === "saved" && doc && (
        <div className="p-10 rounded-2xl text-center" style={{ background: "#fff", boxShadow: "0 1px 4px rgba(0,0,0,0.04)" }}>
          <div className="w-14 h-14 rounded-full flex items-center justify-center mx-auto mb-3" style={{ background: "rgba(16,185,129,0.1)" }}>
            <span className="material-symbols-outlined text-[28px] text-verdant-emerald">task_alt</span>
          </div>
          <h2 className="text-xl font-extrabold text-verdant-ink mb-2" style={{ fontFamily: "Assistant" }}>הנתונים הועברו לתזרים</h2>
          <p className="text-sm text-verdant-muted mb-1">{effectiveTx.length} תנועות נוספו בהצלחה</p>
          {duplicatesRemoved > 0 && <p className="text-xs font-bold mb-1" style={{ color: "#0a7a4a" }}>{duplicatesRemoved} כפילויות הוסרו</p>}
          {overrideCount > 0 && <p className="text-xs font-bold text-blue-600 mb-3">{overrideCount} תיקוני קטגוריה (למידה רוחבית)</p>}
          <div className="flex items-center justify-center gap-3 mt-4">
            <button onClick={() => { setPhase("idle"); setDoc(null); setOverrides({}); setDeletedIndices(new Set()); }}
              className="text-sm font-bold text-verdant-muted hover:text-verdant-ink transition-colors px-4 py-2.5 rounded-xl" style={{ background: "#f4f7ed" }}>
              טען קובץ נוסף
            </button>
            <a href="/cashflow-map"
              className="text-white font-extrabold text-sm py-2.5 px-6 rounded-xl transition-all hover:shadow-lg flex items-center gap-2"
              style={{ background: "linear-gradient(135deg,#012d1d 0%,#0a7a4a 100%)", fontFamily: "Assistant" }}>
              <span className="material-symbols-outlined text-[16px]">arrow_back</span>עבור לתזרים
            </a>
          </div>
        </div>
      )}

      {/* Supported banks (idle only) */}
      {phase === "idle" && !error && (
        <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="p-5 rounded-2xl" style={{ background: "#fff", boxShadow: "0 1px 4px rgba(0,0,0,0.04)" }}>
            <div className="flex items-center gap-2 mb-3">
              <span className="material-symbols-outlined text-[18px] text-verdant-emerald">account_balance</span>
              <h3 className="text-sm font-extrabold text-verdant-ink" style={{ fontFamily: "Assistant" }}>בנקים נתמכים</h3>
            </div>
            <div className="flex flex-wrap gap-2">
              {["הפועלים", "לאומי", "דיסקונט", "מזרחי-טפחות", "הבינלאומי"].map(b => (
                <span key={b} className="text-[11px] font-bold px-2.5 py-1 rounded-lg" style={{ background: "#eef7f1", color: "#0a7a4a" }}>{b}</span>
              ))}
            </div>
          </div>
          <div className="p-5 rounded-2xl" style={{ background: "#fff", boxShadow: "0 1px 4px rgba(0,0,0,0.04)" }}>
            <div className="flex items-center gap-2 mb-3">
              <span className="material-symbols-outlined text-[18px] text-verdant-emerald">credit_card</span>
              <h3 className="text-sm font-extrabold text-verdant-ink" style={{ fontFamily: "Assistant" }}>חברות אשראי</h3>
            </div>
            <div className="flex flex-wrap gap-2">
              {["ישראכרט", "כאל", "מקס", "ויזה", "אמריקן אקספרס"].map(c => (
                <span key={c} className="text-[11px] font-bold px-2.5 py-1 rounded-lg" style={{ background: "#eef7f1", color: "#0a7a4a" }}>{c}</span>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Mini KPI ── */
function MiniKPI({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div className="p-3 rounded-xl" style={{ background: "#f9faf2" }}>
      <div className="text-[10px] font-bold uppercase tracking-[0.1em] text-verdant-muted mb-0.5">{label}</div>
      <div className="text-sm font-extrabold" style={{ color: color || "#012d1d", fontFamily: "Assistant" }}>{value}</div>
    </div>
  );
}
