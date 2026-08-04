"use client";

import { useEffect, useMemo, useRef } from "react";
import { CAT_OPTIONS } from "@/lib/documents-categories";
import { groupOptionsByParent } from "@/lib/doc-parser/category-tree";
import { fmtILS } from "@/lib/format";
import { isMerchantKeyExcluded } from "@/lib/doc-parser/excluded-merchant-keys";

export interface MerchantMappingGroup {
  merchantKey: string;
  merchantLabel: string;
  displaySample: string;
  count: number;
  totalAmount: number;
  sourceFiles: string[];
  suggestedCategory: string;
}

interface Props {
  open: boolean;
  focusMerchantKey: string | null;
  groups: MerchantMappingGroup[];
  selectedCategories: Record<string, string>;
  onChange: (merchantKey: string, categoryKey: string) => void;
  onExcludeMerchant: (merchantKey: string) => void;
  excludedMerchantKeys: Set<string>;
  onClose: () => void;
  onSave: () => void;
}

export function MerchantMappingModal({
  open,
  focusMerchantKey,
  groups,
  selectedCategories,
  onChange,
  onExcludeMerchant,
  excludedMerchantKeys,
  onClose,
  onSave,
}: Props) {
  const rowRefs = useRef<Record<string, HTMLDivElement | null>>({});

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  useEffect(() => {
    if (!open || !focusMerchantKey) return;
    const node = rowRefs.current[focusMerchantKey];
    if (node) {
      window.setTimeout(() => {
        node.scrollIntoView({ behavior: "smooth", block: "center" });
      }, 50);
    }
  }, [open, focusMerchantKey, groups.length]);

  const groupsBySize = useMemo(
    () => [...groups].sort((a, b) => b.totalAmount - a.totalAmount || b.count - a.count),
    [groups]
  );

  if (!open) return null;

  const dirtyGroups = groupsBySize.filter((g) => {
    const selected = selectedCategories[g.merchantKey] || "";
    return selected && selected !== g.suggestedCategory;
  });
  const changedCount = dirtyGroups.length;
  const changedTxCount = dirtyGroups.reduce((sum, g) => sum + g.count, 0);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto p-3 md:p-6"
      style={{ background: "rgba(10,25,41,0.55)" }}
      onClick={onClose}
      dir="rtl"
      role="presentation"
    >
      <div
        className="my-auto w-full max-w-5xl overflow-hidden rounded-2xl"
        style={{ background: "#FFFFFF", boxShadow: "0 24px 60px rgba(10, 25, 41, 0.22)" }}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="מיפוי לפי שם עסק"
        dir="rtl"
      >
        <div className="flex items-start justify-between border-b px-5 py-4" style={{ borderColor: "#FAFAF7" }}>
          <div className="min-w-0 text-right">
            <h2 className="text-base font-extrabold text-verdant-ink">מיפוי לפי שם עסק</h2>
            <div className="mt-1 text-[11px] font-bold text-verdant-muted">
              בוחרים קטגוריה פעם אחת לכל שם, והבחירה נשמרת גם לפעמים הבאות
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-10 w-10 items-center justify-center rounded-full transition hover:bg-verdant-bg"
            title="סגור"
            aria-label="סגור"
          >
            <span className="material-symbols-outlined text-[18px]">close</span>
          </button>
        </div>

        <div className="border-b px-5 py-3" style={{ borderColor: "#FAFAF7", background: "#FAFAF7" }}>
          <div className="flex flex-wrap items-center gap-3 text-[11px] font-bold text-verdant-muted">
            <span>קבוצות פתוחות: {groupsBySize.length}</span>
            <span>•</span>
            <span>לשמירה: {changedCount} קבוצות</span>
            <span>•</span>
            <span>{changedTxCount} תנועות ייצאו מהתור</span>
            <span>•</span>
            <span>למקרים חריגים, משאירים שורה בודדת בתור הרגיל</span>
          </div>
        </div>

        <div className="max-h-[72vh] overflow-y-auto p-3 md:p-5">
          {groupsBySize.length === 0 ? (
            <div className="rounded-xl border border-dashed px-4 py-8 text-center text-sm font-bold text-verdant-muted">
              אין קבוצות למיפוי כרגע.
            </div>
          ) : (
            <div className="space-y-3">
              {groupsBySize.map((group) => {
                const selected = selectedCategories[group.merchantKey] || "";
                const isFocused = focusMerchantKey === group.merchantKey;
                const isExcluded = isMerchantKeyExcluded(group.merchantKey, excludedMerchantKeys);
                return (
                  <div
                    key={group.merchantKey}
                    ref={(node) => {
                      rowRefs.current[group.merchantKey] = node;
                    }}
                    className="rounded-2xl border p-4 transition-shadow"
                    style={{
                      borderColor: isExcluded ? "#FCA5A5" : isFocused ? "#2C7A5A" : "#E5E7EB",
                      background: isExcluded ? "rgba(239,68,68,0.05)" : isFocused ? "#FAFAF7" : "#FFFFFF",
                      boxShadow: isFocused ? "0 8px 22px rgba(44,122,90,0.12)" : "none",
                    }}
                  >
                    <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="text-sm font-extrabold text-verdant-ink">{group.merchantLabel}</h3>
                          {isExcluded && (
                            <span
                              className="rounded-full px-2 py-0.5 text-[10px] font-bold"
                              style={{ background: "rgba(220,38,38,0.12)", color: "#DC2626" }}
                            >
                              מסומן לא להציג שוב
                            </span>
                          )}
                          <span
                            className="rounded-full px-2 py-0.5 text-[10px] font-bold"
                            style={{ background: "#FAFAF7", color: "#2C7A5A" }}
                          >
                            {group.count} תנועות
                          </span>
                          {group.sourceFiles.length > 0 && (
                            <span className="text-[10px] font-bold text-verdant-muted">
                              {group.sourceFiles.length === 1
                                ? group.sourceFiles[0]
                                : `${group.sourceFiles.length} קבצים`}
                            </span>
                          )}
                        </div>
                        <div className="mt-1 text-[11px] leading-5 text-verdant-muted">
                          <span className="font-bold text-verdant-ink">{group.displaySample}</span>
                          <span className="mx-1">•</span>
                          {fmtILS(group.totalAmount)}
                        </div>
                        <div className="mt-2 text-[11px] font-bold text-verdant-muted">
                          מיפוי זה יחול גם על וריאציות עתידיות של אותו שם עסק
                        </div>
                      </div>

                      <div className="min-w-[220px]">
                        <label className="mb-1 block text-[10px] font-bold text-verdant-muted">
                          קטגוריה
                        </label>
                        <div className="flex flex-col gap-2 md:flex-row">
                          <select
                            value={selected}
                            onChange={(e) => onChange(group.merchantKey, e.target.value)}
                            className="min-w-0 flex-1 cursor-pointer rounded-xl border px-3 py-2 text-[12px] font-bold outline-none transition focus:ring-2 focus:ring-verdant-emerald/25"
                            style={{ borderColor: "#E5E7EB", background: "#FFFFFF", color: "#2C7A5A" }}
                          >
                            <option value="">בחר קטגוריה</option>
                            {groupOptionsByParent(CAT_OPTIONS).map((parentGroup) => (
                              <optgroup key={parentGroup.parent.key} label={parentGroup.parent.label}>
                                {parentGroup.options.map((option) => (
                                  <option key={option.key} value={option.key}>
                                    {option.label}
                                  </option>
                                ))}
                              </optgroup>
                            ))}
                          </select>
                          <button
                            type="button"
                            onClick={() => onExcludeMerchant(group.merchantKey)}
                            className="w-full rounded-xl border px-3 py-2 text-[11px] font-extrabold transition hover:bg-red-50 md:w-auto md:whitespace-nowrap"
                            style={{
                              borderColor: "#FCA5A5",
                              background: isExcluded ? "rgba(220,38,38,0.08)" : "#FFFFFF",
                              color: "#B91C1C",
                            }}
                            title="מסמן או מבטל סימון של שם העסק הזה"
                          >
                            {isExcluded ? "בטל סימון" : "לא להציג שוב בעתיד"}
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div
          className="sticky bottom-0 flex flex-col gap-2 border-t px-5 py-4 shadow-[0_-8px_24px_rgba(10,25,41,0.06)] md:flex-row md:items-center md:justify-between"
          style={{ borderColor: "#FAFAF7", background: "#FFFFFF" }}
        >
          <div className="text-[11px] font-bold text-verdant-muted">
            שמירה תחיל את הקטגוריות על כל העסקאות עם אותו שם ותעדכן מיד את התור שנשאר לטיפול.
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border px-4 py-2 text-sm font-bold transition hover:bg-verdant-bg"
              style={{ borderColor: "#E5E7EB", color: "#374151" }}
            >
              ביטול
            </button>
            <button
              type="button"
              onClick={onSave}
              disabled={changedCount === 0}
              className="rounded-lg px-4 py-2 text-sm font-extrabold transition hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-40"
              style={{ background: "#2C7A5A", color: "#FFFFFF" }}
            >
              שמור שינויים
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
