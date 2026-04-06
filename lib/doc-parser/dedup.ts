/**
 * Transaction Deduplication Engine
 *
 * Detects and removes duplicate transactions that appear across multiple files.
 * Common case: credit card charge appears in both the bank statement (עו"ש)
 * and the credit card statement (פירוט כרטיס).
 *
 * Strategy: match on date + normalized amount + description similarity.
 */

import type { ParsedTransaction } from "./types";
import { normalizeSupplier } from "./normalizer";

interface TxWithSource extends ParsedTransaction {
  _sourceFile?: string;
}

/**
 * Generate a dedup fingerprint for a transaction.
 * Uses: date + absolute amount (rounded) + normalized supplier root.
 */
function fingerprint(tx: ParsedTransaction): string {
  const date = tx.date || "";
  const amount = Math.abs(Math.round(tx.amount * 100)); // cents precision
  const supplier = normalizeSupplier(tx.description)
    .toLowerCase()
    .replace(/[\u200F\u200E"]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .substring(0, 20); // first 20 chars for fuzzy match
  return `${date}|${amount}|${supplier}`;
}

/**
 * Merge multiple ParsedDocument transaction arrays, removing duplicates.
 * When a duplicate is found, prefer the one with more description detail.
 */
export function deduplicateTransactions(
  txArrays: { transactions: ParsedTransaction[]; sourceFile: string }[]
): { merged: ParsedTransaction[]; duplicatesRemoved: number; sourceFiles: string[] } {
  const seen = new Map<string, TxWithSource>();
  let duplicatesRemoved = 0;
  const sourceFiles: string[] = [];

  for (const { transactions, sourceFile } of txArrays) {
    sourceFiles.push(sourceFile);

    for (const tx of transactions) {
      const fp = fingerprint(tx);
      const existing = seen.get(fp);

      if (existing) {
        // Duplicate found — keep the one with longer description (more detail)
        if (tx.description.length > (existing.description?.length || 0)) {
          seen.set(fp, { ...tx, _sourceFile: sourceFile });
        }
        duplicatesRemoved++;
      } else {
        seen.set(fp, { ...tx, _sourceFile: sourceFile });
      }
    }
  }

  // Strip internal _sourceFile before returning
  const merged = [...seen.values()].map(({ _sourceFile, ...tx }) => tx as ParsedTransaction);

  // Sort by date descending (newest first)
  merged.sort((a, b) => (b.date || "").localeCompare(a.date || ""));

  return { merged, duplicatesRemoved, sourceFiles };
}
