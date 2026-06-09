export interface MerchantCategoryVoteRecord {
  merchantKey: string;
  categoryKey: string;
  txCount: number;
  createdAt: string;
  sampleDescription?: string;
}

export interface MerchantCategoryRuleAggregate {
  merchantKey: string;
  categoryKey: string;
  count: number;
  firstSeenAt: string;
  updatedAt: string;
  sampleDescription?: string;
}

function normalizeInput(value: string | null | undefined): string {
  return String(value || "")
    .replace(/["\u200F\u200E]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Collapse raw learning votes into the currently winning category per merchant.
 *
 * Ranking:
 * 1. Highest weighted vote count wins.
 * 2. On a tie, the category that appeared first wins.
 * 3. On a remaining tie, category key order keeps the result deterministic.
 */
export function computeMerchantCategoryRulesFromVotes(
  votes: MerchantCategoryVoteRecord[]
): MerchantCategoryRuleAggregate[] {
  const grouped = new Map<string, Map<string, MerchantCategoryRuleAggregate>>();

  for (const vote of votes) {
    const merchantKey = normalizeInput(vote.merchantKey).toLowerCase();
    const categoryKey = normalizeInput(vote.categoryKey).toLowerCase();
    const txCount = Number(vote.txCount) || 0;
    const createdAt = vote.createdAt || new Date(0).toISOString();
    if (!merchantKey || !categoryKey || txCount <= 0) continue;

    let merchantMap = grouped.get(merchantKey);
    if (!merchantMap) {
      merchantMap = new Map();
      grouped.set(merchantKey, merchantMap);
    }

    const existing = merchantMap.get(categoryKey);
    if (existing) {
      existing.count += txCount;
      if (createdAt < existing.firstSeenAt) existing.firstSeenAt = createdAt;
      if (createdAt > existing.updatedAt) existing.updatedAt = createdAt;
      if (!existing.sampleDescription && vote.sampleDescription) {
        existing.sampleDescription = vote.sampleDescription;
      }
      continue;
    }

    merchantMap.set(categoryKey, {
      merchantKey,
      categoryKey,
      count: txCount,
      firstSeenAt: createdAt,
      updatedAt: createdAt,
      sampleDescription: vote.sampleDescription,
    });
  }

  const out: MerchantCategoryRuleAggregate[] = [];
  for (const [merchantKey, merchantMap] of grouped.entries()) {
    const categories = [...merchantMap.values()].sort((a, b) => {
      if (b.count !== a.count) return b.count - a.count;
      if (a.firstSeenAt !== b.firstSeenAt) return a.firstSeenAt.localeCompare(b.firstSeenAt);
      return a.categoryKey.localeCompare(b.categoryKey);
    });
    const winner = categories[0];
    if (winner) {
      out.push({
        ...winner,
        merchantKey,
      });
    }
  }

  return out.sort((a, b) => a.merchantKey.localeCompare(b.merchantKey, "he"));
}
