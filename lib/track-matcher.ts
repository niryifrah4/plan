/**
 * track-matcher — fuzzy match free-text track names (from Mislaka XML or
 * manual entry) against the FUND_REGISTRY.
 *
 * Built 2026-04-28 to enable risk + geography pies on /pension. Without a
 * `registeredFundId`, a fund contributes only to the "by type" pie — no risk
 * or geo data. Mislaka exports give us only `<SHEM-MASLUL-HASHKAA>` (free
 * text), so we need this bridge.
 *
 * Strategy:
 *  1. Normalize names (strip whitespace, common prefixes/suffixes).
 *  2. Filter registry by provider + product type — narrows search a lot.
 *  3. Score by token-overlap; pick highest if confidence >= threshold.
 *  4. Return matched id + confidence so the UI can ask the user to confirm
 *     low-confidence matches.
 */

import { FUND_REGISTRY, type RegisteredFund } from "./fund-registry";

export interface MatchResult {
  fundId: string | null;
  confidence: number; // 0..1
  candidates: Array<{ id: string; name: string; score: number }>;
}

const STOPWORDS = new Set([
  "מסלול",
  "קרן",
  "השקעה",
  "השקעות",
  "כללי",
  "סוג",
  "fund",
  "track",
  "general",
]);

function normalize(s: string): string {
  return (s || "")
    .toLowerCase()
    .replace(/["׳״'()]/g, " ")
    .replace(/[־–—]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenize(s: string): string[] {
  return normalize(s)
    .split(" ")
    .filter((t) => t.length >= 2 && !STOPWORDS.has(t));
}

function tokenScore(a: string[], b: string[]): number {
  if (!a.length || !b.length) return 0;
  const setB = new Set(b);
  const overlap = a.filter((t) => setB.has(t)).length;
  // Jaccard-like: overlap / union
  const union = new Set([...a, ...b]).size;
  return overlap / Math.max(1, union);
}

/**
 * Match a track name to a registered fund.
 *
 * @param trackName Free-text track name (e.g. "מסלול מניות חו״ל")
 * @param provider Provider name (e.g. "מיטב") — narrows search
 * @param productType Optional: "pension" | "gemel" | "hishtalmut" | "bituach"
 * @param threshold Minimum confidence to return a positive match (default 0.4)
 */
export function matchFundByTrack(
  trackName: string,
  provider: string,
  productType?: RegisteredFund["type"],
  threshold = 0.4
): MatchResult {
  const trackTokens = tokenize(trackName);
  const providerNorm = normalize(provider);

  // Narrow by provider (substring match — registry uses canonical names).
  let pool = FUND_REGISTRY.filter(
    (f) =>
      normalize(f.provider).includes(providerNorm) || providerNorm.includes(normalize(f.provider))
  );
  if (productType) {
    pool = pool.filter((f) => f.type === productType);
  }

  if (pool.length === 0 || trackTokens.length === 0) {
    return { fundId: null, confidence: 0, candidates: [] };
  }

  const scored = pool
    .map((f) => {
      const fundTokens = tokenize(f.name);
      return { id: f.id, name: f.name, score: tokenScore(trackTokens, fundTokens) };
    })
    .sort((a, b) => b.score - a.score);

  const best = scored[0];
  return {
    fundId: best.score >= threshold ? best.id : null,
    confidence: best.score,
    candidates: scored.slice(0, 5),
  };
}
