"use client";

/**
 * Idle / uploading phase of the document mapping flow.
 *
 * Sections, top to bottom:
 *   1. Three category zones — bank/credit, amortization, pension XML
 *   2. Drag-and-drop area (also shows the uploading progress spinner)
 *   3. Inline error banner with a retry control
 *   4. Mapping progress summary (only when there is history to summarize)
 *   5. History of uploaded documents
 *   6. Supported banks / credit issuers reference card
 *
 * All file selection happens here. The parent gets the picked files via
 * `onFiles`, runs the parse pipeline, and switches phase to "preview".
 */

import { useRef, useState } from "react";
import { getBankIcon } from "./banks";
import { fmtILS } from "@/lib/format";
import type { DocHistoryEntry } from "@/lib/documents-store";

export function IdleView({
  phase,
  error,
  onClearError,
  uploadProgress,
  docHistory,
  onFiles,
  onRemoveHistory,
}: {
  phase: "idle" | "uploading";
  error: string;
  onClearError: () => void;
  uploadProgress: { current: number; total: number; name: string } | null;
  docHistory: DocHistoryEntry[];
  onFiles: (files: File[]) => void;
  onRemoveHistory: (id: string) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const files = Array.from(e.dataTransfer.files).filter((f) => f.size > 0);
    if (files.length > 0) onFiles(files);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []).filter((f) => f.size > 0);
    if (files.length > 0) onFiles(files);
    e.target.value = "";
  };

  const isIdle = phase === "idle";
  const isUploading = phase === "uploading";

  return (
    <>
      {/* ═══ Three Upload Zones (idle only, no error) ═══ */}
      {isIdle && !error && (
        <div className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-3">
          {/* Zone 1 — Bank / Credit */}
          <div
            onClick={() => inputRef.current?.click()}
            className="card-pad cursor-pointer text-center transition-all duration-200"
            style={{ borderTop: "3px solid #059669" }}
          >
            <div
              className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full"
              style={{ background: "rgba(16,185,129,0.08)" }}
            >
              <span className="material-symbols-outlined text-[28px] text-verdant-emerald">
                account_balance
              </span>
            </div>
            <h3 className="mb-1 text-sm font-extrabold text-verdant-ink">דפי בנק וכרטיסי אשראי</h3>
            <p className="text-[11px] leading-relaxed text-verdant-muted">
              העלה PDF/Excel מעו&quot;ש או כרטיס אשראי — המערכת תזהה תנועות, תסווג אוטומטית ותעביר
              לתזרים
            </p>
            <div className="mt-3 flex items-center justify-center gap-2 text-[10px] font-bold text-verdant-emerald">
              <span className="material-symbols-outlined text-[14px]">upload_file</span>
              PDF · XLSX · CSV
            </div>
          </div>

          {/* Zone 2 — Amortization Schedules */}
          <div
            onClick={() => inputRef.current?.click()}
            className="card-pad cursor-pointer text-center transition-all duration-200"
            style={{ borderTop: "3px solid #3b82f6" }}
          >
            <div
              className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full"
              style={{ background: "rgba(59,130,246,0.08)" }}
            >
              <span className="material-symbols-outlined text-[28px]" style={{ color: "#2563EB" }}>
                table_chart
              </span>
            </div>
            <h3 className="mb-1 text-sm font-extrabold text-verdant-ink">לוחות סילוקין</h3>
            <p className="text-[11px] leading-relaxed text-verdant-muted">
              העלה לוח סילוקין של משכנתא או הלוואה — המערכת תזהה מסלולים, ריביות ויתרות ותטען לעמוד
              ההלוואות
            </p>
            <div
              className="mt-3 flex items-center justify-center gap-2 text-[10px] font-bold"
              style={{ color: "#2563EB" }}
            >
              <span className="material-symbols-outlined text-[14px]">upload_file</span>
              PDF · XLSX
            </div>
          </div>

          {/* Zone 3 — Pension XML */}
          <a
            href="/pension"
            className="card-pad block text-center transition-all duration-200"
            style={{ borderTop: "3px solid #059669" }}
          >
            <div
              className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full"
              style={{ background: "rgba(139,92,246,0.08)" }}
            >
              <span className="material-symbols-outlined text-[28px]" style={{ color: "#059669" }}>
                elderly
              </span>
            </div>
            <h3 className="mb-1 text-sm font-extrabold text-verdant-ink">מסלקה פנסיונית (XML)</h3>
            <p className="text-[11px] leading-relaxed text-verdant-muted">
              קובץ XML מהמסלקה הפנסיונית — יפוענח אוטומטית בעמוד פנסיה ופרישה עם קרנות, דמי ניהול
              ומסלולים
            </p>
            <div
              className="mt-3 flex items-center justify-center gap-2 text-[10px] font-bold"
              style={{ color: "#059669" }}
            >
              <span className="material-symbols-outlined text-[14px]">arrow_back</span>
              עבור לעמוד פנסיה
            </div>
          </a>
        </div>
      )}

      {/* ═══ Upload Area — Drag & Drop ═══ */}
      {(isIdle || isUploading) && (
        <DragDropArea
          inputRef={inputRef}
          isUploading={isUploading}
          uploadProgress={uploadProgress}
          onDrop={handleDrop}
          onFileChange={handleFileChange}
          onClick={() => inputRef.current?.click()}
        />
      )}

      {error && <ErrorBanner error={error} onRetry={onClearError} />}

      {/* ═══ Mapping status — summary + drill-down to uploaded docs ═══ */}
      {isIdle && !error && docHistory.length > 0 && (
        <MappingDrilldown docHistory={docHistory} onRemove={onRemoveHistory} />
      )}

      {/* ═══ Supported Banks — collapsed by default, lives at the bottom ═══ */}
      {isIdle && !error && <SupportedBanksFoldout />}
    </>
  );
}

/* ─────────────────────────────────────────────────────── */

function DragDropArea({
  inputRef,
  isUploading,
  uploadProgress,
  onDrop,
  onFileChange,
  onClick,
}: {
  inputRef: React.RefObject<HTMLInputElement>;
  isUploading: boolean;
  uploadProgress: { current: number; total: number; name: string } | null;
  onDrop: (e: React.DragEvent) => void;
  onFileChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onClick: () => void;
}) {
  const [dragOver, setDragOver] = useState(false);
  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        setDragOver(false);
        onDrop(e);
      }}
      onClick={onClick}
      className="cursor-pointer rounded-2xl transition-all duration-300"
      style={{
        minHeight: 280,
        border: dragOver ? "2px dashed #059669" : "2px dashed #E5E7EB",
        background: dragOver ? "rgba(16,185,129,0.04)" : "#FFFFFF",
        boxShadow: "0 1px 4px rgba(0,0,0,0.04)",
      }}
    >
      <input
        ref={inputRef}
        type="file"
        className="hidden"
        accept=".pdf,.xlsx,.xls,.csv"
        multiple
        onChange={onFileChange}
      />
      <div className="flex h-full flex-col items-center justify-center py-14">
        {isUploading ? (
          <>
            <span className="material-symbols-outlined mb-3 animate-pulse text-[48px] text-verdant-emerald">
              cloud_sync
            </span>
            <div
              className="mb-1 text-lg font-extrabold text-verdant-ink"
              style={{ fontFamily: "inherit" }}
            >
              מעבד קבצים...
            </div>
            {uploadProgress && (
              <div className="text-sm text-verdant-muted">
                קובץ {uploadProgress.current} מתוך {uploadProgress.total}:{" "}
                <span className="font-bold">{uploadProgress.name}</span>
              </div>
            )}
          </>
        ) : (
          <>
            <div
              className="mb-4 flex h-16 w-16 items-center justify-center rounded-full"
              style={{ background: "rgba(16,185,129,0.08)" }}
            >
              <span className="material-symbols-outlined text-[32px] text-verdant-emerald">
                cloud_upload
              </span>
            </div>
            <div
              className="mb-1 text-lg font-extrabold text-verdant-ink"
              style={{ fontFamily: "inherit" }}
            >
              גרור לכאן קבצי PDF או Excel
            </div>
            <div className="mb-1 text-sm text-verdant-muted">
              ניתן להעלות מספר קבצים בו-זמנית
            </div>
            <div className="mb-5 text-xs text-verdant-muted">
              עו&quot;ש + כרטיס אשראי = איחוד אוטומטי ללא כפילויות
            </div>
            <button type="button" className="btn-botanical px-6 py-2.5 text-sm">
              <span className="flex items-center gap-2">
                <span className="material-symbols-outlined text-[18px]">upload_file</span>בחר קבצים
                מהמחשב
              </span>
            </button>
            <div className="caption mt-3 flex items-center gap-3">
              <span>PDF</span>
              <span style={{ color: "#9CA3AF" }}>·</span>
              <span>XLSX</span>
              <span style={{ color: "#9CA3AF" }}>·</span>
              <span>CSV</span>
              <span style={{ color: "#9CA3AF" }}>|</span>
              <span>עד 10MB לקובץ</span>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function ErrorBanner({ error, onRetry }: { error: string; onRetry: () => void }) {
  return (
    <div
      className="mt-4 flex items-center gap-3 rounded-2xl p-4"
      style={{ background: "rgba(220,38,38,0.08)", border: "1px solid #FCA5A5" }}
    >
      <span className="material-symbols-outlined text-[20px]" style={{ color: "#DC2626" }}>
        error
      </span>
      <span className="text-sm font-bold" style={{ color: "#DC2626" }}>
        {error}
      </span>
      <button
        onClick={onRetry}
        className="mr-auto text-xs font-bold text-verdant-muted hover:underline"
      >
        נסה שוב
      </button>
    </div>
  );
}

/**
 * Consolidated mapping panel: summary stats up top, drill-down to the per-file
 * history below. Replaces the older `MappingProgressSummary + DocHistoryList`
 * pair — they were two stacked cards on the landing page; now they're one
 * with a click-to-expand details section so the screen isn't info-soup.
 */
function MappingDrilldown({
  docHistory,
  onRemove,
}: {
  docHistory: DocHistoryEntry[];
  onRemove: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const totalTx = docHistory.reduce((s, h) => s + (h.txCount || 0), 0);
  const totalUnmapped = docHistory.reduce((s, h) => s + (h.unmappedCount ?? 0), 0);
  const totalMapped = totalTx - totalUnmapped;
  const pct = totalTx > 0 ? Math.round((totalMapped / totalTx) * 100) : 100;
  const filesWithGaps = docHistory.filter((h) => (h.unmappedCount ?? 0) > 0).length;
  const allDates = docHistory
    .flatMap((h) => [h.periodFrom, h.periodTo])
    .filter(Boolean)
    .sort() as string[];
  const rangeFrom = allDates[0];
  const rangeTo = allDates[allDates.length - 1];
  const fmtDate = (iso?: string) =>
    iso ? new Date(iso).toLocaleDateString("he-IL", { month: "short", year: "numeric" }) : "";

  return (
    <div
      className="mb-4 mt-6 overflow-hidden rounded-2xl"
      style={{
        background: "linear-gradient(135deg,#FAFAF7 0%,#FFFFFF 100%)",
        border: "1px solid #E5E7EB",
      }}
    >
      <div className="p-5">
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-[18px]" style={{ color: "#2C7A5A" }}>
              fact_check
            </span>
            <h3
              className="text-sm font-extrabold text-verdant-ink"
              style={{ fontFamily: "inherit" }}
            >
              מצב המיפוי
            </h3>
          </div>
          {rangeFrom && rangeTo && (
            <span className="text-[10px] font-bold text-verdant-muted">
              {fmtDate(rangeFrom)} → {fmtDate(rangeTo)}
            </span>
          )}
        </div>
        <div className="mb-3 grid grid-cols-2 gap-3 md:grid-cols-4">
          <SummaryStat label="קבצים" value={docHistory.length} />
          <SummaryStat label="תנועות" value={totalTx} />
          <SummaryStat
            label="אחוז ממופה"
            value={`${pct}%`}
            color={pct >= 95 ? "#059669" : pct >= 80 ? "#B45309" : "#DC2626"}
          />
          <SummaryStat
            label="לא ממופה"
            value={totalUnmapped}
            color={totalUnmapped > 0 ? "#DC2626" : "#059669"}
            suffix={filesWithGaps > 0 ? ` · ב-${filesWithGaps} קבצים` : undefined}
          />
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-[#FFFFFF]">
          <div
            className="h-full"
            style={{
              width: `${pct}%`,
              background: pct >= 95 ? "#059669" : pct >= 80 ? "#B45309" : "#DC2626",
              transition: "width 0.3s",
            }}
          />
        </div>
        {totalUnmapped > 0 && (
          <div className="mt-3 flex items-center gap-1.5 text-[11px] font-bold text-verdant-muted">
            <span className="material-symbols-outlined text-[14px]" style={{ color: "#B45309" }}>
              pending
            </span>
            <span>
              יש {totalUnmapped.toLocaleString("he-IL")} תנועות שסווגו כ״אחר״ או ״העברות״ —
              לחץ "פירוט מסמכים" לראות אילו קבצים דורשים טיפול
            </span>
          </div>
        )}
      </div>

      {/* Drill-down toggle + expanding doc list */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between border-t px-5 py-3 text-right transition-colors hover:bg-[#FAFAF7]/60"
        style={{ borderColor: "#E5E7EB" }}
      >
        <div className="flex items-center gap-2">
          <span className="material-symbols-outlined text-[16px] text-verdant-muted">
            description
          </span>
          <span className="text-[12px] font-extrabold text-verdant-ink">
            {open ? "הסתר פירוט מסמכים" : `פירוט מסמכים (${docHistory.length})`}
          </span>
        </div>
        <span
          className="material-symbols-outlined text-[18px] text-verdant-muted transition-transform"
          style={{ transform: open ? "rotate(180deg)" : "rotate(0)" }}
        >
          expand_more
        </span>
      </button>

      {open && (
        <div className="border-t bg-[#FFFFFF]" style={{ borderColor: "#E5E7EB" }}>
          <div className="divide-y" style={{ borderColor: "#FAFAF7" }}>
            {docHistory.map((h) => (
              <DocHistoryRow key={h.id} entry={h} onRemove={() => onRemove(h.id)} />
            ))}
          </div>
          <div
            className="px-5 py-2.5 text-[10px] font-bold text-verdant-muted"
            style={{ background: "#FAFAF7" }}
          >
            <span className="material-symbols-outlined ml-1 align-middle text-[11px]">info</span>
            הסרה מההיסטוריה לא מוחקת את התנועות עצמן מהתזרים
          </div>
        </div>
      )}
    </div>
  );
}

function SummaryStat({
  label,
  value,
  color,
  suffix,
}: {
  label: string;
  value: string | number;
  color?: string;
  suffix?: string;
}) {
  return (
    <div className="rounded-xl bg-[#FFFFFF] p-3">
      <div className="mb-0.5 text-[9px] font-bold uppercase tracking-[0.1em] text-verdant-muted">
        {label}
      </div>
      <div
        className="tabular text-lg font-extrabold"
        style={{ color: color || "var(--verdant-ink)" }}
      >
        {typeof value === "number" ? value.toLocaleString("he-IL") : value}
        {suffix && (
          <span className="mr-1 text-[10px] font-bold text-verdant-muted">{suffix}</span>
        )}
      </div>
    </div>
  );
}


function DocHistoryRow({ entry: h, onRemove }: { entry: DocHistoryEntry; onRemove: () => void }) {
  const bankIcon = getBankIcon(h.bankHint);
  const dt = new Date(h.uploadedAt);
  const dateStr = dt.toLocaleDateString("he-IL", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
  const timeStr = dt.toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit" });
  const hasStats = typeof h.unmappedCount === "number";
  const unmap = h.unmappedCount ?? 0;
  const mapPct =
    hasStats && h.txCount > 0 ? Math.round(((h.txCount - unmap) / h.txCount) * 100) : null;
  const statusColor = !hasStats
    ? "#6b7280"
    : unmap === 0
      ? "#059669"
      : unmap <= 5
        ? "#B45309"
        : "#DC2626";
  const statusBg = !hasStats
    ? "#FAFAF7"
    : unmap === 0
      ? "#2C7A5A"
      : unmap <= 5
        ? "rgba(217,119,6,0.12)"
        : "rgba(220,38,38,0.12)";
  const statusLabel = !hasStats
    ? "—"
    : unmap === 0
      ? "✓ 100% ממופה"
      : `${unmap} לא ממופה · ${mapPct}%`;
  const periodStr =
    h.periodFrom && h.periodTo
      ? `${new Date(h.periodFrom).toLocaleDateString("he-IL", { month: "short", year: "2-digit" })} → ${new Date(h.periodTo).toLocaleDateString("he-IL", { month: "short", year: "2-digit" })}`
      : null;

  return (
    <div
      className="flex items-center gap-4 px-5 py-3 transition-colors hover:bg-verdant-bg/30"
      style={{ borderRight: unmap > 0 ? "3px solid " + statusColor : "none" }}
    >
      <div
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl"
        style={{ background: bankIcon.color + "14" }}
      >
        <span
          className="material-symbols-outlined text-[18px]"
          style={{ color: bankIcon.color }}
        >
          {bankIcon.icon}
        </span>
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span
            className="truncate text-[13px] font-extrabold text-verdant-ink"
            style={{ fontFamily: "inherit" }}
          >
            {h.filename}
          </span>
          <span
            className="shrink-0 rounded-md px-2 py-0.5 text-[10px] font-extrabold"
            style={{ color: statusColor, background: statusBg }}
          >
            {statusLabel}
          </span>
        </div>
        <div className="mt-0.5 flex flex-wrap items-center gap-2 text-[10px] font-bold text-verdant-muted">
          <span>{h.bankHint}</span>
          <span style={{ color: "#9CA3AF" }}>·</span>
          <span>
            {dateStr} {timeStr}
          </span>
          {periodStr && (
            <>
              <span style={{ color: "#9CA3AF" }}>·</span>
              <span className="flex items-center gap-0.5">
                <span className="material-symbols-outlined text-[11px]">calendar_month</span>
                {periodStr}
              </span>
            </>
          )}
          {typeof h.crossDupsSkipped === "number" && h.crossDupsSkipped > 0 && (
            <>
              <span style={{ color: "#9CA3AF" }}>·</span>
              <span
                className="flex items-center gap-0.5"
                style={{ color: "#2C7A5A" }}
                title="כפילויות מול העלאות קודמות — עו״ש ↔ אשראי"
              >
                <span className="material-symbols-outlined text-[11px]">link</span>
                {h.crossDupsSkipped} מיוזגו
              </span>
            </>
          )}
        </div>
      </div>
      <div className="tabular hidden items-center gap-4 text-[11px] font-bold md:flex">
        <div className="text-right">
          <div className="text-[9px] text-verdant-muted">תנועות</div>
          <div className="font-extrabold text-verdant-ink">{h.txCount}</div>
        </div>
        <div className="text-right">
          <div className="text-[9px] text-verdant-muted">חיובים</div>
          <div className="font-extrabold" style={{ color: "#DC2626" }}>
            {fmtILS(h.chargesSum)}
          </div>
        </div>
        <div className="text-right">
          <div className="text-[9px] text-verdant-muted">זיכויים</div>
          <div className="font-extrabold" style={{ color: "#059669" }}>
            {fmtILS(h.creditsSum)}
          </div>
        </div>
      </div>
      <button
        onClick={onRemove}
        className="rounded-md p-1.5 transition-colors hover:bg-red-50"
        title="הסר מההיסטוריה"
      >
        <span className="material-symbols-outlined text-[14px]" style={{ color: "#DC2626" }}>
          delete_outline
        </span>
      </button>
    </div>
  );
}

/**
 * Reference card listing the banks and credit-card issuers the parser knows
 * about. It's the lowest-priority element on the page — collapsed by default
 * so it doesn't compete with the upload zones or the mapping summary, but
 * still discoverable when a user wonders "is my bank supported?".
 */
function SupportedBanksFoldout() {
  return (
    <details
      className="mt-8 rounded-xl border bg-[#FFFFFF] open:shadow-sm"
      style={{ borderColor: "#E5E7EB" }}
    >
      <summary className="flex cursor-pointer select-none items-center gap-2 px-4 py-2.5 text-[11px] font-bold text-verdant-muted">
        <span className="material-symbols-outlined text-[14px]">help_outline</span>
        בנקים וחברות אשראי נתמכים
      </summary>
      <div className="grid grid-cols-1 gap-3 border-t p-4 md:grid-cols-2" style={{ borderColor: "#E5E7EB" }}>
        <div>
          <div className="mb-2 flex items-center gap-2 text-[11px] font-extrabold text-verdant-ink">
            <span className="material-symbols-outlined text-[14px] text-verdant-emerald">
              account_balance
            </span>
            בנקים
          </div>
          <div className="flex flex-wrap gap-1.5">
            {["הפועלים", "לאומי", "דיסקונט", "מזרחי-טפחות", "הבינלאומי"].map((b) => (
              <span
                key={b}
                className="rounded-md px-2 py-0.5 text-[10px] font-bold"
                style={{ background: "#FAFAF7", color: "#2C7A5A" }}
              >
                {b}
              </span>
            ))}
          </div>
        </div>
        <div>
          <div className="mb-2 flex items-center gap-2 text-[11px] font-extrabold text-verdant-ink">
            <span className="material-symbols-outlined text-[14px] text-verdant-emerald">
              credit_card
            </span>
            חברות אשראי
          </div>
          <div className="flex flex-wrap gap-1.5">
            {["ישראכרט", "כאל", "מקס", "ויזה", "אמריקן אקספרס"].map((c) => (
              <span
                key={c}
                className="rounded-md px-2 py-0.5 text-[10px] font-bold"
                style={{ background: "#FAFAF7", color: "#2C7A5A" }}
              >
                {c}
              </span>
            ))}
          </div>
        </div>
      </div>
    </details>
  );
}
