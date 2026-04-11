/**
 * Document Parser — Shared Types
 * Canonical format for parsed bank/credit transactions.
 */

export interface ParsedTransaction {
  date: string;           // ISO yyyy-mm-dd
  description: string;    // original merchant / action text
  amount: number;         // positive = expense (debit), negative = income (credit)
  category: string;       // auto-assigned category key
  categoryLabel: string;  // Hebrew display name
  raw?: string;           // original line for debugging
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
