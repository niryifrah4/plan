"use client";

import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { PageHeader } from "@/components/ui/PageHeader";
import { SaveStatus } from "@/components/ui/SaveStatus";
import { SolidKpi, SolidKpiRow } from "@/components/ui/SolidKpi";
import { useSaveStatus } from "@/lib/hooks/useSaveStatus";
import { fmtILS } from "@/lib/format";
import { onSync } from "@/lib/sync-engine";
import { scopedKey } from "@/lib/client-scope";
import {
  Bucket,
  BucketPriority,
  loadBuckets,
  saveBuckets,
  createBucket,
  updateBucket,
  removeBucket,
  pickColor,
} from "@/lib/buckets-store";
import {
  projectBucket,
  totalFreeUpPotential,
  totalDeficitContribution,
  BucketProjection,
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
import { type Scope } from "@/lib/scope-types";
import { getIcon, PRIORITY_ORDER } from "./page-files/shared";
import { GoalRow } from "./page-files/GoalRow";
import { AddGoalModal } from "./page-files/AddGoalModal";
import { EditGoalModal } from "./page-files/EditGoalModal";
import { RecommendationsStrip } from "./page-files/RecommendationsStrip";
import { useConfirm } from "@/components/ui/ConfirmModal";
import { reportError } from "@/lib/report-error";

function buildAssetValueLookup(): (type: AssetType, id: string) => number {
  if (typeof window === "undefined") return () => 0;
  const secIndex = new Map<string, number>();
  try {
    const raw = localStorage.getItem(scopedKey("verdant:securities"));
    if (raw) {
      const arr = JSON.parse(raw) as Array<{ id: string; market_value_ils?: number }>;
      for (const s of arr) secIndex.set(s.id, s.market_value_ils || 0);
    }
  } catch (e) { reportError("client/goals/page", e); }
  const reIndex = new Map<string, number>();
  try {
    const props = loadProperties();
    for (const p of props) {
      const netEquity = (p.currentValue || 0) - (p.mortgageBalance || 0);
      reIndex.set(p.id, Math.max(0, netEquity));
    }
  } catch (e) { reportError("client/goals/page", e); }
  const penIndex = new Map<string, number>();
  try {
    const raw = localStorage.getItem(scopedKey("verdant:pension:funds"));
    if (raw) {
      const arr = JSON.parse(raw) as Array<{ id: string; balance?: number }>;
      for (const f of arr) penIndex.set(f.id, f.balance || 0);
    }
  } catch (e) { reportError("client/goals/page", e); }
  return (type, id) => {
    switch (type) {
      case "security":
        return secIndex.get(id) ?? 0;
      case "realestate":
        return reIndex.get(id) ?? 0;
      case "pension":
        return penIndex.get(id) ?? 0;
      case "cash":
        return 0;
      default:
        return 0;
    }
  };
}

export default function GoalsPage() {
  const { status: saveStatus, pulse } = useSaveStatus();
  const { confirm, modal } = useConfirm();

  const [buckets, setBuckets] = useState<Bucket[]>([]);
  const [links, setLinks] = useState<Record<string, AssetGoalLink>>({});
  const [assetLookupVersion, setAssetLookupVersion] = useState(0);
  const [loading, setLoading] = useState(true);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [checkInOpen, setCheckInOpen] = useState(false);
  const [needsCheckIn, setNeedsCheckIn] = useState(false);
  const rowRefs = useRef<Record<string, HTMLDivElement | null>>({});

  const GOALS_CHECKIN_KEY = "goals:last_checkin_dismissed";
  const MS_30_DAYS_GOALS = 30 * 24 * 60 * 60 * 1000;

  useEffect(() => {
    syncOnboardingToStores();
  }, []);

  useEffect(() => {
    if (buckets.length === 0) {
      setNeedsCheckIn(false);
      return;
    }
    const shouldShow = (() => {
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
      } catch (e) { reportError("client/goals/page", e); }
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
    const reHandler = () => refresh();
    window.addEventListener("verdant:realestate:updated", reHandler);
    return () => {
      unsubGoals();
      unsubInv();
      unsubNet();
      window.removeEventListener("verdant:realestate:updated", reHandler);
    };
  }, []);

  const assetLookup = useMemo(
    () => buildAssetValueLookup(),
    [assetLookupVersion, buckets, links]
  );

  const effectiveBuckets = useMemo<Bucket[]>(() => {
    return buckets.map((b) => {
      const linkedAmount = computeGoalAmountFromLinks(b.id, assetLookup, links).total;
      const ic = b.initialCash ?? 0;
      return { ...b, currentAmount: linkedAmount + ic };
    });
  }, [buckets, links, assetLookup]);

  const bucketBreakdowns = useMemo<Record<string, Record<AssetType, number>>>(() => {
    const out: Record<string, Record<AssetType, number>> = {};
    for (const b of buckets) {
      out[b.id] = computeGoalAmountFromLinks(b.id, assetLookup, links).byType;
    }
    return out;
  }, [buckets, links, assetLookup]);

  useEffect(() => {
    if (loading) return;
    const t = setTimeout(() => saveBuckets(buckets), 400);
    return () => clearTimeout(t);
  }, [buckets, loading]);

  const projections = useMemo<BucketProjection[]>(
    () => effectiveBuckets.map(projectBucket),
    [effectiveBuckets]
  );

  const sorted = useMemo(() => {
    const items = effectiveBuckets.map((b) => {
      const proj = projections.find((p) => p.bucketId === b.id)!;
      return { bucket: b, proj };
    });
    return [...items].sort((a, b) => {
      const pDiff = PRIORITY_ORDER[a.bucket.priority] - PRIORITY_ORDER[b.bucket.priority];
      if (pDiff !== 0) return pDiff;
      return new Date(a.bucket.targetDate).getTime() - new Date(b.bucket.targetDate).getTime();
    });
  }, [effectiveBuckets, projections]);

  const totalTarget = effectiveBuckets.reduce((s, b) => s + b.targetAmount, 0);
  const totalCurrent = effectiveBuckets.reduce((s, b) => s + b.currentAmount, 0);
  const totalRequired = projections.reduce((s, p) => s + p.requiredMonthly, 0);
  const freeUp = totalFreeUpPotential(effectiveBuckets);
  const deficit = totalDeficitContribution(effectiveBuckets);

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
      setShowAddModal(false);
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
    async (id: string) => {
      const ok = await confirm({
        title: "למחוק את המטרה?",
        body: "פעולה זו בלתי הפיכה.",
        confirmLabel: "כן, מחק",
        cancelLabel: "ביטול",
        variant: "danger",
      });
      if (!ok) return;
      setBuckets((prev) => removeBucket(prev, id));
      pulse();
      setEditingId(null);
    },
    [pulse, confirm]
  );

  const toggleExpanded = useCallback((id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const handleRecommendationClick = useCallback((id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      next.add(id);
      return next;
    });
    setTimeout(() => {
      const el = rowRefs.current[id];
      if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 50);
  }, []);

  const handleCoverageChange = useCallback(
    (id: string, months: 3 | 4 | 5 | 6, newTarget: number) => {
      setBuckets((prev) =>
        updateBucket(prev, id, {
          coverageMonths: months,
          targetAmount: newTarget,
        } as Partial<Bucket>)
      );
      pulse();
    },
    [pulse]
  );

  const editingBucket = editingId
    ? buckets.find((b) => b.id === editingId) || null
    : null;

  if (loading) {
    return (
      <div className="mx-auto max-w-4xl py-20 text-center text-[13px] font-bold text-verdant-muted">
        טוען מטרות...
      </div>
    );
  }

  return (
    <div
      className="mx-auto max-w-4xl py-4 md:py-8"
      style={{ fontFamily: "Rubik, Heebo, Assistant, system-ui, sans-serif" }}
    >
      {modal}
      <PageHeader
        subtitle="שלב 5"
        title="המטרות והיעדים שלי"
        description="הגדרת מטרות חיים וצביעת הכסף אליהן — כדי לדעת לאן אנחנו הולכים"
      />

      <div className="-mt-4 mb-3 flex min-h-[18px] justify-end">
        <SaveStatus status={saveStatus} />
      </div>

      {buckets.length > 0 && needsCheckIn && (
        <section
          className="mb-6 flex items-center justify-between gap-4 rounded-2xl p-5"
          style={{ background: "rgba(251,191,36,0.08)", border: "1px solid rgba(251,191,36,0.30)" }}
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
                הגיע הזמן לסיכום חודשי
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
              } catch (e) { reportError("client/goals/page", e); }
              setCheckInOpen(true);
            }}
            className="shrink-0 rounded-xl px-5 py-2.5 text-[12px] font-extrabold text-white transition-colors hover:opacity-90"
            style={{ background: "#b45309" }}
          >
            התחל סיכום חודשי
          </button>
        </section>
      )}

      <MonthlyCheckIn
        open={checkInOpen}
        onClose={() => {
          try {
            localStorage.setItem(scopedKey(GOALS_CHECKIN_KEY), String(Date.now()));
          } catch (e) { reportError("client/goals/page", e); }
          setCheckInOpen(false);
          setNeedsCheckIn(false);
        }}
        onDone={() => {
          try {
            localStorage.setItem(scopedKey(GOALS_CHECKIN_KEY), String(Date.now()));
          } catch (e) { reportError("client/goals/page", e); }
          setBuckets(loadBuckets());
          setNeedsCheckIn(false);
        }}
      />

      {buckets.length > 0 && (() => {
        const kpiCount = 2 + (freeUp > 0 ? 1 : 0) + (deficit > 0 ? 1 : 0);
        return (
          <SolidKpiRow cols={kpiCount === 3 ? 3 : 4}>
            <SolidKpi
              label={`${buckets.length} מטרות`}
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
                label="פוטנציאל שחרור"
                value={`${fmtILS(freeUp)}/ח׳`}
                icon="bolt"
                tone="emerald"
                sub="יש יעדים מקדימים"
              />
            )}
            {deficit > 0 && (
              <SolidKpi
                label="חוסר בתקציב"
                value={`${fmtILS(deficit)}/ח׳`}
                icon="warning"
                tone="red"
                sub="יעדים בפיגור"
              />
            )}
          </SolidKpiRow>
        );
      })()}

      {buckets.length > 0 && (() => {
        // Hoisted: count auto-generated buckets once so the "delete auto"
        // button only renders when there's something to delete. Avoids the
        // native // TODO: replace with modal: alert() that previously fired on empty-state click —
        // native // TODO: replace with modal: alert() is blocked silently by iOS PWA in some modes.
        const autoBuckets = buckets.filter(
          (b) => b.autoGenerated?.source || b.isEmergency
        );
        return (
        <div className="mb-4 mt-0 flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2">
            {autoBuckets.length > 0 && (
            <button
              onClick={async () => {
                const ok = await confirm({
                  title: `למחוק ${autoBuckets.length} מטרות אוטומטיות?`,
                  body: "אלו מטרות שהמערכת יצרה מהשאלון. מטרות שיצרת ידנית יישמרו.",
                  confirmLabel: "כן, מחק",
                  cancelLabel: "ביטול",
                  variant: "danger",
                });
                if (!ok) return;
                const toKeep = buckets.filter(
                  (b) => !b.autoGenerated?.source && !b.isEmergency
                );
                saveBuckets(toKeep);
                setBuckets(toKeep);
                pulse();
              }}
              className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[11px] font-bold transition-colors hover:bg-amber-100"
              style={{
                background: "rgba(251,191,36,0.12)",
                color: "#92400e",
                border: "1px solid #D97706",
              }}
              title="מטרות שהמערכת יצרה משאלון הילדים / קרן חירום / יעדים שכתבת בשאלון"
            >
              <span className="material-symbols-outlined text-[14px]">cleaning_services</span>
              מחק מטרות אוטומטיות
            </button>
            )}
            <button
              onClick={async () => {
                const ok = await confirm({
                  title: "למחוק את כל הקופות?",
                  body: "פעולה זו תמחק את כל הקופות ולא ניתן לבטל אותה.",
                  confirmLabel: "כן, מחק הכל",
                  cancelLabel: "ביטול",
                  variant: "danger",
                });
                if (!ok) return;
                saveBuckets([]);
                setBuckets([]);
                pulse();
              }}
              className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[11px] font-bold transition-colors hover:bg-red-100"
              style={{
                background: "rgba(248,113,113,0.08)",
                color: "#991b1b",
                border: "1px solid #b91c1c",
              }}
            >
              <span className="material-symbols-outlined text-[14px]">delete_sweep</span>
              מחק את הכל
            </button>
          </div>
          <button
            onClick={() => setShowAddModal(true)}
            className="btn-botanical inline-flex items-center gap-2 !px-5 !py-2.5 text-[12px]"
          >
            <span className="material-symbols-outlined text-[16px]">add</span>הוסף מטרה
          </button>
        </div>
        );
      })()}

      {buckets.length > 0 && (
        <RecommendationsStrip items={sorted} onItemClick={handleRecommendationClick} />
      )}

      {buckets.length === 0 && (
        <div className="card-mint">
          <div className="flex items-start gap-5">
            <div
              className="icon-lg shrink-0"
              style={{ background: "var(--morning-success-soft)", color: "var(--morning-forest)" }}
            >
              <span className="material-symbols-outlined text-[26px]">palette</span>
            </div>
            <div className="min-w-0 flex-1">
              <div className="t-lg mb-2 font-extrabold" style={{ color: "var(--morning-ink)" }}>
                לא הוגדרו מטרות ויעדים
              </div>
              <div
                className="mb-4 text-[13px] leading-6"
                style={{ color: "rgba(10,25,41,0.75)" }}
              >
                כל שקל יודע לאן הוא הולך.
              </div>
              <button onClick={() => setShowAddModal(true)} className="btn btn-primary btn-sm">
                <span className="material-symbols-outlined text-[16px]">add</span>
                הוסף מטרה ראשונה
              </button>
            </div>
          </div>
        </div>
      )}

      {buckets.length > 0 && (
        <div className="space-y-2">
          {sorted.map(({ bucket, proj }) => (
            <div
              key={bucket.id}
              ref={(el) => {
                rowRefs.current[bucket.id] = el;
              }}
            >
              <GoalRow
                bucket={bucket}
                proj={proj}
                breakdown={bucketBreakdowns[bucket.id]}
                expanded={expandedIds.has(bucket.id)}
                onToggle={() => toggleExpanded(bucket.id)}
                onEdit={() => setEditingId(bucket.id)}
                onCoverageChange={(m, t) => handleCoverageChange(bucket.id, m, t)}
              />
            </div>
          ))}
        </div>
      )}

      {editingBucket && (
        <EditGoalModal
          bucket={editingBucket}
          open={!!editingBucket}
          onClose={() => setEditingId(null)}
          onSave={(patch) => updateBucketById(editingBucket.id, patch)}
          onDelete={() => deleteBucket(editingBucket.id)}
        />
      )}

      <AddGoalModal
        open={showAddModal}
        onClose={() => setShowAddModal(false)}
        onSave={addBucket}
      />

      <div className="mt-8">
        <KidsSavingsSection />
      </div>

      <SpecialEventsSection />
    </div>
  );
}
