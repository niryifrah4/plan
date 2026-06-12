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
import { categorize } from "@/lib/doc-parser/categorizer";
import { CONFIDENCE_THRESHOLD, UNMAPPED_KEYS } from "@/lib/documents-categories";
import { CATEGORY_TO_BUDGET, type BudgetSection } from "@/lib/category-to-budget-map";
import { scopedKey } from "@/lib/client-scope";
import { pushBlob, pushBlobInBackground, pullBlob } from "@/lib/sync/blob-sync";

const TX_KEY = "verdant:parsed_transactions";
const TX_BLOB_KEY = "parsed_transactions";

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
    if (!Array.isArray(parsed)) return [];
    const normalized = normalizeReviewedTransactions(parsed);
    if (normalized !== parsed) {
      persistTransactions(normalized);
    }
    return normalized;
  } catch {
    return [];
  }
}

/** Filter transactions to a specific (year, month). `month` is 0-indexed. */
export function filterByMonth(
  txs: ParsedTransaction[],
  year: number,
  month: number
): ParsedTransaction[] {
  return txs.filter((t) => {
    if (!t.date) return false;
    const d = new Date(t.date);
    if (isNaN(d.getTime())) return false;
    return d.getFullYear() === year && d.getMonth() === month;
  });
}

const uid = () => "r" + Math.random().toString(36).slice(2, 9);

/**
 * Upgrade already-saved rows when the current classifier can now reproduce
 * the exact stored category with higher confidence.
 *
 * This is the migration path for old saves where a user already chose a
 * category in the documents preview, but the persisted row kept the stale
 * parser confidence and still showed up in the "needs attention" badge.
 */
function normalizeReviewedTransactions(txs: ParsedTransaction[]): ParsedTransaction[] {
  let changed = false;

  const next = txs.map((tx) => {
    if (!tx || UNMAPPED_KEYS.has(tx.category)) return tx;

    const currentConfidence =
      typeof tx.confidence === "number" && Number.isFinite(tx.confidence) ? tx.confidence : null;
    if (currentConfidence == null || currentConfidence >= CONFIDENCE_THRESHOLD) return tx;

    const description = tx.description?.trim();
    if (!description) return tx;

    const inferred = categorize(description);
    if (inferred.key !== tx.category) return tx;
    if (typeof inferred.confidence !== "number" || inferred.confidence <= currentConfidence) {
      return tx;
    }

    changed = true;
    return {
      ...tx,
      confidence: inferred.confidence,
    };
  });

  return changed ? next : txs;
}

/* ──────────────────────────────────────────────────────────
   Add a single manual transaction (used by the mobile PWA
   to log expenses on the go).

   The dashboard's /budget page reads from the same scoped
   localStorage key + listens to "verdant:parsed_transactions:updated",
   so a row added here lights up the ביצוע column instantly.
   ────────────────────────────────────────────────────────── */

export interface ManualExpenseInput {
  /** Positive number in ILS. */
  amount: number;
  /** BudgetCategory.key, e.g. "food", "transport". */
  category: string;
  /** Hebrew display name shown on /budget, e.g. "מזון וצריכה". */
  categoryLabel: string;
  /** Optional description / merchant name. */
  description?: string;
  /** ISO yyyy-mm-dd. Defaults to today. */
  date?: string;
}

export function addManualTransaction(input: ManualExpenseInput): ParsedTransaction {
  if (typeof window === "undefined") {
    throw new Error("addManualTransaction must run in the browser");
  }
  const amount = Math.abs(Number(input.amount) || 0);
  if (amount === 0) {
    throw new Error("Expense amount must be greater than 0");
  }

  const today = new Date();
  const date =
    input.date ||
    `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(
      today.getDate()
    ).padStart(2, "0")}`;

  const tx: ParsedTransaction = {
    date,
    description: input.description?.trim() || input.categoryLabel,
    amount, // positive = expense (debit) — matches doc-parser convention
    category: input.category,
    categoryLabel: input.categoryLabel,
    sourceFile: "mobile",
    addedAt: new Date().toISOString(),
    confidence: 1, // user-entered → highest trust
  };

  const existing = loadParsedTransactions();
  const updated = [...existing, tx];
  persistTransactions(updated);
  return tx;
}

/* ──────────────────────────────────────────────────────────
   Edit / delete a single transaction by its storage index.
   The mobile category-detail sheet uses these to fix mis-
   categorised or accidentally-doubled entries.

   persistTransactions() is the single write path for the
   `verdant:parsed_transactions` store. It guarantees:
     1. localStorage is updated (per-tab visibility)
     2. window event is dispatched (same-tab listeners refresh)
     3. blob is pushed to Supabase (cross-device + dashboard sync)
   This is the fix for the mobile-to-desktop sync gap — before
   this, the doc-parser desktop flow + the mobile expense flow
   both wrote to localStorage only and were invisible to the
   advisor's dashboard until the next manual page reload on the
   same device.
   ────────────────────────────────────────────────────────── */

function writeTransactionsLocal(txs: ParsedTransaction[]): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(scopedKey(TX_KEY), JSON.stringify(txs));
    window.dispatchEvent(new Event("verdant:parsed_transactions:updated"));
  } catch (err) {
    throw new Error("Failed to update transaction — storage write rejected");
  }
}

function persistTransactions(txs: ParsedTransaction[]): void {
  writeTransactionsLocal(txs);
  pushBlobInBackground(TX_BLOB_KEY, txs);
}

export function saveParsedTransactions(txs: ParsedTransaction[]): void {
  persistTransactions(normalizeReviewedTransactions(txs));
}

export async function saveParsedTransactionsAndWait(txs: ParsedTransaction[]): Promise<boolean> {
  const normalized = normalizeReviewedTransactions(txs);
  const remoteSaved = await pushBlob(TX_BLOB_KEY, normalized);
  if (!remoteSaved) return false;
  writeTransactionsLocal(normalized);
  return true;
}

export async function pullParsedTransactionsFromRemote(): Promise<ParsedTransaction[] | null> {
  const remote = await pullBlob<ParsedTransaction[]>(TX_BLOB_KEY);
  return Array.isArray(remote) ? normalizeReviewedTransactions(remote) : null;
}

/** Bootstrap pull. Called once per session by bootstrap.ts so the
 *  advisor's dashboard hydrates the mobile-logged transactions
 *  before the budget page renders its first frame. */
export async function hydrateTransactionsFromRemote(): Promise<boolean> {
  const remote = await pullParsedTransactionsFromRemote();
  if (!remote) return false;
  try {
    localStorage.setItem(scopedKey(TX_KEY), JSON.stringify(remote));
    if (typeof window !== "undefined") {
      window.dispatchEvent(new Event("verdant:parsed_transactions:updated"));
    }
    return true;
  } catch {
    return false;
  }
}

export function deleteTransactionAt(storageIndex: number): void {
  const txs = loadParsedTransactions();
  if (storageIndex < 0 || storageIndex >= txs.length) return;
  const next = txs.filter((_, i) => i !== storageIndex);
  persistTransactions(next);
}

export function updateTransactionCategoryAt(
  storageIndex: number,
  newCategory: string,
  newCategoryLabel: string
): void {
  const txs = loadParsedTransactions();
  if (storageIndex < 0 || storageIndex >= txs.length) return;
  const next = txs.map((t, i) =>
    i === storageIndex
      ? { ...t, category: newCategory, categoryLabel: newCategoryLabel }
      : t
  );
  persistTransactions(next);
}

/* ──────────────────────────────────────────────────────────
   Core: merge transactions into budget (pure function)
   ────────────────────────────────────────────────────────── */

export function importTransactionsIntoBudget(
  budget: BudgetData,
  transactions: ParsedTransaction[]
): { budget: BudgetData; summary: ImportSummary } {
  // Deep clone sections so we don't mutate input.
  const nextSections: Record<string, BudgetRow[]> = {};
  for (const k of Object.keys(budget.sections)) {
    nextSections[k] = budget.sections[k].map((r) => ({
      ...r,
      subItems: r.subItems ? r.subItems.map((s) => ({ ...s })) : undefined,
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
    const idx = sectionRows.findIndex((r) => !r.locked && r.name === bucket.rowName);
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
