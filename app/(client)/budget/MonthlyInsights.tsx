"use client";

import { useState, useMemo, useEffect } from "react";
import { scopedKey } from "@/lib/client-scope";

/* ═══════════════════════════════════════════════════════════
   Types
   ═══════════════════════════════════════════════════════════ */

interface BudgetAdjustment {
  sectionKey: string; // "fixed" | "variable" | "income"
  rowName: string; // name to match
  field: "budget";
  /** Multiplier relative to current value, e.g. 1.2 = +20% */
  multiplier?: number;
  /** Absolute value to set (overrides multiplier) */
  absolute?: number;
  /** Label shown in the UI */
  label: string;
}

interface SeasonalInsight {
  icon: string; // emoji
  title: string;
  body: string;
  adjustments: BudgetAdjustment[];
}

interface OnboardingChild {
  name: string;
  age: string;
  framework: string;
  special: string;
}

interface Props {
  month: number; // 0-based
  year: number;
  onApply: (adjustments: BudgetAdjustment[]) => void;
}

/* ═══════════════════════════════════════════════════════════
   Israeli Seasonal Calendar — month → insights
   ═══════════════════════════════════════════════════════════ */

const SEASONAL_MAP: Record<number, SeasonalInsight[]> = {
  0: [
    {
      icon: "📋",
      title: "פתיחת שנת מס חדשה",
      body: "ינואר הוא הזמן לבחון את תלושי השכר, לעדכן ניכויים ולוודא שההפרשות לפנסיה וקרן השתלמות מעודכנות. בדוק שינויים בביטוח לאומי ומס בריאות.",
      adjustments: [
        {
          sectionKey: "fixed",
          rowName: "ביטוחים",
          field: "budget",
          multiplier: 1.05,
          label: "ביטוחים +5% (עדכון שנתי)",
        },
      ],
    },
  ],
  1: [
    {
      icon: "🌿",
      title: "חודש שגרתי — זמן לאופטימיזציה",
      body: "פברואר הוא חודש שקט יחסית. נצל אותו לבדיקת מנויים מיותרים, השוואת ביטוחים ורענון תקציב.",
      adjustments: [],
    },
  ],
  2: [
    {
      icon: "🍷",
      title: "לקראת פסח — הגדל תקציב",
      body: "מרץ-אפריל כוללים הוצאות חג משמעותיות: קניות לפסח, מתנות, ארוחת ליל הסדר ונופש. מומלץ להיערך מראש ולהגדיל את סעיפי הפנאי והמזון.",
      adjustments: [
        {
          sectionKey: "variable",
          rowName: "סופר / מזון",
          field: "budget",
          multiplier: 1.25,
          label: "מזון +25% (קניות פסח)",
        },
        {
          sectionKey: "variable",
          rowName: "פנאי ובילוי",
          field: "budget",
          multiplier: 1.2,
          label: "פנאי +20% (חופשת חג)",
        },
        {
          sectionKey: "variable",
          rowName: "מסעדות",
          field: "budget",
          multiplier: 1.15,
          label: "מסעדות +15% (אירוח חג)",
        },
      ],
    },
  ],
  3: [
    {
      icon: "🕊️",
      title: "חודש פסח — שיא ההוצאות",
      body: "פסח מוסיף בממוצע ₪1,800–₪3,000 להוצאות החודשיות. מתנות לילדים, טיולים, ארוחות חג והלבשה לחג.",
      adjustments: [
        {
          sectionKey: "variable",
          rowName: "סופר / מזון",
          field: "budget",
          multiplier: 1.3,
          label: "מזון +30% (פסח)",
        },
        {
          sectionKey: "variable",
          rowName: "ביגוד / קניות",
          field: "budget",
          multiplier: 1.25,
          label: "ביגוד +25% (קניות חג)",
        },
        {
          sectionKey: "variable",
          rowName: "פנאי ובילוי",
          field: "budget",
          multiplier: 1.35,
          label: "פנאי +35% (חול המועד)",
        },
        {
          sectionKey: "variable",
          rowName: "דלק / תחבורה",
          field: "budget",
          multiplier: 1.15,
          label: "דלק +15% (טיולי חג)",
        },
      ],
    },
  ],
  4: [
    {
      icon: "🇮🇱",
      title: "יום העצמאות ושבועות",
      body: "מאי כולל יום העצמאות ושבועות — הוצאות על מנגלים, טיולים ופנאי. תקצב בהתאם.",
      adjustments: [
        {
          sectionKey: "variable",
          rowName: "פנאי ובילוי",
          field: "budget",
          multiplier: 1.15,
          label: "פנאי +15% (חגים)",
        },
        {
          sectionKey: "variable",
          rowName: "סופר / מזון",
          field: "budget",
          multiplier: 1.1,
          label: "מזון +10% (אירוח)",
        },
      ],
    },
  ],
  5: [
    {
      icon: "☀️",
      title: "לקראת הקיץ — תכנון מוקדם",
      body: "יוני הוא הזמן לסגור קייטנות, חוגי קיץ ולתכנן חופשות. הירשם מוקדם כדי לחסוך.",
      adjustments: [
        {
          sectionKey: "variable",
          rowName: "פנאי ובילוי",
          field: "budget",
          multiplier: 1.2,
          label: "פנאי +20% (תכנון קיץ)",
        },
      ],
    },
  ],
  6: [
    {
      icon: "🏖️",
      title: "חופש הגדול — שיא הוצאות משפחתיות",
      body: "יולי הוא חודש שיא ההוצאות עבור משפחות: קייטנות, טיולים, חופשות ופעילויות. מומלץ לתקצב עליה משמעותית בפנאי ובילוי.",
      adjustments: [
        {
          sectionKey: "variable",
          rowName: "פנאי ובילוי",
          field: "budget",
          multiplier: 1.4,
          label: "פנאי +40% (חופשות קיץ)",
        },
        {
          sectionKey: "variable",
          rowName: "מסעדות",
          field: "budget",
          multiplier: 1.2,
          label: "מסעדות +20% (ימי חופש)",
        },
        {
          sectionKey: "variable",
          rowName: "דלק / תחבורה",
          field: "budget",
          multiplier: 1.2,
          label: "דלק +20% (טיולים)",
        },
      ],
    },
  ],
  7: [
    {
      icon: "🎒",
      title: "אוגוסט — קייטנות וחזרה ללימודים",
      body: "סוף הקיץ כולל קייטנות, ציוד לבית ספר, מדים וספרים. מומלץ לתקצב הוצאות חינוך והלבשה גבוהות.",
      adjustments: [
        {
          sectionKey: "variable",
          rowName: "ביגוד / קניות",
          field: "budget",
          multiplier: 1.3,
          label: "ביגוד +30% (ציוד לימודים)",
        },
        {
          sectionKey: "variable",
          rowName: "פנאי ובילוי",
          field: "budget",
          multiplier: 1.25,
          label: "פנאי +25% (קייטנות)",
        },
      ],
    },
  ],
  8: [
    {
      icon: "🍎",
      title: "ראש השנה — חגי תשרי מתחילים",
      body: "ספטמבר פותח את עונת החגים: ראש השנה, מתנות, ארוחות חג ופתיחת שנת לימודים. תקצב לפחות ₪1,500 נוספים.",
      adjustments: [
        {
          sectionKey: "variable",
          rowName: "סופר / מזון",
          field: "budget",
          multiplier: 1.25,
          label: "מזון +25% (ר״ה)",
        },
        {
          sectionKey: "variable",
          rowName: "ביגוד / קניות",
          field: "budget",
          multiplier: 1.2,
          label: "ביגוד +20% (חגים + לימודים)",
        },
        {
          sectionKey: "variable",
          rowName: "פנאי ובילוי",
          field: "budget",
          multiplier: 1.15,
          label: "פנאי +15% (חגי תשרי)",
        },
      ],
    },
  ],
  9: [
    {
      icon: "🍂",
      title: "סוכות — אירוח וחופשות חול המועד",
      body: "אוקטובר כולל סוכות, שמחת תורה ויציאות משפחתיות. מומלץ להגדיל תקציב פנאי, מזון ודלק.",
      adjustments: [
        {
          sectionKey: "variable",
          rowName: "פנאי ובילוי",
          field: "budget",
          multiplier: 1.3,
          label: "פנאי +30% (סוכות)",
        },
        {
          sectionKey: "variable",
          rowName: "סופר / מזון",
          field: "budget",
          multiplier: 1.15,
          label: "מזון +15% (אירוח סוכות)",
        },
        {
          sectionKey: "variable",
          rowName: "דלק / תחבורה",
          field: "budget",
          multiplier: 1.15,
          label: "דלק +15% (חול המועד)",
        },
      ],
    },
  ],
  10: [
    {
      icon: "📊",
      title: "חזרה לשגרה — בדיקת תזרים",
      body: "נובמבר הוא חודש שגרה לאחר עונת החגים. זמן מצוין לבדוק את המצב הפיננסי, לסגור פערים ולחסוך לקראת דצמבר.",
      adjustments: [],
    },
  ],
  11: [
    {
      icon: "🕎",
      title: "חנוכה וסוף שנת מס",
      body: "דצמבר כולל מתנות חנוכה וחימום מוגבר. זהו גם הזמן האחרון להפקדות פטורות ממס — בדוק קרן השתלמות ופנסיה.",
      adjustments: [
        {
          sectionKey: "variable",
          rowName: "פנאי ובילוי",
          field: "budget",
          multiplier: 1.15,
          label: "פנאי +15% (חנוכה)",
        },
        {
          sectionKey: "fixed",
          rowName: "חשמל",
          field: "budget",
          multiplier: 1.2,
          label: "חשמל +20% (חימום חורף)",
        },
      ],
    },
  ],
};

/* ═══════════════════════════════════════════════════════════
   Context-Aware Insights Generators
   ═══════════════════════════════════════════════════════════ */

function getSelfEmployedInsight(month: number): SeasonalInsight | null {
  // Dec — end of tax year, pension & hishtalmut deposits
  if (month === 11) {
    return {
      icon: "💼",
      title: "עצמאי? הפקד לפני סוף השנה",
      body: "כעצמאי, דצמבר הוא המועד האחרון להפקדה לקרן השתלמות (עד ₪20,520) ולפנסיה (עד ₪12,420) כדי ליהנות מהטבות מס מקסימליות. פנה לרואה חשבון.",
      adjustments: [],
    };
  }
  // June — mid-year tax check
  if (month === 5) {
    return {
      icon: "💼",
      title: "עצמאי — בדיקת מקדמות אמצע שנה",
      body: "זהו הזמן לבדוק את גובה המקדמות מול ההכנסה בפועל. אם ההכנסות גבוהות מהצפי — עדכן מקדמות למס הכנסה וביטוח לאומי.",
      adjustments: [],
    };
  }
  return null;
}

function getChildrenInsight(month: number, childCount: number): SeasonalInsight | null {
  if (childCount === 0) return null;

  // July-August — camps & summer activities
  if (month === 6 || month === 7) {
    return {
      icon: "👨‍👩‍👧‍👦",
      title: `${childCount} ילדים — קייטנות ופעילויות קיץ`,
      body: `עם ${childCount} ילדים, הוצאות הקיץ יכולות להגיע ל-₪${(childCount * 2500).toLocaleString("he-IL")}+ על קייטנות בלבד. מומלץ להגדיל תקציב חינוך ופנאי.`,
      adjustments: [
        {
          sectionKey: "fixed",
          rowName: "גן / חינוך",
          field: "budget",
          multiplier: 1 + 0.15 * childCount,
          label: `חינוך +${15 * childCount}% (${childCount} ילדים בקיץ)`,
        },
        {
          sectionKey: "variable",
          rowName: "פנאי ובילוי",
          field: "budget",
          multiplier: 1.25,
          label: "פנאי +25% (פעילויות ילדים)",
        },
      ],
    };
  }

  // September — back to school
  if (month === 8) {
    return {
      icon: "📚",
      title: `${childCount} ילדים — פתיחת שנת לימודים`,
      body: `ציוד לבית ספר, תשלומי הורים וחוגים ל-${childCount} ילדים. תקצב בממוצע ₪800-₪1,200 לילד.`,
      adjustments: [
        {
          sectionKey: "fixed",
          rowName: "גן / חינוך",
          field: "budget",
          multiplier: 1 + 0.1 * childCount,
          label: `חינוך +${10 * childCount}% (פתיחת לימודים)`,
        },
        {
          sectionKey: "variable",
          rowName: "ביגוד / קניות",
          field: "budget",
          multiplier: 1.2,
          label: "ביגוד +20% (ציוד לימודים)",
        },
      ],
    };
  }

  return null;
}

/* ═══════════════════════════════════════════════════════════
   Load context from localStorage
   ═══════════════════════════════════════════════════════════ */

function loadOnboardingChildren(): OnboardingChild[] {
  try {
    const raw = localStorage.getItem(scopedKey("verdant:onboarding:children"));
    if (raw) {
      const children = JSON.parse(raw) as OnboardingChild[];
      // Filter out empty placeholder rows
      return children.filter((c) => c.name.trim() !== "" || c.age.trim() !== "");
    }
  } catch {}
  return [];
}

function loadOnboardingFields(): Record<string, string> {
  try {
    const raw = localStorage.getItem(scopedKey("verdant:onboarding:fields"));
    if (raw) return JSON.parse(raw);
  } catch {}
  return {};
}

function isSelfEmployed(fields: Record<string, string>): boolean {
  const emp1 = (fields.p1_employer || "").toLowerCase();
  const emp2 = (fields.p2_employer || "").toLowerCase();
  const selfTerms = [
    "עצמאי",
    "עצמאית",
    "עוסק מורשה",
    "עוסק פטור",
    'חברה בע"מ',
    "פרילנס",
    "freelance",
    "self",
  ];
  return selfTerms.some((t) => emp1.includes(t) || emp2.includes(t));
}

/* ═══════════════════════════════════════════════════════════
   Component
   ═══════════════════════════════════════════════════════════ */

export default function MonthlyInsights({ month, year, onApply }: Props) {
  const [dismissed, setDismissed] = useState(false);
  const [applied, setApplied] = useState(false);
  const [children, setChildren] = useState<OnboardingChild[]>([]);
  const [selfEmployed, setSelfEmployed] = useState(false);

  // Load context on mount
  useEffect(() => {
    setChildren(loadOnboardingChildren());
    setSelfEmployed(isSelfEmployed(loadOnboardingFields()));
  }, []);

  // Reset state when month changes
  useEffect(() => {
    setDismissed(false);
    setApplied(false);
  }, [month, year]);

  // Build insights list
  const insights = useMemo(() => {
    const list: SeasonalInsight[] = [];

    // Seasonal insights for this month
    const seasonal = SEASONAL_MAP[month];
    if (seasonal) list.push(...seasonal);

    // Self-employed context
    if (selfEmployed) {
      const seInsight = getSelfEmployedInsight(month);
      if (seInsight) list.push(seInsight);
    }

    // Children context
    if (children.length > 0) {
      const kidInsight = getChildrenInsight(month, children.length);
      if (kidInsight) list.push(kidInsight);
    }

    return list;
  }, [month, children, selfEmployed]);

  // Collect all adjustments
  const allAdjustments = useMemo(() => insights.flatMap((i) => i.adjustments), [insights]);

  if (dismissed || insights.length === 0) return null;

  const HE_MONTHS = [
    "ינואר",
    "פברואר",
    "מרץ",
    "אפריל",
    "מאי",
    "יוני",
    "יולי",
    "אוגוסט",
    "ספטמבר",
    "אוקטובר",
    "נובמבר",
    "דצמבר",
  ];

  const handleApply = () => {
    if (allAdjustments.length > 0) {
      onApply(allAdjustments);
      setApplied(true);
    }
  };

  return (
    <section
      className="mb-4 rounded-2xl p-5 transition-all md:p-7"
      style={{
        background: "linear-gradient(135deg, #f0fdf4 0%, #f8fdf6 50%, #fefff9 100%)",
        border: "1.5px solid #a7f3d0",
        boxShadow: "0 1px 3px rgba(10,122,74,.06), 0 8px 24px rgba(10,122,74,.08)",
      }}
    >
      {/* ── Header ── */}
      <div className="mb-4 flex items-start justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div
            className="flex h-9 w-9 items-center justify-center rounded-xl text-lg"
            style={{
              background: "linear-gradient(135deg, #d1fae5, #a7f3d0)",
              boxShadow: "0 2px 8px rgba(10,122,74,.15)",
            }}
          >
            ✨
          </div>
          <div>
            <h2
              className="text-[15px] font-extrabold leading-tight"
              style={{ color: "#012d1d", fontFamily: "Assistant" }}
            >
              תובנות לתכנון {HE_MONTHS[month]}
            </h2>
            <div
              className="mt-0.5 text-[10px] font-bold uppercase tracking-[0.15em]"
              style={{ color: "#5a7a6a" }}
            >
              תכנון חודשי · {year}
            </div>
          </div>
        </div>

        {/* Dismiss */}
        <button
          onClick={() => setDismissed(true)}
          className="rounded-lg px-2 py-1 text-[11px] font-bold transition-colors hover:bg-white/60"
          style={{ color: "#5a7a6a" }}
          title="הסתר תובנות"
        >
          <span className="material-symbols-outlined text-[16px]">close</span>
        </button>
      </div>

      {/* ── Insight Cards ── */}
      <div className="space-y-3">
        {insights.map((ins, i) => (
          <div
            key={i}
            className="rounded-xl p-4 transition-all"
            style={{
              background: "rgba(255,255,255,.75)",
              border: "1px solid #d1fae5",
              backdropFilter: "blur(8px)",
            }}
          >
            <div className="flex items-start gap-3">
              <span className="mt-0.5 text-xl leading-none">{ins.icon}</span>
              <div className="min-w-0 flex-1">
                <div
                  className="mb-1 text-[13px] font-extrabold"
                  style={{ color: "#012d1d", fontFamily: "Assistant" }}
                >
                  {ins.title}
                </div>
                <div
                  className="text-[12px] font-medium leading-relaxed"
                  style={{ color: "#3d6b56" }}
                >
                  {ins.body}
                </div>

                {/* Adjustment badges */}
                {ins.adjustments.length > 0 && (
                  <div className="mt-2.5 flex flex-wrap gap-1.5">
                    {ins.adjustments.map((adj, j) => (
                      <span
                        key={j}
                        className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[10px] font-bold"
                        style={{
                          background: "#d1fae5",
                          color: "#065f46",
                        }}
                      >
                        <span className="material-symbols-outlined text-[11px]">trending_up</span>
                        {adj.label}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* ── Apply Button ── */}
      {allAdjustments.length > 0 && (
        <div
          className="mt-4 flex items-center justify-between pt-3"
          style={{ borderTop: "1px solid #d1fae5" }}
        >
          <div className="text-[11px] font-semibold" style={{ color: "#5a7a6a" }}>
            {allAdjustments.length} התאמות מוצעות לשדות התכנון
          </div>
          {applied ? (
            <div
              className="inline-flex items-center gap-1.5 rounded-xl px-4 py-2 text-[12px] font-extrabold"
              style={{ background: "#d1fae5", color: "#065f46" }}
            >
              <span className="material-symbols-outlined text-[15px]">check_circle</span>
              ההמלצות הוחלו בהצלחה
            </div>
          ) : (
            <button
              onClick={handleApply}
              className="inline-flex items-center gap-1.5 rounded-xl px-4 py-2 text-[12px] font-extrabold text-white transition-all hover:scale-[1.02] active:scale-[0.98]"
              style={{
                background: "linear-gradient(135deg, #1B4332, #065f46)",
                boxShadow: "0 2px 8px rgba(10,122,74,.25)",
              }}
            >
              <span className="material-symbols-outlined text-[15px]">auto_fix_high</span>
              החל המלצות
            </button>
          )}
        </div>
      )}
    </section>
  );
}

/* ═══════════════════════════════════════════════════════════
   Export the adjustment type for use in parent
   ═══════════════════════════════════════════════════════════ */

export type { BudgetAdjustment };
