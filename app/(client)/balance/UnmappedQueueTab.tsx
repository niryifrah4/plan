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

const STORAGE_KEY = "verdant:parsed_transactions";
const UNMAPPED_KEYS = new Set(["other", "transfers"]);
const CONFIDENCE_THRESHOLD = 0.7;

const fmtILS = (v: number) => "₪" + Math.abs(Math.round(v)).toLocaleString("he-IL");

const CAT_OPTIONS = [
  { key: "food",          label: "מזון וצריכה" },
  { key: "housing",       label: "דיור ומגורים" },
  { key: "transport",     label: "תחבורה ורכב" },
  { key: "utilities",     label: "חשבונות שוטפים" },
  { key: "health",        label: "בריאות" },
  { key: "education",     label: "חינוך וילדים" },
  { key: "insurance",     label: "ביטוח" },
  { key: "leisure",       label: "פנאי ובידור" },
  { key: "shopping",      label: "קניות" },
  { key: "salary",        label: "משכורת" },
  { key: "pension",       label: "פנסיה וחיסכון" },
  { key: "transfers",     label: "העברות" },
  { key: "cash",          label: "מזומן" },
  { key: "subscriptions", label: "מנויים" },
  { key: "refunds",       label: "זיכויים באשראי" },
  { key: "fees",          label: "עמלות וריביות" },
  { key: "dining_out",    label: "אוכל בחוץ ובילויים" },
  { key: "home_maintenance", label: "תחזוקת בית" },
  { key: "misc",          label: "שונות" },
  { key: "other",         label: "אחר" },
];

interface MerchantGroup {
  key: string;              // normalized supplier
  displaySample: string;    // an example original description
  count: number;
  totalAmount: number;      // sum of absolute amounts
  sourceFiles: string[];    // unique
  txIndices: number[];      // indices in the original storage array
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
      const isLowConf = typeof t.confidence === "number" && t.confidence < CONFIDENCE_THRESHOLD && !isUnmapped;
      if (!isUnmapped && !isLowConf) return;

      if (isUnmapped) unmappedTxCount++;
      if (isLowConf) lowConfTxCount++;

      const supplierKey = normalizeSupplier(t.description || "")
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
          existing.avgConfidence = (existing.avgConfidence * (existing.count - 1) + t.confidence) / existing.count;
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

    const groups = Array.from(groupMap.values())
      .sort((a, b) => b.totalAmount - a.totalAmount);

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

  const handleMap = useCallback((group: MerchantGroup, newCategoryKey: string) => {
    const cat = CAT_OPTIONS.find(c => c.key === newCategoryKey);
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
    setRecentlyMapped(prev => { const s = new Set(prev); s.add(group.key); return s; });
    setTimeout(() => {
      setRecentlyMapped(prev => { const s = new Set(prev); s.delete(group.key); return s; });
    }, 1500);
    // Fan out to dependent stores (budget, cashflow, savings rate)
    markUpdated("docs");
    triggerFullSync();
  }, [transactions]);

  const toggleExpand = useCallback((key: string) => {
    setExpanded(prev => {
      const s = new Set(prev);
      if (s.has(key)) s.delete(key); else s.add(key);
      return s;
    });
  }, []);

  // Empty state
  if (transactions.length === 0) {
    return (
      <div className="max-w-5xl mx-auto p-10 text-center rounded-2xl" style={{ background: "#fff", boxShadow: "0 1px 4px rgba(0,0,0,0.04)" }}>
        <div className="w-14 h-14 rounded-full flex items-center justify-center mx-auto mb-3" style={{ background: "#eef7f1" }}>
          <span className="material-symbols-outlined text-[28px]" style={{ color: "#1B4332" }}>folder_open</span>
        </div>
        <h2 className="text-base font-extrabold text-verdant-ink mb-1" style={{ fontFamily: "Assistant" }}>אין תנועות לתצוגה</h2>
        <p className="text-sm text-verdant-muted">העלה קבצי עו״ש/אשראי בלשונית "מסמכים" כדי להתחיל</p>
      </div>
    );
  }

  if (groups.length === 0) {
    const mappedPct = stats.totalTransactions > 0
      ? Math.round(((stats.totalTransactions - stats.unmappedTxCount - stats.lowConfTxCount) / stats.totalTransactions) * 100)
      : 100;
    return (
      <div className="max-w-5xl mx-auto p-10 text-center rounded-2xl" style={{ background: "linear-gradient(135deg,#f0fdf4 0%,#ecfdf5 100%)", border: "1.5px solid #1B433230" }}>
        <div className="w-14 h-14 rounded-full flex items-center justify-center mx-auto mb-3" style={{ background: "#1B433215" }}>
          <span className="material-symbols-outlined text-[28px]" style={{ color: "#1B4332" }}>task_alt</span>
        </div>
        <h2 className="text-xl font-extrabold text-verdant-ink mb-1" style={{ fontFamily: "Assistant" }}>הכל ממופה</h2>
        <p className="text-sm text-verdant-muted">
          {stats.totalTransactions.toLocaleString("he-IL")} תנועות · {mappedPct}% ברמת ביטחון גבוהה
        </p>
      </div>
    );
  }

  const unmappedGroups = groups.filter(g => g.reason === "unmapped");
  const lowConfGroups = groups.filter(g => g.reason === "low-confidence");

  return (
    <div className="max-w-5xl mx-auto space-y-4" dir="rtl">
      {/* Summary */}
      <div className="p-5 rounded-2xl" style={{ background: "linear-gradient(135deg,#eef7f1 0%,#f9faf2 100%)", border: "1px solid #d8e0d0" }}>
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-[20px]" style={{ color: "#1B4332" }}>inbox</span>
            <h3 className="text-base font-extrabold text-verdant-ink" style={{ fontFamily: "Assistant" }}>תור פענוח</h3>
          </div>
          <span className="text-[10px] font-bold text-verdant-muted">
            ממיין לפי סכום · גדול למעלה
          </span>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <StatCard label="קבוצות לטיפול" value={stats.groupCount.toLocaleString("he-IL")} color="#1B4332" />
          <StatCard label="תנועות לא ממופות" value={stats.unmappedTxCount.toLocaleString("he-IL")} color={stats.unmappedTxCount > 0 ? "#8B2E2E" : "#1B4332"} />
          <StatCard label="תנועות לבדיקה" value={stats.lowConfTxCount.toLocaleString("he-IL")} color={stats.lowConfTxCount > 0 ? "#B45309" : "#1B4332"} />
          <StatCard label="סכום לטיפול" value={fmtILS(stats.totalAmount)} color="#012d1d" />
        </div>
        <div className="mt-3 text-[11px] font-bold text-verdant-muted flex items-center gap-1.5">
          <span className="material-symbols-outlined text-[14px]" style={{ color: "#1B4332" }}>auto_fix_high</span>
          <span>בחירה כאן מלמדת את הפענוח — העלאות עתידיות של אותו בית-עסק ימופו אוטומטית.</span>
        </div>
      </div>

      {/* Unmapped section */}
      {unmappedGroups.length > 0 && (
        <QueueSection
          title="לא ממופה"
          subtitle="קטגוריה: אחר / העברות — דורש הכרעה"
          color="#8B2E2E"
          bg="#fef2f2"
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
          bg="#fffbeb"
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
    <div className="p-3 rounded-xl bg-white">
      <div className="text-[9px] font-bold uppercase tracking-[0.1em] text-verdant-muted mb-0.5">{label}</div>
      <div className="text-lg font-extrabold tabular" style={{ color }}>{value}</div>
    </div>
  );
}

function QueueSection({
  title, subtitle, color, bg, icon, groups, expanded, recentlyMapped, transactions, onToggle, onMap,
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
    <div className="rounded-2xl overflow-hidden" style={{ background: "#fff", boxShadow: "0 1px 4px rgba(0,0,0,0.04)" }}>
      <div className="px-5 py-3 flex items-center gap-3" style={{ background: bg, borderRight: "4px solid " + color }}>
        <span className="material-symbols-outlined text-[20px]" style={{ color }}>{icon}</span>
        <div className="flex-1">
          <div className="text-sm font-extrabold" style={{ color, fontFamily: "Assistant" }}>{title}</div>
          <div className="text-[10px] font-bold text-verdant-muted">{subtitle}</div>
        </div>
        <span className="text-[11px] font-extrabold px-2.5 py-1 rounded-md" style={{ background: color + "1a", color }}>
          {groups.length} קבוצות · {groups.reduce((s, g) => s + g.count, 0)} תנועות
        </span>
      </div>
      <div className="divide-y" style={{ borderColor: "#eef7f1" }}>
        {groups.map(g => (
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
  group, transactions, isExpanded, isRecentlyMapped, onToggle, onMap,
}: {
  group: MerchantGroup;
  transactions: ParsedTransaction[];
  isExpanded: boolean;
  isRecentlyMapped: boolean;
  onToggle: () => void;
  onMap: (cat: string) => void;
}) {
  return (
    <div className="transition-all" style={{ background: isRecentlyMapped ? "#f0fdf4" : undefined }}>
      <div className="px-5 py-3 flex items-center gap-3">
        <button
          onClick={onToggle}
          className="flex-1 flex items-center gap-3 text-right min-w-0"
          title="הצג את התנועות הבודדות"
        >
          <span className="material-symbols-outlined text-[16px] text-verdant-muted transition-transform" style={{ transform: isExpanded ? "rotate(180deg)" : "rotate(0)" }}>
            expand_more
          </span>
          <div className="min-w-0 flex-1">
            <div className="text-[13px] font-extrabold text-verdant-ink truncate" style={{ fontFamily: "Assistant" }}>
              {group.displaySample}
            </div>
            <div className="text-[10px] font-bold text-verdant-muted mt-0.5 flex items-center gap-2 flex-wrap">
              <span>{group.count} תנועות · {fmtILS(group.totalAmount)}</span>
              {group.avgConfidence != null && (
                <>
                  <span style={{ color: "#d8e0d0" }}>·</span>
                  <span>ביטחון {Math.round(group.avgConfidence * 100)}%</span>
                </>
              )}
              {group.sourceFiles.length > 0 && (
                <>
                  <span style={{ color: "#d8e0d0" }}>·</span>
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
          onChange={(e) => { if (e.target.value) onMap(e.target.value); e.target.value = ""; }}
          className="text-[11px] font-bold rounded-lg px-3 py-2 border outline-none cursor-pointer transition-all focus:ring-2 focus:ring-verdant-accent/30 min-w-[140px]"
          style={{ borderColor: "#d8e0d0", background: "#fff", color: "#1B4332" }}
        >
          <option value="" disabled>מפה ל…</option>
          {CAT_OPTIONS.filter(c => c.key !== "other" && c.key !== "transfers").map(c => (
            <option key={c.key} value={c.key}>{c.label}</option>
          ))}
        </select>
      </div>

      {isExpanded && (
        <div className="px-5 pb-3">
          <div className="rounded-xl overflow-hidden" style={{ background: "#fafbf5", border: "1px solid #eef7f1" }}>
            <table className="w-full text-xs">
              <tbody>
                {group.txIndices.slice(0, 25).map((i) => {
                  const t = transactions[i];
                  if (!t) return null;
                  return (
                    <tr key={i} className="border-b" style={{ borderColor: "#eef7f1" }}>
                      <td className="px-3 py-1.5 text-verdant-muted tabular w-20" dir="ltr">{t.date}</td>
                      <td className="px-3 py-1.5 text-verdant-ink truncate max-w-[300px]">{t.description}</td>
                      <td className="px-3 py-1.5 text-left font-extrabold tabular w-24" style={{ color: t.amount > 0 ? "#b91c1c" : "#2B694D" }}>
                        {t.amount > 0 ? "-" : "+"}{fmtILS(t.amount)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {group.txIndices.length > 25 && (
              <div className="px-3 py-1.5 text-[10px] text-verdant-muted font-bold text-center">
                ועוד {group.txIndices.length - 25} תנועות…
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
