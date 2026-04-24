"use client";

/**
 * GoalContextStrip — Wealth Architecture
 *
 * Every tool in Plan exists to serve a real-life goal.
 * This strip answers the question: "איך הכלי הזה עוזר לי לחיות את החיים שאני רוצה?"
 *
 * It reads the user's goals from localStorage and shows the ones
 * most relevant to the calculator category (realestate / retirement / investments / freedom).
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import { loadImpactGoals, type ImpactGoal } from "@/lib/impact-engine";
import { fmtILS } from "@/lib/format";

type ToolDomain = "realestate" | "retirement" | "investments" | "tax" | "freedom" | "general";

const DOMAIN_KEYWORDS: Record<ToolDomain, string[]> = {
  realestate: ["דירה", "נדל", "בית", "שדרוג דיור"],
  retirement: ["פרישה", "פנסיה", "חופש"],
  investments: ["השקעה", "תיק", "מניות"],
  tax: ["מס", "הכנסה"],
  freedom: ["חופש", "פרישה מוקדמת"],
  general: [],
};

const DOMAIN_HEADLINES: Record<ToolDomain, string> = {
  realestate: "איך הכלי הזה עוזר לך לקנות את הבית שחלמת עליו?",
  retirement: "איך הכלי הזה מקרב אותך לפרישה שתכננת?",
  investments: "איך הכלי הזה מגדיל את הון המשפחה לטווח הארוך?",
  tax: "איך חיסכון במס מעביר יותר כסף ליעדי החיים שלך?",
  freedom: "איך הכלי הזה מקצר את הדרך לחופש הכלכלי?",
  general: "איך הכלי הזה משרת את היעדים שהגדרת?",
};

interface Props {
  domain: ToolDomain;
  /** Optional title override */
  title?: string;
}

export function GoalContextStrip({ domain, title }: Props) {
  const [goals, setGoals] = useState<ImpactGoal[]>([]);

  useEffect(() => {
    setGoals(loadImpactGoals());
    const handler = () => setGoals(loadImpactGoals());
    window.addEventListener("verdant:goals:updated", handler);
    window.addEventListener("storage", handler);
    return () => {
      window.removeEventListener("verdant:goals:updated", handler);
      window.removeEventListener("storage", handler);
    };
  }, []);

  // Match goals to this tool domain
  const keywords = DOMAIN_KEYWORDS[domain];
  const matched =
    domain === "general" || keywords.length === 0
      ? goals.slice(0, 3)
      : goals.filter((g) => keywords.some((kw) => g.name.includes(kw))).slice(0, 3);

  const displayGoals = matched.length > 0 ? matched : goals.slice(0, 2);

  return (
    <div
      className="rounded-2xl p-5 mb-6 relative overflow-hidden"
      style={{
        background: "linear-gradient(135deg,#012d1d 0%,#064e32 100%)",
        color: "#fff",
      }}
    >
      <div
        className="absolute inset-0 opacity-[0.04]"
        style={{ backgroundImage: "radial-gradient(circle at 85% 20%, #2B694D 0%, transparent 60%)" }}
      />
      <div className="relative">
        <div className="flex items-start justify-between gap-4 mb-4">
          <div>
            <div className="text-[10px] uppercase tracking-[0.2em] font-bold mb-1" style={{ color: "#2B694D" }}>
              Wealth Architecture · הכלי ביחס לחיים
            </div>
            <h4 className="text-[14px] font-extrabold leading-snug">
              {title || DOMAIN_HEADLINES[domain]}
            </h4>
          </div>
          <Link
            href={"/goals" as any}
            className="text-[10px] font-bold px-3 py-1.5 rounded-full whitespace-nowrap transition-colors hover:bg-white/10"
            style={{ background: "rgba(88,225,176,0.12)", color: "#2B694D", border: "1px solid rgba(88,225,176,0.25)" }}
          >
            כל היעדים →
          </Link>
        </div>

        {displayGoals.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5">
            {displayGoals.map((g) => {
              const years = Math.max(0, (new Date(g.targetDate).getTime() - Date.now()) / (365.25 * 24 * 3600 * 1000));
              return (
                <div
                  key={g.id}
                  className="rounded-xl p-3 flex items-center gap-3"
                  style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.08)" }}
                >
                  <div
                    className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0"
                    style={{ background: "rgba(88,225,176,0.15)" }}
                  >
                    <span className="material-symbols-outlined text-[18px]" style={{ color: "#2B694D" }}>
                      {g.icon}
                    </span>
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-[12px] font-extrabold truncate">{g.name}</div>
                    <div className="text-[10px] opacity-60 font-bold">
                      {fmtILS(g.targetAmount)} · בעוד {years.toFixed(1)} שנים
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div
            className="text-[11px] font-bold p-3 rounded-xl text-center"
            style={{ background: "rgba(255,255,255,0.06)", color: "#9ec9b7" }}
          >
            עדיין לא הוגדרו יעדים.{" "}
            <Link href={"/goals" as any} className="underline font-extrabold" style={{ color: "#2B694D" }}>
              הגדר יעדים
            </Link>{" "}
            כדי שהכלי הזה יקבל משמעות אמיתית.
          </div>
        )}
      </div>
    </div>
  );
}
