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
import { InsightsCard } from "./InsightsCard";

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
    <main style={{ color: "var(--morning-ink)" }} dir="rtl">
      {/* HERO — forest gradient with the headline net-worth number.
          Bleeds the column edges of the 480px frame for a true app feel. */}
      <section
        style={{
          background:
            "linear-gradient(135deg, var(--morning-forest) 0%, var(--morning-forest-deep) 100%)",
          color: "#ffffff",
          padding: "24px 20px 28px",
          borderRadius: "0 0 20px 20px",
          boxShadow: "0 6px 20px rgba(31, 90, 66, 0.18)",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "baseline",
          }}
        >
          <div>
            <div style={{ fontSize: 14, opacity: 0.92, fontWeight: 600 }}>
              {greeting} 👋
            </div>
            <div style={{ fontSize: 11, opacity: 0.72, marginTop: 2 }}>
              {today}
            </div>
          </div>
          <div
            style={{
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: "0.22em",
              textTransform: "uppercase",
              opacity: 0.72,
            }}
          >
            plan
          </div>
        </div>

        <div style={{ marginTop: 22 }}>
          <div style={{ fontSize: 11, opacity: 0.8, letterSpacing: "0.12em", textTransform: "uppercase", fontWeight: 700 }}>
            השווי הנקי שלך
          </div>
          <div
            style={{
              fontSize: 38,
              fontWeight: 800,
              letterSpacing: "-0.02em",
              fontVariantNumeric: "tabular-nums",
              marginTop: 4,
            }}
          >
            {hydrated && networth ? fmtILS(networth.netWorth) : "—"}
          </div>
          {hydrated && networth && (
            <div
              style={{
                marginTop: 6,
                fontSize: 12,
                opacity: 0.85,
                fontVariantNumeric: "tabular-nums",
              }}
            >
              נכסים {fmtILS(networth.totalAssets)} · חובות {fmtILS(networth.totalLiabilities)}
            </div>
          )}
        </div>
      </section>

      {/* Content area below the hero */}
      <div style={{ padding: "16px 16px 24px" }}>
        {visitDelta && <VisitDeltaBanner delta={visitDelta} />}

        <InsightsCard
          refreshKey={refreshTick}
          onOpenQuickAdd={() => setQuickAddOpen(true)}
        />

        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <BudgetCard summary={budget} hydrated={hydrated} />
          <GoalCard goal={nextGoal} hydrated={hydrated} />
        </div>

        {/* Quick-expense — the daily-use loop opener */}
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
      </div>

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
  fontSize: 34,
  fontWeight: 800,
  letterSpacing: "-0.02em",
  fontVariantNumeric: "tabular-nums",
  marginTop: 6,
  color: "var(--morning-ink)",
  lineHeight: 1.1,
};

/** Pastel-circle icon + eyebrow header for the home cards. */
function CardHeader({
  icon,
  label,
  tint = "forest",
}: {
  icon: string;
  label: string;
  tint?: "forest" | "coral" | "amber" | "violet";
}) {
  const bg =
    tint === "coral"
      ? "var(--morning-coral-soft)"
      : tint === "amber"
      ? "var(--morning-warning-soft)"
      : tint === "violet"
      ? "var(--morning-violet-soft)"
      : "var(--morning-leaf-tint)";
  const fg =
    tint === "coral"
      ? "var(--morning-coral)"
      : tint === "amber"
      ? "var(--morning-warning)"
      : tint === "violet"
      ? "var(--morning-violet)"
      : "var(--morning-forest)";
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
      <span
        aria-hidden
        style={{
          width: 36,
          height: 36,
          borderRadius: 999,
          background: bg,
          color: fg,
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
        }}
      >
        <span className="material-symbols-outlined" style={{ fontSize: 20 }}>
          {icon}
        </span>
      </span>
      <span
        style={{
          fontSize: 12,
          fontWeight: 700,
          color: "var(--morning-muted)",
          letterSpacing: "0.08em",
        }}
      >
        {label}
      </span>
    </div>
  );
}

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
        <CardHeader icon="savings" label="תקציב החודש" tint="forest" />
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
      <CardHeader
        icon="savings"
        label="תקציב החודש"
        tint={overspent ? "coral" : "forest"}
      />

      {!hasBudget ? (
        <div style={{ fontSize: 14, marginTop: 12, color: "var(--morning-muted)" }}>
          עוד לא הגדרת תקציב חודשי בדשבורד.
        </div>
      ) : (
        <>
          <div
            style={{
              ...BIG_NUMBER,
              color: overspent ? "var(--morning-coral)" : "var(--morning-ink)",
            }}
          >
            {fmtILS(Math.abs(summary.remaining))}
          </div>
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
        <CardHeader icon="flag" label="היעד הבא" tint="violet" />
        <Skeleton />
      </div>
    );
  }

  if (!goal) {
    return (
      <div style={CARD}>
        <CardHeader icon="flag" label="היעד הבא" tint="violet" />
        <div style={{ fontSize: 14, marginTop: 12, color: "var(--morning-muted)" }}>
          עוד לא הוגדרו יעדים בדשבורד.
        </div>
      </div>
    );
  }

  const pct = goal.targetAmount > 0 ? (goal.currentAmount / goal.targetAmount) * 100 : 0;

  return (
    <div style={CARD}>
      <CardHeader icon="flag" label="היעד הבא" tint="violet" />
      <div style={{ fontSize: 16, fontWeight: 700, marginTop: 10 }}>{goal.name}</div>
      <div style={BIG_NUMBER}>{fmtILS(goal.currentAmount)}</div>
      <div style={META}>
        מתוך {fmtILS(goal.targetAmount)} · {Math.round(pct)}%
      </div>
      <ProgressBar pct={pct} color={goal.color || "var(--morning-forest)"} />
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
