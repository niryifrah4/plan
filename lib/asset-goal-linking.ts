/**
 * ═══════════════════════════════════════════════════════════
 *  Asset → Goal Linking — Unified store (web)
 * ═══════════════════════════════════════════════════════════
 *
 * One source of truth for "coloring money" (צביעת כסף) across
 * ALL asset classes: securities, real estate, pension, cash.
 *
 * Each link is keyed by `${assetType}:${assetId}:${goalId}` so
 * a single asset can be split across multiple goals (e.g. a
 * security that is 60% retirement + 40% kids' education).
 *
 * Bucket currentAmount on /goals is computed LIVE from these
 * links — no manual maintenance. When any link changes we
 * dispatch `verdant:goals:updated` so /goals refreshes.
 *
 * Storage: localStorage key `verdant:asset_goal_links`
 *   Legacy shape (security-only, value=string): migrated on read.
 *   Legacy shape v2 (security-only, value={goalId,pct}): migrated on read.
 *   Current shape: { [linkKey]: AssetGoalLink }
 */

import { fireSync } from "./sync-engine";
import { scopedKey } from "./client-scope";

export type AssetType = "security" | "realestate" | "pension" | "cash";

export interface AssetGoalLink {
  assetId: string;
  assetType: AssetType;
  goalId: string;
  pct: number; // 0-100
}

const STORAGE_KEY = "verdant:asset_goal_links";

/* ─── Key helpers ─── */
export function linkKey(assetType: AssetType, assetId: string, goalId: string): string {
  return `${assetType}:${assetId}:${goalId}`;
}

/* ─── Load / save ─── */
export function loadLinks(): Record<string, AssetGoalLink> {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(scopedKey(STORAGE_KEY));
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return {};

    const result: Record<string, AssetGoalLink> = {};
    for (const [k, v] of Object.entries(parsed)) {
      // Current shape — key already contains assetType
      if (k.includes(":") && v && typeof v === "object" && "assetType" in (v as object)) {
        const link = v as AssetGoalLink;
        if (link.goalId && typeof link.pct === "number") {
          result[k] = { ...link, pct: clampPct(link.pct) };
        }
        continue;
      }
      // Legacy v2: { [secId]: { goalId, pct } }
      if (v && typeof v === "object" && "goalId" in (v as object)) {
        const legacy = v as { goalId: string; pct?: number };
        if (!legacy.goalId) continue;
        const migrated: AssetGoalLink = {
          assetId: k,
          assetType: "security",
          goalId: legacy.goalId,
          pct: clampPct(legacy.pct ?? 100),
        };
        result[linkKey("security", k, legacy.goalId)] = migrated;
        continue;
      }
      // Legacy v1: { [secId]: "goalId" }
      if (typeof v === "string" && v) {
        const migrated: AssetGoalLink = {
          assetId: k,
          assetType: "security",
          goalId: v,
          pct: 100,
        };
        result[linkKey("security", k, v)] = migrated;
      }
    }
    return result;
  } catch {
    return {};
  }
}

export function saveLinks(links: Record<string, AssetGoalLink>): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(scopedKey(STORAGE_KEY), JSON.stringify(links));
    fireSync("verdant:goals:updated");
  } catch (err) {
    console.error("[asset-goal-linking] save failed:", err);
  }
}

/* ─── Mutations ─── */

/** Set or remove a single (asset, goal) edge. pct=0 removes. */
export function setLink(assetType: AssetType, assetId: string, goalId: string, pct: number): void {
  const links = loadLinks();
  const key = linkKey(assetType, assetId, goalId);
  if (!goalId || pct <= 0) {
    delete links[key];
  } else {
    links[key] = { assetId, assetType, goalId, pct: clampPct(pct) };
  }
  saveLinks(links);
}

/** Remove all links for an asset (e.g. when a security is deleted). */
export function removeLinksForAsset(assetType: AssetType, assetId: string): void {
  const links = loadLinks();
  let changed = false;
  for (const k of Object.keys(links)) {
    if (links[k].assetType === assetType && links[k].assetId === assetId) {
      delete links[k];
      changed = true;
    }
  }
  if (changed) saveLinks(links);
}

/** Remove all links pointing to a goal (e.g. when a bucket is deleted). */
export function removeLinksForGoal(goalId: string): void {
  const links = loadLinks();
  let changed = false;
  for (const k of Object.keys(links)) {
    if (links[k].goalId === goalId) {
      delete links[k];
      changed = true;
    }
  }
  if (changed) saveLinks(links);
}

/* ─── Queries ─── */

export function getLinksForAsset(
  assetType: AssetType,
  assetId: string,
  links?: Record<string, AssetGoalLink>
): AssetGoalLink[] {
  const src = links ?? loadLinks();
  return Object.values(src).filter((l) => l.assetType === assetType && l.assetId === assetId);
}

export function getLinksForGoal(
  goalId: string,
  links?: Record<string, AssetGoalLink>
): AssetGoalLink[] {
  const src = links ?? loadLinks();
  return Object.values(src).filter((l) => l.goalId === goalId);
}

/** Total % of an asset already allocated to goals (for validation/warnings). */
export function totalAllocatedPct(
  assetType: AssetType,
  assetId: string,
  links?: Record<string, AssetGoalLink>
): number {
  return getLinksForAsset(assetType, assetId, links).reduce((s, l) => s + l.pct, 0);
}

/**
 * Resolve a goal's currentAmount by walking all linked assets.
 * `assetValueLookup(assetType, assetId)` returns the current market value
 * in ILS for a given asset, or 0 if unknown (asset deleted etc.).
 */
export function computeGoalAmountFromLinks(
  goalId: string,
  assetValueLookup: (assetType: AssetType, assetId: string) => number,
  links?: Record<string, AssetGoalLink>
): { total: number; byType: Record<AssetType, number> } {
  const byType: Record<AssetType, number> = {
    security: 0,
    realestate: 0,
    pension: 0,
    cash: 0,
  };
  const relevant = getLinksForGoal(goalId, links);
  for (const link of relevant) {
    const val = assetValueLookup(link.assetType, link.assetId);
    if (val <= 0) continue;
    const share = val * (link.pct / 100);
    byType[link.assetType] += share;
  }
  const total = byType.security + byType.realestate + byType.pension + byType.cash;
  return { total, byType };
}

/* ─── Utils ─── */
function clampPct(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(100, Math.round(n)));
}
