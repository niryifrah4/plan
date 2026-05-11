"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import { PageHeader } from "@/components/ui/PageHeader";
import { SaveStatus } from "@/components/ui/SaveStatus";
import { SolidKpi, SolidKpiRow } from "@/components/ui/SolidKpi";
import { useSaveStatus } from "@/lib/hooks/useSaveStatus";
import { fmtILS } from "@/lib/format";
import { onSync } from "@/lib/sync-engine";
import { scopedKey } from "@/lib/client-scope";
import { loadAssumptions } from "@/lib/assumptions";
import { getMonthlyNetIncome } from "@/lib/income";
import {
  Bucket,
  BucketPriority,
  loadBuckets,
  saveBuckets,
  createBucket,
  updateBucket,
  removeBucket,
  pickColor,
  BUCKET_COLORS,
} from "@/lib/buckets-store";
import {
  projectBucket,
  totalFreeUpPotential,
  totalDeficitContribution,
  BucketProjection,
  BucketRecommendation,
} from "@shared/buckets-rebalancing";
import { MonthlyCheckIn, hasCheckedInThisMonth } from "@/components/MonthlyCheckIn";
import { KidsSavingsSection } from "@/components/KidsSavingsSection";
import { SpecialEventsSection } from "@/components/SpecialEventsSection";
import { syncOnboardingToStores } from "@/lib/onboarding-sync";
import {
  loadLinks,
  computeGoalAmountFromLinks,
  type AssetType,
  type AssetGoalLink,
} from "@/lib/asset-goal-linking";
import { loadProperties } from "@/lib/realestate-store";
import { type Scope, SCOPE_LABELS, SCOPE_COLORS, cycleScope } from "@/lib/scope-types";

/* ═══════════════════════════════════════════════════════════ */
/* Constants                                                     */
/* ═══════════════════════════════════════════════════════════ */

const GOAL_ICONS: Record<string, string> = {
  "קרן חירום": "savings",
  חינוך: "school",
  "חינוך ילדים": "school",
  לימודים: "school",
  רכב: "directions_car",
  "החלפת רכב": "directions_car",
  דירה: "home",
  "שדרוג דיור": "home",
  "רכישת דירה": "home",
  חתונה: "favorite",
  חופשה: "flight_takeoff",
  פרישה: "elderly",
  "פרישה מוקדמת": "elderly",
  עסק: "storefront",
  "פתיחת עסק": "storefront",
  default: "flag",
};

const PRIORITY_COLORS: Record<BucketPriority, { bg: string; text: string }> = {
  high: { bg: "#8B2E2E10", text: "#8B2E2E" },
  medium: { bg: "#B4530910", text: "#B45309" },
  low: { bg: "#1B433210", text: "#1B4332" },
};
const PRIORITY_LABELS: Record<BucketPriority, string> = {
  high: "גבוהה",
  medium: "בינונית",
  low: "נמוכה",
};
const PRIORITY_ORDER: Record<BucketPriority, number> = { high: 0, medium: 1, low: 2 };

/* Status → color + label (aligned to Botanical brand palette) */
const STATUS_COLOR: Record<string, string> = {
  ahead: "#1B4332", // forest
  on_track: "#2B694D", // emerald
  behind: "#B45309", // amber
  at_risk: "#8B2E2E", // deep red
};
const STATUS_LABEL: Record<string, string> = {
  ahead: "מקדים",
  on_track: "בדרך",
  behind: "בפיגור",
  at_risk: "בסיכון",
};

/* Instruments catalog (kept from previous version — used for tax context) */
const INSTRUMENTS: Record<
  string,
  { label: string; rate: number; horizon: string; taxNote: string; category: string }
> = {
  pension: {
    label: "קרן פנסיה",
    rate: 0.05,
    horizon: "long",
    taxNote: "פטור ממס על קצבה עד תקרה. הפקדות מוכרות כניכוי/זיכוי מס.",
    category: "פנסיוני",
  },
  "managers-insurance": {
    label: "ביטוח מנהלים",
    rate: 0.045,
    horizon: "long",
    taxNote: "דמי ניהול גבוהים יותר מפנסיה. פטור ממס על קצבה עד תקרה.",
    category: "פנסיוני",
  },
  "gemel-savings": {
    label: "קופת גמל לחיסכון",
    rate: 0.05,
    horizon: "long",
    taxNote: "משיכה כקצבה — פטור. משיכה הונית אחרי 60 — 25% מס רווחי הון.",
    category: "פנסיוני",
  },
  "gemel-invest": {
    label: "קופת גמל להשקעה",
    rate: 0.055,
    horizon: "medium",
    taxNote: "25% מס רווחי הון. נזילה אחרי 15 שנה ללא מס, או בכל עת עם מס.",
    category: "פנסיוני",
  },
  "gemel-child": {
    label: "קופת גמל לילד",
    rate: 0.05,
    horizon: "long",
    taxNote: "פטור ממס רווחי הון עד גיל 18. אחרי 18 — 25% מס.",
    category: "פנסיוני",
  },
  hishtalmut: {
    label: "קרן השתלמות",
    rate: 0.05,
    horizon: "medium",
    taxNote: "פטור מלא ממס רווחי הון אחרי 6 שנים (3 לגיל 60+). עד תקרת הפקדה.",
    category: "חיסכון מוטה מס",
  },
  "savings-policy": {
    label: "פוליסת חיסכון",
    rate: 0.04,
    horizon: "medium",
    taxNote: "25% מס רווחי הון. ללא דמי ניהול מההפקדה (רק מהצבירה).",
    category: "חיסכון מוטה מס",
  },
  "etf-israel": {
    label: "קרן סל ישראלית",
    rate: 0.06,
    horizon: "medium",
    taxNote: "25% מס רווחי הון.",
    category: "תיק השקעות עצמאי",
  },
  "etf-global": {
    label: "קרן סל עולמית (S&P 500 וכו׳)",
    rate: 0.08,
    horizon: "long",
    taxNote: '25% מס רווחי הון. חשיפה למט"ח.',
    category: "תיק השקעות עצמאי",
  },
  "mutual-fund": {
    label: "קרן נאמנות",
    rate: 0.055,
    horizon: "medium",
    taxNote: "25% מס רווחי הון. דמי ניהול משתנים.",
    category: "תיק השקעות עצמאי",
  },
  "money-market": {
    label: "קרן כספית",
    rate: 0.04,
    horizon: "short",
    taxNote: "25% מס רווחי הון. נזילות מיידית.",
    category: "נזיל",
  },
  "bank-deposit": {
    label: "פיקדון בנקאי",
    rate: 0.035,
    horizon: "short",
    taxNote: "15% מס על ריבית.",
    category: "נזיל",
  },
  "bank-savings": {
    label: "תוכנית חיסכון בנקאית",
    rate: 0.038,
    horizon: "short",
    taxNote: "15% מס. נעול לתקופה קבועה.",
    category: "נזיל",
  },
};

const INSTRUMENT_CATEGORIES = ["פנסיוני", "חיסכון מוטה מס", "תיק השקעות עצמאי", "נזיל"];

function instrumentsByCategory() {
  return INSTRUMENT_CATEGORIES.map((cat) => ({
    category: cat,
    items: Object.entries(INSTRUMENTS)
      .filter(([, v]) => v.category === cat)
      .map(([k, v]) => ({ key: k, label: v.label })),
  })).filter((g) => g.items.length > 0);
}

/* Presets for quickly creating new buckets */
const BUCKET_PRESETS: {
  name: string;
  icon: string;
  targetAmount: number;
  years: number;
  priority: BucketPriority;
  instrument: string;
  color: string;
}[] = [
  {
    name: "רכישת דירה",
    icon: "home",
    targetAmount: 500000,
    years: 7,
    priority: "high",
    instrument: "etf-global",
    color: "#2563eb",
  },
  {
    name: "החלפת רכב",
    icon: "directions_car",
    targetAmount: 150000,
    years: 3,
    priority: "medium",
    instrument: "money-market",
    color: "#d97706",
  },
  {
    name: "חינוך ילדים",
    icon: "school",
    targetAmount: 200000,
    years: 10,
    priority: "medium",
    instrument: "hishtalmut",
    color: "#16a34a",
  },
  {
    name: "חתונה",
    icon: "favorite",
    targetAmount: 80000,
    years: 2,
    priority: "high",
    instrument: "bank-savings",
    color: "#be185d",
  },
  {
    name: "חופשה",
    icon: "flight_takeoff",
    targetAmount: 25000,
    years: 1,
    priority: "low",
    instrument: "money-market",
    color: "#0891b2",
  },
  {
    name: "טיול גדול",
    icon: "luggage",
    targetAmount: 60000,
    years: 2,
    priority: "low",
    instrument: "money-market",
    color: "#7c3aed",
  },
  {
    name: "לימודים",
    icon: "school",
    targetAmount: 120000,
    years: 3,
    priority: "medium",
    instrument: "bank-savings",
    color: "#0284c7",
  },
  {
    name: "קרן חירום",
    icon: "savings",
    targetAmount: 80000,
    years: 1,
    priority: "high",
    instrument: "bank-deposit",
    color: "#dc2626",
  },
  {
    name: "פרישה מוקדמת",
    icon: "elderly",
    targetAmount: 3000000,
    years: 25,
    priority: "medium",
    instrument: "gemel-invest",
    color: "#4338ca",
  },
  {
    name: "פתיחת עסק",
    icon: "storefront",
    targetAmount: 300000,
    years: 5,
    priority: "medium",
    instrument: "etf-global",
    color: "#0f766e",
  },
];

/* ═══════════════════════════════════════════════════════════ */
/* Helpers                                                       */
/* ═══════════════════════════════════════════════════════════ */

function getIcon(name: string): string {
  for (const [key, icon] of Object.entries(GOAL_ICONS)) {
    if (name.includes(key)) return icon;
  }
  return GOAL_ICONS.default;
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  const months = [
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
  return `${months[d.getMonth()]} ${d.getFullYear()}`;
}

function formatYears(months: number): string {
  if (months < 12) return `${months} חודשים`;
  const years = months / 12;
  if (years < 2) {
    const remMonths = Math.round(months - 12);
    return remMonths > 0 ? `שנה ו-${remMonths} חודשים` : "שנה";
  }
  return `${Math.round(years)} שנים`;
}

function taxRecommendation(years: number, amount: number): string | null {
  const tips: string[] = [];
  if (years <= 3) tips.push("לטווח קצר — קרן כספית או תוכנית חיסכון");
  else if (years <= 6) tips.push("קרן השתלמות — פטור ממס אחרי 6 שנים (עד תקרה)");
  else if (years <= 15) tips.push("קרן סל עולמית או קופת גמל להשקעה — פיזור + יתרון מס");
  else tips.push("קופת גמל להשקעה (פטור אחרי 15 שנה) או קרן פנסיה");
  if (amount > 300000 && years > 5) tips.push("שקול פיצול: קרן השתלמות + קרן סל + קופת גמל להשקעה");
  return tips.length > 0 ? tips.join("\n") : null;
}

/* ═══════════════════════════════════════════════════════════ */
/* Grouped Instrument Select                                     */
/* ═══════════════════════════════════════════════════════════ */

function InstrumentSelect({
  value,
  onChange,
  className,
  style,
}: {
  value: string;
  onChange: (key: string) => void;
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={className}
      style={style}
    >
      {instrumentsByCategory().map((g) => (
        <optgroup key={g.category} label={g.category}>
          {g.items.map((item) => (
            <option key={item.key} value={item.key}>
              {item.label}
            </option>
          ))}
        </optgroup>
      ))}
    </select>
  );
}

/* ═══════════════════════════════════════════════════════════ */
/* Recommendation Card — the signature of the new product        */
/* ═══════════════════════════════════════════════════════════ */

function RecommendationCard({ rec, color }: { rec: BucketRecommendation; color: string }) {
  if (rec.type === "on_track") return null;

  const bgMap: Record<string, string> = {
    free_up: "#ecfdf5",
    increase: "#fffbeb",
    extend_date: "#eff6ff",
    reach_now: "#ecfdf5",
  };
  const borderMap: Record<string, string> = {
    free_up: "#1B433233",
    increase: "#f59e0b33",
    extend_date: "#2563eb33",
    reach_now: "#1B433233",
  };
  const textMap: Record<string, string> = {
    free_up: "#065f46",
    increase: "#92400e",
    extend_date: "#1e40af",
    reach_now: "#065f46",
  };

  return (
    <div
      className="rounded-xl p-4"
      style={{
        background: bgMap[rec.type] || "#f9faf2",
        border: `1px solid ${borderMap[rec.type] || "#d8e0d0"}`,
      }}
    >
      <div className="mb-1.5 text-[12px] font-extrabold" style={{ color: textMap[rec.type] }}>
        {rec.title}
      </div>
      <div className="text-[11px] font-bold leading-relaxed" style={{ color: textMap[rec.type] }}>
        {rec.message}
      </div>
      <div className="mt-2 text-[9px] font-bold opacity-70" style={{ color: textMap[rec.type] }}>
        {rec.confidence === "high"
          ? "מבוסס על תשואה בפועל"
          : "מבוסס על תשואה צפויה — יתעדכן כשיהיה מידע אמיתי"}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════ */
/* Main Page                                                     */
/* ═══════════════════════════════════════════════════════════ */

/* ═══════════════════════════════════════════════════════════ */
/* Asset-value lookup — reads securities / RE / pension / cash   */
/* Used to compute bucket currentAmount LIVE from asset links    */
/* ═══════════════════════════════════════════════════════════ */
function buildAssetValueLookup(): (type: AssetType, id: string) => number {
  if (typeof window === "undefined") return () => 0;
  // Securities
  const secIndex = new Map<string, number>();
  try {
    const raw = localStorage.getItem(scopedKey("verdant:securities"));
    if (raw) {
      const arr = JSON.parse(raw) as Array<{ id: string; market_value_ils?: number }>;
      for (const s of arr) secIndex.set(s.id, s.market_value_ils || 0);
    }
  } catch {}
  // Real estate (net equity = currentValue - mortgageBalance)
  const reIndex = new Map<string, number>();
  try {
    const props = loadProperties();
    for (const p of props) {
      const netEquity = (p.currentValue || 0) - (p.mortgageBalance || 0);
      reIndex.set(p.id, Math.max(0, netEquity));
    }
  } catch {}
  // Pension — sum of fund balances (loaded lazily from storage)
  const penIndex = new Map<string, number>();
  try {
    const raw = localStorage.getItem(scopedKey("verdant:pension:funds"));
    if (raw) {
      const arr = JSON.parse(raw) as Array<{ id: string; balance?: number }>;
      for (const f of arr) penIndex.set(f.id, f.balance || 0);
    }
  } catch {}
  return (type, id) => {
    switch (type) {
      case "security":
        return secIndex.get(id) ?? 0;
      case "realestate":
        return reIndex.get(id) ?? 0;
      case "pension":
        return penIndex.get(id) ?? 0;
      case "cash":
        return 0; // cash linking comes in Phase 2
      default:
        return 0;
    }
  };
}

export default function GoalsPage() {
  /* ── Save status indicator ── */
  const { status: saveStatus, pulse } = useSaveStatus();

  const [buckets, setBuckets] = useState<Bucket[]>([]);
  const [links, setLinks] = useState<Record<string, AssetGoalLink>>({});
  const [assetLookupVersion, setAssetLookupVersion] = useState(0);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [checkInOpen, setCheckInOpen] = useState(false);
  const [needsCheckIn, setNeedsCheckIn] = useState(false);

  const GOALS_CHECKIN_KEY = "goals:last_checkin_dismissed";
  const MS_30_DAYS_GOALS = 30 * 24 * 60 * 60 * 1000;

  useEffect(() => {
    // Auto-sync onboarding data (kids savings, pension, etc.) on page load
    syncOnboardingToStores();
  }, []);

  // Banner logic: grace period of 14 days after the user's FIRST goal.
  // Then show once per month, and not within 30 days of being dismissed.
  useEffect(() => {
    if (buckets.length === 0) {
      setNeedsCheckIn(false);
      return;
    }
    const shouldShow = (() => {
      // 14-day grace from the oldest goal's creation
      const oldest = buckets.reduce((min, b) => {
        const t = b.createdAt ? new Date(b.createdAt).getTime() : Date.now();
        return t < min ? t : min;
      }, Date.now());
      const GRACE_MS = 14 * 24 * 60 * 60 * 1000;
      if (Date.now() - oldest < GRACE_MS) return false;
      if (hasCheckedInThisMonth()) return false;
      try {
        const last = Number(localStorage.getItem(scopedKey(GOALS_CHECKIN_KEY)) || 0);
        if (last && Date.now() - last < MS_30_DAYS_GOALS) return false;
      } catch {}
      return true;
    })();
    setNeedsCheckIn(shouldShow);
  }, [buckets, GOALS_CHECKIN_KEY, MS_30_DAYS_GOALS]);

  useEffect(() => {
    setBuckets(loadBuckets());
    setLinks(loadLinks());
    setLoading(false);
    const refresh = () => {
      setBuckets(loadBuckets());
      setLinks(loadLinks());
      setAssetLookupVersion((v) => v + 1);
    };
    const unsubGoals = onSync("verdant:goals:updated", refresh);
    const unsubInv = onSync("verdant:investments:updated", refresh);
    const unsubNet = onSync("verdant:networth:updated", refresh);
    // Real-estate store uses its own event name
    const reHandler = () => refresh();
    window.addEventListener("verdant:realestate:updated", reHandler);
    return () => {
      unsubGoals();
      unsubInv();
      unsubNet();
      window.removeEventListener("verdant:realestate:updated", reHandler);
    };
  }, []);

  // Build the asset-value lookup — rebuilt whenever any asset source changes
  const assetLookup = useMemo(() => buildAssetValueLookup(), [assetLookupVersion, buckets, links]);

  // Effective buckets — currentAmount = linked assets + initialCash.
  const effectiveBuckets = useMemo<Bucket[]>(() => {
    return buckets.map((b) => {
      const linkedAmount = computeGoalAmountFromLinks(b.id, assetLookup, links).total;
      const ic = b.initialCash ?? 0;
      return { ...b, currentAmount: linkedAmount + ic };
    });
  }, [buckets, links, assetLookup]);

  // Per-bucket source breakdown (security / realestate / pension / cash)
  const bucketBreakdowns = useMemo<Record<string, Record<AssetType, number>>>(() => {
    const out: Record<string, Record<AssetType, number>> = {};
    for (const b of buckets) {
      out[b.id] = computeGoalAmountFromLinks(b.id, assetLookup, links).byType;
    }
    return out;
  }, [buckets, links, assetLookup]);

  // Debounced save
  useEffect(() => {
    if (loading) return;
    const t = setTimeout(() => saveBuckets(buckets), 400);
    return () => clearTimeout(t);
  }, [buckets, loading]);

  // Projections — use effectiveBuckets so currentAmount reflects linked assets
  const projections = useMemo<BucketProjection[]>(
    () => effectiveBuckets.map(projectBucket),
    [effectiveBuckets]
  );

  // Sorted: priority first, then by target date
  const sorted = useMemo(() => {
    const bucketsWithProj = effectiveBuckets.map((b) => {
      const proj = projections.find((p) => p.bucketId === b.id)!;
      return { bucket: b, proj };
    });
    return [...bucketsWithProj].sort((a, b) => {
      const pDiff = PRIORITY_ORDER[a.bucket.priority] - PRIORITY_ORDER[b.bucket.priority];
      if (pDiff !== 0) return pDiff;
      return new Date(a.bucket.targetDate).getTime() - new Date(b.bucket.targetDate).getTime();
    });
  }, [effectiveBuckets, projections]);

  // Aggregates
  const totalTarget = effectiveBuckets.reduce((s, b) => s + b.targetAmount, 0);
  const totalCurrent = effectiveBuckets.reduce((s, b) => s + b.currentAmount, 0);
  const totalRequired = projections.reduce((s, p) => s + p.requiredMonthly, 0);
  const freeUp = totalFreeUpPotential(effectiveBuckets);
  const deficit = totalDeficitContribution(effectiveBuckets);

  /* ── CRUD ──────────────────────────────────── */

  const addBucket = useCallback(
    (input: {
      name: string;
      targetAmount: number;
      targetDate: string;
      currentAmount: number;
      monthlyContribution: number;
      expectedAnnualReturn: number;
      priority: BucketPriority;
      fundingSource?: string;
      color?: string;
      scope?: Scope;
      initialCash?: number;
    }) => {
      const bucket = createBucket({
        ...input,
        icon: getIcon(input.name),
        color: input.color || pickColor(input.name + Date.now()),
      });
      if (input.scope) bucket.scope = input.scope;
      setBuckets((prev) => [...prev, bucket]);
      pulse();
      setShowAddForm(false);
    },
    [pulse]
  );

  const updateBucketById = useCallback(
    (id: string, patch: Partial<Bucket>) => {
      setBuckets((prev) =>
        updateBucket(prev, id, {
          ...patch,
          icon: patch.name ? getIcon(patch.name) : undefined,
        })
      );
      pulse();
      setEditingId(null);
    },
    [pulse]
  );

  const deleteBucket = useCallback(
    (id: string) => {
      if (!confirm("למחוק את הקופה? פעולה זו בלתי הפיכה.")) return;
      setBuckets((prev) => removeBucket(prev, id));
      pulse();
    },
    [pulse]
  );

  /* ═══════ RENDER ═══════ */

  if (loading) {
    return (
      <div className="mx-auto max-w-4xl py-20 text-center text-[13px] font-bold text-verdant-muted">
        טוען קופות...
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl py-4 md:py-8" style={{ fontFamily: "'Assistant', sans-serif" }}>
      <PageHeader
        subtitle="Plan · מטרות ויעדים"
        title="המטרות והיעדים שלי"
        description="הגדרת מטרות חיים וצביעת הכסף אליהן — כדי לדעת לאן אנחנו הולכים"
      />
      {/* אינדיקטור שמירה */}
      <div className="-mt-4 mb-3 flex min-h-[18px] justify-end">
        <SaveStatus status={saveStatus} />
      </div>

      {/* ═══════ Monthly check-in banner ═══════ */}
      {buckets.length > 0 && needsCheckIn && (
        <section
          className="mb-6 flex items-center justify-between gap-4 rounded-2xl p-5"
          style={{ background: "#fffbea", border: "1px solid #fde68a" }}
        >
          <div className="flex items-center gap-4">
            <div
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl"
              style={{ background: "#f59e0b20" }}
            >
              <span className="material-symbols-outlined text-[24px]" style={{ color: "#b45309" }}>
                event_available
              </span>
            </div>
            <div>
              <div className="text-[13px] font-extrabold" style={{ color: "#78350f" }}>
                הגיע הזמן ל-check-in חודשי
              </div>
              <div className="text-[11px] font-bold" style={{ color: "#92400e" }}>
                הפקדת החודש?
              </div>
            </div>
          </div>
          <button
            onClick={() => {
              try {
                localStorage.setItem(scopedKey(GOALS_CHECKIN_KEY), String(Date.now()));
              } catch {}
              setCheckInOpen(true);
            }}
            className="shrink-0 rounded-xl px-5 py-2.5 text-[12px] font-extrabold text-white transition-colors hover:opacity-90"
            style={{ background: "#b45309" }}
          >
            התחל check-in
          </button>
        </section>
      )}

      <MonthlyCheckIn
        open={checkInOpen}
        onClose={() => {
          try {
            localStorage.setItem(scopedKey(GOALS_CHECKIN_KEY), String(Date.now()));
          } catch {}
          setCheckInOpen(false);
          setNeedsCheckIn(false);
        }}
        onDone={() => {
          try {
            localStorage.setItem(scopedKey(GOALS_CHECKIN_KEY), String(Date.now()));
          } catch {}
          setBuckets(loadBuckets());
          setNeedsCheckIn(false);
        }}
      />

      {/* ═══════ Summary Row — only when there ARE buckets ═══════ */}
      {buckets.length > 0 && (
        <SolidKpiRow>
          <SolidKpi
            label={`${buckets.length} קופות`}
            value={fmtILS(totalCurrent)}
            icon="savings"
            tone="forest"
            sub={`מתוך ${fmtILS(totalTarget)}`}
          />
          <SolidKpi
            label="נדרש בחודש"
            value={fmtILS(Math.round(totalRequired))}
            icon="calendar_month"
            tone="ink"
            sub="להגיע ליעדים בזמן"
          />
          {freeUp > 0 && (
            <SolidKpi
              label="✨ פוטנציאל שחרור"
              value={`${fmtILS(freeUp)}/ח׳`}
              icon="bolt"
              tone="emerald"
              sub="יש יעדים מקדימים"
            />
          )}
          {deficit > 0 && (
            <SolidKpi
              label="⚠️ חוסר בתקציב"
              value={`${fmtILS(deficit)}/ח׳`}
              icon="warning"
              tone="red"
              sub="יעדים בפיגור"
            />
          )}
        </SolidKpiRow>
      )}

      {/* ═══════ Add + Cleanup Buttons — only when there ARE buckets ═══════
          Cleanup is here because the auto-sync (kids' bar/bat mitzvah, army
          release, emergency fund, onboarding goals) accumulates duplicates
          when names are edited or the questionnaire is re-run. Manual
          delete-one-by-one is tedious; these two presets give the family a
          way to prune the list in a single click. */}
      {buckets.length > 0 && (
        <div className="mb-6 flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => {
                const autoBuckets = buckets.filter(
                  (b) => b.autoGenerated?.source || b.isEmergency
                );
                if (autoBuckets.length === 0) {
                  alert("אין קופות אוטומטיות למחיקה.");
                  return;
                }
                if (
                  !confirm(
                    `למחוק ${autoBuckets.length} קופות שנוצרו אוטומטית מהשאלון? (קופות שיצרת ידנית יישמרו.)`
                  )
                )
                  return;
                const toKeep = buckets.filter(
                  (b) => !b.autoGenerated?.source && !b.isEmergency
                );
                saveBuckets(toKeep);
                setBuckets(toKeep);
                pulse();
              }}
              className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[11px] font-bold transition-colors hover:bg-amber-100"
              style={{ background: "#fef3c7", color: "#92400e", border: "1px solid #fcd34d" }}
              title="קופות שהמערכת יצרה משאלון הילדים / קרן חירום / יעדים שכתבת בשאלון"
            >
              <span className="material-symbols-outlined text-[14px]">cleaning_services</span>
              מחק קופות אוטומטיות
            </button>
            <button
              onClick={() => {
                if (
                  !confirm(
                    `למחוק את כל ${buckets.length} הקופות? פעולה זו בלתי הפיכה.`
                  )
                )
                  return;
                if (!confirm("ממש לוודא — מוחק הכל. אין דרך חזרה.")) return;
                saveBuckets([]);
                setBuckets([]);
                pulse();
              }}
              className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[11px] font-bold transition-colors hover:bg-red-100"
              style={{ background: "#fef2f2", color: "#991b1b", border: "1px solid #fca5a5" }}
            >
              <span className="material-symbols-outlined text-[14px]">delete_sweep</span>
              מחק את הכל
            </button>
          </div>
          <button
            onClick={() => setShowAddForm(true)}
            className="btn-botanical inline-flex items-center gap-2 !px-5 !py-2.5 text-[12px]"
          >
            <span className="material-symbols-outlined text-[16px]">add</span>הוסף מטרה
          </button>
        </div>
      )}

      {/* ═══════ Add Form ═══════ */}
      {showAddForm && (
        <div className="mb-6">
          <BucketAddForm onSave={addBucket} onCancel={() => setShowAddForm(false)} />
        </div>
      )}

      {/* ═══════ Empty State ═══════ */}
      {buckets.length === 0 && !showAddForm && (
        <div className="card-mint">
          <div className="flex items-start gap-5">
            <div
              className="icon-lg shrink-0"
              style={{ background: "rgba(27,67,50,0.1)", color: "var(--botanical-forest)" }}
            >
              <span className="material-symbols-outlined text-[26px]">palette</span>
            </div>
            <div className="min-w-0 flex-1">
              <div className="t-lg mb-2 font-extrabold" style={{ color: "var(--botanical-deep)" }}>
                לא הוגדרו מטרות ויעדים
              </div>
              <div className="mb-4 text-[13px] leading-6" style={{ color: "rgba(1,45,29,0.75)" }}>
                כל שקל יודע לאן הוא הולך.
              </div>
              <button onClick={() => setShowAddForm(true)} className="btn btn-primary btn-sm">
                <span className="material-symbols-outlined text-[16px]">add</span>
                הוסף מטרה ראשונה
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ═══════ Bucket Cards ═══════ */}
      <div className="space-y-5">
        {sorted.map(({ bucket, proj }) => {
          const isEditing = editingId === bucket.id;
          const statusColor = STATUS_COLOR[proj.status];
          const inst = bucket.fundingSource ? INSTRUMENTS[bucket.fundingSource] : null;

          return (
            <div
              key={bucket.id}
              className="overflow-hidden rounded-2xl transition-all duration-200"
              style={{
                background: "#fff",
                border: "1px solid #E8E9E1",
                boxShadow: "none",
              }}
            >
              {/* Row 1: Name + Badges */}
              <div className="px-7 pb-3 pt-6">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-center gap-4">
                    <div
                      className="flex h-12 w-12 items-center justify-center rounded-2xl"
                      style={{ background: "var(--botanical-forest)" }}
                    >
                      <span
                        className="material-symbols-outlined text-[24px]"
                        style={{ color: "#C1ECD4" }}
                      >
                        {bucket.icon}
                      </span>
                    </div>
                    <h3
                      className="text-xl font-extrabold leading-tight"
                      style={{ color: "#012D1D" }}
                    >
                      {bucket.name}
                    </h3>
                  </div>
                  <div className="flex items-center gap-2">
                    {(bucket.scope === "business" || bucket.scope === "mixed") && (
                      <span
                        className="rounded-full px-2.5 py-1 text-[10px] font-bold"
                        style={{
                          background: `${SCOPE_COLORS[bucket.scope]}15`,
                          color: SCOPE_COLORS[bucket.scope],
                        }}
                        title={SCOPE_LABELS[bucket.scope]}
                      >
                        {SCOPE_LABELS[bucket.scope]}
                      </span>
                    )}
                    <button
                      onClick={() => {
                        const next = cycleScope(bucket.scope);
                        setBuckets((prev) =>
                          updateBucket(prev, bucket.id, { scope: next } as Partial<Bucket>)
                        );
                        pulse();
                      }}
                      className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full transition-all hover:scale-110"
                      style={{
                        background: bucket.scope ? SCOPE_COLORS[bucket.scope] : "transparent",
                        border: `1.5px solid ${bucket.scope ? SCOPE_COLORS[bucket.scope] : "#c8d6c0"}`,
                      }}
                      title={
                        bucket.scope
                          ? `${SCOPE_LABELS[bucket.scope]} — לחץ לשינוי`
                          : "סמן כעסקי/מעורב"
                      }
                    />
                    <span
                      className="rounded-full px-3 py-1.5 text-[11px] font-extrabold"
                      style={{ background: `${statusColor}15`, color: statusColor }}
                    >
                      {STATUS_LABEL[proj.status]}
                    </span>
                    <button
                      onClick={() => setEditingId(isEditing ? null : bucket.id)}
                      title={isEditing ? "סגור עריכה" : "ערוך יעד"}
                      className="flex h-9 w-9 items-center justify-center rounded-full transition-all"
                      style={{ background: "#F3F4EC", color: "#1B4332" }}
                    >
                      <span className="material-symbols-outlined text-[18px]">
                        {isEditing ? "close" : "edit"}
                      </span>
                    </button>
                    <button
                      onClick={() => deleteBucket(bucket.id)}
                      title="מחק יעד"
                      className="flex h-9 w-9 items-center justify-center rounded-full transition-all hover:bg-red-100"
                      style={{ background: "#FEF2F2", color: "#b91c1c" }}
                    >
                      <span className="material-symbols-outlined text-[18px]">delete_outline</span>
                    </button>
                  </div>
                </div>
              </div>

              {/* Row 2: Target + date */}
              <div className="px-7 pb-3">
                <div className="flex items-baseline gap-3">
                  <span
                    className="text-2xl font-extrabold tabular-nums"
                    style={{ color: "#012d1d" }}
                  >
                    {fmtILS(bucket.targetAmount)}
                  </span>
                  <span className="text-[12px] font-bold text-verdant-muted">
                    {formatDate(bucket.targetDate)} · בעוד {formatYears(proj.monthsRemaining)}
                  </span>
                </div>
                {/* Emergency-fund — 3/6-month coverage selector + needed-vs-liquid gauge. */}
                {bucket.isEmergency &&
                  (() => {
                    // 2026-05-05: emergency-fund target uses NET monthly income
                    // (the family lives off net). Single source of truth: lib/income.ts.
                    const monthlyIncome = getMonthlyNetIncome();
                    const months = bucket.coverageMonths || 3;
                    const setCoverage = (m: number) => {
                      const clamped = Math.max(3, Math.min(6, Math.round(m))) as 3 | 4 | 5 | 6;
                      const newTarget =
                        monthlyIncome > 0
                          ? Math.round(monthlyIncome * clamped)
                          : bucket.targetAmount;
                      setBuckets((prev) =>
                        updateBucket(prev, bucket.id, {
                          coverageMonths: clamped as any,
                          targetAmount: newTarget,
                        } as Partial<Bucket>)
                      );
                      pulse();
                    };
                    // Liquid assets — sum of all bank account balances. This is
                    // the "ready cash" available to absorb the emergency.
                    let liquid = 0;
                    try {
                      const raw = localStorage.getItem(scopedKey("verdant:accounts"));
                      if (raw) {
                        const parsed = JSON.parse(raw);
                        const banks = parsed?.banks || [];
                        liquid = banks.reduce(
                          (s: number, b: any) => s + (b.currentBalance || 0),
                          0
                        );
                      }
                    } catch {}
                    const gap = Math.max(0, bucket.targetAmount - liquid);
                    const coveragePct =
                      bucket.targetAmount > 0
                        ? Math.min(100, Math.round((liquid / bucket.targetAmount) * 100))
                        : 0;
                    return (
                      <div className="mt-3 space-y-2">
                        <div>
                          <div className="mb-1.5 flex items-center justify-between">
                            <span className="text-[11px] font-bold text-verdant-muted">כיסוי</span>
                            <span className="text-[12px] font-extrabold tabular-nums text-verdant-ink">
                              {months} חודשים
                              {monthlyIncome > 0 && (
                                <span className="mr-2 text-[10px] font-medium text-verdant-muted">
                                  · {fmtILS(monthlyIncome)} × {months}
                                </span>
                              )}
                            </span>
                          </div>
                          <input
                            type="range"
                            min={3}
                            max={6}
                            step={1}
                            value={months}
                            onChange={(e) => setCoverage(parseInt(e.target.value))}
                            className="h-1.5 w-full accent-[#1B4332]"
                          />
                          <div className="mt-0.5 flex items-center justify-between px-0.5 text-[9px] text-verdant-muted">
                            <span>3</span>
                            <span>4</span>
                            <span>5</span>
                            <span>6</span>
                          </div>
                        </div>
                        {/* Needed-vs-liquid bar — quick visual of "where you stand". */}
                        <div
                          className="rounded-lg p-2.5"
                          style={{ background: "#f4f7ed", border: "1px solid #d8e0d0" }}
                        >
                          <div className="mb-1 flex items-center justify-between text-[11px] font-bold">
                            <span className="text-verdant-muted">
                              נזיל בעו״ש{" "}
                              <b className="tabular-nums text-verdant-ink">{fmtILS(liquid)}</b>
                            </span>
                            <span style={{ color: gap === 0 ? "#1B4332" : "#B45309" }}>
                              {gap === 0 ? "מכוסה ✓" : `חסר ${fmtILS(gap)}`}
                            </span>
                          </div>
                          <div
                            className="h-1.5 overflow-hidden rounded-full"
                            style={{ background: "#eef2e8" }}
                          >
                            <div
                              className="h-full rounded-full transition-all"
                              style={{
                                width: `${coveragePct}%`,
                                background: gap === 0 ? "#1B4332" : "#B45309",
                              }}
                            />
                          </div>
                        </div>
                      </div>
                    );
                  })()}
              </div>

              {/* Row 3: Progress */}
              <div className="px-7 pb-4">
                <div className="mb-1.5 flex items-center justify-between text-[11px] font-bold text-verdant-muted">
                  <span className="tabular-nums">{proj.progressPct}% הושג</span>
                  <span className="tabular-nums">
                    {fmtILS(Math.round(bucket.currentAmount))} מתוך {fmtILS(bucket.targetAmount)}
                  </span>
                </div>
                <div
                  className="h-2.5 overflow-hidden rounded-full"
                  style={{ background: "#eef2e8" }}
                >
                  <div
                    className="h-full rounded-full transition-all duration-700"
                    style={{
                      width: `${proj.progressPct}%`,
                      background: `linear-gradient(90deg, ${statusColor}AA, ${statusColor})`,
                    }}
                  />
                </div>
                {/* Breakdown: initialCash + linked assets — show even if only one source exists */}
                {(() => {
                  const ic = bucket.initialCash ?? 0;
                  const linked = computeGoalAmountFromLinks(bucket.id, assetLookup, links).total;
                  const parts: string[] = [];
                  if (ic > 0) parts.push(`${fmtILS(Math.round(ic))} מזומן`);
                  if (linked > 0) parts.push(`${fmtILS(Math.round(linked))} נכסים מקושרים`);
                  if (parts.length === 0) return null;
                  return (
                    <div className="mt-1.5 text-[10px] font-bold" style={{ color: "#5a7a6a" }}>
                      {parts.map((p, i) => (
                        <span key={i}>
                          {i > 0 && <>&nbsp;&nbsp;•&nbsp;&nbsp;</>}• {p}
                        </span>
                      ))}
                    </div>
                  );
                })()}
                {/* Source breakdown — שוק ההון / נדל"ן / פנסיה / מזומן */}
                {(() => {
                  const bd = bucketBreakdowns[bucket.id];
                  if (!bd) return null;
                  const items: { label: string; icon: string; value: number; color: string }[] = [
                    {
                      label: "שוק ההון",
                      icon: "candlestick_chart",
                      value: bd.security,
                      color: "#1B4332",
                    }, // forest
                    { label: "נדל״ן", icon: "home_work", value: bd.realestate, color: "#B45309" }, // amber (earth)
                    { label: "פנסיה", icon: "elderly", value: bd.pension, color: "#2B694D" }, // emerald
                    {
                      label: "מזומן",
                      icon: "account_balance_wallet",
                      value: bd.cash,
                      color: "#4A7C59",
                    }, // moss
                  ].filter((i) => i.value > 0);
                  if (items.length === 0) return null;
                  return (
                    <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
                      {items.map((item) => (
                        <div
                          key={item.label}
                          className="flex items-center gap-1 text-[10px] font-bold"
                          style={{ color: item.color }}
                        >
                          <span className="material-symbols-outlined text-[13px]">{item.icon}</span>
                          <span>
                            {item.label}: {fmtILS(Math.round(item.value))}
                          </span>
                        </div>
                      ))}
                    </div>
                  );
                })()}
              </div>

              {/* Row 4: 4 key numbers */}
              <div className="border-t px-7 pb-5 pt-4" style={{ borderColor: "#eef2e8" }}>
                <div className="grid grid-cols-2 gap-5 md:grid-cols-4">
                  <div>
                    <div className="mb-1 text-[10px] font-bold text-verdant-muted">
                      הפקדה חודשית
                    </div>
                    <div className="text-[14px] font-extrabold tabular-nums text-verdant-ink">
                      {fmtILS(bucket.monthlyContribution)}
                    </div>
                  </div>
                  <div>
                    <div className="mb-1 text-[10px] font-bold text-verdant-muted">נדרש בחודש</div>
                    <div
                      className="text-[14px] font-extrabold tabular-nums"
                      style={{
                        color:
                          proj.requiredMonthly > bucket.monthlyContribution ? "#8B2E2E" : "#1B4332",
                      }}
                    >
                      {fmtILS(Math.round(proj.requiredMonthly))}
                    </div>
                  </div>
                  <div>
                    <div className="mb-1 text-[10px] font-bold text-verdant-muted">מכשיר</div>
                    <div className="text-[13px] font-extrabold text-verdant-ink">
                      {inst?.label || "—"}
                    </div>
                  </div>
                  <div>
                    <div className="mb-1 text-[10px] font-bold text-verdant-muted">
                      {proj.effectiveAnnualReturn === bucket.expectedAnnualReturn
                        ? "תשואה צפויה"
                        : "תשואה בפועל"}
                    </div>
                    <div className="text-[14px] font-extrabold text-verdant-ink">
                      {(proj.effectiveAnnualReturn * 100).toFixed(1)}%
                    </div>
                  </div>
                </div>
              </div>

              {/* Row 5: Recommendation */}
              {proj.recommendation.type !== "on_track" && (
                <div className="mx-7 mb-5">
                  <RecommendationCard rec={proj.recommendation} color={statusColor} />
                </div>
              )}

              {/* Inline Edit Form */}
              {isEditing && (
                <div className="mx-7 mb-6">
                  <BucketEditForm
                    bucket={bucket}
                    onSave={(u) => updateBucketById(bucket.id, u)}
                    onCancel={() => setEditingId(null)}
                  />
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* ═══════ Kids Savings ═══════ */}
      <div className="mt-8">
        <KidsSavingsSection />
      </div>

      {/* ═══════ Special Events (cashflow forecast inputs) ═══════ */}
      <SpecialEventsSection />
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════ */
/* Edit Form                                                     */
/* ═══════════════════════════════════════════════════════════ */

function BucketEditForm({
  bucket,
  onSave,
  onCancel,
}: {
  bucket: Bucket;
  onSave: (u: Partial<Bucket>) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(bucket.name);
  const [targetAmount, setTargetAmount] = useState(bucket.targetAmount.toString());
  const [targetDate, setTargetDate] = useState(bucket.targetDate);
  const [monthlyContribution, setMonthlyContribution] = useState(
    bucket.monthlyContribution.toString()
  );
  const [expectedReturn, setExpectedReturn] = useState(
    (bucket.expectedAnnualReturn * 100).toFixed(1)
  );
  const [priority, setPriority] = useState<BucketPriority>(bucket.priority);
  const [fundingSource, setFundingSource] = useState(bucket.fundingSource || "money-market");
  const [color, setColor] = useState(bucket.color);
  const [initialCash, setInitialCash] = useState((bucket.initialCash || 0).toString());

  const years = (new Date(targetDate).getTime() - Date.now()) / (365.25 * 24 * 3600 * 1000);
  const amount = parseFloat(targetAmount) || 0;
  const tip = taxRecommendation(years, amount);
  const currentInst = INSTRUMENTS[fundingSource];

  const handleInstrumentChange = (key: string) => {
    setFundingSource(key);
    const inst = INSTRUMENTS[key];
    if (inst) setExpectedReturn((inst.rate * 100).toFixed(1));
  };

  return (
    <div
      className="space-y-4 rounded-xl p-6"
      style={{ background: "#f9faf2", border: "1px solid #d8e0d0" }}
    >
      <div className="text-[11px] font-extrabold text-verdant-ink">עריכת קופה</div>
      <div className="grid grid-cols-3 gap-3">
        <Field label="שם הקופה" value={name} onChange={setName} />
        <Field label="סכום יעד (₪)" value={targetAmount} onChange={setTargetAmount} type="number" />
        <Field label="תאריך יעד" value={targetDate} onChange={setTargetDate} type="date" />
        <Field
          label="הפקדה חודשית (₪)"
          value={monthlyContribution}
          onChange={setMonthlyContribution}
          type="number"
        />
        <Field
          label="תשואה צפויה %"
          value={expectedReturn}
          onChange={setExpectedReturn}
          type="number"
        />
      </div>
      <div>
        <div className="mb-1 text-[9px] font-bold text-verdant-muted">
          סכום מזומן שיש לך היום ליעד הזה (אופציונלי)
        </div>
        <input
          type="number"
          value={initialCash}
          onChange={(e) => setInitialCash(e.target.value)}
          placeholder="₪0"
          className="w-full rounded-lg border px-3 py-2 text-[11px] font-bold outline-none focus:ring-2 focus:ring-verdant-accent/30"
          style={{ borderColor: "#d8e0d0", background: "#fff", color: "#0891b2" }}
        />
        <div className="mt-1 text-[9px] font-bold" style={{ color: "#5a7a6a" }}>
          סכום חד-פעמי שכבר קיים בידיך — יחושב כחלק מהיעד מיידית
        </div>
      </div>

      <div>
        <div className="mb-1 text-[9px] font-bold text-verdant-muted">מכשיר ההשקעה</div>
        <InstrumentSelect
          value={fundingSource}
          onChange={handleInstrumentChange}
          className="w-full rounded-lg border px-3 py-2 text-[11px] font-bold outline-none"
          style={{ borderColor: "#d8e0d0", background: "#fff" }}
        />
        {currentInst && (
          <div className="mt-1.5 text-[9px] font-bold leading-relaxed" style={{ color: "#5a7a6a" }}>
            {currentInst.taxNote}
          </div>
        )}
      </div>

      {tip && (
        <div
          className="rounded-lg p-3"
          style={{ background: "#eff6ff", border: "1px solid #93c5fd30" }}
        >
          {tip.split("\n").map((line, i) => (
            <div
              key={i}
              className="text-[11px] font-bold leading-relaxed"
              style={{ color: "#1e40af" }}
            >
              {line}
            </div>
          ))}
        </div>
      )}

      <div className="flex items-center gap-3">
        <div className="ml-2 text-[9px] font-bold text-verdant-muted">עדיפות:</div>
        {(["high", "medium", "low"] as const).map((p) => (
          <button
            key={p}
            onClick={() => setPriority(p)}
            className="rounded-lg px-3 py-1.5 text-[10px] font-bold transition-all"
            style={{
              background: priority === p ? PRIORITY_COLORS[p].text : "#eef2e8",
              color: priority === p ? "#fff" : PRIORITY_COLORS[p].text,
            }}
          >
            {PRIORITY_LABELS[p]}
          </button>
        ))}
      </div>

      <div className="flex items-center gap-3 border-t pt-3" style={{ borderColor: "#d8e0d0" }}>
        <button
          onClick={() =>
            onSave({
              name,
              targetAmount: parseFloat(targetAmount) || 0,
              targetDate,
              monthlyContribution: parseFloat(monthlyContribution) || 0,
              currentAmount: 0,
              expectedAnnualReturn: (parseFloat(expectedReturn) || 5) / 100,
              priority,
              fundingSource,
              color,
              initialCash: parseFloat(initialCash) || 0,
            })
          }
          className="btn-botanical !px-5 !py-2 text-[12px]"
        >
          שמור שינויים
        </button>
        <button onClick={onCancel} className="btn-botanical-ghost !px-4 !py-2 text-[12px]">
          ביטול
        </button>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════ */
/* Add Form                                                      */
/* ═══════════════════════════════════════════════════════════ */

function BucketAddForm({
  onSave,
  onCancel,
}: {
  onSave: (input: {
    name: string;
    targetAmount: number;
    targetDate: string;
    currentAmount: number;
    monthlyContribution: number;
    expectedAnnualReturn: number;
    priority: BucketPriority;
    fundingSource?: string;
    color?: string;
    scope?: Scope;
    initialCash?: number;
  }) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState("");
  const [targetAmount, setTargetAmount] = useState("");
  const [targetDate, setTargetDate] = useState(
    new Date(Date.now() + 3 * 365.25 * 24 * 3600 * 1000).toISOString().split("T")[0]
  );
  const [monthlyContribution, setMonthlyContribution] = useState("");
  const [expectedReturn, setExpectedReturn] = useState("5.0");
  const [priority, setPriority] = useState<BucketPriority>("medium");
  const [fundingSource, setFundingSource] = useState("money-market");
  const [color, setColor] = useState<string>(BUCKET_COLORS[0]);
  const [scope, setScope] = useState<Scope | undefined>(undefined);
  const [initialCash, setInitialCash] = useState("");

  const applyPreset = (preset: (typeof BUCKET_PRESETS)[0]) => {
    setName(preset.name);
    setTargetAmount(preset.targetAmount.toString());
    setTargetDate(
      new Date(Date.now() + preset.years * 365.25 * 24 * 3600 * 1000).toISOString().split("T")[0]
    );
    setPriority(preset.priority);
    setFundingSource(preset.instrument);
    setColor(preset.color);
    const inst = INSTRUMENTS[preset.instrument];
    if (inst) setExpectedReturn((inst.rate * 100).toFixed(1));
  };

  const handleInstrumentChange = (key: string) => {
    setFundingSource(key);
    const inst = INSTRUMENTS[key];
    if (inst) setExpectedReturn((inst.rate * 100).toFixed(1));
  };

  const years = (new Date(targetDate).getTime() - Date.now()) / (365.25 * 24 * 3600 * 1000);
  const amount = parseFloat(targetAmount) || 0;
  const tip = taxRecommendation(years, amount);
  const currentInst = INSTRUMENTS[fundingSource];

  return (
    <div
      className="space-y-5 rounded-2xl p-6"
      style={{ background: "#fff", border: "2px solid #1B433233" }}
    >
      <h3 className="text-base font-extrabold text-verdant-ink">קופה חדשה</h3>

      <div>
        <div className="mb-2 text-[10px] font-bold text-verdant-muted">בחר תבנית מוכנה:</div>
        <div className="flex flex-wrap gap-2">
          {BUCKET_PRESETS.map((p) => (
            <button
              key={p.name}
              onClick={() => applyPreset(p)}
              className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-[11px] font-bold transition-all"
              style={{
                background: `${p.color}10`,
                color: "#012d1d",
                border: `1px solid ${p.color}30`,
              }}
            >
              <span className="material-symbols-outlined text-[14px]" style={{ color: p.color }}>
                {p.icon}
              </span>
              {p.name}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <Field label="שם הקופה" value={name} onChange={setName} placeholder="למשל: החלפת רכב" />
        <Field
          label="סכום יעד (₪)"
          value={targetAmount}
          onChange={setTargetAmount}
          type="number"
          placeholder="150000"
        />
        <Field label="תאריך יעד" value={targetDate} onChange={setTargetDate} type="date" />
        <Field
          label="הפקדה חודשית (₪)"
          value={monthlyContribution}
          onChange={setMonthlyContribution}
          type="number"
          placeholder="2000"
        />
        <Field
          label="תשואה צפויה %"
          value={expectedReturn}
          onChange={setExpectedReturn}
          type="number"
        />
      </div>
      <div>
        <div className="mb-1 text-[9px] font-bold text-verdant-muted">
          סכום מזומן שיש לך היום ליעד הזה (אופציונלי)
        </div>
        <input
          type="number"
          value={initialCash}
          onChange={(e) => setInitialCash(e.target.value)}
          placeholder="₪0"
          className="w-full rounded-lg border px-3 py-2 text-[11px] font-bold outline-none focus:ring-2 focus:ring-verdant-accent/30"
          style={{ borderColor: "#d8e0d0", background: "#fff", color: "#0891b2" }}
        />
        <div className="mt-1 text-[9px] font-bold" style={{ color: "#5a7a6a" }}>
          סכום חד-פעמי שכבר קיים בידיך — יחושב כחלק מהיעד מיידית
        </div>
      </div>

      <div>
        <div className="mb-1 text-[9px] font-bold text-verdant-muted">מכשיר</div>
        <InstrumentSelect
          value={fundingSource}
          onChange={handleInstrumentChange}
          className="w-full rounded-lg border px-3 py-2 text-[11px] font-bold outline-none"
          style={{ borderColor: "#d8e0d0", background: "#fff" }}
        />
        {currentInst && (
          <div className="mt-1.5 text-[9px] font-bold leading-relaxed" style={{ color: "#5a7a6a" }}>
            {currentInst.taxNote}
          </div>
        )}
      </div>

      {tip && (
        <div
          className="rounded-lg p-3"
          style={{ background: "#eff6ff", border: "1px solid #93c5fd30" }}
        >
          {tip.split("\n").map((line, i) => (
            <div
              key={i}
              className="text-[11px] font-bold leading-relaxed"
              style={{ color: "#1e40af" }}
            >
              {line}
            </div>
          ))}
        </div>
      )}

      <div className="flex items-center gap-3">
        <div className="ml-2 text-[9px] font-bold text-verdant-muted">עדיפות:</div>
        {(["high", "medium", "low"] as const).map((p) => (
          <button
            key={p}
            onClick={() => setPriority(p)}
            className="rounded-lg px-3 py-1.5 text-[10px] font-bold transition-all"
            style={{
              background: priority === p ? PRIORITY_COLORS[p].text : "#eef2e8",
              color: priority === p ? "#fff" : PRIORITY_COLORS[p].text,
            }}
          >
            {PRIORITY_LABELS[p]}
          </button>
        ))}
      </div>

      <div className="flex items-center gap-3">
        <div className="ml-2 text-[9px] font-bold text-verdant-muted">ייעוד:</div>
        {[
          { key: undefined, label: "פרטי (ברירת מחדל)" },
          { key: "business" as const, label: "עסקי" },
          { key: "mixed" as const, label: "מעורב" },
        ].map((opt) => {
          const active = scope === opt.key;
          const color = opt.key ? SCOPE_COLORS[opt.key] : SCOPE_COLORS.personal;
          return (
            <button
              key={String(opt.key)}
              type="button"
              onClick={() => setScope(opt.key)}
              className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[10px] font-bold transition-all"
              style={{ background: active ? color : "#eef2e8", color: active ? "#fff" : color }}
            >
              <span
                className="inline-block h-1.5 w-1.5 rounded-full"
                style={{ background: active ? "#fff" : color }}
              />
              {opt.label}
            </button>
          );
        })}
      </div>

      <div className="flex items-center gap-3 border-t pt-3" style={{ borderColor: "#eef2e8" }}>
        <button
          disabled={!name || !targetAmount}
          onClick={() =>
            onSave({
              name,
              targetAmount: parseFloat(targetAmount) || 0,
              targetDate,
              currentAmount: 0,
              monthlyContribution: parseFloat(monthlyContribution) || 0,
              expectedAnnualReturn: (parseFloat(expectedReturn) || 5) / 100,
              priority,
              fundingSource,
              color,
              scope,
              initialCash: parseFloat(initialCash) || 0,
            })
          }
          className="btn-botanical !px-5 !py-2 text-[12px] disabled:opacity-40"
        >
          הוסף מטרה
        </button>
        <button onClick={onCancel} className="btn-botanical-ghost !px-4 !py-2 text-[12px]">
          ביטול
        </button>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════ */
/* Field helper                                                  */
/* ═══════════════════════════════════════════════════════════ */

function Field({
  label,
  value,
  onChange,
  type = "text",
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  placeholder?: string;
}) {
  return (
    <div>
      <div className="mb-1 text-[9px] font-bold text-verdant-muted">{label}</div>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-lg border px-3 py-2 text-[11px] font-bold outline-none focus:ring-2 focus:ring-verdant-accent/30"
        style={{ borderColor: "#d8e0d0", background: "#fff" }}
      />
    </div>
  );
}
