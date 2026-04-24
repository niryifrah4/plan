"use client";

/**
 * ═══════════════════════════════════════════════════════════
 *  <GoalLinker /> — Universal "color money" control
 * ═══════════════════════════════════════════════════════════
 *
 * Drop this into ANY asset row/card (security, property, pension
 * fund, cash bucket) to link that asset to one or more goals with
 * percentage allocations. All storage + bucket recalculation is
 * handled by `lib/asset-goal-linking`.
 *
 * UX (compact mode, default):
 *   dropdown → select goal, % input → 100 by default
 *   "+ עוד יעד" → reveals another (goal, %) row
 *   shows "₪X צבוע" below when pct<100 or when there are multiple links
 *
 * The component self-subscribes to `verdant:goals:updated` so any
 * change elsewhere (new bucket created in /goals) is reflected
 * immediately without prop drilling.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { fmtILS } from "@/lib/format";
import { onSync } from "@/lib/sync-engine";
import { loadBuckets, type Bucket } from "@/lib/buckets-store";
import {
  loadLinks,
  setLink,
  getLinksForAsset,
  totalAllocatedPct,
  type AssetType,
  type AssetGoalLink,
} from "@/lib/asset-goal-linking";

interface Props {
  assetType: AssetType;
  assetId: string;
  /** Current market value in ILS — used to show "₪ צבוע ליעד" */
  assetValue: number;
  /** "compact" fits in a table cell; "card" is roomier with labels */
  variant?: "compact" | "card";
  /** If true, allow splitting across multiple goals (+ עוד יעד) */
  allowMulti?: boolean;
}

export function GoalLinker({ assetType, assetId, assetValue, variant = "compact", allowMulti = true }: Props) {
  const [buckets, setBuckets] = useState<Bucket[]>([]);
  const [links, setLinks] = useState<AssetGoalLink[]>([]);
  const [showAdd, setShowAdd] = useState(false);

  const refresh = useCallback(() => {
    setBuckets(loadBuckets());
    setLinks(getLinksForAsset(assetType, assetId, loadLinks()));
  }, [assetType, assetId]);

  useEffect(() => {
    refresh();
    const unsub = onSync("verdant:goals:updated", refresh);
    return unsub;
  }, [refresh]);

  const handleSelectChange = (oldGoalId: string, newGoalId: string, pct: number) => {
    // Clear old edge first if goal changed
    if (oldGoalId && oldGoalId !== newGoalId) {
      setLink(assetType, assetId, oldGoalId, 0);
    }
    if (newGoalId) {
      setLink(assetType, assetId, newGoalId, pct);
    }
    setShowAdd(false);
    refresh();
  };

  const handlePctChange = (goalId: string, pct: number) => {
    setLink(assetType, assetId, goalId, pct);
    refresh();
  };

  const handleRemove = (goalId: string) => {
    setLink(assetType, assetId, goalId, 0);
    refresh();
  };

  const totalPct = useMemo(() => totalAllocatedPct(assetType, assetId, Object.fromEntries(links.map(l => [`${l.assetType}:${l.assetId}:${l.goalId}`, l]))), [links, assetType, assetId]);
  const overAllocated = totalPct > 100;

  // Hide already-linked goals from "add more" dropdown
  const availableBuckets = useMemo(() => {
    const used = new Set(links.map(l => l.goalId));
    return buckets.filter(b => !used.has(b.id));
  }, [buckets, links]);

  // Empty state — no buckets at all
  if (buckets.length === 0) {
    return (
      <div className={variant === "card" ? "text-[11px] text-verdant-muted" : "text-[10px] text-verdant-muted"}>
        לא הוגדרו יעדים
      </div>
    );
  }

  const selectCls =
    variant === "card"
      ? "text-[12px] font-bold rounded-lg px-2.5 py-1.5 border outline-none bg-white"
      : "text-[10px] font-bold rounded px-1.5 py-1 border outline-none max-w-[130px]";
  const pctInputCls =
    variant === "card"
      ? "w-14 text-[12px] font-bold text-center rounded-lg border px-1.5 py-1.5 outline-none tabular"
      : "w-10 text-[10px] font-bold text-center rounded border px-1 py-1 outline-none tabular";

  return (
    <div className={variant === "card" ? "space-y-1.5" : "space-y-1"}>
      {/* Existing links */}
      {links.map((link) => {
        const bucket = buckets.find((b) => b.id === link.goalId);
        return (
          <div key={link.goalId} className="flex items-center gap-1.5">
            <select
              value={link.goalId}
              onChange={(e) => handleSelectChange(link.goalId, e.target.value, link.pct)}
              className={selectCls}
              style={{ borderColor: "#d8e0d0", background: "#f0fdf4" }}
            >
              {bucket && <option value={link.goalId}>{bucket.name}</option>}
              {buckets
                .filter((b) => b.id !== link.goalId && !links.some((l) => l.goalId === b.id))
                .map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
            </select>
            <div className="flex items-center gap-0.5">
              <input
                type="number"
                min={1}
                max={100}
                value={link.pct}
                onChange={(e) => handlePctChange(link.goalId, Number(e.target.value))}
                className={pctInputCls}
                style={{ borderColor: "#d8e0d0", background: "#f0fdf4" }}
              />
              <span className="text-[9px] text-verdant-muted font-bold">%</span>
            </div>
            <button
              onClick={() => handleRemove(link.goalId)}
              className="p-0.5 rounded hover:bg-red-50"
              title="הסר שיוך"
            >
              <span className="material-symbols-outlined text-[14px] text-red-400">close</span>
            </button>
          </div>
        );
      })}

      {/* "Add new link" row — shown when no links yet, or explicitly */}
      {(links.length === 0 || showAdd) && availableBuckets.length > 0 && (
        <div className="flex items-center gap-1.5">
          <select
            value=""
            onChange={(e) => {
              if (e.target.value) handleSelectChange("", e.target.value, 100);
            }}
            className={selectCls}
            style={{ borderColor: "#d8e0d0", background: "#fff" }}
          >
            <option value="">ללא שיוך</option>
            {availableBuckets.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* "+ עוד יעד" button — only when multi + there are unused buckets */}
      {allowMulti && links.length > 0 && !showAdd && availableBuckets.length > 0 && (
        <button
          onClick={() => setShowAdd(true)}
          className="text-[10px] font-bold text-verdant-emerald hover:underline"
        >
          + עוד יעד
        </button>
      )}

      {/* Warning when over-allocated */}
      {overAllocated && (
        <div className="text-[9px] font-bold" style={{ color: "#b91c1c" }}>
          ⚠ שיוך {totalPct}% — חריגה
        </div>
      )}

      {/* Show colored amount when pct<100 or multi */}
      {assetValue > 0 && totalPct > 0 && (totalPct < 100 || links.length > 1) && !overAllocated && (
        <div className="text-[9px] text-verdant-muted">
          {fmtILS(Math.round((assetValue * totalPct) / 100))} צבוע ({totalPct}%)
        </div>
      )}
    </div>
  );
}
