"use client";

/**
 * /m — Mobile home.
 *
 * One-screen summary: how the month is going, the closest goal, and
 * total net worth. Three glance-cards. No drill-down lives here —
 * the bottom tab bar owns navigation. This page is a hub, not a tool.
 *
 * Per Nir 2026-05-23: "ברור שחייב עמוד בית עם סרגל תחתון" — restored
 * after a short-lived experiment where /m redirected straight to
 * /m/budget. The home keeps the daily-use loop alive (delta-since-
 * last-visit + days-remaining) without duplicating the cashflow tool.
 */

import { useEffect, useState } from "react";
import { fmtILS } from "@/lib/format";
import { buildBudgetLines, totalBudget } from "@/lib/budget-store";
import { loadBuckets } from "@/lib/buckets-store";
import type { Bucket } from "@/lib/_shared/buckets-core";
import {
  computeCurrentNetWorth,
  sumAssetPools,
  sumLiabilityPools,
} from "@/lib/balance-history-store";
import { loadParsedTransactions } from "@/lib/budget-import";
import { scopedKey } from "@/lib/client-scope";
import { AddExpenseSheet } from "./budget/AddExpenseSheet";

type BudgetSummary = { actual: number; budget: number; remaining: number };
type NetWorthSummary = {
  totalAssets: number;
  totalLiabilities: number;
  netWorth: number;
};
type VisitDelta = { added: number; count: number; lastVisit: Date };

const LAST_VISIT_KEY = "verdant:m:last_visit";
const PRIORITY_RANK: Record<string, number> = { high: 0, medium: 1, low: 2 };

export default function MobileHomePage() {
  const [hydrated, setHydrated] = useState(false);
  const [budget, setBudget] = useState<BudgetSummary | null>(null);
  const [nextGoal, setNextGoal] = useState<Bucket | null>(null);
  const [networth, setNetworth] = useState<NetWorthSummary | null>(null);
  const [visitDelta, setVisitDelta] = useState<VisitDelta | null>(null);
  const [today, setToday] = useState("");
  const [greeting, setGreeting] = useState("שלום");
  const [quickAddOpen, setQuickAddOpen] = useState(false);
  const [refreshTick, setRefreshTick] = useState(0);

  useEffect(() => {
    try {
      const lines = buildBudgetLines(0);
      setBudget(totalBudget(lines));
    } catch {
      setBudget({ actual: 0, budget: 0, remaining: 0 });
    }

    try {
      setNextGoal(pickNextGoal(loadBuckets()));
    } catch {
      setNextGoal(null);
    }

    try {
      const b = computeCurrentNetWorth();
      const totalAssets = sumAssetPools(b);
      const totalLiabilities = sumLiabilityPools(b);
      setNetworth({ totalAssets, totalLiabilities, netWorth: totalAssets - totalLiabilities });
    } catch {
      setNetworth({ totalAssets: 0, totalLiabilities: 0, netWorth: 0 });
    }

    const now = new Date();
    setToday(
      now.toLocaleDateString("he-IL", {
        weekday: "long",
        day: "numeric",
        month: "long",
      })
    );
    // Time-of-day greeting — finance-agent visual fix #2 (2026-05-23).
    const hour = now.getHours();
    setGreeting(
      hour < 12 ? "בוקר טוב" : hour < 17 ? "צהריים טובים" : "ערב טוב"
    );

    // Visit-delta — read previous timestamp BEFORE overwriting it.
    try {
      const previousRaw = localStorage.getItem(scopedKey(LAST_VISIT_KEY));
      localStorage.setItem(scopedKey(LAST_VISIT_KEY), new Date().toISOString());

      if (previousRaw) {
        const previousVisit = new Date(previousRaw);
        const minSinceVisit = (Date.now() - previousVisit.getTime()) / 60_000;
        // Ignore micro-revisits (< 10 min, same session).
        if (!Number.isNaN(previousVisit.getTime()) && minSinceVisit > 10) {
          const newOnes = loadParsedTransactions().filter((t) => {
            const created = t.addedAt || t.date;
            if (!created) return false;
            const d = new Date(created);
            return (
              !Number.isNaN(d.getTime()) &&
              d.getTime() > previousVisit.getTime() &&
              t.amount > 0
            );
          });
          if (newOnes.length > 0) {
            setVisitDelta({
              added: newOnes.reduce((s, t) => s + t.amount, 0),
              count: newOnes.length,
              lastVisit: previousVisit,
            });
          }
        }
      }
    } catch {
      /* delta is informational only */
    }

    setHydrated(true);
  }, [refreshTick]);

  return (
    <main style={{ padding: "20px 16px 24px", color: "var(--morning-ink)" }} dir="rtl">
      {/* Header */}
      <header style={{ marginBottom: 18 }}>
        <div
          style={{
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: "0.18em",
            textTransform: "uppercase",
            color: "var(--morning-forest)",
          }}
        >
          plan
        </div>
        <h1
          style={{
            fontSize: 24,
            fontWeight: 800,
            margin: "4px 0 2px",
            letterSpacing: "-0.02em",
          }}
        >
          {greeting} 👋
        </h1>
        <div style={{ fontSize: 13, color: "var(--morning-muted)", minHeight: 18 }}>
          {today}
        </div>
      </header>

      {visitDelta && <VisitDeltaBanner delta={visitDelta} />}

      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <BudgetCard summary={budget} hydrated={hydrated} />
        <GoalCard goal={nextGoal} hydrated={hydrated} />
        <NetWorthCard summary={networth} hydrated={hydrated} />
      </div>

      {/* finance-agent "ONE thing": removes friction from the daily-use
          loop by surfacing the primary action directly from home. */}
      <button
        type="button"
        onClick={() => setQuickAddOpen(true)}
        style={{
          marginTop: 18,
          width: "100%",
          padding: "16px 18px",
          background: "var(--morning-forest)",
          color: "#ffffff",
          border: "none",
          borderRadius: 14,
          fontSize: 16,
          fontWeight: 700,
          cursor: "pointer",
          boxShadow: "var(--morning-shadow-fab)",
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 8,
        }}
      >
        <span className="material-symbols-outlined" style={{ fontSize: 22 }}>
          add
        </span>
        הוצאה מהירה
      </button>

      {quickAddOpen && (
        <AddExpenseSheet
          onClose={() => setQuickAddOpen(false)}
          onSaved={() => {
            setQuickAddOpen(false);
            setRefreshTick((t) => t + 1);
          }}
        />
      )}
    </main>
  );
}

/* ─────────────────────────────────────────────── */
/* Visit-delta banner                              */
/* ─────────────────────────────────────────────── */

function VisitDeltaBanner({ delta }: { delta: VisitDelta }) {
  const since = relativeHebrew(delta.lastVisit);
  return (
    <div
      style={{
        marginBottom: 14,
        padding: "10px 14px",
        background: "var(--morning-leaf-tint)",
        border: "1px solid var(--morning-border)",
        borderRadius: 12,
        fontSize: 13,
        color: "var(--morning-forest-deep)",
        display: "flex",
        alignItems: "center",
        gap: 8,
      }}
    >
      <span className="material-symbols-outlined" style={{ fontSize: 18 }}>
        history
      </span>
      <span>
        מאז {since} נוספו{" "}
        <span style={{ fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>
          {fmtILS(delta.added)}
        </span>{" "}
        ב-{delta.count.toLocaleString("he-IL")}{" "}
        {delta.count === 1 ? "הוצאה" : "הוצאות"}
      </span>
    </div>
  );
}

function relativeHebrew(d: Date): string {
  // finance-agent visual fix #3 (2026-05-23): "אתמול" only for 20-48h —
  // anything fresher reports actual hours so the banner stays honest.
  const diffH = (Date.now() - d.getTime()) / 3_600_000;
  if (diffH < 1) return "לפני כמה דקות";
  if (diffH < 20) return `לפני ${Math.round(diffH)} שעות`;
  if (diffH < 48) return "אתמול";
  const diffD = Math.round(diffH / 24);
  if (diffD < 7) return `לפני ${diffD} ימים`;
  if (diffD < 14) return "לפני שבוע";
  if (diffD < 30) return `לפני ${Math.round(diffD / 7)} שבועות`;
  return d.toLocaleDateString("he-IL", { day: "numeric", month: "long" });
}

/* ─────────────────────────────────────────────── */
/* Card primitives                                 */
/* ─────────────────────────────────────────────── */

const CARD: React.CSSProperties = {
  background: "var(--morning-surface)",
  border: "1px solid var(--morning-border)",
  borderRadius: 16,
  padding: 18,
  boxShadow: "var(--morning-shadow-card)",
};

const EYEBROW: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 700,
  letterSpacing: "0.16em",
  textTransform: "uppercase",
  color: "var(--morning-muted)",
};

const BIG_NUMBER: React.CSSProperties = {
  fontSize: 28,
  fontWeight: 800,
  letterSpacing: "-0.02em",
  fontVariantNumeric: "tabular-nums",
  marginTop: 6,
  color: "var(--morning-ink)",
};

const META: React.CSSProperties = {
  fontSize: 13,
  color: "var(--morning-muted)",
  marginTop: 4,
};

function Skeleton() {
  return (
    <div
      aria-hidden
      style={{
        height: 28,
        width: "55%",
        marginTop: 8,
        borderRadius: 6,
        background: "var(--morning-surface-3)",
      }}
    />
  );
}

function ProgressBar({ pct, color }: { pct: number; color: string }) {
  const clamped = Math.max(0, Math.min(100, pct));
  return (
    <div
      style={{
        marginTop: 12,
        height: 6,
        borderRadius: 999,
        background: "var(--morning-surface-3)",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          width: `${clamped}%`,
          height: "100%",
          background: color,
          borderRadius: 999,
          transition: "width 0.4s ease",
        }}
      />
    </div>
  );
}

/* ─────────────────────────────────────────────── */
/* Card 1: Budget                                  */
/* ─────────────────────────────────────────────── */

function BudgetCard({
  summary,
  hydrated,
}: {
  summary: BudgetSummary | null;
  hydrated: boolean;
}) {
  if (!hydrated || !summary) {
    return (
      <div style={CARD}>
        <div style={EYEBROW}>💰 תקציב החודש</div>
        <Skeleton />
      </div>
    );
  }

  const hasBudget = summary.budget > 0;
  const pct = hasBudget ? (summary.actual / summary.budget) * 100 : 0;
  const overspent = summary.remaining < 0;
  const barColor = overspent
    ? "var(--morning-coral)"
    : pct > 80
    ? "var(--morning-warning)"
    : "var(--morning-forest)";

  return (
    <div style={CARD}>
      <div style={EYEBROW}>💰 תקציב החודש</div>

      {!hasBudget ? (
        <div style={{ fontSize: 15, marginTop: 10, color: "var(--morning-muted)" }}>
          עוד לא הגדרת תקציב חודשי בדשבורד.
        </div>
      ) : (
        <>
          <div style={BIG_NUMBER}>{fmtILS(Math.abs(summary.remaining))}</div>
          <div style={META}>
            {overspent ? "חריגה מהתקציב" : "נותרו לחודש"} · מתוך{" "}
            {fmtILS(summary.budget)}
          </div>
          <ProgressBar pct={pct} color={barColor} />
          {!overspent && <DailyAllowance remaining={summary.remaining} />}
        </>
      )}
    </div>
  );
}

function DailyAllowance({ remaining }: { remaining: number }) {
  const [text, setText] = useState<string>("");

  useEffect(() => {
    const now = new Date();
    const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    const today = now.getDate();
    const daysLeft = Math.max(1, lastDay - today + 1);
    const perDay = Math.round(remaining / daysLeft);
    setText(`${daysLeft.toLocaleString("he-IL")} ימים · ${fmtILS(perDay)} ליום`);
  }, [remaining]);

  if (!text) return null;
  return (
    <div
      style={{
        marginTop: 10,
        padding: "6px 12px",
        background: "var(--morning-leaf-tint)",
        borderRadius: 999,
        fontSize: 12,
        fontWeight: 600,
        color: "var(--morning-forest-deep)",
        display: "inline-block",
        fontVariantNumeric: "tabular-nums",
      }}
    >
      {text}
    </div>
  );
}

/* ─────────────────────────────────────────────── */
/* Card 2: Next Goal                               */
/* ─────────────────────────────────────────────── */

function GoalCard({ goal, hydrated }: { goal: Bucket | null; hydrated: boolean }) {
  if (!hydrated) {
    return (
      <div style={CARD}>
        <div style={EYEBROW}>🎯 היעד הבא</div>
        <Skeleton />
      </div>
    );
  }

  if (!goal) {
    return (
      <div style={CARD}>
        <div style={EYEBROW}>🎯 היעד הבא</div>
        <div style={{ fontSize: 15, marginTop: 10, color: "var(--morning-muted)" }}>
          עוד לא הוגדרו יעדים בדשבורד.
        </div>
      </div>
    );
  }

  const pct = goal.targetAmount > 0 ? (goal.currentAmount / goal.targetAmount) * 100 : 0;

  return (
    <div style={CARD}>
      <div style={EYEBROW}>🎯 היעד הבא</div>
      <div style={{ fontSize: 17, fontWeight: 700, marginTop: 8 }}>{goal.name}</div>
      <div style={BIG_NUMBER}>{fmtILS(goal.currentAmount)}</div>
      <div style={META}>
        מתוך {fmtILS(goal.targetAmount)} · {Math.round(pct)}%
      </div>
      <ProgressBar pct={pct} color={goal.color || "var(--morning-forest)"} />
    </div>
  );
}

/* ─────────────────────────────────────────────── */
/* Card 3: Net Worth                               */
/* ─────────────────────────────────────────────── */

function NetWorthCard({
  summary,
  hydrated,
}: {
  summary: NetWorthSummary | null;
  hydrated: boolean;
}) {
  if (!hydrated || !summary) {
    return (
      <div style={CARD}>
        <div style={EYEBROW}>📊 שווי נטו</div>
        <Skeleton />
      </div>
    );
  }

  return (
    <div style={CARD}>
      <div style={EYEBROW}>📊 שווי נטו</div>
      <div style={BIG_NUMBER}>{fmtILS(summary.netWorth)}</div>
      <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
        <Chip label="נכסים" value={fmtILS(summary.totalAssets)} tone="forest" />
        <Chip label="חובות" value={fmtILS(summary.totalLiabilities)} tone="coral" />
      </div>
    </div>
  );
}

function Chip({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: "forest" | "coral";
}) {
  const bg = tone === "forest" ? "var(--morning-leaf-tint)" : "var(--morning-coral-soft)";
  const fg = tone === "forest" ? "var(--morning-forest-deep)" : "var(--morning-coral)";
  return (
    <div
      style={{
        padding: "6px 12px",
        borderRadius: 999,
        background: bg,
        fontSize: 12,
        fontWeight: 600,
        color: fg,
        display: "inline-flex",
        gap: 6,
        alignItems: "center",
      }}
    >
      <span style={{ opacity: 0.7 }}>{label}</span>
      <span style={{ fontVariantNumeric: "tabular-nums" }}>{value}</span>
    </div>
  );
}

/* ─────────────────────────────────────────────── */
/* Helpers                                         */
/* ─────────────────────────────────────────────── */

function pickNextGoal(buckets: Bucket[]): Bucket | null {
  const active = buckets.filter((b) => !b.archived && b.targetAmount > 0);
  if (active.length === 0) return null;
  return [...active].sort((a, b) => {
    const ra = PRIORITY_RANK[a.priority] ?? 1;
    const rb = PRIORITY_RANK[b.priority] ?? 1;
    if (ra !== rb) return ra - rb;
    return a.targetDate.localeCompare(b.targetDate);
  })[0];
}
