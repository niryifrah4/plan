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
import { normalizeSupplier, extractBitRecipient } from "@/lib/doc-parser/normalizer";
import { learnOverride, getOverrides } from "@/lib/doc-parser/categorizer";
import { markUpdated, triggerFullSync } from "@/lib/sync-engine";
import { CAT_OPTIONS, UNMAPPED_KEYS, CONFIDENCE_THRESHOLD } from "@/lib/documents-categories";
import { STORAGE_KEY } from "@/lib/documents-store";
import { isBusinessScopeEnabled, BUSINESS_SCOPE_EVENT } from "@/lib/business-scope";
import { recordCorrection } from "@/lib/doc-parser/correction-history";
import { groupOptionsByParent } from "@/lib/doc-parser/category-tree";
import {
  excludeMerchant,
  buildExcludedSet,
  EXCLUDED_EVENT,
} from "@/lib/doc-parser/excluded-merchants";
import type { AISuggestion } from "@/lib/doc-parser/ai-categorizer";

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
  const [businessEnabled, setBusinessEnabled] = useState(false);
  /** Refreshed via window event whenever the excluded list changes. */
  const [excludedSet, setExcludedSet] = useState<Set<string>>(new Set());
  /** AI re-categorization state. */
  const [aiRunning, setAiRunning] = useState(false);
  const [aiResult, setAiResult] = useState<{ added: number; skipped: number } | null>(null);
  /** When ON, hide non-business groups. Only meaningful when business scope is enabled. */
  const [filterBusinessOnly, setFilterBusinessOnly] = useState(false);

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

  // Business-scope gate — same trigger as DocumentsTab. Visible only when the
  // household has at least one עצמאי spouse (gate set in business-scope.ts).
  useEffect(() => {
    setBusinessEnabled(isBusinessScopeEnabled());
    const handler = () => setBusinessEnabled(isBusinessScopeEnabled());
    window.addEventListener(BUSINESS_SCOPE_EVENT, handler);
    window.addEventListener("storage", handler);
    return () => {
      window.removeEventListener(BUSINESS_SCOPE_EVENT, handler);
      window.removeEventListener("storage", handler);
    };
  }, []);

  // Excluded merchants — keep an in-memory Set so per-tx lookups are O(1).
  useEffect(() => {
    setExcludedSet(buildExcludedSet());
    const handler = () => setExcludedSet(buildExcludedSet());
    window.addEventListener(EXCLUDED_EVENT, handler);
    window.addEventListener("storage", handler);
    return () => {
      window.removeEventListener(EXCLUDED_EVENT, handler);
      window.removeEventListener("storage", handler);
    };
  }, []);

  const { groups, stats } = useMemo(() => {
    const groupMap = new Map<string, MerchantGroup>();
    let unmappedTxCount = 0;
    let lowConfTxCount = 0;
    let businessTxCount = 0;
    let totalAmount = 0;

    transactions.forEach((t, idx) => {
      const isUnmapped = UNMAPPED_KEYS.has(t.category);
      const isLowConf =
        typeof t.confidence === "number" && t.confidence < CONFIDENCE_THRESHOLD && !isUnmapped;
      if (!isUnmapped && !isLowConf) return;

      // Excluded merchants — hide from the queue entirely. The transactions
      // stay in storage (so totals from past uploads are reproducible) but
      // they don't clutter triage and they're filtered out of cashflow
      // downstream.
      const supplierKeyForExclude = normalizeSupplier(t.description || "")
        .toLowerCase()
        .replace(/["\u200F\u200E]/g, "")
        .replace(/\s+/g, " ")
        .trim();
      if (excludedSet.has(supplierKeyForExclude)) return;

      if (isUnmapped) unmappedTxCount++;
      if (isLowConf) lowConfTxCount++;
      if (t.scope === "business") businessTxCount++;

      // Group by Bit/PayBox recipient when applicable — otherwise every Bit
      // row collapses into one useless "ביט" mega-group of dozens of
      // unrelated people. With recipient extraction, "ביט - שלמה גואטה"
      // becomes its own group keyed by "שלמה גואטה", which the user can
      // then map confidently (e.g. "ילדים" for a child's allowance) without
      // accidentally mass-mapping every Bit transfer they've ever made.
      const bitRecipient = extractBitRecipient(t.description || "");
      const baseKey = bitRecipient
        ? `bit:${bitRecipient}`
        : normalizeSupplier(t.description || "");
      const supplierKey =
        baseKey
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
        businessTxCount,
        totalAmount,
        totalTransactions: transactions.length,
      },
    };
  }, [transactions, excludedSet]);

  /* If the "business only" filter is on, hide groups with no business tx. A
   * group qualifies if any tx in it currently has scope='business'. */
  const visibleGroups = useMemo(() => {
    if (!filterBusinessOnly) return groups;
    return groups.filter((g) => g.txIndices.some((i) => transactions[i]?.scope === "business"));
  }, [groups, filterBusinessOnly, transactions]);

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
      if (sampleDesc) {
        learnOverride(sampleDesc, cat.key);
        // Also log a proper correction record (with full context) so the AI
        // categorizer can use this as a learning example later.
        recordCorrection(sampleDesc, group.currentCategory, cat.key, "user");
      }
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

  /* Map a single transaction (not the whole group). Used in the drill-down
   * when a merchant group is mixed — e.g. some shufersal rows are personal
   * groceries, one is a business gift. The user expands the row and maps the
   * outlier line by line. We still learn the override on the per-tx
   * description, but it's a narrower signal than mass-mapping the group. */
  const handleMapSingle = useCallback(
    (txIndex: number, newCategoryKey: string) => {
      const cat = CAT_OPTIONS.find((c) => c.key === newCategoryKey);
      if (!cat) return;
      const next = transactions.slice();
      const tx = next[txIndex];
      if (!tx) return;
      const isRefund = cat.key === "refunds";
      const adjustedAmount = isRefund && tx.amount > 0 ? -tx.amount : tx.amount;
      next[txIndex] = {
        ...tx,
        category: cat.key,
        categoryLabel: cat.label,
        amount: adjustedAmount,
        confidence: 1.0,
      };
      saveTransactions(next);
      setTransactions(next);
      if (tx.description) {
        learnOverride(tx.description, cat.key);
        recordCorrection(tx.description, tx.category, cat.key, "user");
      }
      markUpdated("docs");
      triggerFullSync();
    },
    [transactions]
  );

  /* Toggle scope on a single transaction in the drill-down. Lets the user
   * fix a mixed group one row at a time without overriding everyone. */
  const handleToggleBusinessSingle = useCallback(
    (txIndex: number) => {
      const next = transactions.slice();
      const tx = next[txIndex];
      if (!tx) return;
      next[txIndex] = {
        ...tx,
        scope: tx.scope === "business" ? undefined : ("business" as const),
      };
      saveTransactions(next);
      setTransactions(next);
      markUpdated("docs");
      triggerFullSync();
    },
    [transactions]
  );

  /* Exclude a merchant group entirely. Future transactions from that
   * normalized supplier never appear in the queue OR in cashflow. The
   * existing rows stay in storage so totals from past periods stay reproducible. */
  const handleExcludeMerchant = useCallback((group: MerchantGroup) => {
    excludeMerchant(group.displaySample);
    // The buildExcludedSet event handler will refresh excludedSet → memo re-runs → group disappears.
  }, []);

  /* "סווג מחדש עם AI" — bulk-classify everything in the queue via Claude
   * Haiku. Past corrections are fed into the prompt so the model can mirror
   * Nir's prior choices. Only suggestions with confidence ≥ 60% are auto-applied;
   * the rest stay in the queue so the advisor stays in control. */
  const handleAiRecategorize = useCallback(async () => {
    if (aiRunning) return;
    // Gather every queue-eligible tx (unmapped or low-confidence, NOT excluded)
    const candidates = transactions
      .map((t, i) => ({ tx: t, idx: i }))
      .filter(({ tx }) => {
        const isUnmapped = UNMAPPED_KEYS.has(tx.category);
        const isLowConf =
          typeof tx.confidence === "number" &&
          tx.confidence < CONFIDENCE_THRESHOLD &&
          !isUnmapped;
        if (!isUnmapped && !isLowConf) return false;
        const supplierKey = normalizeSupplier(tx.description || "")
          .toLowerCase()
          .replace(/["\u200F\u200E]/g, "")
          .replace(/\s+/g, " ")
          .trim();
        return !excludedSet.has(supplierKey);
      })
      .slice(0, 200); // server cap

    if (candidates.length === 0) {
      setAiResult({ added: 0, skipped: 0 });
      return;
    }

    setAiRunning(true);
    setAiResult(null);
    try {
      // Past corrections from the keyword-override store — these are the
      // user's prior choices, perfect learning examples for Haiku.
      const pastCorrections = getOverrides()
        .slice(0, 30)
        .map((o) => ({ description: o.pattern, category: o.category }));

      const res = await fetch("/api/categorize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          transactions: candidates.map(({ tx, idx }) => ({
            index: idx,
            description: tx.description,
            currentGuess: tx.category,
          })),
          pastCorrections,
        }),
      });
      const data = await res.json();
      const suggestions: AISuggestion[] = Array.isArray(data?.suggestions)
        ? data.suggestions
        : [];

      // Apply confidently — only suggestions ≥ 0.6 — and skip ones that
      // don't actually move the category (waste a "correction" record).
      const next = transactions.slice();
      let added = 0;
      let skipped = 0;
      for (const s of suggestions) {
        const tx = next[s.index];
        if (!tx) continue;
        if (s.confidence < 0.6) {
          skipped++;
          continue;
        }
        if (s.category === tx.category) {
          skipped++;
          continue;
        }
        const isRefund = s.category === "refunds";
        const adjustedAmount = isRefund && tx.amount > 0 ? -tx.amount : tx.amount;
        next[s.index] = {
          ...tx,
          category: s.category,
          categoryLabel: s.categoryLabel,
          amount: adjustedAmount,
          confidence: s.confidence,
        };
        learnOverride(tx.description, s.category);
        recordCorrection(tx.description, tx.category, s.category, "ai_bulk");
        added++;
      }
      saveTransactions(next);
      setTransactions(next);
      markUpdated("docs");
      triggerFullSync();
      setAiResult({ added, skipped: skipped + (candidates.length - suggestions.length) });
    } catch (err) {
      console.error("AI recategorize failed:", err);
      setAiResult({ added: 0, skipped: 0 });
    } finally {
      setAiRunning(false);
      // Clear the toast after 4 seconds
      setTimeout(() => setAiResult(null), 4000);
    }
  }, [transactions, excludedSet, aiRunning]);

  const toggleExpand = useCallback((key: string) => {
    setExpanded((prev) => {
      const s = new Set(prev);
      if (s.has(key)) s.delete(key);
      else s.add(key);
      return s;
    });
  }, []);

  /* Toggle every transaction in a merchant group between business and personal.
   * If any tx in the group is already business → strip the scope (back to personal).
   * Otherwise mark them all as business. Matches the per-row pattern in
   * DocumentsTab's PreviewView. */
  const handleToggleBusiness = useCallback(
    (group: MerchantGroup) => {
      const next = transactions.slice();
      const hasBusiness = group.txIndices.some((i) => next[i]?.scope === "business");
      const newScope = hasBusiness ? undefined : ("business" as const);
      for (const i of group.txIndices) {
        if (!next[i]) continue;
        next[i] = { ...next[i], scope: newScope };
      }
      saveTransactions(next);
      setTransactions(next);
      markUpdated("docs");
      triggerFullSync();
    },
    [transactions]
  );

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

  const unmappedGroups = visibleGroups.filter((g) => g.reason === "unmapped");
  const lowConfGroups = visibleGroups.filter((g) => g.reason === "low-confidence");

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

        {/* AI re-categorize action bar */}
        <div className="mt-4 flex flex-wrap items-center gap-3 border-t pt-3" style={{ borderColor: "#E5E7EB" }}>
          <button
            onClick={handleAiRecategorize}
            disabled={aiRunning || stats.groupCount === 0}
            className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-[12px] font-extrabold text-white transition-all disabled:opacity-40"
            style={{ background: "#7C3AED" }}
          >
            <span className="material-symbols-outlined text-[16px]">
              {aiRunning ? "progress_activity" : "auto_awesome"}
            </span>
            {aiRunning ? "מסווג עם AI..." : "סווג מחדש עם AI"}
          </button>
          <span className="text-[11px] text-verdant-muted">
            Claude Haiku בודק את כל ה-{stats.groupCount} הקבוצות לפי הקטגוריות וההיסטוריה שלך
          </span>
          {aiResult && (
            <span
              className="rounded-md px-2 py-1 text-[11px] font-bold"
              style={{
                background: aiResult.added > 0 ? "#7C3AED15" : "#FAFAF7",
                color: aiResult.added > 0 ? "#7C3AED" : "#6B7280",
              }}
            >
              {aiResult.added > 0
                ? `✓ סווגו ${aiResult.added}, ${aiResult.skipped} נשארו לבדיקה`
                : "אף הצעה לא הייתה ברמת ביטחון מספיקה — נשאר ידני"}
            </span>
          )}
        </div>

        {/* Business filter — only when business scope is enabled for the household. */}
        {businessEnabled && (
          <div className="mt-3 flex flex-wrap items-center gap-2 border-t pt-3" style={{ borderColor: "#E5E7EB" }}>
            <span className="text-[11px] font-bold text-verdant-muted">סנן:</span>
            <button
              onClick={() => setFilterBusinessOnly(false)}
              className="rounded-full px-3 py-1 text-[11px] font-extrabold transition-all"
              style={
                !filterBusinessOnly
                  ? { background: "#2C7A5A", color: "#FFFFFF" }
                  : { background: "#FAFAF7", color: "#6B7280", border: "1px solid #E5E7EB" }
              }
            >
              הכל ({stats.unmappedTxCount + stats.lowConfTxCount})
            </button>
            <button
              onClick={() => setFilterBusinessOnly(true)}
              className="flex items-center gap-1 rounded-full px-3 py-1 text-[11px] font-extrabold transition-all"
              style={
                filterBusinessOnly
                  ? { background: "#2C7A5A", color: "#FFFFFF" }
                  : { background: "#FAFAF7", color: "#6B7280", border: "1px solid #E5E7EB" }
              }
            >
              <span className="material-symbols-outlined text-[13px]">work</span>
              עסקי ({stats.businessTxCount})
            </button>
            {filterBusinessOnly && stats.businessTxCount === 0 && (
              <span className="text-[11px] text-verdant-muted">
                אין תנועות מסומנות עסקי בתור הפענוח. לחץ "פרטי/עסקי" על קבוצה כדי לסמן.
              </span>
            )}
          </div>
        )}
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
          businessEnabled={businessEnabled}
          onToggle={toggleExpand}
          onMap={handleMap}
          onMapSingle={handleMapSingle}
          onToggleBusiness={handleToggleBusiness}
          onToggleBusinessSingle={handleToggleBusinessSingle}
          onExclude={handleExcludeMerchant}
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
          businessEnabled={businessEnabled}
          onToggle={toggleExpand}
          onMap={handleMap}
          onMapSingle={handleMapSingle}
          onToggleBusiness={handleToggleBusiness}
          onToggleBusinessSingle={handleToggleBusinessSingle}
          onExclude={handleExcludeMerchant}
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
  businessEnabled,
  onToggle,
  onMap,
  onMapSingle,
  onToggleBusiness,
  onToggleBusinessSingle,
  onExclude,
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
  businessEnabled: boolean;
  onToggle: (key: string) => void;
  onMap: (g: MerchantGroup, cat: string) => void;
  onMapSingle: (txIndex: number, cat: string) => void;
  onToggleBusiness: (g: MerchantGroup) => void;
  onToggleBusinessSingle: (txIndex: number) => void;
  onExclude: (g: MerchantGroup) => void;
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
            businessEnabled={businessEnabled}
            onToggle={() => onToggle(g.key)}
            onMap={(cat) => onMap(g, cat)}
            onMapSingle={onMapSingle}
            onToggleBusiness={() => onToggleBusiness(g)}
            onToggleBusinessSingle={onToggleBusinessSingle}
            onExclude={() => onExclude(g)}
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
  businessEnabled,
  onToggle,
  onMap,
  onMapSingle,
  onToggleBusiness,
  onToggleBusinessSingle,
  onExclude,
}: {
  group: MerchantGroup;
  transactions: ParsedTransaction[];
  isExpanded: boolean;
  isRecentlyMapped: boolean;
  businessEnabled: boolean;
  onToggle: () => void;
  onMap: (cat: string) => void;
  onMapSingle: (txIndex: number, cat: string) => void;
  onToggleBusiness: () => void;
  onToggleBusinessSingle: (txIndex: number) => void;
  onExclude: () => void;
}) {
  // Group is "business" if any tx in it is currently scoped business
  const isBusiness = group.txIndices.some((i) => transactions[i]?.scope === "business");
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
        {businessEnabled && (
          <button
            onClick={onToggleBusiness}
            title={
              isBusiness
                ? "כל התנועות בקבוצה מסומנות כעסקי — לחץ להחזרה לפרטי"
                : "סמן את כל התנועות בקבוצה כהוצאה עסקית"
            }
            className="rounded-lg border px-3 py-2 text-[10px] font-extrabold transition-all"
            style={
              isBusiness
                ? { borderColor: "#2C7A5A", background: "#FAFAF7", color: "#2C7A5A" }
                : { borderColor: "#E5E7EB", background: "#FFFFFF", color: "#9CA3AF" }
            }
          >
            {isBusiness ? "עסקי" : "פרטי"}
          </button>
        )}
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
          {groupOptionsByParent(
            CAT_OPTIONS.filter((c) => c.key !== "other" && c.key !== "transfers")
          ).map((group) => (
            <optgroup key={group.parent.key} label={group.parent.label}>
              {group.options.map((o) => (
                <option key={o.key} value={o.key}>
                  {o.label}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
        <button
          onClick={onExclude}
          title="סנן ספק זה מהתזרים — לא יופיע בתור פענוח ולא בתזרים. עסקאות קיימות נשארות בהיסטוריה."
          className="flex h-9 w-9 items-center justify-center rounded-lg border transition-all hover:bg-red-50"
          style={{ borderColor: "#E5E7EB", color: "#9CA3AF" }}
        >
          <span className="material-symbols-outlined text-[16px]">visibility_off</span>
        </button>
      </div>

      {isExpanded && (
        <div className="px-5 pb-3">
          <div
            className="overflow-hidden rounded-xl"
            style={{ background: "#FAFAF7", border: "1px solid #FAFAF7" }}
          >
            <div className="flex items-center gap-2 border-b px-3 py-2 text-[10px] font-bold text-verdant-muted" style={{ borderColor: "#E5E7EB" }}>
              <span className="material-symbols-outlined text-[12px]" style={{ color: "#2C7A5A" }}>
                edit
              </span>
              ניתן למפות כל תנועה בנפרד — לדוגמה כשבתוך אותו ספק יש גם פרטי וגם עסקי
            </div>
            <table className="w-full text-xs">
              <tbody>
                {group.txIndices.slice(0, 25).map((i) => {
                  const t = transactions[i];
                  if (!t) return null;
                  const isBusiness = t.scope === "business";
                  return (
                    <tr key={i} className="border-b align-middle" style={{ borderColor: "#FFFFFF" }}>
                      <td className="tabular w-20 px-3 py-2 text-verdant-muted" dir="ltr">
                        {t.date}
                      </td>
                      <td className="max-w-[260px] truncate px-3 py-2 text-verdant-ink" title={t.description}>
                        {t.description}
                      </td>
                      <td
                        className="tabular w-20 px-3 py-2 text-left font-extrabold"
                        style={{ color: t.amount > 0 ? "#DC2626" : "#059669" }}
                      >
                        {t.amount > 0 ? "-" : "+"}
                        {fmtILS(t.amount)}
                      </td>
                      {businessEnabled && (
                        <td className="px-2 py-2">
                          <button
                            onClick={() => onToggleBusinessSingle(i)}
                            title={
                              isBusiness
                                ? "מסומן עסקי — לחץ להחזרה לפרטי"
                                : "סמן את התנועה הספציפית כעסקית"
                            }
                            className="rounded-md border px-2 py-1 text-[10px] font-extrabold transition-all"
                            style={
                              isBusiness
                                ? { borderColor: "#2C7A5A", background: "#FFFFFF", color: "#2C7A5A" }
                                : { borderColor: "#E5E7EB", background: "#FFFFFF", color: "#9CA3AF" }
                            }
                          >
                            {isBusiness ? "עסקי" : "פרטי"}
                          </button>
                        </td>
                      )}
                      <td className="px-2 py-2">
                        <select
                          defaultValue=""
                          onChange={(e) => {
                            if (e.target.value) onMapSingle(i, e.target.value);
                            e.target.value = "";
                          }}
                          className="cursor-pointer rounded-md border px-2 py-1 text-[10px] font-bold outline-none transition-all focus:ring-2 focus:ring-verdant-accent/30"
                          style={{ borderColor: "#E5E7EB", background: "#FFFFFF", color: "#2C7A5A" }}
                        >
                          <option value="" disabled>
                            מפה תנועה…
                          </option>
                          {groupOptionsByParent(
                            CAT_OPTIONS.filter((c) => c.key !== "other" && c.key !== "transfers")
                          ).map((g2) => (
                            <optgroup key={g2.parent.key} label={g2.parent.label}>
                              {g2.options.map((o) => (
                                <option key={o.key} value={o.key}>
                                  {o.label}
                                </option>
                              ))}
                            </optgroup>
                          ))}
                        </select>
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
