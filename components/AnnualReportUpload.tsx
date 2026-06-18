"use client";

import { useState, useEffect, useRef } from "react";
import type { ReactNode } from "react";
import { Card } from "./ui/Card";
import { fmtILS } from "@/lib/format";
import { loadPensionFunds, savePensionFundsAsync } from "@/lib/pension-store";
import { uploadFile } from "@/lib/storage/file-storage";
import { mergeAnnualIntoFunds } from "@/lib/doc-parser/annual-to-pension";
import {
  parseMislakaFiles,
  mislakaProductsToFunds,
  type ParsedMislakaBundle,
  type ParsedMislakaProduct,
} from "@/lib/pension-xml-parser";
import type { ParsedAnnualBundle, AnnualPolicy } from "@/lib/doc-parser/annual-report-parser";

/**
 * Pension data upload panel.
 *
 * Supports TWO flows:
 *   1. PDF / Excel / CSV — דיוור שנתי מפורט (annual report from provider)
 *      POST to /api/pension/parse-pdf → returns ParsedAnnualBundle
 *   2. XML — קבצי מסלקה פנסיונית (pension clearinghouse)
 *      Parsed entirely client-side — no server needed
 */

type UploadMode = "idle" | "annual" | "xml";

const MAX_CLIENT_BYTES = 20 * 1024 * 1024; // 20 MB

const ANNUAL_FILE_EXTENSIONS = new Set(["pdf", "xlsx", "xls", "csv", "txt"]);

function getExt(file: File): string {
  return file.name.split(".").pop()?.toLowerCase() || "";
}

function validateAnnualFiles(files: File[]): string | null {
  for (const f of files) {
    if (f.size > MAX_CLIENT_BYTES) return "הקובץ גדול מדי — מקסימום 20MB";
    const ext = getExt(f);
    if (!ANNUAL_FILE_EXTENSIONS.has(ext)) {
      return `הקובץ ${f.name} לא נתמך — נדרש PDF, Excel, CSV או XML`;
    }
    // Note: don't reject on MIME — some browsers/OS send application/octet-stream
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
  const [expandedPolicyIds, setExpandedPolicyIds] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const [needsPassword, setNeedsPassword] = useState(false);
  const [pdfPassword, setPdfPassword] = useState("");

  // PDF flow state
  const [pdfBundle, setPdfBundle] = useState<ParsedAnnualBundle | null>(null);
  const [pdfSummary, setPdfSummary] = useState<BundleSummary | null>(null);

  // XML flow state
  const [xmlBundle, setXmlBundle] = useState<ParsedMislakaBundle | null>(null);

  const totalSize = files.reduce((s, f) => s + f.size, 0);

  function clearPasswordPrompt() {
    setNeedsPassword(false);
    setPdfPassword("");
  }

  /* ── Drag & Drop ── */
  function classifyDropped(list: File[]): { accepted: File[]; rejected: File[]; hasZip: boolean } {
    const accepted: File[] = [];
    const rejected: File[] = [];
    let hasZip = false;
    for (const f of list) {
      const n = f.name.toLowerCase();
      const ext = getExt(f);
      if (ext === "xml" || ANNUAL_FILE_EXTENSIONS.has(ext)) accepted.push(f);
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
    clearPasswordPrompt();
    const { accepted, rejected, hasZip } = classifyDropped(Array.from(e.dataTransfer.files));
    if (hasZip) {
      setErrorMsg("קובץ ZIP של המסלקה לא נתמך ישירות — חלץ את הקבצים (XML) ואז גרור אותם לכאן");
      return;
    }
    if (accepted.length === 0 && rejected.length > 0) {
      setErrorMsg(
        `סוג קובץ לא נתמך: ${rejected.map((f) => f.name).join(", ")} — נדרש XML, PDF, Excel או CSV`
      );
      return;
    }
    const hasDroppedXml = accepted.some((f) => getExt(f) === "xml");
    const hasDroppedAnnual = accepted.some((f) => ANNUAL_FILE_EXTENSIONS.has(getExt(f)));
    if (hasDroppedXml && hasDroppedAnnual) {
      setErrorMsg("לא ניתן לערבב XML עם PDF/Excel באותה העלאה — העלה כל סוג בנפרד");
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
  const hasXml = files.some((f) => getExt(f) === "xml");
  const hasAnnual = files.some((f) => ANNUAL_FILE_EXTENSIONS.has(getExt(f)));
  const mode: UploadMode = files.length === 0 ? "idle" : hasXml ? "xml" : "annual";

  // Auto-parse when files are selected
  const prevFilesRef = useRef<File[]>([]);
  useEffect(() => {
    if (files.length > 0 && files !== prevFilesRef.current) {
      prevFilesRef.current = files;
      if (hasXml) handleParseXml();
      else if (hasAnnual) handleParseAnnual();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [files]);

  // Maslaka PDF state
  const [maslakaPdfProducts, setMaslakaPdfProducts] = useState<any[] | null>(null);

  /* ── Annual report parse (server-side) ── */
  async function handleParseAnnual(passwordOverride?: string) {
    const password = (passwordOverride ?? pdfPassword).trim();
    setBusy(true);
    setMsg(null);
    setErrorMsg(null);
    setPdfBundle(null);
    setPdfSummary(null);
    setMaslakaPdfProducts(null);
    setSavedInfo(null);
    try {
      const annualFiles = files.filter((f) => ANNUAL_FILE_EXTENSIONS.has(getExt(f)));

      // Client-side validation before sending
      const validationError = validateAnnualFiles(annualFiles);
      if (validationError) {
        setErrorMsg(validationError);
        setBusy(false);
        return;
      }

      // Upload raw annual reports to Supabase Storage (fire-and-forget; no-op in demo mode)
      for (const f of annualFiles) {
        uploadFile(f, "pension_report").catch(() => {});
      }

      const fd = new FormData();
      annualFiles.forEach((f) => fd.append("files", f));
      if (password) fd.append("password", password);
      const res = await fetch("/api/pension/parse-pdf", {
        method: "POST",
        body: fd,
        credentials: "include"
      });
      const data = await res.json();
      if (!res.ok) {
        if (
          data?.code === "PASSWORD_REQUIRED" ||
          data?.code === "PASSWORD_WRONG" ||
          data?.code === "ENCRYPTED_PDF"
        ) {
          setNeedsPassword(true);
          setErrorMsg(data?.error || "הקובץ מוגן בסיסמה — הזן את הסיסמה כדי לנתח אותו");
          return;
        }
        setErrorMsg(data?.error || "שגיאה בעיבוד הקובץ");
        return;
      }
      clearPasswordPrompt();

      if (data.type === "maslaka") {
        // Maslaka clearinghouse PDF — auto-save like XML
        setMaslakaPdfProducts(data.products);
        const funds = data.funds || [];
        if (funds.length > 0) {
          const existing = loadPensionFunds();
          let added = 0,
            updated = 0;
          const merged = [...existing];
          for (const nf of funds) {
            const idx = merged.findIndex(
              (e: any) => e.company.includes(nf.company.slice(0, 10)) && e.type === nf.type
            );
            if (idx >= 0) {
              merged[idx] = {
                ...merged[idx],
                balance: nf.balance,
                mgmtFeeDeposit: nf.mgmtFeeDeposit,
                mgmtFeeBalance: nf.mgmtFeeBalance,
                monthlyContrib: nf.monthlyContrib,
                track: nf.track,
                insuranceCover: nf.insuranceCover,
                openingDate: nf.openingDate || merged[idx].openingDate,
              };
              updated++;
            } else {
              merged.push(nf);
              added++;
            }
          }
          const saved = await savePensionFundsAsync(merged);
          if (!saved.ok) {
            setErrorMsg(`הנתונים נשמרו במכשיר הזה בלבד, אבל לא עלו לשרת (${saved.error || "sync_failed"})`);
          }
          setSavedInfo(
            saved.ok
              ? `נשמר: ${added} חדשים, ${updated} עודכנו`
              : `נשמר מקומית בלבד: ${added} חדשים, ${updated} עודכנו`
          );
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
          setMsg(
            `עובדו ${data.bundle.policies.length} פוליסות מ-${data.bundle.files.length} קבצים`
          );
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
      const xmlFiles = files.filter((f) => f.name.endsWith(".xml"));
      const result = await parseMislakaFiles(xmlFiles);
      setXmlBundle(result);
      if (result.products.length === 0) {
        setMsg(result.warnings.length > 0 ? result.warnings.join(" · ") : "לא נמצאו מוצרים בקבצים");
      } else {
        // Auto-save to pension store immediately
        const newFunds = mislakaProductsToFunds(result.products);
        const existing = loadPensionFunds();
        let added = 0,
          updated = 0;
        const merged = [...existing];
        for (const nf of newFunds) {
          const idx = merged.findIndex(
            (e) => e.company.includes(nf.company.slice(0, 10)) && e.type === nf.type
          );
          if (idx >= 0) {
            merged[idx] = {
              ...merged[idx],
              balance: nf.balance,
              mgmtFeeDeposit: nf.mgmtFeeDeposit,
              mgmtFeeBalance: nf.mgmtFeeBalance,
              monthlyContrib: nf.monthlyContrib,
              track: nf.track,
              insuranceCover: nf.insuranceCover,
              subtype: nf.subtype,
              openingDate: nf.openingDate || merged[idx].openingDate,
            };
            updated++;
          } else {
            merged.push(nf);
            added++;
          }
        }
        const saved = await savePensionFundsAsync(merged);
        if (!saved.ok) {
          setErrorMsg(`הנתונים נשמרו במכשיר הזה בלבד, אבל לא עלו לשרת (${saved.error || "sync_failed"})`);
        }
        console.log(
          "[pension-xml] auto-saved",
          merged.length,
          "funds. Added:",
          added,
          "Updated:",
          updated
        );

        // Upload raw files to Supabase Storage (fire-and-forget; no-op in demo mode)
        for (const f of xmlFiles) {
          uploadFile(f, "pension_report").catch(() => {});
        }

        const ownerPrefix = result.ownerName ? `${result.ownerName} · ` : "";
        setMsg(
          `${ownerPrefix}נמצאו ${result.products.length} מוצרים מ-${result.files.length} קבצים`
        );
        setSavedInfo(
          saved.ok
            ? `נשמר: ${added} חדשים, ${updated} עודכנו`
            : `נשמר מקומית בלבד: ${added} חדשים, ${updated} עודכנו`
        );
      }
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : "שגיאה בקריאת הקבצים — נסה שוב");
    } finally {
      setBusy(false);
    }
  }

  function handleParse() {
    if (mode === "xml") handleParseXml();
    else handleParseAnnual();
  }

  /* ── Save — either flow ── */
  async function handleSavePdf() {
    if (!pdfBundle) return;
    setSaving(true);
    setSavedInfo(null);

    await new Promise((resolve) => window.setTimeout(resolve, 250));

    const existing = loadPensionFunds();
    const result = mergeAnnualIntoFunds(existing, pdfBundle);
    const saved = await savePensionFundsAsync(result.funds);
    if (!saved.ok) {
      setErrorMsg(`הנתונים נשמרו במכשיר הזה בלבד, אבל לא עלו לשרת (${saved.error || "sync_failed"})`);
    }
    setSavedInfo(
      `${saved.ok ? "נשמר" : "נשמר מקומית בלבד"}: ${result.added} חדשים, ${result.updated} עודכנו` +
        (result.unchanged > 0 ? `, ${result.unchanged} ללא שינוי` : "")
    );
    setSaving(false);

    window.setTimeout(() => {
      const target =
        document.getElementById("pension-graphs") ||
        document.querySelector<HTMLElement>("[data-pension-summary]");
      target?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 150);
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
    setExpandedPolicyIds(new Set());
    setSaving(false);
    clearPasswordPrompt();
  }

  const showPreview =
    pdfBundle ||
    (xmlBundle && xmlBundle.products.length > 0) ||
    (maslakaPdfProducts && maslakaPdfProducts.length > 0);

  return (
    <Card>
      <div className="mb-4 flex items-baseline justify-between">
        <h3 className="text-lg font-extrabold text-verdant-ink">העלאת נתוני פנסיה</h3>
        <span className="text-[11px] font-bold uppercase tracking-[0.2em] text-verdant-muted">
          {mode === "xml" ? "מסלקה" : "PDF / Excel / XML"}
        </span>
      </div>

      <label
        htmlFor="annual-input"
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        className={`flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed p-6 text-center transition-colors ${errorMsg ? "border-red-300 bg-red-50/50" : dragOver ? "border-verdant-accent bg-verdant-accent/5" : "v-divider hover:bg-[#FAFAF7]"}`}
      >
        <span className="material-symbols-outlined mb-2 text-[36px] text-verdant-accent">
          cloud_upload
        </span>
        <span className="text-sm font-extrabold text-verdant-ink">
          {files.length > 0
            ? `${files.length} קבצים נבחרו`
            : "בחר קבצי XML מהמסלקה או דיוור שנתי PDF / Excel"}
        </span>
        {files.length > 0 && (
          <span className="mt-1 text-[11px] font-bold text-verdant-muted">
            {(totalSize / 1024).toFixed(1)} KB סה&quot;כ
            {mode === "xml" && " · קבצי מסלקה פנסיונית"}
            {mode === "annual" && " · דיוור שנתי"}
          </span>
        )}
        <span className="mt-1 text-[10px] text-verdant-muted">
          אם קיבלת ZIP מהמסלקה — חלץ תחילה ובחר את קבצי ה-XML
        </span>
        <input
          id="annual-input"
          type="file"
          accept=".pdf,.xml,.xlsx,.xls,.csv,.txt,application/pdf,text/xml,application/xml,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,text/csv,text/plain"
          multiple
          className="hidden"
          onChange={(e) => {
            setErrorMsg(null);
            clearPasswordPrompt();
            const picked = Array.from(e.target.files ?? []);
            const { accepted, rejected, hasZip } = classifyDropped(picked);
            if (hasZip) {
              setErrorMsg("קובץ ZIP של המסלקה לא נתמך ישירות — חלץ את הקבצים (XML) ואז העלה אותם");
              return;
            }
            if (accepted.length === 0 && rejected.length > 0) {
              setErrorMsg(
                `סוג קובץ לא נתמך: ${rejected.map((f) => f.name).join(", ")} — נדרש XML, PDF, Excel או CSV`
              );
              return;
            }
            const hasPickedXml = accepted.some((f) => getExt(f) === "xml");
            const hasPickedAnnual = accepted.some((f) => ANNUAL_FILE_EXTENSIONS.has(getExt(f)));
            if (hasPickedXml && hasPickedAnnual) {
              setErrorMsg("לא ניתן לערבב XML עם PDF/Excel באותה העלאה — העלה כל סוג בנפרד");
              return;
            }
            setFiles(accepted);
          }}
        />
      </label>

      {files.length > 0 && !showPreview && (
        <ul className="mt-3 space-y-1 text-right text-[11px] text-verdant-muted">
          {files.map((f, i) => (
            <li key={i} className="flex items-center gap-1.5 truncate">
              <span className="material-symbols-outlined text-[12px]">
                {getExt(f) === "xml"
                  ? "code"
                  : getExt(f) === "pdf"
                    ? "picture_as_pdf"
                    : "table_chart"}
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
          className="btn-botanical px-4 py-2.5 text-sm disabled:cursor-not-allowed disabled:opacity-40"
        >
          {busy ? "מעבד…" : "טען קבצים"}
        </button>
        <button
          disabled={busy || (files.length === 0 && !showPreview)}
          onClick={reset}
          className="btn-botanical-ghost px-4 py-2.5 text-sm disabled:opacity-40"
        >
          נקה
        </button>
      </div>

      {errorMsg && (
        <div className="mt-3 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-right">
          <span className="material-symbols-outlined mt-0.5 shrink-0 text-[16px] text-red-500">
            error
          </span>
          <span className="text-[12px] font-bold leading-snug text-red-700">{errorMsg}</span>
        </div>
      )}

      {needsPassword && mode === "annual" && (
        <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-right">
          <div className="mb-2 text-[12px] font-extrabold text-amber-900">
            הקובץ מוגן בסיסמה
          </div>
          <div className="flex flex-col gap-2 sm:flex-row-reverse">
            <input
              type="password"
              value={pdfPassword}
              onChange={(e) => setPdfPassword(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && pdfPassword.trim() && !busy) {
                  void handleParseAnnual(pdfPassword);
                }
              }}
              placeholder="סיסמת הקובץ"
              className="min-w-0 flex-1 rounded-lg border border-amber-200 bg-white px-3 py-2 text-right text-sm font-bold text-verdant-ink outline-none focus:border-verdant-accent"
            />
            <button
              type="button"
              disabled={busy || !pdfPassword.trim()}
              onClick={() => void handleParseAnnual(pdfPassword)}
              className="btn-botanical px-4 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-40"
            >
              {busy ? "בודק…" : "פענח ונתח"}
            </button>
          </div>
        </div>
      )}

      {msg && !errorMsg && (
        <div className="mt-3 text-right text-[12px] font-bold text-verdant-muted">{msg}</div>
      )}

      {/* ── Annual report Preview ── */}
      {pdfBundle && pdfSummary && (
        <div className="v-divider mt-5 border-t pt-4">
          <div className="mb-4 grid grid-cols-2 gap-2">
            <Stat label="סה״כ צבירה" value={fmtILS(pdfSummary.totalBalance)} />
            <Stat label="קצבה חזויה" value={`${fmtILS(pdfSummary.totalProjectedPension)}/ח`} />
            <Stat label="הפקדה חודשית" value={fmtILS(pdfSummary.totalMonthlyContrib)} />
            <Stat label="דמי ניהול (צבירה)" value={`${pdfSummary.avgMgmtFeeBalance.toFixed(2)}%`} />
          </div>
          <div className="mb-2 text-right text-[11px] font-bold text-verdant-muted">
            {pdfSummary.policyCount} פוליסות • {pdfSummary.providerCount} יצרנים •{" "}
            {pdfSummary.fileCount} קבצים
          </div>
          <div className="max-h-64 space-y-2 overflow-y-auto">
            {pdfBundle.policies.map((p: AnnualPolicy) => (
              <div
                key={p.id}
                className="v-divider rounded border bg-[#FAFAF7] p-2 text-right text-[11px]"
              >
                <div className="flex items-baseline justify-between">
                  <span className="font-bold text-verdant-ink">{fmtILS(p.balance)}</span>
                  <span className="font-extrabold text-verdant-ink">{p.providerName}</span>
                </div>
                <div className="text-verdant-muted">
                  {p.productTypeLabel}
                  {p.planName && ` • ${p.planName}`}
                  {p.accountNumber && ` • חשבון ${p.accountNumber}`}
                </div>
                <button
                  type="button"
                  onClick={() =>
                    setExpandedPolicyIds((prev) => {
                      const next = new Set(prev);
                      if (next.has(p.id)) next.delete(p.id);
                      else next.add(p.id);
                      return next;
                    })
                  }
                  className="mt-2 text-[11px] font-extrabold text-verdant-accent"
                >
                  {expandedPolicyIds.has(p.id) ? "הסתר פרטים" : "הצג עוד פרטים"}
                </button>
                {expandedPolicyIds.has(p.id) && <AnnualPolicyDetails policy={p} />}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── XML (מסלקה) Preview ── */}
      {xmlBundle && xmlBundle.products.length > 0 && (
        <div className="v-divider mt-5 border-t pt-4">
          <div className="mb-4 grid grid-cols-2 gap-2">
            <Stat
              label="סה״כ צבירה"
              value={fmtILS(xmlBundle.products.reduce((s, p) => s + p.balance, 0))}
            />
            <Stat
              label="הפקדה חודשית"
              value={fmtILS(xmlBundle.products.reduce((s, p) => s + p.monthlyContrib, 0))}
            />
            <Stat label="מוצרים" value={String(xmlBundle.products.length)} />
            <Stat label="קבצים" value={String(xmlBundle.files.length)} />
          </div>

          <div className="max-h-72 space-y-2 overflow-y-auto">
            {xmlBundle.products.map((p: ParsedMislakaProduct, i: number) => (
              <div
                key={i}
                className="v-divider rounded-lg border bg-[#FAFAF7] p-3 text-right text-[11px] transition-colors hover:bg-[#FAFAF7]"
              >
                <div className="mb-1 flex items-baseline justify-between">
                  <span className="font-extrabold tabular-nums text-verdant-ink">
                    {fmtILS(p.balance)}
                  </span>
                  <span className="font-extrabold text-verdant-ink">{p.company}</span>
                </div>
                <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-verdant-muted">
                  <span className="font-bold" style={{ color: "#2C7A5A" }}>
                    {PRODUCT_TYPE_LABELS[p.productType] || `סוג ${p.productType}`}
                  </span>
                  {p.employer && <span>מעסיק: {p.employer}</span>}
                  {p.monthlyContrib > 0 && <span>הפקדה: {fmtILS(p.monthlyContrib)}/ח</span>}
                </div>
                {p.tracks.length > 0 && (
                  <div className="mt-1 text-[10px] text-verdant-muted">
                    מסלולים: {p.tracks.map((t) => t.name).join(", ")}
                  </div>
                )}
                <div className="mt-1 flex gap-3 text-[10px]">
                  {p.mgmtFeeDeposit > 0 && (
                    <span>ד.ניהול הפקדה: {p.mgmtFeeDeposit.toFixed(2)}%</span>
                  )}
                  {p.mgmtFeeBalance > 0 && (
                    <span>ד.ניהול צבירה: {p.mgmtFeeBalance.toFixed(4)}%</span>
                  )}
                  {p.insuranceCover && (
                    <span>
                      ביטוח:{" "}
                      {[
                        p.insuranceCover.death && "שאירים",
                        p.insuranceCover.disability && "נכות",
                        p.insuranceCover.lossOfWork && "אכ״ע",
                      ]
                        .filter(Boolean)
                        .join(", ") || "—"}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>

          {xmlBundle.warnings.length > 0 && (
            <details className="mt-3 text-[11px]">
              <summary className="cursor-pointer text-right font-bold text-amber-700">
                {xmlBundle.warnings.length} אזהרות
              </summary>
              <ul className="mt-1 space-y-0.5 text-verdant-muted">
                {xmlBundle.warnings.map((w, i) => (
                  <li key={i} className="text-right">
                    • {w}
                  </li>
                ))}
              </ul>
            </details>
          )}
        </div>
      )}

      {/* ── Maslaka PDF Preview ── */}
      {maslakaPdfProducts && maslakaPdfProducts.length > 0 && (
        <div className="v-divider mt-5 border-t pt-4">
          <div className="mb-4 grid grid-cols-2 gap-2">
            <Stat
              label="סה״כ צבירה"
              value={fmtILS(
                maslakaPdfProducts.reduce((s: number, p: any) => s + (p.balance || 0), 0)
              )}
            />
            <Stat label="מוצרים" value={String(maslakaPdfProducts.length)} />
          </div>

          <div className="max-h-72 space-y-2 overflow-y-auto">
            {maslakaPdfProducts.map((p: any, i: number) => (
              <div
                key={i}
                className="v-divider rounded-lg border bg-[#FAFAF7] p-3 text-right text-[11px] transition-colors hover:bg-[#FAFAF7]"
              >
                <div className="mb-1 flex items-baseline justify-between">
                  <span className="tabular font-extrabold text-verdant-ink">
                    {fmtILS(p.balance || 0)}
                  </span>
                  <span className="font-extrabold text-verdant-ink">{p.company}</span>
                </div>
                <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-verdant-muted">
                  <span className="font-bold" style={{ color: "#2C7A5A" }}>
                    {p.productType}
                  </span>
                  <span
                    className={`rounded-full px-1.5 py-0.5 text-[9px] font-bold ${p.status === "active" ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"}`}
                  >
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
                  <div className="mt-1 text-[10px] font-bold" style={{ color: "#2C7A5A" }}>
                    נזילות: {p.liquidityDate}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Save button (annual reports only — XML auto-saves) ── */}
      {pdfBundle && pdfSummary && (
        <div className="mt-4">
          <button
            onClick={handleSavePdf}
            disabled={!!savedInfo || saving}
            className="btn-botanical flex w-full items-center justify-center gap-2 py-2.5 text-sm disabled:opacity-50"
          >
            {saving && (
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
            )}
            {saving ? "שומר ומעדכן גרפים…" : savedInfo ? "נשמר ✓" : "שמור במערכת הפנסיה"}
          </button>
        </div>
      )}

      {/* ── Auto-save confirmation ── */}
      {savedInfo && (
        <div className="mt-3 flex items-center justify-end gap-1.5 text-[12px] font-bold text-verdant-emerald">
          <span className="material-symbols-outlined text-[14px]">check_circle</span>
          {savedInfo}
        </div>
      )}

      <div className="v-divider mt-4 border-t pt-4 text-right text-[11px] font-bold leading-relaxed text-verdant-muted">
        <strong>XML מהמסלקה:</strong> הורד קבצי XML מאתר המסלקה הפנסיונית (gemel.mof.gov.il) —
        המערכת תקרא אוטומטית: חברה, צבירה, דמי ניהול, מסלולי השקעה וביטוחים.
        <br />
        <strong>דיוור שנתי:</strong> העלה את הדיוור המפורט שמתקבל מהקרן פעם בשנה כ-PDF,
        Excel או CSV.
      </div>
    </Card>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="v-divider rounded border bg-[#FFFFFF] p-2 text-right">
      <div className="text-[10px] font-bold uppercase tracking-wider text-verdant-muted">
        {label}
      </div>
      <div className="mt-0.5 text-sm font-extrabold text-verdant-ink">{value}</div>
    </div>
  );
}

function AnnualPolicyDetails({ policy }: { policy: AnnualPolicy }) {
  const c = policy.annualContributionsBreakdown;
  const cover = policy.projectedCoverages;
  const move = policy.balanceMovements;
  const tracks = policy.investmentTracks || [];

  return (
    <div className="mt-3 space-y-3 rounded border border-verdant-accent/20 bg-white p-3">
      <div className="grid grid-cols-2 gap-2">
        <Detail
          label="סטטוס"
          value={
            policy.status === "active"
              ? "פעיל"
              : policy.status === "inactive"
                ? "לא פעיל"
                : undefined
          }
        />
        <Detail label="מעסיק" value={policy.employerName} textValue />
        <Detail label="מועד הצטרפות" value={policy.joinDate} />
        <Detail label="גיל פרישה" value={policy.retirementAge?.toString()} />
        <Detail
          label="משכורת קובעת"
          value={policy.salaryBase ? fmtILS(policy.salaryBase) : undefined}
        />
        <Detail
          label="דמי ניהול הפקדה"
          value={policy.mgmtFeeDeposit !== undefined ? `${policy.mgmtFeeDeposit.toFixed(2)}%` : undefined}
        />
      </div>

      {c && (
        <DetailSection title="פירוט הפקדות שנתי">
          <Detail label="עובד" value={c.employee ? fmtILS(c.employee) : undefined} />
          <Detail label="מעסיק" value={c.employer ? fmtILS(c.employer) : undefined} />
          <Detail label="פיצויים" value={c.severance ? fmtILS(c.severance) : undefined} />
          <Detail label="סה״כ" value={c.total ? fmtILS(c.total) : undefined} />
        </DetailSection>
      )}

      {cover && (
        <DetailSection title="כיסויים ביטוחיים">
          <Detail label="נכות" value={cover.disabilityPct !== undefined ? `${cover.disabilityPct.toFixed(2)}%` : undefined} />
          <Detail label="קצבת נכות" value={cover.disabilityMonthly ? `${fmtILS(cover.disabilityMonthly)}/ח` : undefined} />
          <Detail label="שחרור מהפקדות" value={cover.disabilityContributionWaiver ? fmtILS(cover.disabilityContributionWaiver) : undefined} />
          <Detail label="אלמן/ה" value={cover.spouseMonthly ? `${fmtILS(cover.spouseMonthly)}/ח` : undefined} />
          <Detail label="יתום" value={cover.childMonthly ? `${fmtILS(cover.childMonthly)}/ח` : undefined} />
          <Detail label="עלות כיסוי" value={cover.insuranceCostPctOfDeposits !== undefined ? `${cover.insuranceCostPctOfDeposits.toFixed(2)}% מהפקדות` : undefined} />
        </DetailSection>
      )}

      {move && (
        <DetailSection title="תנועות ויתרות">
          <Detail label="הפקדות" value={move.deposits ? fmtILS(move.deposits) : undefined} />
          <Detail label="העברות פנימה" value={move.transfersIn ? fmtILS(move.transfersIn) : undefined} />
          <Detail label="העברות החוצה" value={move.transfersOut ? fmtILS(move.transfersOut) : undefined} />
          <Detail label="רווח/הפסד" value={move.investmentProfitLoss !== undefined ? fmtILS(move.investmentProfitLoss) : undefined} />
          <Detail label="דמי ניהול ששולמו" value={move.managementFeesPaid !== undefined ? fmtILS(Math.abs(move.managementFeesPaid)) : undefined} />
          <Detail label="עלות נכות" value={move.disabilityInsuranceCost !== undefined ? fmtILS(Math.abs(move.disabilityInsuranceCost)) : undefined} />
          <Detail label="עלות שארים" value={move.survivorsInsuranceCost !== undefined ? fmtILS(Math.abs(move.survivorsInsuranceCost)) : undefined} />
          <Detail label="יתרה לסוף שנה" value={move.closingBalance ? fmtILS(move.closingBalance) : undefined} />
        </DetailSection>
      )}

      {tracks.length > 0 && (
        <div>
          <div className="mb-1 font-extrabold text-verdant-ink">מסלולי השקעה</div>
          <div className="space-y-1">
            {tracks.map((track, i) => (
              <div key={`${track.name}-${i}`} className="rounded border bg-[#FAFAF7] p-2">
                <div className="font-bold text-verdant-ink">
                  <bdi dir="rtl">{track.name}</bdi>
                </div>
                <div className="mt-1 grid grid-cols-2 gap-x-3 gap-y-1 text-verdant-muted">
                  <Detail label="יתרה" value={track.balance ? fmtILS(track.balance) : undefined} />
                  <Detail label="תשואה שנתית" value={track.annualReturnPct !== undefined ? `${track.annualReturnPct.toFixed(2)}%` : undefined} />
                  <Detail label="תשואה 5 שנים" value={track.return5yPct !== undefined ? `${track.return5yPct.toFixed(2)}%` : undefined} />
                  <Detail label="הוצאות השקעה" value={track.investmentExpensePct !== undefined ? `${track.investmentExpensePct.toFixed(2)}%` : undefined} />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function DetailSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div>
      <div className="mb-1 font-extrabold text-verdant-ink">{title}</div>
      <div className="grid grid-cols-2 gap-2">{children}</div>
    </div>
  );
}

function Detail({ label, value, textValue = false }: { label: string; value?: string; textValue?: boolean }) {
  if (!value) return null;
  return (
    <div>
      <span className="font-bold text-verdant-muted">{label}: </span>
      <span className="font-extrabold text-verdant-ink">
        {textValue ? <bdi dir="rtl">{value}</bdi> : value}
      </span>
    </div>
  );
}
