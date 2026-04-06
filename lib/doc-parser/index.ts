/**
 * Document Parser — Main Entry Point
 * Routes files to the appropriate parser based on extension.
 */

export { parseExcel } from "./parse-excel";
export { parsePDF } from "./parse-pdf";
export { categorize, CATEGORIES, getCategoryByKey, learnOverride, getOverrides } from "./categorizer";
export type { Category, CategoryOverride } from "./categorizer";
export { matchSynonym, detectBank } from "./synonyms";
export { parseILNumber, parseILDate, cleanAmount } from "./number-utils";
export { detectRecurring, tagRecurring } from "./recurring";
export type { RecurringGroup } from "./recurring";
export { analyzeBurnRate } from "./burn-rate";
export type { BurnRateAnalysis, BurnRateAlert, MonthlyBreakdown } from "./burn-rate";
export { normalizeSupplier, isInternalTransfer, filterInternalTransfers, getTier, groupByTier, TIER_INFO } from "./normalizer";
export type { ExpenseTier, TierInfo } from "./normalizer";
export { deduplicateTransactions } from "./dedup";
export { assignSubCategory, learnSubRule, loadSubRules, SUB_CATEGORIES, SUB_CATEGORIES_BY_BUCKET } from "./sub-categories";
export type { SubCategory, SubCategoryRule } from "./sub-categories";
export type { ParsedDocument, ParsedTransaction, ColumnMapping } from "./types";

import { parseExcel } from "./parse-excel";
import { parsePDF } from "./parse-pdf";
import type { ParsedDocument } from "./types";

/**
 * Auto-detect file type and parse accordingly.
 */
export async function parseDocument(buffer: Buffer, filename: string): Promise<ParsedDocument> {
  const ext = filename.toLowerCase().split(".").pop();

  switch (ext) {
    case "xlsx":
    case "xls":
    case "csv":
      return parseExcel(buffer, filename);
    case "pdf":
      return await parsePDF(buffer, filename);
    default:
      return {
        filename,
        type: "pdf",
        bankHint: "לא זוהה",
        transactions: [],
        totalDebit: 0,
        totalCredit: 0,
        dateRange: { from: "", to: "" },
        warnings: [`סוג קובץ לא נתמך: .${ext}. העלה PDF או Excel.`],
      };
  }
}
