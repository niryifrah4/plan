"use client";

/**
 * InsightsCard — the proactive coach card on /m home.
 *
 * One nudge max, picked from the insights engine. Silence is OK — if
 * no rule fires, the component returns null and nothing renders.
 *
 * Tone (per finance-agent 2026-05-23): feels like Nir whispering in the
 * client's ear, not a robot. Each insight is a specific, data-derived
 * observation with a one-tap action.
 *
 * The 'add_expense' action opens the AddExpenseSheet inline via the
 * parent's callback; everything else navigates to the relevant /m/*
 * route. Dismiss persists 3 days via the engine's localStorage map.
 */

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  computeTopInsight,
  dismissInsight,
  type Insight,
} from "@/lib/insights-engine";

interface Props {
  /** Trigger to recompute (e.g. after the user logs an expense). */
  refreshKey?: number;
  /** Called when the insight's action is "add_expense" — parent opens
   *  the AddExpenseSheet directly without a route change. */
  onOpenQuickAdd: () => void;
}

export function InsightsCard({ refreshKey, onOpenQuickAdd }: Props) {
  const router = useRouter();
  const [insight, setInsight] = useState<Insight | null>(null);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setInsight(computeTopInsight());
    setHydrated(true);
  }, [refreshKey]);

  if (!hydrated || !insight) return null;

  const handleAction = () => {
    const a = insight.action;
    switch (a.target) {
      case "add_expense":
        onOpenQuickAdd();
        return;
      case "category":
        router.push(`/m/budget?cat=${encodeURIComponent(a.payload ?? "")}` as any);
        return;
      case "goals":
        if (a.payload) {
          router.push(`/m/goals?goal=${encodeURIComponent(a.payload)}` as any);
        } else {
          router.push("/m/goals" as any);
        }
        return;
      case "goal_check_in":
        router.push(
          `/m/goals?checkin=${encodeURIComponent(a.payload ?? "")}` as any
        );
        return;
      case "edit_category":
        router.push(`/m/budget?edit=${encodeURIComponent(a.payload ?? "")}` as any);
        return;
      case "balance":
        router.push("/m/balance" as any);
        return;
    }
  };

  const handleDismiss = () => {
    dismissInsight(insight.id);
    setInsight(null);
  };

  return (
    <article
      style={{
        marginTop: 4,
        marginBottom: 14,
        background: "var(--morning-surface)",
        border: "1px solid var(--morning-forest)",
        borderRadius: 14,
        padding: "12px 14px",
        boxShadow: "var(--morning-shadow-card)",
        position: "relative",
      }}
      dir="rtl"
      aria-label={`תובנה: ${insight.eyebrow ?? insight.kind}`}
    >
      <button
        type="button"
        onClick={handleDismiss}
        aria-label="סגור תובנה זו"
        title="הסתר ל-3 ימים"
        style={{
          position: "absolute",
          top: 8,
          insetInlineStart: 8,
          width: 28,
          height: 28,
          border: "none",
          background: "transparent",
          color: "var(--morning-muted)",
          cursor: "pointer",
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          borderRadius: 999,
          fontSize: 18,
          lineHeight: 1,
        }}
      >
        ✕
      </button>

      <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
        <div
          aria-hidden
          style={{
            width: 32,
            height: 32,
            borderRadius: 999,
            background: "var(--morning-leaf-tint)",
            color: "var(--morning-forest)",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
          }}
        >
          <span className="material-symbols-outlined" style={{ fontSize: 20 }}>
            lightbulb
          </span>
        </div>
        <div style={{ flex: 1, minWidth: 0, paddingInlineEnd: 24 }}>
          {insight.eyebrow && (
            <div
              style={{
                fontSize: 11,
                fontWeight: 700,
                color: "var(--morning-forest)",
                letterSpacing: "0.1em",
                textTransform: "uppercase",
              }}
            >
              {insight.eyebrow}
            </div>
          )}
          <div
            style={{
              fontSize: 14,
              color: "var(--morning-ink)",
              marginTop: 2,
              lineHeight: 1.45,
            }}
          >
            {insight.body}
          </div>
        </div>
      </div>

      <button
        type="button"
        onClick={handleAction}
        style={{
          marginTop: 10,
          width: "100%",
          padding: "10px 12px",
          background: "var(--morning-forest)",
          color: "#ffffff",
          border: "none",
          borderRadius: 10,
          fontSize: 13,
          fontWeight: 700,
          cursor: "pointer",
        }}
      >
        {insight.action.label}
      </button>
    </article>
  );
}
