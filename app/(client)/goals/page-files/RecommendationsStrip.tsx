"use client";

import type { Bucket } from "@/lib/buckets-store";
import type { BucketProjection } from "@shared/buckets-rebalancing";
import { fmtILS } from "@/lib/format";

interface ItemBucket {
  bucket: Bucket;
  proj: BucketProjection;
}

const TYPE_LABEL: Record<string, string> = {
  free_up: "פוטנציאל שחרור",
  increase: "צריך תוספת",
  extend_date: "דחיית יעד",
  reach_now: "הגיע ליעד",
};

const TYPE_ICON: Record<string, string> = {
  free_up: "bolt",
  increase: "warning",
  extend_date: "event",
  reach_now: "check_circle",
};

const TYPE_BG: Record<string, string> = {
  free_up: "#ecfdf5",
  increase: "rgba(251,191,36,0.12)",
  extend_date: "#EFF6FF",
  reach_now: "#ecfdf5",
};

const TYPE_BORDER: Record<string, string> = {
  free_up: "#2C7A5A33",
  increase: "#f59e0b40",
  extend_date: "#2563eb33",
  reach_now: "#2C7A5A33",
};

const TYPE_FG: Record<string, string> = {
  free_up: "#065f46",
  increase: "#92400e",
  extend_date: "#1e40af",
  reach_now: "#065f46",
};

const PRIORITY_ORDER: Record<string, number> = {
  increase: 0,
  extend_date: 1,
  free_up: 2,
  reach_now: 3,
};

export function RecommendationsStrip({
  items,
  onItemClick,
}: {
  items: ItemBucket[];
  onItemClick: (bucketId: string) => void;
}) {
  const actionable = items
    .filter((i) => i.proj.recommendation.type !== "on_track")
    .sort(
      (a, b) =>
        (PRIORITY_ORDER[a.proj.recommendation.type] ?? 9) -
        (PRIORITY_ORDER[b.proj.recommendation.type] ?? 9)
    )
    .slice(0, 4);

  if (actionable.length === 0) return null;

  return (
    <section className="mb-6">
      <div className="mb-2 text-[10px] font-bold uppercase tracking-[0.15em] text-verdant-muted">
        דורש החלטה ({actionable.length})
      </div>
      <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
        {actionable.map(({ bucket, proj }) => {
          const t = proj.recommendation.type;
          return (
            <button
              key={bucket.id}
              type="button"
              onClick={() => onItemClick(bucket.id)}
              className="flex items-center gap-3 rounded-lg p-3 text-right transition-all hover:opacity-90"
              style={{
                background: TYPE_BG[t] || "#FAFAF7",
                border: `1px solid ${TYPE_BORDER[t] || "#E5E7EB"}`,
              }}
            >
              <span
                className="material-symbols-outlined shrink-0 text-[20px]"
                style={{ color: TYPE_FG[t] }}
              >
                {TYPE_ICON[t] || "info"}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span
                    className="truncate text-[12px] font-extrabold"
                    style={{ color: TYPE_FG[t] }}
                  >
                    {bucket.name}
                  </span>
                  <span
                    className="shrink-0 rounded-full px-1.5 py-0.5 text-[9px] font-bold"
                    style={{ background: "rgba(255,255,255,0.5)", color: TYPE_FG[t] }}
                  >
                    {TYPE_LABEL[t] || t}
                  </span>
                </div>
                <div
                  className="mt-0.5 truncate text-[10px] font-bold"
                  style={{ color: TYPE_FG[t], opacity: 0.85 }}
                >
                  {proj.recommendation.amount
                    ? `${fmtILS(proj.recommendation.amount)}/חודש — ${proj.recommendation.title}`
                    : proj.recommendation.title}
                </div>
              </div>
              <span
                className="material-symbols-outlined shrink-0 text-[16px]"
                style={{ color: TYPE_FG[t], opacity: 0.5 }}
              >
                arrow_back
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
