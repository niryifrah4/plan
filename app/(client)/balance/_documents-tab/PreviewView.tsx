"use client";

/**
 * Preview / review phase of the document mapping flow.
 *
 * Lays out:
 *   • Header card — bank icon + filename + 3 KPIs + mapping progress bar
 *   • Info strip — warnings + dedup count + reconciliation status (when relevant)
 *   • "לבדיקה" zone — unmapped / low-confidence transactions awaiting category pick
 *   • "מופה" zone — mapped transactions grouped by category (accordion)
 *   • Action bar — cancel / save buttons, plus a "+ קובץ" append control in header
 *
 * State stays in the parent (DocumentsTab) — this view is pure presentation.
 */

import { useRef, useState } from "react";
import type { ParsedDocument, ParsedTransaction } from "@/lib/doc-parser/types";
import { CAT_OPTIONS } from "@/lib/documents-categories";
import { groupOptionsByParent } from "@/lib/doc-parser/category-tree";
import { getMerchantKey } from "@/lib/doc-parser/merchant-category-rules";
import { fmtILS } from "@/lib/format";
import { MoneyText } from "@/components/ui/MoneyText";
import { getBankIcon } from "./banks";
import { MiniKPI } from "./MiniKPI";

type TxWithIdx = ParsedTransaction & { _idx: number };
type AutoHiddenRow = { idx: number; description: string; amount: number; date: string };

export function PreviewView({
  doc,
  effectiveTx,
  toReview,
  mapped,
  mappedGroups,
  deletedIndicesSize,
  overrideCount,
  duplicatesRemoved,
  autoHiddenCount,
  autoHiddenRows,
  expandedMappedCats,
  businessEnabled,
  onAppendFiles,
  onCategoryChange,
  onDelete,
  onToggleBusiness,
  onMarkSubscription,
  onMarkHidden,
  onIncludeHiddenRow,
  onMakeHiddenMerchantVisible,
  onToggleMappedCat,
  onCancel,
  onSave,
}: {
  doc: ParsedDocument;
  effectiveTx: TxWithIdx[];
  toReview: TxWithIdx[];
  mapped: TxWithIdx[];
  mappedGroups: Record<string, TxWithIdx[]>;
  deletedIndicesSize: number;
  overrideCount: number;
  duplicatesRemoved: number;
  autoHiddenCount: number;
  autoHiddenRows: AutoHiddenRow[];
  expandedMappedCats: Set<string>;
  businessEnabled: boolean;
  onAppendFiles: (files: File[]) => void;
  onCategoryChange: (idx: number, newKey: string) => void;
  onDelete: (idx: number) => void;
  onToggleBusiness: (idx: number) => void;
  onMarkSubscription: (idx: number) => void;
  onMarkHidden: (idx: number, applyToFile: boolean) => void;
  onIncludeHiddenRow: (idx: number) => void;
  onMakeHiddenMerchantVisible: (idx: number) => void;
  onToggleMappedCat: (key: string) => void;
  onCancel: () => void;
  onSave: () => void;
}) {
  const appendInputRef = useRef<HTMLInputElement>(null);
  // Pending "hide this business" confirmation — when set, the RTL modal asks
  // whether to also drop the merchant's other rows in this same file.
  const [hideConfirm, setHideConfirm] = useState<TxWithIdx | null>(null);
  const [showAutoHidden, setShowAutoHidden] = useState(false);
  const requestHide = (tx: TxWithIdx) => setHideConfirm(tx);
  const sameMerchantCount = hideConfirm
    ? effectiveTx.filter(
        (t) =>
          t._idx !== hideConfirm._idx &&
          getMerchantKey(t.description || "") === getMerchantKey(hideConfirm.description || "")
      ).length
    : 0;
  const bankHint = doc.bankHint || "לא זוהה";
  const bankIcon = getBankIcon(bankHint);
  const allMapped = toReview.length === 0;
  const reviewPct =
    effectiveTx.length > 0 ? Math.round((mapped.length / effectiveTx.length) * 100) : 100;
  const netCharges = effectiveTx.reduce((s, t) => s + t.amount, 0);

  const handleAppendChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []).filter((f) => f.size > 0);
    if (files.length > 0) onAppendFiles(files);
    e.target.value = "";
  };

  return (
    <div className="mt-2 space-y-3">
      {/* ── Header card: file + 3 KPIs + progress ── */}
      <div
        className="rounded-2xl p-5"
        style={{ background: "#FFFFFF", boxShadow: "0 1px 4px rgba(0,0,0,0.04)" }}
      >
        <div className="mb-4 flex items-center justify-between">
          <div className="flex min-w-0 items-center gap-3">
            <div
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl"
              style={{ background: bankIcon.color + "14" }}
            >
              <span
                className="material-symbols-outlined text-[20px]"
                style={{ color: bankIcon.color }}
              >
                {bankIcon.icon}
              </span>
            </div>
            <div className="min-w-0">
              <h2
                className="truncate text-base font-extrabold text-verdant-ink"
                style={{ fontFamily: "inherit" }}
              >
                {doc.filename}
              </h2>
              <div className="text-[11px] font-bold text-verdant-muted">{bankHint}</div>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <input
              ref={appendInputRef}
              type="file"
              className="hidden"
              accept=".pdf,.xlsx,.xls,.csv"
              multiple
              onChange={handleAppendChange}
            />
            <button
              onClick={() => appendInputRef.current?.click()}
              className="flex items-center gap-1 rounded-lg px-3 py-2 text-xs font-extrabold transition-colors hover:opacity-90"
              style={{ background: "#2C7A5A", color: "#FFFFFF" }}
              title="הוסף קובץ לסקירה הזאת — יתמזג עם דה-דופ"
            >
              <span className="material-symbols-outlined text-[14px]">add</span>קובץ
            </button>
            <button
              onClick={onCancel}
              className="rounded-lg px-2.5 py-2 text-xs font-bold text-verdant-muted transition-colors hover:bg-verdant-bg hover:text-verdant-ink"
              title="התחל מחדש"
            >
              <span className="material-symbols-outlined text-[16px]">refresh</span>
            </button>
          </div>
        </div>
        {/* 3 KPIs */}
        <div className="mb-3 grid grid-cols-3 gap-3">
          <MiniKPI
            label="תנועות"
            value={`${effectiveTx.length}${deletedIndicesSize > 0 ? ` (-${deletedIndicesSize})` : ""}`}
          />
          <MiniKPI
            label="מצב מיפוי"
            value={
              allMapped
                ? `✓ ${mapped.length} מופו`
                : `${toReview.length} לבדיקה · ${mapped.length} מופו`
            }
            color={allMapped ? "#2C7A5A" : "#B45309"}
          />
          <MiniKPI
            label="חיובים נטו"
            value={fmtILS(netCharges, { signed: true })}
            color={netCharges >= 0 ? "#DC2626" : "#2C7A5A"}
          />
        </div>
        {/* Progress bar */}
        <div className="h-1.5 overflow-hidden rounded-full" style={{ background: "#FAFAF7" }}>
          <div
            className="h-full transition-all"
            style={{ width: `${reviewPct}%`, background: allMapped ? "#2C7A5A" : "#B45309" }}
          />
        </div>
      </div>

      {/* ── Compact info strip: warnings + dedup + reconciliation ── */}
      {(doc.warnings.length > 0 ||
        duplicatesRemoved > 0 ||
        autoHiddenCount > 0 ||
        (doc.reconciliation && doc.reconciliation.severity !== "skipped")) && (
        <div
          className="flex flex-wrap items-start gap-2 rounded-xl px-4 py-2 text-[11px] font-bold"
          style={{ background: "#FFFFFF", color: "#5a6b52" }}
        >
          {autoHiddenCount > 0 && (
            <button
              type="button"
              onClick={() => setShowAutoHidden(true)}
              className="flex items-center gap-1 rounded-full px-2 py-1 transition hover:bg-red-50"
              style={{ color: "#DC2626" }}
              title="הצג עסקאות שהוסתרו בגלל עסקים מוסתרים"
            >
              <span className="material-symbols-outlined text-[13px]">visibility_off</span>
              {autoHiddenCount} עסקאות הוסתרו (עסקים מוסתרים)
            </button>
          )}
          {duplicatesRemoved > 0 && (
            <span className="flex items-center gap-1">
              <span className="material-symbols-outlined text-[13px]">merge</span>
              {duplicatesRemoved} כפילויות הוסרו
            </span>
          )}
          {doc.reconciliation && doc.reconciliation.severity !== "skipped" && (
            <span className="flex items-center gap-1">
              <span style={{ color: "#9CA3AF" }}>·</span>
              <span
                className="material-symbols-outlined text-[13px]"
                style={{
                  color:
                    doc.reconciliation.severity === "clean"
                      ? "#2C7A5A"
                      : doc.reconciliation.severity === "minor"
                        ? "#B45309"
                        : "#DC2626",
                }}
              >
                {doc.reconciliation.severity === "clean" ? "verified" : "info"}
              </span>
              {doc.reconciliation.message}
            </span>
          )}
          {doc.warnings.map((w, i) => (
            <span key={i} className="flex items-center gap-1">
              <span style={{ color: "#9CA3AF" }}>·</span>
              <span className="material-symbols-outlined text-[13px]" style={{ color: "#B45309" }}>
                info
              </span>
              {w}
            </span>
          ))}
        </div>
      )}

      {toReview.length > 0 && (
        <ReviewZone
          rows={toReview}
          businessEnabled={businessEnabled}
          onCategoryChange={onCategoryChange}
          onDelete={onDelete}
          onToggleBusiness={onToggleBusiness}
          onMarkSubscription={onMarkSubscription}
          onRequestHide={requestHide}
        />
      )}

      {mapped.length > 0 && (
        <MappedZone
          mappedCount={mapped.length}
          mappedGroups={mappedGroups}
          expanded={expandedMappedCats}
          businessEnabled={businessEnabled}
          onToggle={onToggleMappedCat}
          onCategoryChange={onCategoryChange}
          onDelete={onDelete}
          onToggleBusiness={onToggleBusiness}
          onMarkSubscription={onMarkSubscription}
          onRequestHide={requestHide}
        />
      )}

      <ActionBar
        toReviewLength={toReview.length}
        overrideCount={overrideCount}
        allMapped={allMapped}
        onCancel={onCancel}
        onSave={onSave}
      />

      {hideConfirm && (
        <HideMerchantModal
          tx={hideConfirm}
          sameMerchantCount={sameMerchantCount}
          onClose={() => setHideConfirm(null)}
          onConfirm={(applyToFile) => {
            onMarkHidden(hideConfirm._idx, applyToFile);
            setHideConfirm(null);
          }}
        />
      )}

      {showAutoHidden && (
        <AutoHiddenTransactionsModal
          rows={autoHiddenRows}
          onClose={() => setShowAutoHidden(false)}
          onIncludeRow={(idx) => {
            onIncludeHiddenRow(idx);
            if (autoHiddenRows.length <= 1) setShowAutoHidden(false);
          }}
          onMakeMerchantVisible={(idx) => {
            onMakeHiddenMerchantVisible(idx);
            if (autoHiddenRows.length <= 1) setShowAutoHidden(false);
          }}
        />
      )}
    </div>
  );
}

/* Per-row quick actions: mark as subscription, hide this business.
   Shared by both the "לבדיקה" and "מופה" rows. */
function RowActions({
  tx,
  onMarkSubscription,
  onRequestHide,
}: {
  tx: TxWithIdx;
  onMarkSubscription: (idx: number) => void;
  onRequestHide: (tx: TxWithIdx) => void;
}) {
  return (
    <div className="flex items-center justify-center gap-1">
      <button
        onClick={() => onMarkSubscription(tx._idx)}
        title="סמן כמנוי — ייכנס למסלול המנויים הרגיל"
        className="flex h-7 w-7 items-center justify-center rounded-md border transition-all hover:bg-verdant-bg"
        style={{ borderColor: "#E5E7EB", color: "#7C3AED" }}
      >
        <span className="material-symbols-outlined text-[15px]">autorenew</span>
      </button>
      <button
        onClick={() => onRequestHide(tx)}
        title="סמן כעסק להסתרה — לא ייכלל בתזרים"
        className="flex h-7 w-7 items-center justify-center rounded-md border transition-all hover:bg-red-50"
        style={{ borderColor: "#E5E7EB", color: "#DC2626" }}
      >
        <span className="material-symbols-outlined text-[15px]">visibility_off</span>
      </button>
    </div>
  );
}

/* ─────────── HIDE-MERCHANT CONFIRM MODAL (RTL) ─────────── */

function HideMerchantModal({
  tx,
  sameMerchantCount,
  onClose,
  onConfirm,
}: {
  tx: TxWithIdx;
  sameMerchantCount: number;
  onClose: () => void;
  onConfirm: (applyToFile: boolean) => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(10,25,41,0.55)" }}
      onClick={onClose}
      dir="rtl"
      role="presentation"
    >
      <div
        className="w-full max-w-md overflow-hidden rounded-2xl text-right"
        style={{ background: "#FFFFFF", boxShadow: "0 24px 60px rgba(10,25,41,0.22)" }}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="הסתרת בית עסק"
        dir="rtl"
      >
        <div className="flex items-start gap-3 border-b px-5 py-4" style={{ borderColor: "#FAFAF7" }}>
          <span
            className="material-symbols-outlined mt-0.5 text-[22px]"
            style={{ color: "#DC2626" }}
          >
            visibility_off
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="text-base font-extrabold text-verdant-ink">הסתרת בית עסק</h2>
            <div className="mt-1 truncate text-[12px] font-bold text-verdant-muted">
              {tx.description}
            </div>
          </div>
        </div>

        <div className="px-5 py-4 text-[13px] font-bold text-verdant-ink">
          בית העסק הזה יוסתר גם מהעלאות עתידיות.
          {sameMerchantCount > 0 ? (
            <span>
              {" "}
              נמצאו עוד {sameMerchantCount} עסקאות של אותו בית עסק בקובץ הזה. להחיל גם עליהן?
            </span>
          ) : (
            <span> איך להחיל זאת על הקובץ הנוכחי?</span>
          )}
        </div>

        <div className="flex flex-col gap-2 px-5 pb-5">
          <button
            type="button"
            onClick={() => onConfirm(true)}
            className="flex items-center justify-between rounded-xl px-4 py-3 text-[13px] font-extrabold text-white transition hover:opacity-95"
            style={{ background: "#DC2626" }}
          >
            <span>
              {sameMerchantCount > 0
                ? `החל על כל העסקאות בקובץ (${sameMerchantCount + 1})`
                : "הסתר מהקובץ ומעתיד"}
            </span>
            <span className="material-symbols-outlined text-[18px]">done_all</span>
          </button>
          <button
            type="button"
            onClick={() => onConfirm(false)}
            className="flex items-center justify-between rounded-xl border px-4 py-3 text-[13px] font-extrabold transition hover:bg-verdant-bg"
            style={{ borderColor: "#E5E7EB", color: "#374151" }}
          >
            <span>רק העסקה הזו (השאר רק לעתיד)</span>
            <span className="material-symbols-outlined text-[18px]">filter_1</span>
          </button>
          <button
            type="button"
            onClick={onClose}
            className="mt-1 rounded-xl px-4 py-2 text-[12px] font-bold text-verdant-muted transition hover:bg-verdant-bg"
          >
            ביטול
          </button>
        </div>
      </div>
    </div>
  );
}

/* ─────────── HIDDEN TRANSACTIONS MODAL (RTL) ─────────── */

function AutoHiddenTransactionsModal({
  rows,
  onClose,
  onIncludeRow,
  onMakeMerchantVisible,
}: {
  rows: AutoHiddenRow[];
  onClose: () => void;
  onIncludeRow: (idx: number) => void;
  onMakeMerchantVisible: (idx: number) => void;
}) {
  const total = rows.reduce((sum, row) => sum + row.amount, 0);
  const [confirmAction, setConfirmAction] = useState<{
    type: "include-row" | "make-visible";
    row: AutoHiddenRow;
  } | null>(null);

  const confirmTitle =
    confirmAction?.type === "include-row"
      ? "להכניס את העסקה לתזרים?"
      : "להפסיק להסתיר את בית העסק עבורך?";
  const confirmIcon = confirmAction?.type === "include-row" ? "undo" : "visibility";
  const confirmColor = confirmAction?.type === "include-row" ? "#2C7A5A" : "#DC2626";
  const confirmBody =
    confirmAction?.type === "include-row"
      ? "העסקה הספציפית הזאת תחזור לתצוגה המקדימה ותישמר בתזרים אם תאשר את הקובץ. ההגדרה שבית העסק מוסתר לא תשתנה, ולכן עסקאות עתידיות של אותו בית עסק עדיין יוסתרו אוטומטית."
      : "בית העסק יסומן כלא מוסתר עבור הלקוח הזה. כל העסקאות שלו בקובץ הנוכחי יחזרו לתצוגה המקדימה, ובהעלאות עתידיות הוא לא יוסתר עבור הלקוח הזה גם אם הוא נשאר מוסתר בקטלוג המערכתי.";

  const applyConfirmAction = () => {
    if (!confirmAction) return;
    if (confirmAction.type === "include-row") onIncludeRow(confirmAction.row.idx);
    else onMakeMerchantVisible(confirmAction.row.idx);
    setConfirmAction(null);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(10,25,41,0.55)" }}
      onClick={onClose}
      dir="rtl"
      role="presentation"
    >
      <div
        className="flex max-h-[86vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl text-right"
        style={{ background: "#FFFFFF", boxShadow: "0 24px 60px rgba(10,25,41,0.22)" }}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="עסקאות שהוסתרו"
        dir="rtl"
      >
        <div className="flex items-start justify-between gap-4 border-b px-5 py-4" style={{ borderColor: "#FAFAF7" }}>
          <div className="flex min-w-0 items-start gap-3">
            <span className="material-symbols-outlined mt-0.5 text-[22px]" style={{ color: "#DC2626" }}>
              visibility_off
            </span>
            <div className="min-w-0">
              <h2 className="text-base font-extrabold text-verdant-ink">עסקאות שהוסתרו</h2>
              <div className="mt-1 text-[12px] font-bold text-verdant-muted">
                {rows.length} עסקאות · סה״כ {fmtILS(Math.abs(total), { signed: false })}
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-verdant-muted transition hover:bg-verdant-bg"
            title="סגור"
          >
            <span className="material-symbols-outlined text-[18px]">close</span>
          </button>
        </div>

        <div className="overflow-y-auto px-5 py-3">
          {rows.length === 0 ? (
            <div className="rounded-xl border border-dashed border-verdant-line p-4 text-[13px] font-bold text-verdant-muted">
              אין עסקאות מוסתרות להצגה.
            </div>
          ) : (
            <div className="divide-y divide-verdant-line overflow-hidden rounded-xl border border-verdant-line">
              {rows.map((row) => (
                <div
                  key={row.idx}
                  className="grid grid-cols-[92px_minmax(0,1fr)_110px_auto] items-center gap-3 bg-white px-3 py-2 text-[12px]"
                >
                  <div className="tabular font-bold text-verdant-muted" dir="ltr">
                    {row.date}
                  </div>
                  <div className="min-w-0">
                    <div className="truncate font-extrabold text-verdant-ink">{row.description}</div>
                    <div className="text-[10px] font-bold text-verdant-muted">
                      ההחרגה כאן לא משנה את קטלוג ברירת המחדל
                    </div>
                  </div>
                  <div
                    className="tabular text-left font-extrabold"
                    style={{ color: row.amount > 0 ? "#DC2626" : "#2C7A5A" }}
                  >
                    <MoneyText className="text-xs font-extrabold">
                      {row.amount > 0 ? "-" : "+"}
                      {fmtILS(Math.abs(row.amount))}
                    </MoneyText>
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => setConfirmAction({ type: "include-row", row })}
                      className="rounded-lg border px-2 py-1.5 text-[11px] font-extrabold transition hover:bg-verdant-bg"
                      style={{ borderColor: "#E5E7EB", color: "#2C7A5A" }}
                      title="הכנס רק את העסקה הזאת לתזרים"
                    >
                      הכנס שורה
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmAction({ type: "make-visible", row })}
                      className="rounded-lg border px-2 py-1.5 text-[11px] font-extrabold transition hover:bg-red-50"
                      style={{ borderColor: "#FCA5A5", color: "#DC2626" }}
                      title="בית העסק לא מוסתר עבור הלקוח הזה"
                    >
                      לא מוסתר עבורי
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {confirmAction && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center p-4"
          style={{ background: "rgba(10,25,41,0.45)" }}
          onClick={() => setConfirmAction(null)}
          dir="rtl"
          role="presentation"
        >
          <div
            className="w-full max-w-md overflow-hidden rounded-2xl bg-white text-right"
            style={{ boxShadow: "0 24px 60px rgba(10,25,41,0.22)" }}
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-label={confirmTitle}
            dir="rtl"
          >
            <div className="flex items-start gap-3 border-b px-5 py-4" style={{ borderColor: "#FAFAF7" }}>
              <span className="material-symbols-outlined mt-0.5 text-[22px]" style={{ color: confirmColor }}>
                {confirmIcon}
              </span>
              <div className="min-w-0 flex-1">
                <h3 className="text-base font-extrabold text-verdant-ink">{confirmTitle}</h3>
                <div className="mt-1 truncate text-[12px] font-bold text-verdant-muted">
                  {confirmAction.row.description}
                </div>
              </div>
            </div>

            <div className="space-y-3 px-5 py-4 text-[13px] font-bold leading-6 text-verdant-ink">
              <p>{confirmBody}</p>
              <div className="flex items-center justify-between rounded-xl bg-verdant-bg px-3 py-2">
                <span className="tabular text-[12px] text-verdant-muted" dir="ltr">
                  {confirmAction.row.date}
                </span>
                <MoneyText className="text-xs font-extrabold">
                  {confirmAction.row.amount > 0 ? "-" : "+"}
                  {fmtILS(Math.abs(confirmAction.row.amount))}
                </MoneyText>
              </div>
            </div>

            <div className="flex flex-col gap-2 px-5 pb-5">
              <button
                type="button"
                onClick={applyConfirmAction}
                className="flex items-center justify-between rounded-xl px-4 py-3 text-[13px] font-extrabold text-white transition hover:opacity-95"
                style={{ background: confirmColor }}
              >
                <span>
                  {confirmAction.type === "include-row"
                    ? "כן, הכנס את העסקה"
                    : "כן, בית העסק לא מוסתר עבורי"}
                </span>
                <span className="material-symbols-outlined text-[18px]">check</span>
              </button>
              <button
                type="button"
                onClick={() => setConfirmAction(null)}
                className="rounded-xl px-4 py-2 text-[12px] font-bold text-verdant-muted transition hover:bg-verdant-bg"
              >
                ביטול
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ─────────── REVIEW ZONE — לבדיקה (unmapped + low-confidence) ─────────── */

function ReviewZone({
  rows,
  businessEnabled,
  onCategoryChange,
  onDelete,
  onToggleBusiness,
  onMarkSubscription,
  onRequestHide,
}: {
  rows: TxWithIdx[];
  businessEnabled: boolean;
  onCategoryChange: (idx: number, key: string) => void;
  onDelete: (idx: number) => void;
  onToggleBusiness: (idx: number) => void;
  onMarkSubscription: (idx: number) => void;
  onRequestHide: (tx: TxWithIdx) => void;
}) {
  return (
    <div
      className="overflow-hidden rounded-2xl"
      style={{
        background: "#FFFFFF",
        boxShadow: "0 1px 4px rgba(0,0,0,0.04)",
        borderRight: "3px solid #B45309",
      }}
    >
      <div
        className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-3 md:px-5"
        style={{ borderColor: "#FAFAF7" }}
      >
        <div className="flex items-center gap-2">
          <span className="material-symbols-outlined text-[18px]" style={{ color: "#B45309" }}>
            help_outline
          </span>
          <h3
            className="text-sm font-extrabold text-verdant-ink"
            style={{ fontFamily: "inherit" }}
          >
            לבדיקה · {rows.length} תנועות
          </h3>
        </div>
        <span className="text-[10px] font-bold text-verdant-muted">
          בחר קטגוריה · המערכת תלמד
        </span>
      </div>
      <div className="divide-y md:hidden" style={{ borderColor: "#FAFAF7" }}>
        {rows.map((t) => (
          <MobileTransactionRow
            key={t._idx}
            tx={t}
            businessEnabled={businessEnabled}
            searchDescription
            categoryStyle={{
              borderColor: "#fcd9a8",
              background: "rgba(217,119,6,0.08)",
              color: "#2C7A5A",
            }}
            onCategoryChange={onCategoryChange}
            onDelete={onDelete}
            onToggleBusiness={onToggleBusiness}
            onMarkSubscription={onMarkSubscription}
            onRequestHide={onRequestHide}
          />
        ))}
      </div>
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full text-sm">
          <tbody>
            {rows.map((t) => (
              <ReviewRow
                key={t._idx}
                tx={t}
                businessEnabled={businessEnabled}
                onCategoryChange={onCategoryChange}
                onDelete={onDelete}
                onToggleBusiness={onToggleBusiness}
                onMarkSubscription={onMarkSubscription}
                onRequestHide={onRequestHide}
              />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ReviewRow({
  tx,
  businessEnabled,
  onCategoryChange,
  onDelete,
  onToggleBusiness,
  onMarkSubscription,
  onRequestHide,
}: {
  tx: TxWithIdx;
  businessEnabled: boolean;
  onCategoryChange: (idx: number, key: string) => void;
  onDelete: (idx: number) => void;
  onToggleBusiness: (idx: number) => void;
  onMarkSubscription: (idx: number) => void;
  onRequestHide: (tx: TxWithIdx) => void;
}) {
  const isBiz = tx.scope === "business";
  return (
    <tr
      className="group border-b transition-colors hover:bg-verdant-bg/30"
      style={{ borderColor: "#FAFAF7" }}
    >
      <td className="tabular w-20 px-5 py-2 text-xs font-bold text-verdant-ink" dir="ltr">
        {tx.date}
      </td>
      <td className="max-w-[220px] px-3 py-2 text-xs font-bold text-verdant-ink">
        <a
          href={`https://www.google.com/search?q=${encodeURIComponent(tx.description + " ישראל")}`}
          target="_blank"
          rel="noopener noreferrer"
          className="group/link inline-flex items-center gap-1 truncate hover:text-verdant-emerald hover:underline"
          title="חפש בגוגל כדי לזהות את בית העסק"
          onClick={(e) => e.stopPropagation()}
        >
          <span className="truncate">{tx.description}</span>
          <span
            className="material-symbols-outlined flex-shrink-0 text-[11px] opacity-0 transition-opacity group-hover/link:opacity-100"
            style={{ color: "#B45309" }}
          >
            open_in_new
          </span>
        </a>
      </td>
      <td className="w-44 px-3 py-1.5">
        <select
          value={tx.category}
          onChange={(e) => onCategoryChange(tx._idx, e.target.value)}
          className="w-full cursor-pointer rounded-lg border px-2 py-1.5 text-[11px] font-bold outline-none transition-all focus:ring-2"
          style={{
            borderColor: "#fcd9a8",
            background: "rgba(217,119,6,0.08)",
            color: "#2C7A5A",
          }}
        >
          {groupOptionsByParent(CAT_OPTIONS).map((group) => (
            <optgroup key={group.parent.key} label={group.parent.label}>
              {group.options.map((o) => (
                <option key={o.key} value={o.key}>
                  {o.label}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
      </td>
      {businessEnabled && (
        <td className="w-20 px-2 py-1.5 text-center">
          <button
            onClick={() => onToggleBusiness(tx._idx)}
            title={isBiz ? "עסקי — לחץ להחזרה לפרטי" : "סמן כהוצאה עסקית"}
            className="rounded-lg border px-2 py-1.5 text-[10px] font-extrabold transition-all"
            style={
              isBiz
                ? { borderColor: "#2C7A5A", background: "#FAFAF7", color: "#2C7A5A" }
                : { borderColor: "#e5e7eb", background: "#FFFFFF", color: "#9ca3af" }
            }
          >
            {isBiz ? "עסקי" : "פרטי"}
          </button>
        </td>
      )}
      <td
        className="tabular w-24 px-3 py-2 text-left text-xs font-extrabold"
        style={{ color: tx.amount > 0 ? "#DC2626" : "#2C7A5A" }}
      >
        <MoneyText className="text-xs font-extrabold">
          {tx.amount > 0 ? "-" : "+"}
          {fmtILS(Math.abs(tx.amount))}
        </MoneyText>
      </td>
      <td className="px-2 py-1.5">
        <RowActions
          tx={tx}
          onMarkSubscription={onMarkSubscription}
          onRequestHide={onRequestHide}
        />
      </td>
      <td className="w-10 px-3 py-2 text-center">
        <button
          onClick={() => onDelete(tx._idx)}
          className="rounded-md p-1 opacity-0 transition-opacity hover:bg-red-50 group-hover:opacity-100"
          title="מחק"
        >
          <span className="material-symbols-outlined text-[14px]" style={{ color: "#DC2626" }}>
            delete_outline
          </span>
        </button>
      </td>
    </tr>
  );
}

/* ─────────── MAPPED ZONE — מופה (grouped by category) ─────────── */

function MappedZone({
  mappedCount,
  mappedGroups,
  expanded,
  businessEnabled,
  onToggle,
  onCategoryChange,
  onDelete,
  onToggleBusiness,
  onMarkSubscription,
  onRequestHide,
}: {
  mappedCount: number;
  mappedGroups: Record<string, TxWithIdx[]>;
  expanded: Set<string>;
  businessEnabled: boolean;
  onToggle: (key: string) => void;
  onCategoryChange: (idx: number, key: string) => void;
  onDelete: (idx: number) => void;
  onToggleBusiness: (idx: number) => void;
  onMarkSubscription: (idx: number) => void;
  onRequestHide: (tx: TxWithIdx) => void;
}) {
  const sortedGroups = Object.entries(mappedGroups).sort((a, b) => {
    const totalA = a[1].reduce((s, t) => s + Math.abs(t.amount), 0);
    const totalB = b[1].reduce((s, t) => s + Math.abs(t.amount), 0);
    return totalB - totalA;
  });

  return (
    <div
      className="overflow-hidden rounded-2xl"
      style={{
        background: "#FFFFFF",
        boxShadow: "0 1px 4px rgba(0,0,0,0.04)",
        borderRight: "3px solid #2C7A5A",
      }}
    >
      <div
        className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-3 md:px-5"
        style={{ borderColor: "#FAFAF7" }}
      >
        <div className="flex items-center gap-2">
          <span className="material-symbols-outlined text-[18px]" style={{ color: "#2C7A5A" }}>
            check_circle
          </span>
          <h3
            className="text-sm font-extrabold text-verdant-ink"
            style={{ fontFamily: "inherit" }}
          >
            מופה · {mappedCount} תנועות
          </h3>
        </div>
        <span className="text-[10px] font-bold text-verdant-muted">מקובץ לפי קטגוריה</span>
      </div>
      <div className="divide-y" style={{ borderColor: "#FAFAF7" }}>
        {sortedGroups.map(([catKey, txs]) => {
          const catLabel = CAT_OPTIONS.find((c) => c.key === catKey)?.label || catKey;
          const total = txs.reduce((s, t) => s + Math.abs(t.amount), 0);
          const isExpanded = expanded.has(catKey);
          return (
            <div key={catKey}>
              <button
                onClick={() => onToggle(catKey)}
                className="flex w-full items-center justify-between gap-3 px-4 py-3 text-right transition-colors hover:bg-verdant-bg/30 md:px-5"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <div className="h-2 w-2 rounded-full" style={{ background: "#2C7A5A" }} />
                  <span
                    className="truncate text-sm font-extrabold text-verdant-ink"
                    style={{ fontFamily: "inherit" }}
                  >
                    {catLabel}
                  </span>
                  <span
                    className="rounded-full px-2 py-0.5 text-[10px] font-bold"
                    style={{ background: "#FAFAF7", color: "#2C7A5A" }}
                  >
                    {txs.length}
                  </span>
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  <span className="tabular text-sm font-extrabold text-verdant-ink">
                    {fmtILS(total)}
                  </span>
                  <span
                    className="material-symbols-outlined text-[16px] text-verdant-muted transition-transform"
                    style={{ transform: isExpanded ? "rotate(180deg)" : "rotate(0)" }}
                  >
                    expand_more
                  </span>
                </div>
              </button>
              {isExpanded && (
                <div className="border-t" style={{ borderColor: "#FAFAF7" }}>
                  <div className="divide-y md:hidden" style={{ borderColor: "#FAFAF7" }}>
                    {txs.map((t) => (
                      <MobileTransactionRow
                        key={t._idx}
                        tx={t}
                        businessEnabled={businessEnabled}
                        onCategoryChange={onCategoryChange}
                        onDelete={onDelete}
                        onToggleBusiness={onToggleBusiness}
                        onMarkSubscription={onMarkSubscription}
                        onRequestHide={onRequestHide}
                      />
                    ))}
                  </div>
                  <table className="hidden w-full text-sm md:table">
                    <tbody>
                      {txs.map((t) => (
                        <MappedRow
                          key={t._idx}
                          tx={t}
                          businessEnabled={businessEnabled}
                          onCategoryChange={onCategoryChange}
                          onDelete={onDelete}
                          onToggleBusiness={onToggleBusiness}
                          onMarkSubscription={onMarkSubscription}
                          onRequestHide={onRequestHide}
                        />
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
  );
}

function MobileTransactionRow({
  tx,
  businessEnabled,
  searchDescription = false,
  categoryStyle = { borderColor: "#E5E7EB", background: "#FFFFFF", color: "#2C7A5A" },
  onCategoryChange,
  onDelete,
  onToggleBusiness,
  onMarkSubscription,
  onRequestHide,
}: {
  tx: TxWithIdx;
  businessEnabled: boolean;
  searchDescription?: boolean;
  categoryStyle?: React.CSSProperties;
  onCategoryChange: (idx: number, key: string) => void;
  onDelete: (idx: number) => void;
  onToggleBusiness: (idx: number) => void;
  onMarkSubscription: (idx: number) => void;
  onRequestHide: (tx: TxWithIdx) => void;
}) {
  const isBiz = tx.scope === "business";
  const description = searchDescription ? (
    <a
      href={`https://www.google.com/search?q=${encodeURIComponent(tx.description + " ישראל")}`}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex min-w-0 items-center gap-1 hover:text-verdant-emerald hover:underline"
      title="חפש בגוגל כדי לזהות את בית העסק"
      onClick={(e) => e.stopPropagation()}
    >
      <span className="truncate">{tx.description}</span>
      <span
        className="material-symbols-outlined shrink-0 text-[12px]"
        style={{ color: "#B45309" }}
      >
        open_in_new
      </span>
    </a>
  ) : (
    <span className="truncate">{tx.description}</span>
  );

  return (
    <div className="bg-white px-4 py-3">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="min-w-0 text-sm font-extrabold text-verdant-ink">{description}</div>
          <div className="tabular mt-1 text-[11px] font-bold text-verdant-muted" dir="ltr">
            {tx.date}
          </div>
        </div>
        <MoneyText
          className="tabular shrink-0 text-left text-sm font-extrabold"
          style={{ color: tx.amount > 0 ? "#DC2626" : "#2C7A5A" }}
        >
          {tx.amount > 0 ? "-" : "+"}
          {fmtILS(Math.abs(tx.amount))}
        </MoneyText>
      </div>

      <select
        value={tx.category}
        onChange={(e) => onCategoryChange(tx._idx, e.target.value)}
        className="w-full cursor-pointer rounded-lg border px-3 py-2 text-[12px] font-bold outline-none transition-all focus:ring-2 focus:ring-verdant-accent/30"
        style={categoryStyle}
      >
        {groupOptionsByParent(CAT_OPTIONS).map((group) => (
          <optgroup key={group.parent.key} label={group.parent.label}>
            {group.options.map((o) => (
              <option key={o.key} value={o.key}>
                {o.label}
              </option>
            ))}
          </optgroup>
        ))}
      </select>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          {businessEnabled && (
            <button
              onClick={() => onToggleBusiness(tx._idx)}
              title={isBiz ? "עסקי — לחץ להחזרה לפרטי" : "סמן כהוצאה עסקית"}
              className="rounded-lg border px-3 py-2 text-[11px] font-extrabold transition-all"
              style={
                isBiz
                  ? { borderColor: "#2C7A5A", background: "#FAFAF7", color: "#2C7A5A" }
                  : { borderColor: "#e5e7eb", background: "#FFFFFF", color: "#9ca3af" }
              }
            >
              {isBiz ? "עסקי" : "פרטי"}
            </button>
          )}
          <RowActions
            tx={tx}
            onMarkSubscription={onMarkSubscription}
            onRequestHide={onRequestHide}
          />
        </div>
        <button
          onClick={() => onDelete(tx._idx)}
          className="flex h-9 w-9 items-center justify-center rounded-lg transition-colors hover:bg-red-50"
          title="מחק"
        >
          <span className="material-symbols-outlined text-[16px]" style={{ color: "#DC2626" }}>
            delete_outline
          </span>
        </button>
      </div>
    </div>
  );
}

function MappedRow({
  tx,
  businessEnabled,
  onCategoryChange,
  onDelete,
  onToggleBusiness,
  onMarkSubscription,
  onRequestHide,
}: {
  tx: TxWithIdx;
  businessEnabled: boolean;
  onCategoryChange: (idx: number, key: string) => void;
  onDelete: (idx: number) => void;
  onToggleBusiness: (idx: number) => void;
  onMarkSubscription: (idx: number) => void;
  onRequestHide: (tx: TxWithIdx) => void;
}) {
  const isBiz = tx.scope === "business";
  return (
    <tr
      className="group border-b transition-colors hover:bg-verdant-bg/20"
      style={{ borderColor: "#E5E7EB" }}
    >
      <td className="tabular w-20 px-5 py-2 text-xs font-bold text-verdant-ink" dir="ltr">
        {tx.date}
      </td>
      <td className="max-w-[220px] truncate px-3 py-2 text-xs font-bold text-verdant-ink">
        {tx.description}
      </td>
      <td className="w-44 px-3 py-1.5">
        <select
          value={tx.category}
          onChange={(e) => onCategoryChange(tx._idx, e.target.value)}
          className="w-full cursor-pointer rounded-lg border px-2 py-1.5 text-[11px] font-bold outline-none transition-all focus:ring-2 focus:ring-verdant-accent/30"
          style={{ borderColor: "#E5E7EB", background: "#FFFFFF", color: "#2C7A5A" }}
        >
          {groupOptionsByParent(CAT_OPTIONS).map((group) => (
            <optgroup key={group.parent.key} label={group.parent.label}>
              {group.options.map((o) => (
                <option key={o.key} value={o.key}>
                  {o.label}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
      </td>
      {businessEnabled && (
        <td className="w-20 px-2 py-1.5 text-center">
          <button
            onClick={() => onToggleBusiness(tx._idx)}
            title={isBiz ? "עסקי — לחץ להחזרה לפרטי" : "סמן כהוצאה עסקית"}
            className="rounded-lg border px-2 py-1.5 text-[10px] font-extrabold transition-all"
            style={
              isBiz
                ? { borderColor: "#2C7A5A", background: "#FAFAF7", color: "#2C7A5A" }
                : { borderColor: "#e5e7eb", background: "#FFFFFF", color: "#9ca3af" }
            }
          >
            {isBiz ? "עסקי" : "פרטי"}
          </button>
        </td>
      )}
      <td
        className="tabular w-24 px-3 py-2 text-left text-xs font-extrabold"
        style={{ color: tx.amount > 0 ? "#DC2626" : "#2C7A5A" }}
      >
        <MoneyText className="text-xs font-extrabold">
          {tx.amount > 0 ? "-" : "+"}
          {fmtILS(Math.abs(tx.amount))}
        </MoneyText>
      </td>
      <td className="px-2 py-1.5">
        <RowActions
          tx={tx}
          onMarkSubscription={onMarkSubscription}
          onRequestHide={onRequestHide}
        />
      </td>
      <td className="w-10 px-3 py-2 text-center">
        <button
          onClick={() => onDelete(tx._idx)}
          className="rounded-md p-1 opacity-0 transition-opacity hover:bg-red-50 group-hover:opacity-100"
          title="מחק"
        >
          <span className="material-symbols-outlined text-[14px]" style={{ color: "#DC2626" }}>
            delete_outline
          </span>
        </button>
      </td>
    </tr>
  );
}

/* ─────────── ACTION BAR — cancel / save ─────────── */

function ActionBar({
  toReviewLength,
  overrideCount,
  allMapped,
  onCancel,
  onSave,
}: {
  toReviewLength: number;
  overrideCount: number;
  allMapped: boolean;
  onCancel: () => void;
  onSave: () => void;
}) {
  return (
    <div className="flex items-center justify-between pt-1">
      <button
        onClick={onCancel}
        className="flex items-center gap-1.5 rounded-xl px-4 py-2.5 text-sm font-bold text-verdant-muted transition-colors hover:text-verdant-ink"
        style={{ background: "#FAFAF7" }}
      >
        <span className="material-symbols-outlined text-[16px]">close</span>בטל
      </button>
      <div className="flex items-center gap-3">
        {overrideCount > 0 && (
          <span
            className="flex items-center gap-1 text-[11px] font-bold text-verdant-muted"
            title="למידה רוחבית — בתי עסק דומים עודכנו אוטומטית"
          >
            <span className="material-symbols-outlined text-[13px]" style={{ color: "#2C7A5A" }}>
              auto_fix_high
            </span>
            {overrideCount} תיקונים
          </span>
        )}
        <button
          onClick={onSave}
          className="flex items-center gap-2 rounded-xl px-8 py-3 text-sm font-extrabold text-white transition-all hover:scale-[0.98]"
          style={{ background: "#2C7A5A", fontFamily: "inherit" }}
        >
          <span className="material-symbols-outlined text-[18px]">
            {allMapped ? "verified" : "save"}
          </span>
          {allMapped ? "אשר והעבר" : `שמור והעבר (${toReviewLength} לא מסווגות)`}
        </button>
      </div>
    </div>
  );
}
