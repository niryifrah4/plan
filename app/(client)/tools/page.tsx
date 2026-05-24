"use client";

import { useState, useMemo, type ReactNode } from "react";
import { CompoundCalc } from "@/components/toolbox/CompoundCalc";
import { TaxCalc } from "@/components/toolbox/TaxCalc";
import { RealReturnCalc } from "@/components/toolbox/RealReturnCalc";
import { BituachLeumiCalc } from "@/components/toolbox/BituachLeumiCalc";
import { RsuCalc } from "@/components/toolbox/RsuCalc";
import { RetirementCalc } from "@/components/toolbox/RetirementCalc";
import { FreedomCalc } from "@/components/toolbox/FreedomCalc";
import { AffordabilityCalc } from "@/components/toolbox/AffordabilityCalc";
import { MortgageCalc } from "@/components/toolbox/MortgageCalc";
import { InvestmentPropertyCalc } from "@/components/toolbox/InvestmentPropertyCalc";
import { RealEstateCalc } from "@/components/toolbox/RealEstateCalc";
import { RentVsBuyCalc } from "@/components/toolbox/RentVsBuyCalc";

type Category = "realestate" | "tax" | "investments" | "retirement";

interface CalcDef {
  id: string;
  name: string;
  description: string;
  icon: string;
  category: Category;
  component: () => ReactNode;
}

const CATEGORIES: Record<Category, { label: string; icon: string; color: string }> = {
  realestate: { label: "נדל״ן", icon: "home_work", color: "#2C7A5A" },
  tax: { label: "מיסוי", icon: "receipt_long", color: "#8B5CF6" },
  investments: { label: "השקעות", icon: "trending_up", color: "#0EA5E9" },
  retirement: { label: "ביטוח ופרישה", icon: "shield", color: "#D97706" },
};

const CALCULATORS: CalcDef[] = [
  {
    id: "affordability",
    name: "יכולת רכישת דירה",
    description: "מחיר דירה מקסימלי לפי הון עצמי וכושר החזר",
    icon: "real_estate_agent",
    category: "realestate",
    component: () => <AffordabilityCalc />,
  },
  {
    id: "mortgage",
    name: "מחשבון משכנתא",
    description: "מסלולי הלוואה, החזרים חודשיים וסך ריבית",
    icon: "home",
    category: "realestate",
    component: () => <MortgageCalc />,
  },
  {
    id: "rent-vs-buy",
    name: "שכירות מול רכישה",
    description: "האם עדיף לקנות דירה או לשכור ולהשקיע — השוואת שווי נטו",
    icon: "compare_arrows",
    category: "realestate",
    component: () => <RentVsBuyCalc />,
  },
  {
    id: "second-home",
    name: "דירה שנייה",
    description: "מס רכישה, מימון ותחזית תשואה",
    icon: "domain_add",
    category: "realestate",
    component: () => <InvestmentPropertyCalc />,
  },
  {
    id: "real-estate-analysis",
    name: "ניתוח השקעה בנדל״ן",
    description: "IRR, Equity Multiple ותחזית יציאה",
    icon: "apartment",
    category: "realestate",
    component: () => <RealEstateCalc />,
  },
  {
    id: "tax",
    name: "מס הכנסה ורווח הון",
    description: "חישוב מדרגות מס ומס על השקעות",
    icon: "receipt_long",
    category: "tax",
    component: () => <TaxCalc />,
  },
  {
    id: "compound",
    name: "ריבית דריבית",
    description: "כמה יצמח החיסכון לאורך זמן",
    icon: "trending_up",
    category: "investments",
    component: () => <CompoundCalc />,
  },
  {
    id: "real-return",
    name: "תשואה ריאלית",
    description: "תשואה אמיתית אחרי אינפלציה ומס",
    icon: "analytics",
    category: "investments",
    component: () => <RealReturnCalc />,
  },
  {
    id: "rsu",
    name: "מחשבון RSU",
    description: "שווי מענקי מניות, מיסוי והבשלה",
    icon: "inventory_2",
    category: "investments",
    component: () => <RsuCalc />,
  },
  {
    id: "bituach-leumi",
    name: "ביטוח לאומי",
    description: "תשלומים, פטורים וזכויות",
    icon: "shield",
    category: "retirement",
    component: () => <BituachLeumiCalc />,
  },
  {
    id: "retirement",
    name: "תכנון מס בפרישה",
    description: "פטורים, פריסה ורצפים",
    icon: "elderly",
    category: "retirement",
    component: () => <RetirementCalc />,
  },
  {
    id: "freedom",
    name: "חופש כלכלי",
    description: "כמה הון צריך כדי לחיות מהתשואות (Rule of 300)",
    icon: "self_improvement",
    category: "retirement",
    component: () => <FreedomCalc />,
  },
];

export default function ToolboxPage() {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Category | "all">("all");

  const selected = useMemo(
    () => (selectedId ? CALCULATORS.find((c) => c.id === selectedId) ?? null : null),
    [selectedId]
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return CALCULATORS.filter((c) => {
      if (filter !== "all" && c.category !== filter) return false;
      if (!q) return true;
      return c.name.toLowerCase().includes(q) || c.description.toLowerCase().includes(q);
    });
  }, [query, filter]);

  // ─── Single-calculator view ───
  if (selected) {
    const cat = CATEGORIES[selected.category];
    return (
      <div className="mx-auto max-w-6xl">
        {/* Back bar */}
        <div className="mb-6 flex items-center justify-between">
          <button
            type="button"
            onClick={() => setSelectedId(null)}
            className="inline-flex items-center gap-2 rounded-lg px-3 py-2 text-[13px] font-semibold transition-colors"
            style={{
              background: "var(--morning-surface)",
              color: "var(--morning-ink)",
              border: "1px solid var(--morning-border)",
            }}
            onMouseEnter={(e) =>
              (e.currentTarget.style.background = "var(--morning-surface-2)")
            }
            onMouseLeave={(e) =>
              (e.currentTarget.style.background = "var(--morning-surface)")
            }
          >
            <span className="material-symbols-outlined text-[18px]">arrow_forward</span>
            חזרה לכל המחשבונים
          </button>
          <div className="flex items-center gap-3">
            <div className="text-right">
              <div className="text-[15px] font-bold" style={{ color: "var(--morning-ink)" }}>
                {selected.name}
              </div>
              <div className="text-[11px]" style={{ color: "var(--morning-muted)" }}>
                {cat.label}
              </div>
            </div>
            <div
              className="flex h-9 w-9 items-center justify-center rounded-lg"
              style={{ background: `${cat.color}14`, color: cat.color }}
            >
              <span className="material-symbols-outlined text-[20px]">{selected.icon}</span>
            </div>
          </div>
        </div>

        {/* Calculator content */}
        <div>{selected.component()}</div>
      </div>
    );
  }

  // ─── Grid view ───
  return (
    <div className="mx-auto max-w-6xl">
      {/* Page header */}
      <div className="mb-6">
        <h1
          className="text-[24px] font-bold leading-tight"
          style={{
            color: "var(--morning-ink)",
            fontFamily: "Rubik, Heebo, Assistant, system-ui, sans-serif",
            letterSpacing: "-0.01em",
          }}
        >
          מחשבונים וכלים
        </h1>
        <p className="mt-1 text-[14px]" style={{ color: "var(--morning-muted)" }}>
          {CALCULATORS.length} כלי תכנון פיננסיים — לחיצה אחת לכל מחשבון
        </p>
      </div>

      {/* Search + filter row */}
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <div className="relative min-w-[260px] flex-1">
          <span
            className="material-symbols-outlined absolute right-3 top-1/2 -translate-y-1/2 text-[18px]"
            style={{ color: "var(--morning-muted)" }}
          >
            search
          </span>
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="חפשו מחשבון..."
            className="w-full rounded-lg py-2.5 pr-10 pl-3 text-[14px] outline-none transition-all"
            style={{
              background: "var(--morning-surface)",
              border: "1px solid var(--morning-border)",
              color: "var(--morning-ink)",
            }}
            onFocus={(e) => {
              e.currentTarget.style.borderColor = "var(--morning-forest)";
              e.currentTarget.style.boxShadow = "0 0 0 3px rgba(44, 122, 90, 0.12)";
            }}
            onBlur={(e) => {
              e.currentTarget.style.borderColor = "var(--morning-border)";
              e.currentTarget.style.boxShadow = "none";
            }}
          />
        </div>

        {/* Category filter chips */}
        <div className="flex flex-wrap items-center gap-2">
          <CategoryChip
            label="הכל"
            icon="apps"
            active={filter === "all"}
            onClick={() => setFilter("all")}
          />
          {(Object.keys(CATEGORIES) as Category[]).map((k) => (
            <CategoryChip
              key={k}
              label={CATEGORIES[k].label}
              icon={CATEGORIES[k].icon}
              color={CATEGORIES[k].color}
              active={filter === k}
              onClick={() => setFilter(k)}
            />
          ))}
        </div>
      </div>

      {/* Calculator grid */}
      {filtered.length === 0 ? (
        <div
          className="rounded-xl py-16 text-center"
          style={{
            background: "var(--morning-surface)",
            border: "1px solid var(--morning-border)",
          }}
        >
          <span
            className="material-symbols-outlined text-[40px]"
            style={{ color: "var(--morning-muted)" }}
          >
            search_off
          </span>
          <div
            className="mt-2 text-[15px] font-semibold"
            style={{ color: "var(--morning-ink)" }}
          >
            לא נמצאו מחשבונים
          </div>
          <div className="mt-1 text-[13px]" style={{ color: "var(--morning-muted)" }}>
            נסו לחפש מילה אחרת או לבטל את הסינון
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((c) => {
            const cat = CATEGORIES[c.category];
            return (
              <button
                key={c.id}
                type="button"
                onClick={() => setSelectedId(c.id)}
                className="group relative overflow-hidden rounded-xl p-5 text-right transition-all"
                style={{
                  background: "var(--morning-surface)",
                  border: "1px solid var(--morning-border)",
                  boxShadow: "var(--morning-shadow-card)",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.boxShadow = "var(--morning-shadow-card-hover)";
                  e.currentTarget.style.transform = "translateY(-2px)";
                  e.currentTarget.style.borderColor = cat.color;
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.boxShadow = "var(--morning-shadow-card)";
                  e.currentTarget.style.transform = "translateY(0)";
                  e.currentTarget.style.borderColor = "var(--morning-border)";
                }}
              >
                <div className="mb-4 flex items-start justify-between gap-3">
                  <div
                    className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-lg"
                    style={{ background: `${cat.color}14`, color: cat.color }}
                  >
                    <span className="material-symbols-outlined text-[22px]">{c.icon}</span>
                  </div>
                  <span
                    className="rounded-full px-2.5 py-1 text-[10px] font-semibold"
                    style={{ background: `${cat.color}14`, color: cat.color }}
                  >
                    {cat.label}
                  </span>
                </div>
                <div
                  className="mb-1.5 text-[15px] font-bold leading-tight"
                  style={{ color: "var(--morning-ink)" }}
                >
                  {c.name}
                </div>
                <div
                  className="text-[13px] leading-relaxed"
                  style={{ color: "var(--morning-muted)" }}
                >
                  {c.description}
                </div>
                <div
                  className="mt-4 inline-flex items-center gap-1 text-[12px] font-semibold transition-all"
                  style={{ color: cat.color }}
                >
                  פתח מחשבון
                  <span className="material-symbols-outlined text-[16px] transition-transform group-hover:-translate-x-0.5">
                    chevron_left
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function CategoryChip({
  label,
  icon,
  color,
  active,
  onClick,
}: {
  label: string;
  icon: string;
  color?: string;
  active: boolean;
  onClick: () => void;
}) {
  const accent = color ?? "var(--morning-forest)";
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-[12px] font-semibold transition-all"
      style={{
        background: active ? accent : "var(--morning-surface)",
        color: active ? "#fff" : "var(--morning-ink)",
        border: `1px solid ${active ? accent : "var(--morning-border)"}`,
      }}
    >
      <span className="material-symbols-outlined text-[16px]">{icon}</span>
      {label}
    </button>
  );
}
