/**
 * ═══════════════════════════════════════════════════════════
 *  Annual-Report → PensionFund adapter
 * ═══════════════════════════════════════════════════════════
 *
 * Maps the structured AnnualPolicy objects produced by
 * annual-report-parser.ts into the PensionFund shape used by the
 * pension-store (single source of truth).
 *
 * The merge is idempotent and dedup-aware:
 *   - Match existing funds by company + type + nearest match by track/account
 *   - If a match exists → UPDATE balance, fees, monthly contrib (preserving
 *     manual fields like conversionFactor, guaranteedRate, registeredFundId)
 *   - If no match → ADD a new fund
 */

import type { PensionFund } from "@/lib/pension-store";
import type { AnnualPolicy, AnnualProductType, ParsedAnnualBundle } from "./annual-report-parser";

/**
 * Map the regulatory product type to the simpler PensionFund.type enum.
 */
function mapType(t: AnnualProductType): PensionFund["type"] {
  switch (t) {
    case "pension_comprehensive":
    case "pension_general":
      return "pension";
    case "insurance_manager":
      return "bituach";
    case "gemel":
    case "gemel_investment":
      return "gemel";
    case "hishtalmut":
      return "hishtalmut";
    default:
      return "gemel";
  }
}

/**
 * Map to the more-detailed subtype enum, when we can infer it.
 */
function mapSubtype(t: AnnualProductType): PensionFund["subtype"] | undefined {
  switch (t) {
    case "pension_comprehensive":
    case "pension_general":
      return "pension_hadasha";
    case "insurance_manager":
      return "bituach_2004";
    case "gemel":
      return "gemel_regular";
    case "gemel_investment":
      return "gemel_lehashkaa";
    default:
      return undefined;
  }
}

/**
 * Build a stable id from the policy. Uses provider + account when available
 * so re-uploading the same report next year updates the existing record.
 */
function buildId(p: AnnualPolicy): string {
  const provider = (p.providerName || "unknown").replace(/\s+/g, "_");
  const acct = p.accountNumber || p.id;
  return `pdf_${provider}_${acct}`.toLowerCase();
}

/**
 * Map a single AnnualPolicy → PensionFund record.
 */
export function annualPolicyToFund(p: AnnualPolicy): PensionFund {
  return {
    id: buildId(p),
    company: p.providerName,
    type: mapType(p.productType),
    subtype: mapSubtype(p.productType),
    balance: Math.round(p.balance || 0),
    mgmtFeeDeposit: p.mgmtFeeDeposit ?? 0,
    mgmtFeeBalance: p.mgmtFeeBalance ?? 0,
    track: p.planName || p.productTypeLabel || "כללי",
    monthlyContrib: Math.round(p.monthlyContrib || 0),
  };
}

interface MergeResult {
  funds: PensionFund[];
  added: number;
  updated: number;
  unchanged: number;
}

/**
 * Match an incoming policy against existing funds.
 *
 * Strategy (in priority order):
 *   1. Exact id match (re-upload of same report)
 *   2. Same company + type + similar track name
 *   3. Same company + type (single fund of that type)
 */
function findMatch(existing: PensionFund[], incoming: PensionFund): number {
  // 1. Exact id
  const idIdx = existing.findIndex((f) => f.id === incoming.id);
  if (idIdx >= 0) return idIdx;

  // 2. Company + type + similar track
  const sameCompanyType = existing
    .map((f, i) => ({ f, i }))
    .filter(({ f }) => f.company === incoming.company && f.type === incoming.type);

  if (sameCompanyType.length === 1) return sameCompanyType[0].i;

  if (sameCompanyType.length > 1 && incoming.track) {
    const trackMatch = sameCompanyType.find(
      ({ f }) => f.track && (f.track.includes(incoming.track) || incoming.track.includes(f.track))
    );
    if (trackMatch) return trackMatch.i;
  }

  return -1;
}

/**
 * Merge a parsed bundle into an existing list of pension funds.
 * Returns the new list + counts of added / updated / unchanged.
 */
export function mergeAnnualIntoFunds(
  existing: PensionFund[],
  bundle: ParsedAnnualBundle
): MergeResult {
  const result: PensionFund[] = [...existing];
  let added = 0;
  let updated = 0;
  let unchanged = 0;

  for (const policy of bundle.policies) {
    const incoming = annualPolicyToFund(policy);
    const idx = findMatch(result, incoming);

    if (idx === -1) {
      result.push(incoming);
      added++;
      continue;
    }

    // Merge — preserve manual fields (conversionFactor, guaranteedRate,
    // insuranceCover, registeredFundId), update factual ones from the report.
    const old = result[idx];
    const merged: PensionFund = {
      ...old,
      company: incoming.company,
      type: incoming.type,
      subtype: incoming.subtype || old.subtype,
      balance: incoming.balance,
      mgmtFeeBalance: incoming.mgmtFeeBalance || old.mgmtFeeBalance,
      mgmtFeeDeposit: incoming.mgmtFeeDeposit || old.mgmtFeeDeposit,
      track: incoming.track || old.track,
      monthlyContrib: incoming.monthlyContrib || old.monthlyContrib,
    };

    const isSame =
      old.balance === merged.balance &&
      old.mgmtFeeBalance === merged.mgmtFeeBalance &&
      old.mgmtFeeDeposit === merged.mgmtFeeDeposit &&
      old.monthlyContrib === merged.monthlyContrib &&
      old.track === merged.track;

    if (isSame) {
      unchanged++;
    } else {
      result[idx] = merged;
      updated++;
    }
  }

  return { funds: result, added, updated, unchanged };
}
