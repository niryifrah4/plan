"use client";

import { useState, useEffect, useRef } from "react";
import { Card } from "./ui/Card";
import { fmtILS } from "@/lib/format";
import { loadPensionFunds, savePensionFunds } from "@/lib/pension-store";
import { uploadFile } from "@/lib/storage/file-storage";
import { mergeAnnualIntoFunds } from "@/lib/doc-parser/annual-to-pension";
import { parseMislakaFiles, mislakaProductsToFunds, type ParsedMislakaBundle, type ParsedMislakaProduct } from "@/lib/pension-xml-parser";
import type {
  ParsedAnnualBundle,
  AnnualPolicy,
} from "@/lib/doc-parser/annual-report-parser";

/**
 * Pension data upload panel.
 *
 * Supports TWO flows:
 *   1. PDF — דיוור שנתי מפורט (annual report from provider)
 *      POST to /api/pension/parse-pdf → returns ParsedAnnualBundle
 *   2. XML — קבצי מסלקה פנסיונית (pension clearinghouse)
 *      Parsed entirely client-side — no server needed
 */

type UploadMode = "idle" | "pdf" | "xml";

const MAX_CLIENT_BYTES = 20 * 1024 * 1024; // 20 MB

function validatePdfFiles(files: File[]): string | null {
  for (const f of files) {
    if (f.size > MAX_CLIENT_BYTES) return "הקובץ גדול מדי — מקסימום 20MB";
    const ext = f.name.split(".").pop()?.toLowerCase();
    if (ext !== "pdf") return `הקובץ ${f.name} אינו PDF — בדוק את סוג הקובץ`;
    // Note: don't reject on MIME — some browsers/OS send application/octet-stream for PDFs
  }
  return null;
}

interface BundleSummary {
  totalBalance: number;
  totalProjectedPension: number;
  totalMonthlyContrib: number;
  policyCount: number;
  fileCount: number;
  providerCount: number;
  avgMgmtFeeBalance: number;
  avgMgmtFeeDeposit: number;
  pensionBalance: number;
  gemelBalance: number;
  hishtalmutBalance: number;
  insuranceBalance: number;
}

/* ── Product type labels ── */
const PRODUCT_TYPE_LABELS: Record<number, string> = {
  1: "קרן פנסיה ותיקה",
  2: "קרן פנסיה",
  3: "ביטוח מנהלים",
  4: "קופת גמל",
  5: "קרן השתלמות",
  6: "ביטוח חיים",
  7: "ביטוח מנהלים",
};

export function AnnualReportUpload() {
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [savedInfo, setSavedInfo] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);

  // PDF flow state
  const [pdfBundle, setPdfBundle] = useState<ParsedAnnualBundle | null>(null);
  const [pdfSummary, setPdfSummary] = useState<BundleSummary | null>(null);

  // XML flow state
  const [xmlBundle, setXmlBundle] = useState<ParsedMislakaBundle | null>(null);

  const totalSize = files.reduce((s, f) => s + f.size, 0);

  /* ── Drag & Drop ── */
  function classifyDropped(list: File[]): { accepted: File[]; rejected: File[]; hasZip: boolean } {
    const accepted: File[] = [];
    const rejected: File[] = [];
    let hasZip = false;
    for (const f of list) {
      const n = f.name.toLowerCase();
      if (n.endsWith(".xml") || n.endsWith(".pdf")) accepted.push(f);
      else {
        rejected.push(f);
        if (n.endsWith(".zip")) hasZip = true;
      }
    }
    return { accepted, rejected, hasZip };
  }
  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);
    setErrorMsg(null);
    const { accepted, rejected, hasZip } = classifyDropped(Array.from(e.dataTransfer.files));
    if (hasZip) {
      setErrorMsg("קובץ ZIP של המסלקה לא נתמך ישירות — חלץ את הקבצים (XML) ואז גרור אותם לכאן");
      return;
    }
    if (accepted.length === 0 && rejected.length > 0) {
      setErrorMsg(`סוג קובץ לא נתמך: ${rejected.map(f => f.name).join(", ")} — נדרש XML או PDF`);
      return;
    }
    if (accepted.length > 0) setFiles(accepted);
  }
  function handleDragOver(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(true);
  }
  function handleDragLeave(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);
  }

  // Detect file types
  const hasXml = files.some(f => f.name.endsWith(".xml"));
  const hasPdf = files.some(f => f.name.toLowerCase().endsWith(".pdf"));
  const mode: UploadMode = files.length === 0 ? "idle" : hasXml ? "xml" : "pdf";

  // Auto-parse when files are selected
  const prevFilesRef = useRef<File[]>([]);
  useEffect(() => {
    if (files.length > 0 && files !== prevFilesRef.current) {
      prevFilesRef.current = files;
      if (hasXml) handleParseXml();
      else if (hasPdf) handleParsePdf();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [files]);

  // Maslaka PDF state
  const [maslakaPdfProducts, setMaslakaPdfProducts] = useState<any[] | null>(null);

  /* ── PDF parse (server-side) ── */
  async function handleParsePdf() {
    setBusy(true);
    setMsg(null);
    setErrorMsg(null);
    setPdfBundle(null);
    setPdfSummary(null);
    setMaslakaPdfProducts(null);
    setSavedInfo(null);
    try {
      const pdfFiles = files.filter(f => f.name.toLowerCase().endsWith(".pdf"));

      // Client-side validation before sending
      const validationError = validatePdfFiles(pdfFiles);
      if (validationError) {
        setErrorMsg(validationError);
        setBusy(false);
        return;
      }

      // Upload raw PDFs to Supabase Storage (fire-and-forget; no-op in demo mode)
      for (const f of pdfFiles) {
        uploadFile(f, "pension_report").catch(() => {});
      }

      const fd = new FormData();
      pdfFiles.forEach((f) => fd.append("files", f));
      const res = await fetch("/api/pension/parse-pdf", {
        method: "POST",
        body: fd,
      });
      const data = await res.json();
      if (!res.ok) {
        setErrorMsg(data?.error || "שגיאה בעיבוד הקובץ");
        return;
      }

      if (data.type === "maslaka") {
        // Maslaka clearinghouse PDF — auto-save like XML
        setMaslakaPdfProducts(data.products);
        const funds = data.funds || [];
        if (funds.length > 0) {
          const existing = loadPensionFunds();
          let added = 0, updated = 0;
          const merged = [...existing];
          for (const nf of funds) {
            const idx = merged.findIndex((e: any) =>
              e.company.includes(nf.company.slice(0, 10)) && e.type === nf.type
            );
            if (idx >= 0) {
              merged[idx] = { ...merged[idx], balance: nf.balance, mgmtFeeDeposit: nf.mgmtFeeDeposit, mgmtFeeBalance: nf.mgmtFeeBalance, monthlyContrib: nf.monthlyContrib, track: nf.track, insuranceCover: nf.insuranceCover, openingDate: nf.openingDate || merged[idx].openingDate };
              updated++;
            } else {
              merged.push(nf);
              added++;
            }
          }
          savePensionFunds(merged);
          setSavedInfo(`נשמר: ${added} חדשים, ${updated} עודכנו`);
        }
        const ownerPrefix = data.ownerName ? `${data.ownerName} · ` : "";
        setMsg(`${ownerPrefix}זוהה דוח מסלקה · ${data.products.length} מוצרים`);
        if (data.warnings?.length) {
          console.warn("[maslaka-pdf] warnings:", data.warnings);
        }
      } else {
        // Standard annual report
        setPdfBundle(data.bundle);
        setPdfSummary(data.summary);
        if (data.bundle.warnings?.length) {
          setMsg(`עיבוד הושלם עם ${data.bundle.warnings.length} אזהרות`);
        } else {
          setMsg(`עובדו ${data.bundle.policies.length} פוליסות מ-${data.bundle.files.length} קבצים`);
        }
      }
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : "שגיאה בעיבוד הקובץ — נסה שוב");
    } finally {
      setBusy(false);
    }
  }

  /* ── XML parse (client-side) — scans AND auto-saves ── */
  async function handleParseXml() {
    setBusy(true);
    setMsg(null);
    setErrorMsg(null);
    setXmlBundle(null);
    setSavedInfo(null);
    try {
      const xmlFiles = files.filter(f => f.name.endsWith(".xml"));
      const result = await parseMislakaFiles(xmlFiles);
      setXmlBundle(result);
      if (result.products.length === 0) {
        setMsg(result.warnings.length > 0
          ? result.warnings.join(" · ")
          : "לא נמצאו מוצרים בקבצים");
      } else {
        // Auto-save to pension store immediately
        const newFunds = mislakaProductsToFunds(result.products);
        const existing = loadPensionFunds();
        let added = 0, updated = 0;
        const merged = [...existing];
        for (const nf of newFunds) {
          const idx = merged.findIndex(e =>
            e.company.includes(nf.company.slice(0, 10)) && e.type === nf.type
          );
          if (idx >= 0) {
            merged[idx] = { ...merged[idx], balance: nf.balance, mgmtFeeDeposit: nf.mgmtFeeDeposit, mgmtFeeBalance: nf.mgmtFeeBalance, monthlyContrib: nf.monthlyContrib, track: nf.track, insuranceCover: nf.insuranceCover, subtype: nf.subtype, openingDate: nf.openingDate || merged[idx].openingDate };
            updated++;
          } else {
            merged.push(nf);
            added++;
          }
        }
        savePensionFunds(merged);
        console.log("[pension-xml] auto-saved", merged.length, "funds. Added:", added, "Updated:", updated);

        // Upload raw files to Supabase Storage (fire-and-forget; no-op in demo mode)
        for (const f of xmlFiles) {
          uploadFile(f, "pension_report").catch(() => {});
        }

        const ownerPrefix = result.ownerName ? `${result.ownerName} · ` : "";
        setMsg(`${ownerPrefix}נמצאו ${result.products.length} מוצרים מ-${result.files.length} קבצים`);
        setSavedInfo(`נשמר: ${added} חדשים, ${updated} עודכנו`);
      }
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : "שגיאה בקריאת הקבצים — נסה שוב");
    } finally {
      setBusy(false);
    }
  }

  function handleParse() {
    if (mode === "xml") handleParseXml();
    else handleParsePdf();
  }

  /* ── Save — either flow ── */
  function handleSavePdf() {
    if (!pdfBundle) return;
    const existing = loadPensionFunds();
    const result = mergeAnnualIntoFunds(existing, pdfBundle);
    savePensionFunds(result.funds);
    setSavedInfo(`נשמר: ${result.added} חדשים, ${result.updated} עודכנו` +
      (result.unchanged > 0 ? `, ${result.unchanged} ללא שינוי` : ""));
  }

  /* handleSaveXml removed — XML auto-saves during parse */

  function reset() {
    setFiles([]);
    setPdfBundle(null);
    setPdfSummary(null);
    setXmlBundle(null);
    setMaslakaPdfProducts(null);
    setMsg(null);
    setErrorMsg(null);
    setSavedInfo(null);
  }

  const showPreview = pdfBundle || (xmlBundle && xmlBundle.products.length > 0) || (maslakaPdfProducts && maslakaPdfProducts.length > 0);

  return (
    <Card>
      <div className="flex items-baseline justify-between mb-4">
        <span className="text-[11px] uppercase tracking-[0.2em] text-verdant-muted font-bold">
          {mode === "xml" ? "מסלקה" : "PDF / XML"}
        </span>
        <h3 className="text-lg font-extrabold text-verdant-ink">
          העלאת נתוני פנסיה
        </h3>
      </div>

      <label
        htmlFor="annual-input"
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        className={`flex flex-col items-center justify-center border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors ${errorMsg ? "border-red-300 bg-red-50/50" : dragOver ? "border-verdant-accent bg-verdant-accent/5" : "v-divider hover:bg-gray-50"}`}
      >
        <span className="material-symbols-outlined text-verdant-accent text-[36px] mb-2">
          cloud_upload
        </span>
        <span className="text-sm font-extrabold text-verdant-ink">
          {files.length > 0
            ? `${files.length} קבצים נבחרו`
            : "בחר קבצי XML מהמסלקה או PDF דיוור שנתי"}
        </span>
        {files.length > 0 && (
          <span className="text-[11px] text-verdant-muted font-bold mt-1">
            {(totalSize / 1024).toFixed(1)} KB סה&quot;כ
            {mode === "xml" && " · קבצי מסלקה פנסיונית"}
            {mode === "pdf" && " · דיוור שנתי PDF"}
          </span>
        )}
        <span className="text-[10px] text-verdant-muted mt-1">
          אם קיבלת ZIP מהמסלקה — חלץ תחילה ובחר את קבצי ה-XML
        </span>
        <input
          id="annual-input"
          type="file"
          accept=".pdf,.xml,application/pdf,text/xml,application/xml"
          multiple
          className="hidden"
          onChange={(e) => {
            setErrorMsg(null);
            const picked = Array.from(e.target.files ?? []);
            const { accepted, rejected, hasZip } = classifyDropped(picked);
            if (hasZip) {
              setErrorMsg("קובץ ZIP של המסלקה לא נתמך ישירות — חלץ את הקבצים (XML) ואז העלה אותם");
              return;
            }
            if (accepted.length === 0 && rejected.length > 0) {
              setErrorMsg(`סוג קובץ לא נתמך: ${rejected.map(f => f.name).join(", ")} — נדרש XML או PDF`);
              return;
            }
            setFiles(accepted);
          }}
        />
      </label>

      {files.length > 0 && !showPreview && (
        <ul className="mt-3 space-y-1 text-[11px] text-verdant-muted text-right">
          {files.map((f, i) => (
            <li key={i} className="truncate flex items-center gap-1.5">
              <span className="material-symbols-outlined text-[12px]">
                {f.name.endsWith(".xml") ? "code" : "picture_as_pdf"}
              </span>
              {f.name}
            </li>
          ))}
        </ul>
      )}

      <div className="mt-4 grid grid-cols-2 gap-2">
        <button
          disabled={files.length === 0 || busy}
          onClick={handleParse}
          className="btn-botanical text-sm py-2.5 px-4 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {busy ? "מעבד…" : "טען קבצים"}
        </button>
        <button
          disabled={busy || (files.length === 0 && !showPreview)}
          onClick={reset}
          className="btn-botanical-ghost text-sm py-2.5 px-4 disabled:opacity-40"
        >
          נקה
        </button>
      </div>

      {errorMsg && (
        <div className="mt-3 flex items-start gap-2 p-3 rounded-lg border border-red-200 bg-red-50 text-right">
          <span className="material-symbols-outlined text-red-500 text-[16px] mt-0.5 shrink-0">error</span>
          <span className="text-[12px] font-bold text-red-700 leading-snug">{errorMsg}</span>
        </div>
      )}

      {msg && !errorMsg && (
        <div className="mt-3 text-[12px] font-bold text-right text-verdant-muted">
          {msg}
        </div>
      )}

      {/* ── PDF Preview ── */}
      {pdfBundle && pdfSummary && (
        <div className="mt-5 pt-4 border-t v-divider">
          <div className="grid grid-cols-2 gap-2 mb-4">
            <Stat label="סה״כ צבירה" value={fmtILS(pdfSummary.totalBalance)} />
            <Stat label="קצבה חזויה" value={`${fmtILS(pdfSummary.totalProjectedPension)}/ח`} />
            <Stat label="הפקדה חודשית" value={fmtILS(pdfSummary.totalMonthlyContrib)} />
            <Stat label="דמי ניהול (צבירה)" value={`${pdfSummary.avgMgmtFeeBalance.toFixed(2)}%`} />
          </div>
          <div className="text-[11px] font-bold text-verdant-muted text-right mb-2">
            {pdfSummary.policyCount} פוליסות • {pdfSummary.providerCount} יצרנים • {pdfSummary.fileCount} קבצים
          </div>
          <div className="max-h-64 overflow-y-auto space-y-2">
            {pdfBundle.policies.map((p: AnnualPolicy) => (
              <div key={p.id} className="p-2 rounded border v-divider text-right text-[11px] bg-gray-50">
                <div className="flex justify-between items-baseline">
                  <span className="font-bold text-verdant-ink">{fmtILS(p.balance)}</span>
                  <span className="font-extrabold text-verdant-ink">{p.providerName}</span>
                </div>
                <div className="text-verdant-muted">
                  {p.productTypeLabel}
                  {p.planName && ` • ${p.planName}`}
                  {p.accountNumber && ` • חשבון ${p.accountNumber}`}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── XML (מסלקה) Preview ── */}
      {xmlBundle && xmlBundle.products.length > 0 && (
        <div className="mt-5 pt-4 border-t v-divider">
          <div className="grid grid-cols-2 gap-2 mb-4">
            <Stat label="סה״כ צבירה" value={fmtILS(xmlBundle.products.reduce((s, p) => s + p.balance, 0))} />
            <Stat label="הפקדה חודשית" value={fmtILS(xmlBundle.products.reduce((s, p) => s + p.monthlyContrib, 0))} />
            <Stat label="מוצרים" value={String(xmlBundle.products.length)} />
            <Stat label="קבצים" value={String(xmlBundle.files.length)} />
          </div>

          <div className="max-h-72 overflow-y-auto space-y-2">
            {xmlBundle.products.map((p: ParsedMislakaProduct, i: number) => (
              <div key={i} className="p-3 rounded-lg border v-divider text-right text-[11px] bg-gray-50 hover:bg-white transition-colors">
                <div className="flex justify-between items-baseline mb-1">
                  <span className="font-extrabold text-verdant-ink tabular-nums">{fmtILS(p.balance)}</span>
                  <span className="font-extrabold text-verdant-ink">{p.company}</span>
                </div>
                <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-verdant-muted">
                  <span className="font-bold" style={{ color: "#1B4332" }}>
                    {PRODUCT_TYPE_LABELS[p.productType] || `סוג ${p.productType}`}
                  </span>
                  {p.employer && <span>מעסיק: {p.employer}</span>}
                  {p.monthlyContrib > 0 && <span>הפקדה: {fmtILS(p.monthlyContrib)}/ח</span>}
                </div>
                {p.tracks.length > 0 && (
                  <div className="mt-1 text-[10px] text-verdant-muted">
                    מסלולים: {p.tracks.map(t => t.name).join(", ")}
                  </div>
                )}
                <div className="flex gap-3 mt-1 text-[10px]">
                  {p.mgmtFeeDeposit > 0 && (
                    <span>ד.ניהול הפקדה: {p.mgmtFeeDeposit.toFixed(2)}%</span>
                  )}
                  {p.mgmtFeeBalance > 0 && (
                    <span>ד.ניהול צבירה: {p.mgmtFeeBalance.toFixed(4)}%</span>
                  )}
                  {p.insuranceCover && (
                    <span>
                      ביטוח: {[p.insuranceCover.death && "שאירים", p.insuranceCover.disability && "נכות", p.insuranceCover.lossOfWork && "אכ״ע"].filter(Boolean).join(", ") || "—"}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>

          {xmlBundle.warnings.length > 0 && (
            <details className="mt-3 text-[11px]">
              <summary className="font-bold text-amber-700 cursor-pointer text-right">
                {xmlBundle.warnings.length} אזהרות
              </summary>
              <ul className="mt-1 text-verdant-muted space-y-0.5">
                {xmlBundle.warnings.map((w, i) => (
                  <li key={i} className="text-right">• {w}</li>
                ))}
              </ul>
            </details>
          )}
        </div>
      )}

      {/* ── Maslaka PDF Preview ── */}
      {maslakaPdfProducts && maslakaPdfProducts.length > 0 && (
        <div className="mt-5 pt-4 border-t v-divider">
          <div className="grid grid-cols-2 gap-2 mb-4">
            <Stat label="סה״כ צבירה" value={fmtILS(maslakaPdfProducts.reduce((s: number, p: any) => s + (p.balance || 0), 0))} />
            <Stat label="מוצרים" value={String(maslakaPdfProducts.length)} />
          </div>

          <div className="max-h-72 overflow-y-auto space-y-2">
            {maslakaPdfProducts.map((p: any, i: number) => (
              <div key={i} className="p-3 rounded-lg border v-divider text-right text-[11px] bg-gray-50 hover:bg-white transition-colors">
                <div className="flex justify-between items-baseline mb-1">
                  <span className="font-extrabold text-verdant-ink tabular">{fmtILS(p.balance || 0)}</span>
                  <span className="font-extrabold text-verdant-ink">{p.company}</span>
                </div>
                <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-verdant-muted">
                  <span className="font-bold" style={{ color: "#1B4332" }}>{p.productType}</span>
                  <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${p.status === "active" ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"}`}>
                    {p.status === "active" ? "פעיל" : "לא פעיל"}
                  </span>
                  {p.employer && <span>מעסיק: {p.employer}</span>}
                </div>
                {(p.mgmtFeeDeposit || p.mgmtFeeBalance) && (
                  <div className="mt-1 text-[10px]">
                    {p.mgmtFeeDeposit ? `ד.ניהול הפקדה: ${p.mgmtFeeDeposit.toFixed(2)}%` : ""}
                    {p.mgmtFeeDeposit && p.mgmtFeeBalance ? " · " : ""}
                    {p.mgmtFeeBalance ? `ד.ניהול צבירה: ${p.mgmtFeeBalance.toFixed(4)}%` : ""}
                  </div>
                )}
                {p.liquidityDate && (
                  <div className="mt-1 text-[10px] font-bold" style={{ color: "#1B4332" }}>
                    נזילות: {p.liquidityDate}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Save button (PDF only — XML auto-saves) ── */}
      {pdfBundle && pdfSummary && (
        <div className="mt-4">
          <button
            onClick={handleSavePdf}
            disabled={!!savedInfo}
            className="btn-botanical w-full text-sm py-2.5 disabled:opacity-50"
          >
            {savedInfo ? "נשמר ✓" : "שמור במערכת הפנסיה"}
          </button>
        </div>
      )}

      {/* ── Auto-save confirmation ── */}
      {savedInfo && (
        <div className="mt-3 flex items-center gap-1.5 justify-end text-[12px] font-bold text-verdant-emerald">
          <span className="material-symbols-outlined text-[14px]">check_circle</span>
          {savedInfo}
        </div>
      )}

      <div className="mt-4 pt-4 border-t v-divider text-[11px] text-verdant-muted font-bold text-right leading-relaxed">
        <strong>XML מהמסלקה:</strong> הורד קבצי XML מאתר המסלקה הפנסיונית (gemel.mof.gov.il) — המערכת תקרא אוטומטית: חברה, צבירה, דמי ניהול, מסלולי השקעה וביטוחים.
        <br />
        <strong>PDF דיוור שנתי:</strong> העלה את הדיוור המפורט שמתקבל מהקרן פעם בשנה.
      </div>
    </Card>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="p-2 rounded border v-divider bg-white text-right">
      <div className="text-[10px] uppercase tracking-wider text-verdant-muted font-bold">
        {label}
      </div>
      <div className="text-sm font-extrabold text-verdant-ink mt-0.5">
        {value}
      </div>
    </div>
  );
}
