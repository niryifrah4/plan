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

import { useRef } from "react";
import type { ParsedDocument, ParsedTransaction } from "@/lib/doc-parser/types";
import { CAT_OPTIONS } from "@/lib/documents-categories";
import { groupOptionsByParent } from "@/lib/doc-parser/category-tree";
import { fmtILS } from "@/lib/format";
import { getBankIcon } from "./banks";
import { MiniKPI } from "./MiniKPI";

type TxWithIdx = ParsedTransaction & { _idx: number };

export function PreviewView({
  doc,
  effectiveTx,
  toReview,
  mapped,
  mappedGroups,
  deletedIndicesSize,
  overrideCount,
  duplicatesRemoved,
  expandedMappedCats,
  businessEnabled,
  onAppendFiles,
  onCategoryChange,
  onDelete,
  onToggleBusiness,
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
  expandedMappedCats: Set<string>;
  businessEnabled: boolean;
  onAppendFiles: (files: File[]) => void;
  onCategoryChange: (idx: number, newKey: string) => void;
  onDelete: (idx: number) => void;
  onToggleBusiness: (idx: number) => void;
  onToggleMappedCat: (key: string) => void;
  onCancel: () => void;
  onSave: () => void;
}) {
  const appendInputRef = useRef<HTMLInputElement>(null);
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
            value={(netCharges >= 0 ? "-" : "+") + fmtILS(netCharges)}
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
        (doc.reconciliation && doc.reconciliation.severity !== "skipped")) && (
        <div
          className="flex flex-wrap items-start gap-2 rounded-xl px-4 py-2 text-[11px] font-bold"
          style={{ background: "#FFFFFF", color: "#5a6b52" }}
        >
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
        />
      )}

      <ActionBar
        toReviewLength={toReview.length}
        overrideCount={overrideCount}
        allMapped={allMapped}
        onCancel={onCancel}
        onSave={onSave}
      />
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
}: {
  rows: TxWithIdx[];
  businessEnabled: boolean;
  onCategoryChange: (idx: number, key: string) => void;
  onDelete: (idx: number) => void;
  onToggleBusiness: (idx: number) => void;
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
        className="flex items-center justify-between border-b px-5 py-3"
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
      <div className="overflow-x-auto">
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
}: {
  tx: TxWithIdx;
  businessEnabled: boolean;
  onCategoryChange: (idx: number, key: string) => void;
  onDelete: (idx: number) => void;
  onToggleBusiness: (idx: number) => void;
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
        {tx.amount > 0 ? "-" : "+"}
        {fmtILS(tx.amount)}
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
}: {
  mappedCount: number;
  mappedGroups: Record<string, TxWithIdx[]>;
  expanded: Set<string>;
  businessEnabled: boolean;
  onToggle: (key: string) => void;
  onCategoryChange: (idx: number, key: string) => void;
  onDelete: (idx: number) => void;
  onToggleBusiness: (idx: number) => void;
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
        className="flex items-center justify-between border-b px-5 py-3"
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
                className="flex w-full items-center justify-between px-5 py-3 text-right transition-colors hover:bg-verdant-bg/30"
              >
                <div className="flex items-center gap-3">
                  <div className="h-2 w-2 rounded-full" style={{ background: "#2C7A5A" }} />
                  <span
                    className="text-sm font-extrabold text-verdant-ink"
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
                <div className="flex items-center gap-3">
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
                  <table className="w-full text-sm">
                    <tbody>
                      {txs.map((t) => (
                        <MappedRow
                          key={t._idx}
                          tx={t}
                          businessEnabled={businessEnabled}
                          onCategoryChange={onCategoryChange}
                          onDelete={onDelete}
                          onToggleBusiness={onToggleBusiness}
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

function MappedRow({
  tx,
  businessEnabled,
  onCategoryChange,
  onDelete,
  onToggleBusiness,
}: {
  tx: TxWithIdx;
  businessEnabled: boolean;
  onCategoryChange: (idx: number, key: string) => void;
  onDelete: (idx: number) => void;
  onToggleBusiness: (idx: number) => void;
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
        {tx.amount > 0 ? "-" : "+"}
        {fmtILS(tx.amount)}
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
