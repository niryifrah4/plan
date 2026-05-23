"use client";

/**
 * /m/balance — Mobile net-worth & growth.
 *
 * Read-only summary of the household's wealth: the big number, the
 * breakdown (cash, investments, pension, real estate, goals, debt,
 * mortgages), monthly delta, and a growth chart of past snapshots.
 *
 * The single write action is "📸 צלם snapshot" — captures the current
 * computed net worth into balance-history-store, which both the desktop
 * /balance and this page read. One snapshot per calendar month
 * (addSnapshot replaces same-month entries automatically).
 */

import { useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { fmtILS } from "@/lib/format";
import {
  computeCurrentNetWorth,
  buildSnapshotFromCurrent,
  addSnapshot,
  loadHistory,
  sumAssetPools,
  sumLiabilityPools,
  BALANCE_HISTORY_EVENT,
  type NetWorthBreakdown,
  type NetWorthSnapshot,
} from "@/lib/balance-history-store";

const NetWorthHistoryChart = dynamic(
  () =>
    import("@/components/balance/NetWorthHistoryChart").then(
      (m) => m.NetWorthHistoryChart
    ),
  { ssr: false, loading: () => <ChartSkeleton /> }
);

interface Live {
  breakdown: NetWorthBreakdown;
  totalAssets: number;
  totalLiabilities: number;
  netWorth: number;
}

/** Asset pools that count toward net worth. Goals are NOT here — they're
 *  an earmark on existing cash/investments and shown below as a tracking
 *  row, not an asset. */
const ASSET_GROUPS: Array<{
  key: keyof NetWorthBreakdown;
  label: string;
  icon: string;
}> = [
  { key: "cash", label: "מזומן וחשבונות", icon: "savings" },
  { key: "investments", label: "השקעות וני״ע", icon: "show_chart" },
  { key: "pension", label: "פנסיוני", icon: "elderly" },
  { key: "realestate", label: "נדל״ן", icon: "home" },
];

const LIAB_GROUPS: Array<{
  key: keyof NetWorthBreakdown;
  label: string;
  icon: string;
}> = [
  { key: "mortgages", label: "משכנתאות", icon: "account_balance" },
  { key: "debt", label: "הלוואות וקרדיט", icon: "credit_card" },
];

export default function MobileBalancePage() {
  const [live, setLive] = useState<Live | null>(null);
  const [history, setHistory] = useState<NetWorthSnapshot[] | null>(null);
  const [taking, setTaking] = useState(false);

  const refresh = () => {
    try {
      const breakdown = computeCurrentNetWorth();
      // Use shared aggregators so the page matches buildSnapshotFromCurrent
      // exactly (goals excluded — they're an earmark layer, not an asset).
      const totalAssets = sumAssetPools(breakdown);
      const totalLiabilities = sumLiabilityPools(breakdown);
      setLive({
        breakdown,
        totalAssets,
        totalLiabilities,
        netWorth: totalAssets - totalLiabilities,
      });
    } catch {
      setLive(null);
    }
    try {
      setHistory(loadHistory());
    } catch {
      setHistory([]);
    }
  };

  useEffect(() => {
    refresh();
    const onUpdate = () => refresh();
    const events = [
      BALANCE_HISTORY_EVENT,
      "verdant:accounts:updated",
      "verdant:pension:updated",
      "verdant:realestate:updated",
      "verdant:debt:updated",
      "verdant:goals:updated",
      "verdant:securities:updated",
      "storage",
    ];
    events.forEach((e) => window.addEventListener(e, onUpdate));
    return () => events.forEach((e) => window.removeEventListener(e, onUpdate));
  }, []);

  const delta = useMemo(() => {
    if (!live || !history || history.length === 0) return null;
    const previous = history[history.length - 1];
    if (!previous || previous.netWorth === 0) return null;
    const diff = live.netWorth - previous.netWorth;
    const pct = (diff / Math.abs(previous.netWorth)) * 100;
    return { diff, pct, prevDate: previous.date };
  }, [live, history]);

  const handleSnapshot = async () => {
    setTaking(true);
    try {
      const snap = buildSnapshotFromCurrent();
      addSnapshot(snap);
      refresh();
    } catch {
      // swallow — UI will show no change if it failed
    } finally {
      setTaking(false);
    }
  };

  return (
    <main style={{ padding: "16px 14px 32px", color: "var(--morning-ink)" }} dir="rtl">
      <h1 style={{ fontSize: 18, fontWeight: 700, letterSpacing: "-0.01em", margin: 0 }}>
        שווי נטו{" "}
        <span style={{ color: "var(--morning-muted)", fontWeight: 500 }}>וצמיחה</span>
      </h1>

      {/* HERO */}
      <NetWorthHero live={live} delta={delta} />

      {/* SNAPSHOT BUTTON */}
      <button
        type="button"
        onClick={handleSnapshot}
        disabled={taking || !live}
        style={{
          marginTop: 12,
          width: "100%",
          padding: "12px 16px",
          background: live && !taking ? "var(--morning-forest)" : "var(--morning-surface-3)",
          color: live && !taking ? "#ffffff" : "var(--morning-subtle)",
          border: "none",
          borderRadius: 12,
          fontSize: 14,
          fontWeight: 700,
          cursor: live && !taking ? "pointer" : "not-allowed",
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 8,
        }}
      >
        <span className="material-symbols-outlined" style={{ fontSize: 20 }}>
          photo_camera
        </span>
        {taking ? "שומר..." : "צילום מצב להיסטוריה"}
      </button>

      {/* CHART — always open, projection below */}
      <SectionTitle title="צמיחה לאורך זמן" />
      <div
        style={{
          marginTop: 6,
          background: "var(--morning-surface)",
          border: "1px solid var(--morning-border)",
          borderRadius: 12,
          padding: 12,
        }}
      >
        {history === null ? (
          <ChartSkeleton />
        ) : (
          <NetWorthHistoryChart snapshots={history} />
        )}
      </div>
      <GrowthProjection history={history} live={live} />

      {/* BREAKDOWN — assets */}
      <SectionTitle title="נכסים" total={live ? fmtILS(live.totalAssets) : null} />
      <RoundedList>
        {ASSET_GROUPS.map((g, i) => (
          <BreakdownRow
            key={g.key}
            label={g.label}
            icon={g.icon}
            value={live ? live.breakdown[g.key] : null}
            tone="forest"
            divider={i < ASSET_GROUPS.length - 1}
          />
        ))}
      </RoundedList>

      {/* Earmarks — buckets sit on top of cash/investments, not added separately */}
      {live && live.breakdown.goals > 0 && (
        <>
          <SectionTitle title="קופות מסומנות" />
          <div
            style={{
              background: "var(--morning-leaf-tint)",
              border: "1px solid var(--morning-border)",
              borderRadius: 12,
              padding: "10px 14px",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              fontSize: 13,
              color: "var(--morning-forest-deep)",
            }}
          >
            <span>
              ייעוד פנימי בתוך הנכסים — {fmtILS(live.breakdown.goals)}
            </span>
            <span style={{ fontSize: 11, opacity: 0.75 }}>לא נוסף לסך</span>
          </div>
        </>
      )}

      {/* BREAKDOWN — liabilities */}
      <SectionTitle
        title="התחייבויות"
        total={live ? fmtILS(live.totalLiabilities) : null}
      />
      <RoundedList>
        {LIAB_GROUPS.map((g, i) => (
          <BreakdownRow
            key={g.key}
            label={g.label}
            icon={g.icon}
            value={live ? live.breakdown[g.key] : null}
            tone="coral"
            divider={i < LIAB_GROUPS.length - 1}
          />
        ))}
      </RoundedList>
    </main>
  );
}

/* ─────────────────────────────────────────────── */

function NetWorthHero({
  live,
  delta,
}: {
  live: Live | null;
  delta: { diff: number; pct: number; prevDate: string } | null;
}) {
  if (!live) {
    return (
      <div
        aria-hidden
        style={{
          marginTop: 12,
          height: 130,
          background: "var(--morning-surface-2)",
          border: "1px solid var(--morning-border)",
          borderRadius: 16,
        }}
      />
    );
  }

  const positive = live.netWorth >= 0;

  return (
    <div
      style={{
        marginTop: 12,
        background: "var(--morning-surface)",
        border: "1px solid var(--morning-border)",
        borderRadius: 16,
        padding: 18,
        boxShadow: "var(--morning-shadow-card)",
        textAlign: "center",
      }}
    >
      <div
        style={{
          fontSize: 11,
          fontWeight: 700,
          color: "var(--morning-muted)",
          letterSpacing: "0.16em",
          textTransform: "uppercase",
        }}
      >
        השווי הנקי שלך
      </div>
      <div
        style={{
          marginTop: 6,
          fontSize: 34,
          fontWeight: 800,
          letterSpacing: "-0.02em",
          color: positive ? "var(--morning-ink)" : "var(--morning-coral)",
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {fmtILS(live.netWorth)}
      </div>
      {delta && (
        <div
          style={{
            marginTop: 8,
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            padding: "4px 12px",
            borderRadius: 999,
            background:
              delta.diff >= 0 ? "var(--morning-leaf-tint)" : "var(--morning-coral-soft)",
            color: delta.diff >= 0 ? "var(--morning-forest-deep)" : "var(--morning-coral)",
            fontSize: 13,
            fontWeight: 700,
            fontVariantNumeric: "tabular-nums",
          }}
        >
          <span className="material-symbols-outlined" style={{ fontSize: 16 }}>
            {delta.diff >= 0 ? "trending_up" : "trending_down"}
          </span>
          {delta.diff >= 0 ? "+" : ""}
          {fmtILS(delta.diff)} ({delta.pct >= 0 ? "+" : ""}
          {delta.pct.toFixed(1)}%)
          <span style={{ opacity: 0.7, fontWeight: 500 }}> מהצילום הקודם</span>
        </div>
      )}
      {!delta && (
        <div style={{ marginTop: 8, fontSize: 12, color: "var(--morning-subtle)" }}>
          טרם נשמר צילום מצב — לחץ למטה כדי להתחיל לעקוב.
        </div>
      )}
    </div>
  );
}

/* ─────────────────────────────────────────────── */

function SectionTitle({ title, total }: { title: string; total?: string | null }) {
  return (
    <div
      style={{
        marginTop: 18,
        marginBottom: 6,
        display: "flex",
        justifyContent: "space-between",
        alignItems: "baseline",
      }}
    >
      <h2
        style={{
          fontSize: 14,
          fontWeight: 700,
          margin: 0,
          color: "var(--morning-ink)",
        }}
      >
        {title}
      </h2>
      {total !== undefined && total !== null && (
        <span
          style={{
            fontSize: 13,
            fontWeight: 700,
            color: "var(--morning-ink)",
            fontVariantNumeric: "tabular-nums",
          }}
        >
          {total}
        </span>
      )}
    </div>
  );
}

function RoundedList({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        background: "var(--morning-surface)",
        border: "1px solid var(--morning-border)",
        borderRadius: 14,
        overflow: "hidden",
        boxShadow: "var(--morning-shadow-card)",
      }}
    >
      {children}
    </div>
  );
}

function BreakdownRow({
  label,
  icon,
  value,
  tone,
  divider,
}: {
  label: string;
  icon: string;
  value: number | null;
  tone: "forest" | "coral";
  divider: boolean;
}) {
  const color =
    tone === "forest" ? "var(--morning-forest)" : "var(--morning-coral)";
  return (
    <div
      style={{
        padding: "12px 14px",
        borderBottom: divider ? "1px solid var(--morning-border)" : "none",
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        gap: 10,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
        <span
          aria-hidden
          style={{
            width: 28,
            height: 28,
            borderRadius: 999,
            background:
              tone === "forest"
                ? "var(--morning-leaf-tint)"
                : "var(--morning-coral-soft)",
            color,
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
          }}
        >
          <span className="material-symbols-outlined" style={{ fontSize: 16 }}>
            {icon}
          </span>
        </span>
        <span style={{ fontSize: 14, fontWeight: 600 }}>{label}</span>
      </div>
      <span
        style={{
          fontSize: 14,
          fontWeight: 700,
          fontVariantNumeric: "tabular-nums",
          color: "var(--morning-ink)",
          flexShrink: 0,
        }}
      >
        {value === null ? "—" : fmtILS(value)}
      </span>
    </div>
  );
}

function ChartSkeleton() {
  return (
    <div
      aria-hidden
      style={{
        height: 220,
        background: "var(--morning-surface-2)",
        borderRadius: 12,
      }}
    />
  );
}

/* ─────────────────────────────────────────────── */
/* Growth projection — "at the current pace,     */
/* you'll reach X in Y years." Lightweight text  */
/* under the chart. No code-heavy projection line */
/* on the graph itself — keeps the chart clean.   */
/* ─────────────────────────────────────────────── */

function GrowthProjection({
  history,
  live,
}: {
  history: NetWorthSnapshot[] | null;
  live: Live | null;
}) {
  if (!history || !live) return null;

  // Need at least 3 snapshots to compute a meaningful trend.
  if (history.length < 3) {
    return (
      <div
        style={{
          marginTop: 8,
          padding: "10px 14px",
          background: "var(--morning-bg)",
          border: "1px dashed var(--morning-border)",
          borderRadius: 10,
          fontSize: 12,
          color: "var(--morning-muted)",
          textAlign: "center",
        }}
      >
        עוד {3 - history.length} צילומי מצב ותתחיל להופיע תחזית צמיחה.
      </div>
    );
  }

  const first = history[0];
  const last = history[history.length - 1];
  const firstDate = new Date(first.date);
  const lastDate = new Date(last.date);
  const monthsSpanned = Math.max(
    1,
    (lastDate.getFullYear() - firstDate.getFullYear()) * 12 +
      (lastDate.getMonth() - firstDate.getMonth())
  );
  const totalGrowth = last.netWorth - first.netWorth;
  const monthlyGrowth = totalGrowth / monthsSpanned;

  // If trend is flat or negative, don't promise a milestone — just show the
  // monthly average so Nir can have an honest conversation.
  if (monthlyGrowth <= 0) {
    return (
      <div
        style={{
          marginTop: 8,
          padding: "10px 14px",
          background: "var(--morning-coral-soft)",
          border: "1px solid var(--morning-border)",
          borderRadius: 10,
          fontSize: 13,
          color: "var(--morning-coral)",
          lineHeight: 1.5,
        }}
      >
        <span style={{ fontWeight: 700 }}>שינוי ממוצע: {fmtILS(monthlyGrowth)}/חודש.</span>{" "}
        שווה לפתוח שיחה — צמיחה שלילית או שטוחה לאורך {monthsSpanned} חודשים.
      </div>
    );
  }

  // Project forward — pick a meaningful round milestone.
  const milestone = pickMilestone(last.netWorth);
  if (milestone === null) {
    return (
      <div
        style={{
          marginTop: 8,
          padding: "10px 14px",
          background: "var(--morning-leaf-tint)",
          border: "1px solid var(--morning-border)",
          borderRadius: 10,
          fontSize: 13,
          color: "var(--morning-forest-deep)",
          fontVariantNumeric: "tabular-nums",
        }}
      >
        בקצב הנוכחי ({fmtILS(monthlyGrowth)}/חודש) השווי גדל בעקביות.
      </div>
    );
  }

  const monthsToMilestone = Math.ceil((milestone - last.netWorth) / monthlyGrowth);
  const years = monthsToMilestone / 12;
  const eta =
    years >= 1
      ? `${years.toFixed(years >= 5 ? 0 : 1)} שנים`
      : `${monthsToMilestone} חודשים`;

  return (
    <div
      style={{
        marginTop: 8,
        padding: "12px 14px",
        background: "var(--morning-leaf-tint)",
        border: "1px solid var(--morning-border)",
        borderRadius: 12,
        fontSize: 13,
        color: "var(--morning-forest-deep)",
        lineHeight: 1.5,
      }}
    >
      <div style={{ fontVariantNumeric: "tabular-nums" }}>
        בקצב הנוכחי <span style={{ fontWeight: 700 }}>{fmtILS(monthlyGrowth)}</span>/חודש —
      </div>
      <div style={{ marginTop: 2, fontVariantNumeric: "tabular-nums" }}>
        תגיעו ל-<span style={{ fontWeight: 800 }}>{fmtILS(milestone)}</span> בעוד{" "}
        <span style={{ fontWeight: 700 }}>{eta}</span>.
      </div>
    </div>
  );
}

function pickMilestone(current: number): number | null {
  // Round up to the next "feel-good" milestone — useful round numbers in ₪.
  const milestones = [
    100_000, 250_000, 500_000, 750_000, 1_000_000, 1_500_000, 2_000_000,
    3_000_000, 5_000_000, 7_500_000, 10_000_000,
  ];
  for (const m of milestones) {
    if (m > current * 1.05) return m; // need at least 5% headroom
  }
  return null;
}
