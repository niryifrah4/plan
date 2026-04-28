/**
 * Budget Import — convert parsed bank transactions into a monthly budget.
 *
 * Pipeline:
 *   DocumentsTab parses files → saves into localStorage["verdant:parsed_transactions"]
 *   Budget page reads them via loadParsedTransactions(), filters by month,
 *   then calls importTransactionsIntoBudget() to merge actuals into rows.
 *
 * Amount sign convention (from lib/doc-parser/types.ts):
 *   positive = expense (debit)
 *   negative = income  (credit)
 * For both income and expense rows we store Math.abs(sum) in `actual`.
 *
 * Locked rows (row.locked === true) are NEVER modified — those are synced
 * from the /debt page.
 */

import type { ParsedTransaction } from "@/lib/doc-parser/types";
import type { Scope } from "@/lib/scope-types";
import { CATEGORY_TO_BUDGET, type BudgetSection } from "@/lib/category-to-budget-map";
import { scopedKey } from "@/lib/client-scope";

const TX_KEY = "verdant:parsed_transactions";

/* ──────────────────────────────────────────────────────────
   Local structural types — mirror the budget page shape so we
   do not have to refactor app/(client)/budget/page.tsx.
   ────────────────────────────────────────────────────────── */

export interface BudgetSubItem {
  id: string;
  name: string;
  budget: number;
  actual: number;
  avg3: number;
  notes?: string;
}

export interface BudgetRow {
  id: string;
  name: string;
  budget: number;
  actual: number;
  avg3: number;
  subItems?: BudgetSubItem[];
  locked?: boolean;
  notes?: string;
  scope?: Scope;
}

export interface BudgetData {
  year: number;
  month: number;
  sections: Record<string, BudgetRow[]>;
  settled: boolean;
}

/* ──────────────────────────────────────────────────────────
   Summary returned to the UI confirmation modal.
   ────────────────────────────────────────────────────────── */

export interface ImportSummary {
  matched: number;
  unmatched: number;
  totalAmount: number;
  byRow: Array<{ rowName: string; section: string; count: number; total: number }>;
  unmatchedList: Array<{ description: string; amount: number; category: string }>;
}

/* ──────────────────────────────────────────────────────────
   Loading & filtering transactions
   ────────────────────────────────────────────────────────── */

export function loadParsedTransactions(): ParsedTransaction[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(scopedKey(TX_KEY));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/** Filter transactions to a specific (year, month). `month` is 0-indexed. */
export function filterByMonth(
  txs: ParsedTransaction[],
  year: number,
  month: number,
): ParsedTransaction[] {
  return txs.filter(t => {
    if (!t.date) return false;
    const d = new Date(t.date);
    if (isNaN(d.getTime())) return false;
    return d.getFullYear() === year && d.getMonth() === month;
  });
}

const uid = () => "r" + Math.random().toString(36).slice(2, 9);

/* ──────────────────────────────────────────────────────────
   Core: merge transactions into budget (pure function)
   ────────────────────────────────────────────────────────── */

export function importTransactionsIntoBudget(
  budget: BudgetData,
  transactions: ParsedTransaction[],
): { budget: BudgetData; summary: ImportSummary } {
  // Deep clone sections so we don't mutate input.
  const nextSections: Record<string, BudgetRow[]> = {};
  for (const k of Object.keys(budget.sections)) {
    nextSections[k] = budget.sections[k].map(r => ({
      ...r,
      subItems: r.subItems ? r.subItems.map(s => ({ ...s })) : undefined,
    }));
  }

  // key = `${section}::${rowName}` → { section, rowName, sum, count }
  const buckets = new Map<
    string,
    { section: BudgetSection; rowName: string; sum: number; count: number }
  >();
  const unmatchedByLabel = new Map<
    string,
    { section: BudgetSection; rowName: string; sum: number; count: number }
  >();
  const unmatchedList: ImportSummary["unmatchedList"] = [];

  // Business-scoped txs are routed to the "business" section.
  // We override the category→row mapping to force section="business", while
  // keeping the original rowName (or falling back to the category label).
  for (const tx of transactions) {
    if (tx.scope === "business") {
      const mapped = CATEGORY_TO_BUDGET[tx.category];
      const rowName = mapped?.rowName || tx.categoryLabel || tx.category || "אחר";
      const key = `business::${rowName}`;
      const b = buckets.get(key) || {
        section: "business" as BudgetSection,
        rowName,
        sum: 0,
        count: 0,
      };
      b.sum += tx.amount;
      b.count += 1;
      buckets.set(key, b);
      continue;
    }
    // Skip pure inter-account transfers — they aren't real income/expense.
    // Examples: "חיסכון לכל ילד" (kids savings), "העברה לחיסכון", bank-to-bank
    // moves, ביט / paybox between own accounts. Counting them inflates both
    // sides of the budget (Nir 2026-04-28: "₪114 חיסכון לילדים זה לא הוצאה").
    if (tx.category === "transfers") continue;

    // 2026-04-28 per Nir: low-confidence + unrecognized transactions are
    // routed to /files mapping queue instead of polluting the budget with
    // "[אחר - X]" rows. The Documents tab surfaces them for manual triage.
    const isLowConfidence = (tx as any).confidence != null && (tx as any).confidence < 0.7;
    if (tx.category === "other" || isLowConfidence) {
      unmatchedList.push({
        description: tx.description,
        amount: tx.amount,
        category: tx.category,
      });
      continue;
    }

    const target = CATEGORY_TO_BUDGET[tx.category];
    if (target) {
      const key = `${target.section}::${target.rowName}`;
      const b = buckets.get(key) || {
        section: target.section,
        rowName: target.rowName,
        sum: 0,
        count: 0,
      };
      b.sum += tx.amount;
      b.count += 1;
      buckets.set(key, b);
    } else {
      // Unmapped category — accumulate under a new row at the bottom of variable.
      const label = `[אחר - ${tx.categoryLabel || tx.category || "לא מזוהה"}]`;
      const key = `variable::${label}`;
      const b = unmatchedByLabel.get(key) || {
        section: "variable" as BudgetSection,
        rowName: label,
        sum: 0,
        count: 0,
      };
      b.sum += tx.amount;
      b.count += 1;
      unmatchedByLabel.set(key, b);
      unmatchedList.push({
        description: tx.description,
        amount: tx.amount,
        category: tx.category,
      });
    }
  }

  // Apply matched buckets onto existing rows. Skip locked rows.
  const appliedKeys = new Set<string>();
  for (const [key, bucket] of buckets.entries()) {
    const sectionRows = nextSections[bucket.section];
    if (!sectionRows) continue;
    const idx = sectionRows.findIndex(r => !r.locked && r.name === bucket.rowName);
    if (idx === -1) continue;
    const row = sectionRows[idx];
    sectionRows[idx] = {
      ...row,
      actual: Math.abs(bucket.sum),
      scope: bucket.section === "business" ? "business" : row.scope,
    };
    appliedKeys.add(key);
  }

  // Any bucket that didn't find its target row (row name missing in this budget)
  // gets promoted to a new row at the bottom of its section.
  for (const [key, bucket] of buckets.entries()) {
    if (appliedKeys.has(key)) continue;
    const sectionRows = nextSections[bucket.section] || [];
    sectionRows.push({
      id: uid(),
      name: bucket.rowName,
      budget: 0,
      actual: Math.abs(bucket.sum),
      avg3: 0,
      ...(bucket.section === "business" ? { scope: "business" as Scope } : {}),
    });
    nextSections[bucket.section] = sectionRows;
    // Move from "matched" to unmatched accounting so the user sees these too.
    unmatchedList.push({
      description: `(${bucket.count} תנועות) ${bucket.rowName}`,
      amount: bucket.sum,
      category: "row-not-found",
    });
  }

  // Append unmapped categories as new rows in "variable".
  if (unmatchedByLabel.size > 0) {
    const variable = nextSections.variable || [];
    for (const bucket of unmatchedByLabel.values()) {
      variable.push({
        id: uid(),
        name: bucket.rowName,
        budget: 0,
        actual: Math.abs(bucket.sum),
        avg3: 0,
      });
    }
    nextSections.variable = variable;
  }

  // Build summary
  const byRow: ImportSummary["byRow"] = [];
  for (const bucket of buckets.values()) {
    byRow.push({
      rowName: bucket.rowName,
      section: bucket.section,
      count: bucket.count,
      total: Math.abs(bucket.sum),
    });
  }
  for (const bucket of unmatchedByLabel.values()) {
    byRow.push({
      rowName: bucket.rowName,
      section: bucket.section,
      count: bucket.count,
      total: Math.abs(bucket.sum),
    });
  }
  byRow.sort((a, b) => b.total - a.total);

  const matchedCount = Array.from(buckets.values()).reduce((s, b) => s + b.count, 0);
  const unmatchedCount = Array.from(unmatchedByLabel.values()).reduce((s, b) => s + b.count, 0);
  const totalAmount = transactions.reduce((s, t) => s + Math.abs(t.amount), 0);

  const summary: ImportSummary = {
    matched: matchedCount,
    unmatched: unmatchedCount,
    totalAmount,
    byRow,
    unmatchedList,
  };

  return {
    budget: { ...budget, sections: nextSections },
    summary,
  };
}
