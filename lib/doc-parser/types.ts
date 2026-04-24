/**
 * Document Parser — Shared Types
 * Canonical format for parsed bank/credit transactions.
 */

import type { Scope } from "../scope-types";

export interface ParsedTransaction {
  date: string;           // ISO yyyy-mm-dd
  description: string;    // original merchant / action text
  amount: number;         // positive = expense (debit), negative = income (credit)
  category: string;       // auto-assigned category key
  categoryLabel: string;  // Hebrew display name
  raw?: string;           // original line for debugging
  /** Business / personal / mixed tag. Undefined = personal. */
  scope?: Scope;
  /** ID of the source document (history entry) — lets us trace back to origin file. */
  sourceDocId?: string;
  /** Original filename of the source document — for quick display in cashflow. */
  sourceFile?: string;
  /**
   * Categorization confidence 0..1.
   *   1.00 — user-learned override
   *   0.90 — long keyword hit (≥6 chars)
   *   0.70 — short keyword hit
   *   0.50 — regex fallback
   *   0.00 — no match, classified "other"
   * UI should surface transactions with confidence < 0.7 for manual review.
   */
  confidence?: number;
}

export interface ParsedDocument {
  filename: string;
  type: "pdf" | "xlsx" | "csv";
  bankHint: string;        // detected bank name or "unknown"
  transactions: ParsedTransaction[];
  totalDebit: number;
  totalCredit: number;
  dateRange: { from: string; to: string };
  warnings: string[];
  instruments?: { type: "bank_account" | "credit_card"; institution: string; identifier: string; label: string }[];
  /** Declared opening balance extracted from source (for reconciliation) */
  openingBalance?: number;
  /** Declared closing balance extracted from source (for reconciliation) */
  closingBalance?: number;
  /** Reconciliation result — matches source doc 100% when 'clean' */
  reconciliation?: {
    ok: boolean;
    severity: "clean" | "minor" | "major" | "skipped";
    message: string;
    delta: number;
    computed: number;
  };
}

export interface ColumnMapping {
  date: number;
  description: number;
  debit: number;
  credit: number;
  balance?: number;
}
