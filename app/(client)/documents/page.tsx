"use client";

import { useState, useCallback, useRef, useMemo } from "react";
import { PageHeader } from "@/components/ui/PageHeader";
import { triggerFullSync, markUpdated } from "@/lib/sync-engine";
import type { ParsedDocument, ParsedTransaction } from "@/lib/doc-parser/types";
import { computeImpact, loadImpactGoals, CATEGORY_LABELS_HE } from "@/lib/impact-engine";

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
  { key: "fees", label: "עמלות וריביות" },
  { key: "dining_out", label: "אוכל בחוץ ובילויים" },
  { key: "other", label: "אחר" },
];

const CAT_COLORS: Record<string, string> = {
  food: "#10b981", housing: "#0a7a4a", transport: "#3b82f6", utilities: "#f59e0b",
  health: "#ef4444", education: "#8b5cf6", insurance: "#06b6d4", leisure: "#ec4899",
  shopping: "#f97316", salary: "#10b981", pension: "#1a6b42", transfers: "#64748b",
  cash: "#78716c", subscriptions: "#a855f7", refunds: "#059669", other: "#94a3b8",
  fees: "#dc2626", dining_out: "#e11d48",
};

/** Categories considered "unmapped" — need manual attention */
const UNMAPPED_KEYS = new Set(["other", "transfers"]);

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
  const [expandedMappedCats, setExpandedMappedCats] = useState<Set<string>>(new Set());

  /* ── Effective transactions (with overrides + deletes applied) ── */
  const effectiveTx = useMemo(() => {
    if (!doc) return [];
    return doc.transactions.map((t, i) => {
      if (deletedIndices.has(i)) return null;
      const ov = overrides[i];
      if (ov) {
        const isRefund = ov.key === "refunds";
        const adjustedAmount = isRefund && t.amount > 0 ? -t.amount : t.amount;
        return { ...t, category: ov.key, categoryLabel: ov.label, amount: adjustedAmount, _idx: i };
      }
      return { ...t, _idx: i };
    }).filter(Boolean) as (ParsedTransaction & { _idx: number })[];
  }, [doc, overrides, deletedIndices]);

  /* ── Split into unmapped / mapped ── */
  const { unmapped, mapped, mappedGroups } = useMemo(() => {
    const unmapped: (ParsedTransaction & { _idx: number })[] = [];
    const mapped: (ParsedTransaction & { _idx: number })[] = [];
    for (const t of effectiveTx) {
      if (UNMAPPED_KEYS.has(t.category)) {
        unmapped.push(t);
      } else {
        mapped.push(t);
      }
    }
    // Group mapped by category
    const groups: Record<string, (ParsedTransaction & { _idx: number })[]> = {};
    for (const t of mapped) {
      if (!groups[t.category]) groups[t.category] = [];
      groups[t.category].push(t);
    }
    return { unmapped, mapped, mappedGroups: groups };
  }, [effectiveTx]);

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

  /* ── Toggle mapped category accordion ── */
  const toggleMappedCat = useCallback((catKey: string) => {
    setExpandedMappedCats(prev => {
      const next = new Set(prev);
      if (next.has(catKey)) next.delete(catKey); else next.add(catKey);
      return next;
    });
  }, []);

  /* ── BULK UPLOAD ── */
  const uploadFiles = useCallback(async (files: File[]) => {
    setError(""); setOverrides({}); setDeletedIndices(new Set()); setDuplicatesRemoved(0);
    setExpandedMappedCats(new Set());
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
      // Merge detected financial instruments into persistent storage
      if (parsed.instruments && parsed.instruments.length > 0) {
        const { mergeAndSaveInstruments } = await import("@/lib/doc-parser/instruments");
        mergeAndSaveInstruments(parsed.instruments);
      }
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
      const txToSave = effectiveTx.map(({ _idx, ...rest }) => rest);
      const existing: ParsedTransaction[] = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
      localStorage.setItem(STORAGE_KEY, JSON.stringify([...existing, ...txToSave]));
      markUpdated("docs");
      triggerFullSync();
      setPhase("saved");
    } catch { setError("שגיאה בשמירה"); }
  }, [doc, effectiveTx]);

  /* ── Derived ── */
  const overrideCount = Object.keys(overrides).length;
  const deleteCount = deletedIndices.size;
  const bankHint = doc?.bankHint || "לא זוהה";
  const bankIcon = BANK_ICONS[bankHint] || BANK_ICONS["לא זוהה"];
  const allMapped = unmapped.length === 0;

  return (
    <div className="max-w-5xl mx-auto" dir="rtl">
      <PageHeader
        subtitle="Parsing Station · תחנת אימות"
        title="תחנת אימות מסמכים"
        description="העלאה, זיהוי אוטומטי ואישור של תנועות פיננסיות — בנק, אשראי, לוחות סילוקין ומסלקה פנסיונית"
      />

      {/* ═══ Three Upload Zones (idle only) ═══ */}
      {phase === "idle" && !error && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          {/* Zone 1 — Bank / Credit */}
          <div
            onClick={() => inputRef.current?.click()}
            className="v-card p-5 cursor-pointer hover:shadow-lg hover:-translate-y-0.5 transition-all duration-200 text-center"
            style={{ borderTop: "3px solid #10b981" }}
          >
            <div className="w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-3" style={{ background: "rgba(16,185,129,0.08)" }}>
              <span className="material-symbols-outlined text-[28px] text-verdant-emerald">account_balance</span>
            </div>
            <h3 className="text-sm font-extrabold text-verdant-ink mb-1">דפי בנק וכרטיסי אשראי</h3>
            <p className="text-[11px] text-verdant-muted leading-relaxed">
              העלה PDF/Excel מעו&quot;ש או כרטיס אשראי — המערכת תזהה תנועות, תסווג אוטומטית ותעביר לתזרים
            </p>
            <div className="mt-3 flex items-center justify-center gap-2 text-[10px] font-bold text-verdant-emerald">
              <span className="material-symbols-outlined text-[14px]">upload_file</span>
              PDF · XLSX · CSV
            </div>
          </div>

          {/* Zone 2 — Amortization Schedules */}
          <div
            onClick={() => inputRef.current?.click()}
            className="v-card p-5 cursor-pointer hover:shadow-lg hover:-translate-y-0.5 transition-all duration-200 text-center"
            style={{ borderTop: "3px solid #3b82f6" }}
          >
            <div className="w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-3" style={{ background: "rgba(59,130,246,0.08)" }}>
              <span className="material-symbols-outlined text-[28px]" style={{ color: "#3b82f6" }}>table_chart</span>
            </div>
            <h3 className="text-sm font-extrabold text-verdant-ink mb-1">לוחות סילוקין</h3>
            <p className="text-[11px] text-verdant-muted leading-relaxed">
              העלה לוח סילוקין של משכנתא או הלוואה — המערכת תזהה מסלולים, ריביות ויתרות ותטען לעמוד ההלוואות
            </p>
            <div className="mt-3 flex items-center justify-center gap-2 text-[10px] font-bold" style={{ color: "#3b82f6" }}>
              <span className="material-symbols-outlined text-[14px]">upload_file</span>
              PDF · XLSX
            </div>
          </div>

          {/* Zone 3 — Pension XML */}
          <a
            href="/retirement"
            className="v-card p-5 hover:shadow-lg hover:-translate-y-0.5 transition-all duration-200 text-center block"
            style={{ borderTop: "3px solid #8b5cf6" }}
          >
            <div className="w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-3" style={{ background: "rgba(139,92,246,0.08)" }}>
              <span className="material-symbols-outlined text-[28px]" style={{ color: "#8b5cf6" }}>elderly</span>
            </div>
            <h3 className="text-sm font-extrabold text-verdant-ink mb-1">מסלקה פנסיונית (XML)</h3>
            <p className="text-[11px] text-verdant-muted leading-relaxed">
              קובץ XML מהמסלקה הפנסיונית — יפוענח אוטומטית בעמוד פנסיה ופרישה עם קרנות, דמי ניהול ומסלולים
            </p>
            <div className="mt-3 flex items-center justify-center gap-2 text-[10px] font-bold" style={{ color: "#8b5cf6" }}>
              <span className="material-symbols-outlined text-[14px]">arrow_back</span>
              עבור לעמוד פנסיה
            </div>
          </a>
        </div>
      )}

      {/* ═══ Upload Area — Drag & Drop ═══ */}
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

      {/* ═══ PREVIEW — Split into Unmapped + Mapped ═══ */}
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

          {/* Reconciliation badge — source-of-truth match */}
          {doc.reconciliation && doc.reconciliation.severity !== "skipped" && (() => {
            const sev = doc.reconciliation.severity;
            const bg = sev === "clean" ? "#f0fdf4" : sev === "minor" ? "#fffbeb" : "#fef2f2";
            const border = sev === "clean" ? "#86efac" : sev === "minor" ? "#fde68a" : "#fecaca";
            const color = sev === "clean" ? "#0a7a4a" : sev === "minor" ? "#b45309" : "#b91c1c";
            const icon = sev === "clean" ? "verified" : sev === "minor" ? "info" : "error";
            return (
              <div className="rounded-2xl p-4 flex items-center gap-3"
                style={{ background: bg, border: `1.5px solid ${border}` }}>
                <span className="material-symbols-outlined text-[22px]" style={{ color }}>{icon}</span>
                <div className="flex-1">
                  <div className="text-[10px] uppercase tracking-[0.15em] font-bold mb-0.5" style={{ color }}>
                    Reconciliation · בדיקת סיכום מול המסמך המקורי
                  </div>
                  <div className="text-[12px] font-extrabold text-verdant-ink">{doc.reconciliation.message}</div>
                </div>
              </div>
            );
          })()}

          {/* Summary header card */}
          <div className="p-5 rounded-2xl" style={{ background: "#fff", boxShadow: "0 1px 4px rgba(0,0,0,0.04)" }}>
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: bankIcon.color + "14" }}>
                  <span className="material-symbols-outlined text-[20px]" style={{ color: bankIcon.color }}>{bankIcon.icon}</span>
                </div>
                <div>
                  <div className="text-[10px] uppercase tracking-[0.2em] text-verdant-muted font-bold">תחנת אימות · אשר את הסיווג והסכומים</div>
                  <h2 className="text-base font-extrabold text-verdant-ink" style={{ fontFamily: "Assistant" }}>{doc.filename}</h2>
                </div>
              </div>
              <button onClick={() => { setPhase("idle"); setDoc(null); setOverrides({}); setDeletedIndices(new Set()); }}
                className="text-xs font-bold text-verdant-muted hover:text-verdant-ink transition-colors px-3 py-2 rounded-lg hover:bg-verdant-bg flex items-center gap-1">
                <span className="material-symbols-outlined text-[14px]">refresh</span>החלף קובץ
              </button>
            </div>
            {/* KPIs + Mapping summary counter */}
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
              <MiniKPI label="בנק / חברה" value={bankHint} />
              <MiniKPI label="תנועות" value={`${effectiveTx.length}${deleteCount > 0 ? ` (-${deleteCount})` : ""}`} />
              <MiniKPI label="חיובים" value={fmtILS(effectiveTx.filter(t => t.amount > 0).reduce((s, t) => s + t.amount, 0))} color="#b91c1c" />
              <MiniKPI label="זיכויים" value={fmtILS(effectiveTx.filter(t => t.amount < 0).reduce((s, t) => s + Math.abs(t.amount), 0))} color="#10b981" />
              <MiniKPI
                label="מצב מיפוי"
                value={allMapped ? `✓ ${mapped.length} מופו` : `${unmapped.length} דרוש · ${mapped.length} מופו`}
                color={allMapped ? "#0a7a4a" : "#b91c1c"}
              />
            </div>
          </div>

          {/* ═══ AUTOPILOT BANNER — zero-effort philosophy ═══ */}
          {mapped.length > 0 && (
            <div className="rounded-2xl p-5 flex items-center gap-4"
              style={{ background: "linear-gradient(135deg,#f0fdf4 0%,#ecfdf5 100%)", border: "1.5px solid #0a7a4a30" }}>
              <div className="w-11 h-11 rounded-xl flex items-center justify-center" style={{ background: "#0a7a4a15" }}>
                <span className="material-symbols-outlined text-[22px]" style={{ color: "#0a7a4a" }}>auto_mode</span>
              </div>
              <div className="flex-1">
                <div className="text-[10px] uppercase tracking-[0.15em] font-bold mb-0.5" style={{ color: "#0a7a4a" }}>Autopilot · טייס אוטומטי</div>
                <div className="text-[13px] font-extrabold text-verdant-ink">
                  {mapped.length} תנועות סווגו אוטומטית · {Math.round((mapped.length / Math.max(1, effectiveTx.length)) * 100)}% מהעבודה בוצעה בשבילך
                </div>
                <div className="text-[11px] font-bold text-verdant-muted mt-0.5">
                  {unmapped.length > 0 ? `אתה צריך לאשר רק ${unmapped.length} תנועות חריגות` : "אין תנועות חריגות — הכל ירוק"}
                </div>
              </div>
            </div>
          )}

          {/* ═══ IMPACT BANNER — categories → life goals ═══ */}
          {(() => {
            const goals = loadImpactGoals();
            if (goals.length === 0 || mapped.length === 0) return null;
            // Detect the largest category total as the potential "overage" surface
            const catTotals: Record<string, number> = {};
            for (const t of mapped) {
              if (t.amount > 0) {
                catTotals[t.category] = (catTotals[t.category] || 0) + t.amount;
              }
            }
            const BUDGETS: Record<string, number> = {
              leisure: 1500, dining_out: 1200, shopping: 2000, subscriptions: 400,
              food: 4000, transport: 2500, utilities: 1500, health: 800, education: 2000,
            };
            const overages = Object.entries(catTotals)
              .map(([key, total]) => ({ key, total, budget: BUDGETS[key] || Infinity, over: total - (BUDGETS[key] || Infinity) }))
              .filter(x => x.over > 0)
              .sort((a, b) => b.over - a.over);
            if (overages.length === 0) return null;
            const top = overages[0];
            const label = CATEGORY_LABELS_HE[top.key] || top.key;
            const impact = computeImpact(top.over, label, goals);
            if (!impact.goal) return null;
            const sevBg = impact.severity === "danger" ? "#fef2f2" : impact.severity === "warning" ? "#fffbeb" : "#eff6ff";
            const sevBorder = impact.severity === "danger" ? "#fecaca" : impact.severity === "warning" ? "#fde68a" : "#bfdbfe";
            const sevColor = impact.severity === "danger" ? "#b91c1c" : impact.severity === "warning" ? "#b45309" : "#1d4ed8";
            return (
              <div className="rounded-2xl p-5 flex items-start gap-4"
                style={{ background: sevBg, border: `1.5px solid ${sevBorder}` }}>
                <div className="w-11 h-11 rounded-xl flex items-center justify-center" style={{ background: sevColor + "15" }}>
                  <span className="material-symbols-outlined text-[22px]" style={{ color: sevColor }}>{impact.goal.icon}</span>
                </div>
                <div className="flex-1">
                  <div className="text-[10px] uppercase tracking-[0.15em] font-bold mb-0.5" style={{ color: sevColor }}>Impact Engine · הקשר לחיים</div>
                  <div className="text-[13px] font-extrabold text-verdant-ink leading-relaxed">
                    {impact.message}
                  </div>
                  <div className="text-[11px] font-bold text-verdant-muted mt-1">
                    מספרים יבשים הופכים למוחשיים · כל שקל בחריגה נלקח מהחלום הגדול
                  </div>
                </div>
              </div>
            );
          })()}

          {/* ═══ ZONE 1 — Unmapped ("דרוש טיפול") ═══ */}
          {unmapped.length > 0 && (
            <div className="rounded-2xl overflow-hidden" style={{ background: "#fff", boxShadow: "0 1px 4px rgba(0,0,0,0.04)", border: "1.5px solid #fecaca" }}>
              <div className="px-5 py-3 flex items-center justify-between" style={{ background: "linear-gradient(135deg,#b91c1c 0%,#dc2626 100%)" }}>
                <div className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-[18px] text-white">error_outline</span>
                  <h3 className="text-sm font-extrabold text-white" style={{ fontFamily: "Assistant" }}>דרוש טיפול — {unmapped.length} תנועות לא מופו</h3>
                </div>
                <span className="text-[10px] text-white/70 font-bold">בחר קטגוריה מתאימה · המערכת תלמד אוטומטית</span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead style={{ background: "#fef2f2" }}>
                    <tr className="text-right border-b" style={{ borderColor: "#fecaca" }}>
                      <th className="px-3 py-2.5 text-[10px] font-bold uppercase tracking-[0.1em] text-verdant-muted w-20">תאריך</th>
                      <th className="px-3 py-2.5 text-[10px] font-bold uppercase tracking-[0.1em] text-verdant-muted">תיאור</th>
                      <th className="px-3 py-2.5 text-[10px] font-bold uppercase tracking-[0.1em] text-verdant-muted w-44">קטגוריה</th>
                      <th className="px-3 py-2.5 text-[10px] font-bold uppercase tracking-[0.1em] text-verdant-muted text-left w-24">סכום</th>
                      <th className="px-3 py-2.5 w-10"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {unmapped.map((t) => {
                      const wasOverridden = !!overrides[t._idx];
                      return (
                        <tr key={t._idx} className={`group transition-colors border-b ${wasOverridden ? "bg-blue-50/30" : "hover:bg-red-50/20"}`} style={{ borderColor: "#fef2f2" }}>
                          <td className="px-3 py-2 text-xs font-bold text-verdant-ink tabular" dir="ltr">{t.date}</td>
                          <td className="px-3 py-2 text-xs font-bold text-verdant-ink truncate max-w-[220px]">{t.description}</td>
                          <td className="px-3 py-1.5">
                            <select value={t.category} onChange={e => handleCategoryChange(t._idx, e.target.value)}
                              className="w-full text-[11px] font-bold rounded-lg px-2 py-1.5 border outline-none cursor-pointer transition-all focus:ring-2 focus:ring-red-300"
                              style={{ borderColor: "#fca5a5", background: "#fff7f7", color: CAT_COLORS[t.category] || "#94a3b8" }}>
                              {CAT_OPTIONS.map(c => <option key={c.key} value={c.key}>{c.label}</option>)}
                            </select>
                          </td>
                          <td className="px-3 py-2 text-xs font-extrabold tabular text-left" style={{ color: t.amount > 0 ? "#b91c1c" : "#10b981" }}>
                            {t.amount > 0 ? "-" : "+"}{fmtILS(t.amount)}
                          </td>
                          <td className="px-3 py-2 text-center">
                            <button onClick={() => handleDelete(t._idx)}
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
            </div>
          )}

          {/* ═══ ZONE 2 — Mapped ("זוהו אוטומטית") ═══ */}
          {mapped.length > 0 && (
            <div className="rounded-2xl overflow-hidden" style={{ background: "#fff", boxShadow: "0 1px 4px rgba(0,0,0,0.04)", border: "1.5px solid #d1fae5" }}>
              <div className="px-5 py-3 flex items-center justify-between" style={{ background: "linear-gradient(135deg,#012d1d 0%,#0a7a4a 100%)" }}>
                <div className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-[18px] text-white">check_circle</span>
                  <h3 className="text-sm font-extrabold text-white" style={{ fontFamily: "Assistant" }}>זוהו אוטומטית — {mapped.length} תנועות</h3>
                </div>
                <span className="text-[10px] text-white/60 font-bold">מקובצות לפי קטגוריה · לחץ לפרטים</span>
              </div>
              <div className="divide-y" style={{ borderColor: "#eef7f1" }}>
                {Object.entries(mappedGroups).sort((a, b) => {
                  const totalA = a[1].reduce((s, t) => s + Math.abs(t.amount), 0);
                  const totalB = b[1].reduce((s, t) => s + Math.abs(t.amount), 0);
                  return totalB - totalA;
                }).map(([catKey, txs]) => {
                  const catLabel = CAT_OPTIONS.find(c => c.key === catKey)?.label || catKey;
                  const catColor = CAT_COLORS[catKey] || "#94a3b8";
                  const total = txs.reduce((s, t) => s + Math.abs(t.amount), 0);
                  const isExpanded = expandedMappedCats.has(catKey);
                  return (
                    <div key={catKey}>
                      <button onClick={() => toggleMappedCat(catKey)}
                        className="w-full px-5 py-3 flex items-center justify-between hover:bg-verdant-bg/30 transition-colors text-right">
                        <div className="flex items-center gap-3">
                          <div className="w-2.5 h-2.5 rounded-full" style={{ background: catColor }} />
                          <span className="text-sm font-extrabold text-verdant-ink" style={{ fontFamily: "Assistant" }}>{catLabel}</span>
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ background: catColor + "15", color: catColor }}>
                            {txs.length} תנועות
                          </span>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="text-sm font-extrabold tabular" style={{ color: catColor }}>{fmtILS(total)}</span>
                          <span className="material-symbols-outlined text-[16px] text-verdant-muted transition-transform" style={{ transform: isExpanded ? "rotate(180deg)" : "rotate(0)" }}>
                            expand_more
                          </span>
                        </div>
                      </button>
                      {isExpanded && (
                        <div className="border-t" style={{ borderColor: "#f4f7ed" }}>
                          <table className="w-full text-sm">
                            <tbody>
                              {txs.map((t) => (
                                <tr key={t._idx} className="group transition-colors border-b hover:bg-verdant-bg/20" style={{ borderColor: "#f9faf2" }}>
                                  <td className="px-5 py-2 text-xs font-bold text-verdant-ink tabular w-20" dir="ltr">{t.date}</td>
                                  <td className="px-3 py-2 text-xs font-bold text-verdant-ink truncate max-w-[220px]">{t.description}</td>
                                  <td className="px-3 py-1.5 w-44">
                                    <select value={t.category} onChange={e => handleCategoryChange(t._idx, e.target.value)}
                                      className="w-full text-[11px] font-bold rounded-lg px-2 py-1.5 border outline-none cursor-pointer transition-all focus:ring-2 focus:ring-verdant-accent/30"
                                      style={{ borderColor: "#d8e0d0", background: "#fff", color: catColor }}>
                                      {CAT_OPTIONS.map(c => <option key={c.key} value={c.key}>{c.label}</option>)}
                                    </select>
                                  </td>
                                  <td className="px-3 py-2 text-xs font-extrabold tabular text-left w-24" style={{ color: t.amount > 0 ? "#b91c1c" : "#10b981" }}>
                                    {t.amount > 0 ? "-" : "+"}{fmtILS(t.amount)}
                                  </td>
                                  <td className="px-3 py-2 text-center w-10">
                                    <button onClick={() => handleDelete(t._idx)}
                                      className="opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded-md hover:bg-red-50" title="מחק">
                                      <span className="material-symbols-outlined text-[14px]" style={{ color: "#b91c1c" }}>delete_outline</span>
                                    </button>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Lateral learning indicator */}
          {overrideCount > 0 && (
            <div className="px-5 py-2.5 rounded-xl flex items-center gap-2 text-[11px] font-bold" style={{ background: "#eff6ff", color: "#1d4ed8" }}>
              <span className="material-symbols-outlined text-[14px]">auto_fix_high</span>
              {overrideCount} תיקונים · למידה רוחבית פעילה — בתי עסק דומים עודכנו אוטומטית
            </div>
          )}

          {/* Action bar */}
          <div className="flex items-center justify-between pt-1">
            <button onClick={() => { setPhase("idle"); setDoc(null); setOverrides({}); setDeletedIndices(new Set()); }}
              className="text-sm font-bold text-verdant-muted hover:text-verdant-ink transition-colors px-4 py-2.5 rounded-xl flex items-center gap-1.5" style={{ background: "#f4f7ed" }}>
              <span className="material-symbols-outlined text-[16px]">close</span>בטל
            </button>
            {allMapped ? (
              <button onClick={handleTransfer}
                className="text-white font-extrabold text-sm py-3 px-8 rounded-xl transition-all hover:shadow-lg hover:scale-[0.98] flex items-center gap-2"
                style={{ background: "linear-gradient(135deg,#012d1d 0%,#0a7a4a 100%)", fontFamily: "Assistant" }}>
                <span className="material-symbols-outlined text-[18px]">verified</span>
                אשר והעבר לתזרים
              </button>
            ) : (
              <div className="flex items-center gap-3">
                <span className="text-[11px] font-bold text-verdant-muted flex items-center gap-1">
                  <span className="material-symbols-outlined text-[14px]" style={{ color: "#b91c1c" }}>info</span>
                  יש למפות {unmapped.length} תנועות לפני העברה
                </span>
              </div>
            )}
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
