"use client";

/**
 * ═══════════════════════════════════════════════════════════
 *  Unmapped Queue — "תור פענוח"
 * ═══════════════════════════════════════════════════════════
 *
 * Single place to triage every transaction the auto-categorizer
 * isn't sure about, across all uploaded documents.
 *
 * Sources:
 *   • category is "other" or "transfers" (strict unmapped)
 *   • confidence < 0.7 (soft — AI guessed but not confident)
 *
 * UX: groups identical merchants so 7 shufersal rows become ONE
 *     dropdown that maps all 7 in a single click. Learn-override
 *     propagates to future uploads as well.
 */

import { useState, useEffect, useMemo, useCallback } from "react";
import type { ParsedTransaction } from "@/lib/doc-parser/types";
import { scopedKey } from "@/lib/client-scope";
import { normalizeSupplier } from "@/lib/doc-parser/normalizer";
import { learnOverride } from "@/lib/doc-parser/categorizer";
import { markUpdated, triggerFullSync } from "@/lib/sync-engine";
import { CAT_OPTIONS, UNMAPPED_KEYS, CONFIDENCE_THRESHOLD } from "@/lib/documents-categories";
import { STORAGE_KEY } from "@/lib/documents-store";

const fmtILS = (v: number) => "₪" + Math.abs(Math.round(v)).toLocaleString("he-IL");

interface MerchantGroup {
  key: string; // normalized supplier
  displaySample: string; // an example original description
  count: number;
  totalAmount: number; // sum of absolute amounts
  sourceFiles: string[]; // unique
  txIndices: number[]; // indices in the original storage array
  reason: "unmapped" | "low-confidence";
  currentCategory: string;
  avgConfidence?: number;
}

function loadTransactions(): ParsedTransaction[] {
  try {
    const raw = localStorage.getItem(scopedKey(STORAGE_KEY));
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveTransactions(txs: ParsedTransaction[]) {
  localStorage.setItem(scopedKey(STORAGE_KEY), JSON.stringify(txs));
  window.dispatchEvent(new Event("verdant:parsed_transactions:updated"));
}

export function UnmappedQueueTab() {
  const [transactions, setTransactions] = useState<ParsedTransaction[]>([]);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [recentlyMapped, setRecentlyMapped] = useState<Set<string>>(new Set());

  useEffect(() => {
    setTransactions(loadTransactions());
    const handler = () => setTransactions(loadTransactions());
    window.addEventListener("verdant:parsed_transactions:updated", handler);
    window.addEventListener("storage", handler);
    return () => {
      window.removeEventListener("verdant:parsed_transactions:updated", handler);
      window.removeEventListener("storage", handler);
    };
  }, []);

  const { groups, stats } = useMemo(() => {
    const groupMap = new Map<string, MerchantGroup>();
    let unmappedTxCount = 0;
    let lowConfTxCount = 0;
    let totalAmount = 0;

    transactions.forEach((t, idx) => {
      const isUnmapped = UNMAPPED_KEYS.has(t.category);
      const isLowConf =
        typeof t.confidence === "number" && t.confidence < CONFIDENCE_THRESHOLD && !isUnmapped;
      if (!isUnmapped && !isLowConf) return;

      if (isUnmapped) unmappedTxCount++;
      if (isLowConf) lowConfTxCount++;

      const supplierKey =
        normalizeSupplier(t.description || "")
          .toLowerCase()
          .replace(/["\u200F\u200E]/g, "")
          .replace(/\s+/g, " ")
          .trim()
          .substring(0, 30) || "_unknown_";

      const amt = Math.abs(t.amount || 0);
      totalAmount += amt;

      const reason: "unmapped" | "low-confidence" = isUnmapped ? "unmapped" : "low-confidence";
      const mapKey = `${reason}:${supplierKey}`;
      const existing = groupMap.get(mapKey);
      if (existing) {
        existing.count++;
        existing.totalAmount += amt;
        if (t.sourceFile && !existing.sourceFiles.includes(t.sourceFile)) {
          existing.sourceFiles.push(t.sourceFile);
        }
        existing.txIndices.push(idx);
        if (typeof t.confidence === "number" && existing.avgConfidence != null) {
          existing.avgConfidence =
            (existing.avgConfidence * (existing.count - 1) + t.confidence) / existing.count;
        }
      } else {
        groupMap.set(mapKey, {
          key: mapKey,
          displaySample: t.description || "—",
          count: 1,
          totalAmount: amt,
          sourceFiles: t.sourceFile ? [t.sourceFile] : [],
          txIndices: [idx],
          reason,
          currentCategory: t.category,
          avgConfidence: typeof t.confidence === "number" ? t.confidence : undefined,
        });
      }
    });

    const groups = Array.from(groupMap.values()).sort((a, b) => b.totalAmount - a.totalAmount);

    return {
      groups,
      stats: {
        groupCount: groups.length,
        unmappedTxCount,
        lowConfTxCount,
        totalAmount,
        totalTransactions: transactions.length,
      },
    };
  }, [transactions]);

  const handleMap = useCallback(
    (group: MerchantGroup, newCategoryKey: string) => {
      const cat = CAT_OPTIONS.find((c) => c.key === newCategoryKey);
      if (!cat) return;
      const isRefund = cat.key === "refunds";
      const next = transactions.slice();
      for (const i of group.txIndices) {
        if (!next[i]) continue;
        const adjustedAmount = isRefund && next[i].amount > 0 ? -next[i].amount : next[i].amount;
        next[i] = {
          ...next[i],
          category: cat.key,
          categoryLabel: cat.label,
          amount: adjustedAmount,
          confidence: 1.0, // user-confirmed
        };
      }
      saveTransactions(next);
      setTransactions(next);
      // Teach the categorizer so future uploads auto-map this merchant.
      const sampleDesc = next[group.txIndices[0]]?.description || group.displaySample;
      if (sampleDesc) learnOverride(sampleDesc, cat.key);
      // Visual confirmation
      setRecentlyMapped((prev) => {
        const s = new Set(prev);
        s.add(group.key);
        return s;
      });
      setTimeout(() => {
        setRecentlyMapped((prev) => {
          const s = new Set(prev);
          s.delete(group.key);
          return s;
        });
      }, 1500);
      // Fan out to dependent stores (budget, cashflow, savings rate)
      markUpdated("docs");
      triggerFullSync();
    },
    [transactions]
  );

  const toggleExpand = useCallback((key: string) => {
    setExpanded((prev) => {
      const s = new Set(prev);
      if (s.has(key)) s.delete(key);
      else s.add(key);
      return s;
    });
  }, []);

  // Empty state
  if (transactions.length === 0) {
    return (
      <div
        className="mx-auto max-w-5xl rounded-2xl p-10 text-center"
        style={{ background: "#FFFFFF", boxShadow: "0 1px 4px rgba(0,0,0,0.04)" }}
      >
        <div
          className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full"
          style={{ background: "#FAFAF7" }}
        >
          <span className="material-symbols-outlined text-[28px]" style={{ color: "#2C7A5A" }}>
            folder_open
          </span>
        </div>
        <h2
          className="mb-1 text-base font-extrabold text-verdant-ink"
          style={{ fontFamily: "inherit" }}
        >
          אין תנועות לתצוגה
        </h2>
        <p className="text-sm text-verdant-muted">
          העלה קבצי עו״ש/אשראי בלשונית "מסמכים" כדי להתחיל
        </p>
      </div>
    );
  }

  if (groups.length === 0) {
    const mappedPct =
      stats.totalTransactions > 0
        ? Math.round(
            ((stats.totalTransactions - stats.unmappedTxCount - stats.lowConfTxCount) /
              stats.totalTransactions) *
              100
          )
        : 100;
    return (
      <div
        className="mx-auto max-w-5xl rounded-2xl p-10 text-center"
        style={{
          background: "linear-gradient(135deg,#FAFAF7 0%,#ecfdf5 100%)",
          border: "1.5px solid #2C7A5A30",
        }}
      >
        <div
          className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full"
          style={{ background: "#2C7A5A15" }}
        >
          <span className="material-symbols-outlined text-[28px]" style={{ color: "#2C7A5A" }}>
            task_alt
          </span>
        </div>
        <h2
          className="mb-1 text-xl font-extrabold text-verdant-ink"
          style={{ fontFamily: "inherit" }}
        >
          הכל ממופה
        </h2>
        <p className="text-sm text-verdant-muted">
          {stats.totalTransactions.toLocaleString("he-IL")} תנועות · {mappedPct}% ברמת ביטחון גבוהה
        </p>
      </div>
    );
  }

  const unmappedGroups = groups.filter((g) => g.reason === "unmapped");
  const lowConfGroups = groups.filter((g) => g.reason === "low-confidence");

  return (
    <div className="mx-auto max-w-5xl space-y-4" dir="rtl">
      {/* Summary */}
      <div
        className="rounded-2xl p-5"
        style={{
          background: "linear-gradient(135deg,#FAFAF7 0%,#FFFFFF 100%)",
          border: "1px solid #E5E7EB",
        }}
      >
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-[20px]" style={{ color: "#2C7A5A" }}>
              inbox
            </span>
            <h3
              className="text-base font-extrabold text-verdant-ink"
              style={{ fontFamily: "inherit" }}
            >
              תור פענוח
            </h3>
          </div>
          <span className="text-[10px] font-bold text-verdant-muted">
            ממיין לפי סכום · גדול למעלה
          </span>
        </div>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <StatCard
            label="קבוצות לטיפול"
            value={stats.groupCount.toLocaleString("he-IL")}
            color="#2C7A5A"
          />
          <StatCard
            label="תנועות לא ממופות"
            value={stats.unmappedTxCount.toLocaleString("he-IL")}
            color={stats.unmappedTxCount > 0 ? "#DC2626" : "#2C7A5A"}
          />
          <StatCard
            label="תנועות לבדיקה"
            value={stats.lowConfTxCount.toLocaleString("he-IL")}
            color={stats.lowConfTxCount > 0 ? "#B45309" : "#2C7A5A"}
          />
          <StatCard label="סכום לטיפול" value={fmtILS(stats.totalAmount)} color="#FFFFFF" />
        </div>
        <div className="mt-3 flex items-center gap-1.5 text-[11px] font-bold text-verdant-muted">
          <span className="material-symbols-outlined text-[14px]" style={{ color: "#2C7A5A" }}>
            auto_fix_high
          </span>
          <span>בחירה כאן מלמדת את הפענוח — העלאות עתידיות של אותו בית-עסק ימופו אוטומטית.</span>
        </div>
      </div>

      {/* Unmapped section */}
      {unmappedGroups.length > 0 && (
        <QueueSection
          title="לא ממופה"
          subtitle="קטגוריה: אחר / העברות — דורש הכרעה"
          color="#DC2626"
          bg="rgba(220,38,38,0.08)"
          icon="help"
          groups={unmappedGroups}
          expanded={expanded}
          recentlyMapped={recentlyMapped}
          transactions={transactions}
          onToggle={toggleExpand}
          onMap={handleMap}
        />
      )}

      {/* Low confidence section */}
      {lowConfGroups.length > 0 && (
        <QueueSection
          title="לבדיקה"
          subtitle="המערכת סיווגה — אבל לא בוודאות גבוהה"
          color="#B45309"
          bg="rgba(217,119,6,0.08)"
          icon="flaky"
          groups={lowConfGroups}
          expanded={expanded}
          recentlyMapped={recentlyMapped}
          transactions={transactions}
          onToggle={toggleExpand}
          onMap={handleMap}
        />
      )}
    </div>
  );
}

/* ═══════════════════ Sub-components ═══════════════════ */

function StatCard({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="rounded-xl bg-[#FFFFFF] p-3">
      <div className="mb-0.5 text-[9px] font-bold uppercase tracking-[0.1em] text-verdant-muted">
        {label}
      </div>
      <div className="tabular text-lg font-extrabold" style={{ color }}>
        {value}
      </div>
    </div>
  );
}

function QueueSection({
  title,
  subtitle,
  color,
  bg,
  icon,
  groups,
  expanded,
  recentlyMapped,
  transactions,
  onToggle,
  onMap,
}: {
  title: string;
  subtitle: string;
  color: string;
  bg: string;
  icon: string;
  groups: MerchantGroup[];
  expanded: Set<string>;
  recentlyMapped: Set<string>;
  transactions: ParsedTransaction[];
  onToggle: (key: string) => void;
  onMap: (g: MerchantGroup, cat: string) => void;
}) {
  return (
    <div
      className="overflow-hidden rounded-2xl"
      style={{ background: "#FFFFFF", boxShadow: "0 1px 4px rgba(0,0,0,0.04)" }}
    >
      <div
        className="flex items-center gap-3 px-5 py-3"
        style={{ background: bg, borderRight: "4px solid " + color }}
      >
        <span className="material-symbols-outlined text-[20px]" style={{ color }}>
          {icon}
        </span>
        <div className="flex-1">
          <div className="text-sm font-extrabold" style={{ color, fontFamily: "inherit" }}>
            {title}
          </div>
          <div className="text-[10px] font-bold text-verdant-muted">{subtitle}</div>
        </div>
        <span
          className="rounded-md px-2.5 py-1 text-[11px] font-extrabold"
          style={{ background: color + "1a", color }}
        >
          {groups.length} קבוצות · {groups.reduce((s, g) => s + g.count, 0)} תנועות
        </span>
      </div>
      <div className="divide-y" style={{ borderColor: "#FAFAF7" }}>
        {groups.map((g) => (
          <QueueRow
            key={g.key}
            group={g}
            transactions={transactions}
            isExpanded={expanded.has(g.key)}
            isRecentlyMapped={recentlyMapped.has(g.key)}
            onToggle={() => onToggle(g.key)}
            onMap={(cat) => onMap(g, cat)}
          />
        ))}
      </div>
    </div>
  );
}

function QueueRow({
  group,
  transactions,
  isExpanded,
  isRecentlyMapped,
  onToggle,
  onMap,
}: {
  group: MerchantGroup;
  transactions: ParsedTransaction[];
  isExpanded: boolean;
  isRecentlyMapped: boolean;
  onToggle: () => void;
  onMap: (cat: string) => void;
}) {
  return (
    <div
      className="transition-all"
      style={{ background: isRecentlyMapped ? "#FAFAF7" : undefined }}
    >
      <div className="flex items-center gap-3 px-5 py-3">
        <button
          onClick={onToggle}
          className="flex min-w-0 flex-1 items-center gap-3 text-right"
          title="הצג את התנועות הבודדות"
        >
          <span
            className="material-symbols-outlined text-[16px] text-verdant-muted transition-transform"
            style={{ transform: isExpanded ? "rotate(180deg)" : "rotate(0)" }}
          >
            expand_more
          </span>
          <div className="min-w-0 flex-1">
            <div
              className="truncate text-[13px] font-extrabold text-verdant-ink"
              style={{ fontFamily: "inherit" }}
            >
              {group.displaySample}
            </div>
            <div className="mt-0.5 flex flex-wrap items-center gap-2 text-[10px] font-bold text-verdant-muted">
              <span>
                {group.count} תנועות · {fmtILS(group.totalAmount)}
              </span>
              {group.avgConfidence != null && (
                <>
                  <span style={{ color: "#9CA3AF" }}>·</span>
                  <span>ביטחון {Math.round(group.avgConfidence * 100)}%</span>
                </>
              )}
              {group.sourceFiles.length > 0 && (
                <>
                  <span style={{ color: "#9CA3AF" }}>·</span>
                  <span className="flex items-center gap-0.5" title={group.sourceFiles.join("\n")}>
                    <span className="material-symbols-outlined text-[11px]">attach_file</span>
                    {group.sourceFiles.length === 1
                      ? group.sourceFiles[0]
                      : `${group.sourceFiles.length} קבצים`}
                  </span>
                </>
              )}
            </div>
          </div>
        </button>
        <select
          defaultValue=""
          onChange={(e) => {
            if (e.target.value) onMap(e.target.value);
            e.target.value = "";
          }}
          className="min-w-[140px] cursor-pointer rounded-lg border px-3 py-2 text-[11px] font-bold outline-none transition-all focus:ring-2 focus:ring-verdant-accent/30"
          style={{ borderColor: "#E5E7EB", background: "#FFFFFF", color: "#2C7A5A" }}
        >
          <option value="" disabled>
            מפה ל…
          </option>
          {CAT_OPTIONS.filter((c) => c.key !== "other" && c.key !== "transfers").map((c) => (
            <option key={c.key} value={c.key}>
              {c.label}
            </option>
          ))}
        </select>
      </div>

      {isExpanded && (
        <div className="px-5 pb-3">
          <div
            className="overflow-hidden rounded-xl"
            style={{ background: "#FAFAF7", border: "1px solid #FAFAF7" }}
          >
            <table className="w-full text-xs">
              <tbody>
                {group.txIndices.slice(0, 25).map((i) => {
                  const t = transactions[i];
                  if (!t) return null;
                  return (
                    <tr key={i} className="border-b" style={{ borderColor: "#FAFAF7" }}>
                      <td className="tabular w-20 px-3 py-1.5 text-verdant-muted" dir="ltr">
                        {t.date}
                      </td>
                      <td className="max-w-[300px] truncate px-3 py-1.5 text-verdant-ink">
                        {t.description}
                      </td>
                      <td
                        className="tabular w-24 px-3 py-1.5 text-left font-extrabold"
                        style={{ color: t.amount > 0 ? "#DC2626" : "#059669" }}
                      >
                        {t.amount > 0 ? "-" : "+"}
                        {fmtILS(t.amount)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {group.txIndices.length > 25 && (
              <div className="px-3 py-1.5 text-center text-[10px] font-bold text-verdant-muted">
                ועוד {group.txIndices.length - 25} תנועות…
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
