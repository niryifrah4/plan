/**
 * Installment Extractor — surface the "hidden hole" of credit-card payment
 * series from imported bank/credit statements.
 *
 * Per Nir 2026-05-13: the most dangerous thing a family doesn't see is the
 * silent stack of installment plans on the credit card. "תשלום 3 מתוך 12"
 * on a single line looks small. The fact that there are 7 such lines
 * adding up to ₪3,400/month for the next 11 months is invisible — and it
 * blocks every conversation about "how much can we redirect to investments".
 *
 * Flow:
 *   1. parseInstallmentFromDescription(desc) — read "X מתוך Y" or "X/Y"
 *      patterns out of the merchant text.
 *   2. extractInstallments(txs)              — group txs by merchant+total,
 *      keep the latest payment number seen, return one entry per series.
 *   3. mergeIntoDebtStore(extracted)         — upsert into Installment[]:
 *      same merchant+totalPayments = update currentPayment; otherwise add.
 *
 * Idempotent: re-running the merge after the same import is a no-op.
 */

import type { ParsedTransaction } from "@/lib/doc-parser/types";
import { loadDebtData, saveDebtData, type Installment } from "@/lib/debt-store";

export interface ExtractedInstallment {
  merchant: string;
  currentPayment: number;
  totalPayments: number;
  monthlyAmount: number;
  /** Free-text card hint we may have parsed alongside (e.g. "ויזה כאל"). */
  source?: string;
  /** Number of statement rows that contributed to this extraction —
   *  surfaced in the UI confirmation so the user sees the basis. */
  samples: number;
  /** True when this series doesn't yet exist in the debt store. */
  isNew: boolean;
}

export interface ExtractionResult {
  detected: ExtractedInstallment[];
  /** Series found in the source that already exist in /debt — included so the
   *  UI can say "X already tracked, Y new". */
  existing: ExtractedInstallment[];
}

/**
 * Try to pull a (current, total) tuple + the clean merchant name out of a
 * single transaction description. Returns null if no installment pattern
 * matched.
 *
 * Patterns we cover (in order, first match wins):
 *   1. "<merchant> תשלום 3 מתוך 12"           ← most common Israeli card format
 *   2. "<merchant> 3/12 תשלומים"
 *   3. "<merchant> תשלום 3/12"                ← shorthand from some statements
 *   4. "<merchant> תש 3/12" / "תש.3/12"
 *   5. "<merchant> 3 מ-12"                    ← rarer dash form
 */
export function parseInstallmentFromDescription(
  desc: string
): { current: number; total: number; cleanMerchant: string } | null {
  if (!desc) return null;
  // Normalize RTL marks + extra whitespace before matching so the regexes
  // can stay readable.
  const cleaned = desc.replace(/[‎‏‪-‮]/g, "").trim();

  const patterns: RegExp[] = [
    /^(.*?)\s*תשלום\s*(\d+)\s*מתוך\s*(\d+)/i,
    /^(.*?)\s*(\d+)\s*\/\s*(\d+)\s*תשלומים?/i,
    /^(.*?)\s*תשלום\s*(\d+)\s*\/\s*(\d+)/i,
    /^(.*?)\s*תש\.?\s*(\d+)\s*\/\s*(\d+)/i,
    /^(.*?)\s*(\d+)\s*מ[-־]\s*(\d+)\s*תשלומים?/i,
  ];

  for (const pat of patterns) {
    const m = cleaned.match(pat);
    if (!m) continue;
    const merchantRaw = (m[1] || "").trim();
    const current = parseInt(m[2], 10);
    const total = parseInt(m[3], 10);
    if (!Number.isFinite(current) || !Number.isFinite(total)) continue;
    if (total <= 1) continue; // 1-payment isn't a real installment series
    if (total > 120) continue; // 10 years is the upper bound for real Israeli card plans; anything more is a parse error
    if (current < 1 || current > total) continue;

    // Clean trailing punctuation/separators that often precede the X-of-Y
    // suffix in real-world descriptions ("חנות אבי - " / "אמזון •").
    const cleanMerchant = merchantRaw.replace(/[\s\-•,./]+$/u, "").trim();
    if (!cleanMerchant) continue;

    return { current, total, cleanMerchant };
  }
  return null;
}

/**
 * Pull all installment series out of a transaction list. Multiple txs that
 * resolve to the same series (e.g. "תשלום 3 מתוך 12" in March + "תשלום 4
 * מתוך 12" in April) collapse into one entry with the latest current
 * payment seen.
 */
export function extractInstallments(txs: ParsedTransaction[]): ExtractionResult {
  const found = new Map<string, ExtractedInstallment>();
  const existingDebt = loadDebtData();
  const existingByKey = new Map<string, Installment>();
  for (const inst of existingDebt.installments || []) {
    const k = `${inst.merchant.trim().toLowerCase()}|${inst.totalPayments}`;
    existingByKey.set(k, inst);
  }

  for (const tx of txs) {
    if (!tx || !tx.description) continue;
    // Only outgoing money — installments are charges, not refunds.
    if (tx.amount <= 0) continue;
    const parsed = parseInstallmentFromDescription(tx.description);
    if (!parsed) continue;

    const key = `${parsed.cleanMerchant.toLowerCase()}|${parsed.total}`;
    const existing = found.get(key);
    const monthly = Math.round(Math.abs(tx.amount));

    if (existing) {
      if (parsed.current > existing.currentPayment) {
        existing.currentPayment = parsed.current;
        // Refresh monthly amount — later txs are more authoritative if the
        // payment number is larger (e.g. price adjustments mid-series).
        existing.monthlyAmount = monthly;
      }
      existing.samples += 1;
    } else {
      found.set(key, {
        merchant: parsed.cleanMerchant,
        currentPayment: parsed.current,
        totalPayments: parsed.total,
        monthlyAmount: monthly,
        samples: 1,
        isNew: !existingByKey.has(key),
      });
    }
  }

  const all = Array.from(found.values());
  return {
    detected: all.filter((e) => e.isNew),
    existing: all.filter((e) => !e.isNew),
  };
}

/**
 * Upsert detected installments into the debt store. Returns counts so the
 * UI can show a clear summary. Pass `dryRun: true` to compute the diff
 * without persisting — useful for the import-preview modal.
 */
export function mergeIntoDebtStore(
  extracted: ExtractedInstallment[],
  options: { dryRun?: boolean } = {}
): { added: number; updated: number; unchanged: number } {
  const data = loadDebtData();
  let added = 0;
  let updated = 0;
  let unchanged = 0;

  for (const ext of extracted) {
    const idx = (data.installments || []).findIndex(
      (i) =>
        i.merchant.trim().toLowerCase() === ext.merchant.toLowerCase() &&
        i.totalPayments === ext.totalPayments
    );

    if (idx >= 0) {
      const cur = data.installments[idx];
      // Update only when the imported snapshot is more recent (higher
      // currentPayment number) — never roll the user backwards.
      if (ext.currentPayment > cur.currentPayment) {
        data.installments[idx] = {
          ...cur,
          currentPayment: ext.currentPayment,
          monthlyAmount: ext.monthlyAmount,
        };
        updated++;
      } else {
        unchanged++;
      }
    } else {
      data.installments.push({
        id: "inst_" + Math.random().toString(36).slice(2, 9),
        merchant: ext.merchant,
        source: ext.source || "",
        currentPayment: ext.currentPayment,
        totalPayments: ext.totalPayments,
        monthlyAmount: ext.monthlyAmount,
      });
      added++;
    }
  }

  if (!options.dryRun && (added > 0 || updated > 0)) {
    saveDebtData(data);
  }
  return { added, updated, unchanged };
}
