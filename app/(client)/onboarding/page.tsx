"use client";

/**
 * Onboarding page — orchestrator.
 *
 * Owns the 7 persisted slices (fields, children, assets, liabilities,
 * insurance, goals, incomes), the remote hydration guard, one-shot
 * migrations, CRM-prefill, and the sync-out cascade. Per-step rendering
 * is delegated to the 5 Step* components under `page-files/`.
 *
 * Persistence layout (per slice, all scoped per household):
 *   • verdant:onboarding:step         — current step number
 *   • verdant:onboarding:fields       — flat key/value bag
 *   • verdant:onboarding:children     — Child[]
 *   • verdant:onboarding:assets       — AssetRow[]
 *   • verdant:onboarding:liabilities  — LiabRow[]
 *   • verdant:onboarding:insurance    — InsRow[]
 *   • verdant:onboarding:goals        — GoalRow[]
 *   • verdant:onboarding:incomes      — IncomeRow[]
 *
 * usePersistedState writes to the RAW key (no scope). After every settled
 * save we copy each slice to its scoped key, run syncOnboardingToStores,
 * and push a remote snapshot. That makes the questionnaire effectively
 * live — moving to /budget immediately reflects what was typed here.
 */

import { useState, useCallback, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { usePersistedState } from "@/hooks/usePersistedState";
import { SaveIndicator } from "@/components/SaveIndicator";
import { syncOnboardingToStores } from "@/lib/onboarding-sync";
import { pushOnboardingSnapshot, hydrateOnboardingFromRemote } from "@/lib/onboarding-remote";
import { notifyBusinessScopeChanged } from "@/lib/business-scope";
import { scopedKey } from "@/lib/client-scope";
import { useClient } from "@/lib/client-context";
import type {
  AssetRow,
  Child,
  Fields,
  GoalRow,
  IncomeRow,
  InsRow,
  LiabRow,
} from "./page-files/types";
import { EMPTY_CHILD, INCOME_DEFAULTS, INS_DEFAULTS, TOTAL_STEPS, n } from "./page-files/constants";
import { ProgressBar } from "./page-files/ProgressBar";
import { Step1Family } from "./page-files/Step1Family";
import { Step2Finances } from "./page-files/Step2Finances";
import { Step3Risk } from "./page-files/Step3Risk";
import { Step4Goals } from "./page-files/Step4Goals";
import { Step5Retirement } from "./page-files/Step5Retirement";
import { Navigation } from "./page-files/Navigation";
import { Step0Welcome, shouldShowWelcome } from "./page-files/Step0Welcome";

export default function OnboardingPage() {
  const router = useRouter();

  /* ── Hydrate from Supabase BEFORE rendering the form ──
   * Prevents usePersistedState from initializing with a stale empty state
   * when the user re-opens the page on a different browser. */
  const [hydrated, setHydrated] = useState(false);
  // Welcome screen — shown once per household before Step 1. Defer the
  // localStorage read to post-mount so the SSR/CSR render trees match.
  const [showWelcome, setShowWelcome] = useState(false);
  useEffect(() => {
    setShowWelcome(shouldShowWelcome());
  }, []);
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const wrote = await hydrateOnboardingFromRemote();
        if (!alive) return;
        // If we wrote new data, force a full remount so usePersistedState re-reads
        // from localStorage. Otherwise just proceed — local already matches.
        if (wrote) {
          window.location.reload();
          return;
        }
      } catch {}
      if (alive) setHydrated(true);
    })();
    return () => {
      alive = false;
    };
  }, []);

  /* ── Step navigation ── */
  const [step, setStep] = usePersistedState<number>("verdant:onboarding:step", 1);

  /* ── Persisted state — auto-saves to localStorage (1.5s debounce) ── */
  const [fields, setFields, fieldsSaving] = usePersistedState<Fields>(
    "verdant:onboarding:fields",
    {},
    1500
  );
  const [children, setChildren, childrenSaving] = usePersistedState<Child[]>(
    "verdant:onboarding:children",
    [EMPTY_CHILD],
    1500
  );
  const [assets, setAssets, assetsSaving] = usePersistedState<AssetRow[]>(
    "verdant:onboarding:assets",
    [{ type: 'נדל"ן למגורים', desc: "", value: "", rent: "", rentExpenses: "" }],
    1500
  );
  const [liabilities, setLiabilities, liabSaving] = usePersistedState<LiabRow[]>(
    "verdant:onboarding:liabilities",
    [{ type: "משכנתא", lender: "", balance: "", rate: "", monthly: "" }],
    1500
  );
  const [insurance, setInsurance, insSaving] = usePersistedState<InsRow[]>(
    "verdant:onboarding:insurance",
    INS_DEFAULTS,
    1500
  );
  const [goals, setGoals, goalsSaving] = usePersistedState<GoalRow[]>(
    "verdant:onboarding:goals",
    [{ name: "", cost: "", horizon: "", priority: "" }],
    1500
  );
  const [incomes, setIncomes, incomesSaving] = usePersistedState<IncomeRow[]>(
    "verdant:onboarding:incomes",
    INCOME_DEFAULTS,
    1500
  );

  const isSaving =
    fieldsSaving ||
    childrenSaving ||
    assetsSaving ||
    liabSaving ||
    insSaving ||
    goalsSaving ||
    incomesSaving;
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved">("idle");
  useEffect(() => {
    if (isSaving) {
      setSaveStatus("saving");
    } else if (saveStatus === "saving") {
      setSaveStatus("saved");
      const t = setTimeout(() => setSaveStatus("idle"), 2000);
      return () => clearTimeout(t);
    }
  }, [isSaving, saveStatus]);

  /* ── Push to Supabase + cascade to all stores whenever saves settle ──
   * usePersistedState writes to the RAW key (no scope). The stores read from
   * the scoped key. So after each debounced save we:
   *   1. Copy every onboarding slice to its scoped key (what the sync reads).
   *   2. Fan out via syncOnboardingToStores → budget, properties, etc.
   *   3. Push a remote snapshot (Supabase).
   * Result: the client doesn't need to click "סיום" for data to flow —
   * navigating to /budget immediately shows allowances, rent, etc. */
  useEffect(() => {
    if (!hydrated) return;
    if (!isSaving) {
      try {
        localStorage.setItem(scopedKey("verdant:onboarding:fields"), JSON.stringify(fields));
        localStorage.setItem(scopedKey("verdant:onboarding:children"), JSON.stringify(children));
        localStorage.setItem(scopedKey("verdant:onboarding:assets"), JSON.stringify(assets));
        localStorage.setItem(
          scopedKey("verdant:onboarding:liabilities"),
          JSON.stringify(liabilities)
        );
        localStorage.setItem(scopedKey("verdant:onboarding:insurance"), JSON.stringify(insurance));
        localStorage.setItem(scopedKey("verdant:onboarding:goals"), JSON.stringify(goals));
        localStorage.setItem(scopedKey("verdant:onboarding:incomes"), JSON.stringify(incomes));
      } catch {}
      syncOnboardingToStores();
      pushOnboardingSnapshot();
    }
  }, [hydrated, isSaving, fields, children, assets, liabilities, insurance, goals, incomes]);

  /* ── One-shot migration: legacy inc_* fields → incomes[] list ──
   * Runs once per client after hydration. If the user already has any
   * non-zero income recorded in the old fixed-field model, we pull those
   * values into the new dynamic list. After migration, the inc_* keys
   * are cleared so the legacy sum logic in onboarding-sync stops firing. */
  const incomesMigratedRef = useRef(false);
  useEffect(() => {
    if (!hydrated || incomesMigratedRef.current) return;
    const legacyKeys: [string, string][] = [
      ["inc_salary1", "שכר בן/בת זוג 1 (נטו)"],
      ["inc_salary2", "שכר בן/בת זוג 2 (נטו)"],
      ["inc_rental", "הכנסה מנכסים מניבים"],
      ["inc_pension", "קצבאות"],
      ["inc_parents", "עזרה מההורים"],
      ["inc_other", "אחר"],
    ];
    const hasLegacy = legacyKeys.some(([k]) => n(fields[k] || "0") > 0);
    const listIsDefault = incomes.every((r) => !r.value);
    if (hasLegacy && listIsDefault) {
      const migrated: IncomeRow[] = legacyKeys
        .filter(([k]) => n(fields[k] || "0") > 0)
        .map(([k, label]) => ({ label, value: fields[k] || "" }));
      if (migrated.length > 0) setIncomes(migrated);
      // Clear legacy keys so they don't double-count via onboarding-sync.
      setFields((p) => {
        const next = { ...p };
        legacyKeys.forEach(([k]) => delete next[k]);
        return next;
      });
    }
    incomesMigratedRef.current = true;
  }, [hydrated, fields, incomes, setIncomes, setFields]);

  /* ── Pre-fill primary contact from CRM client card ──
   * When the advisor converts a lead to a client, the lead's email/phone
   * are copied onto the client record. On first visit to the questionnaire,
   * seed p1_email / p1_phone so the advisor doesn't re-type them.
   * Only seeds empty fields — never overwrites user edits. Partner (p2) is
   * intentionally left blank; the advisor captures it during intake. */
  const { client } = useClient();
  const prefilledRef = useRef(false);
  useEffect(() => {
    if (!hydrated || prefilledRef.current || !client) return;
    const patch: Record<string, string> = {};
    if (!fields.p1_email && client.email) patch.p1_email = client.email;
    if (!fields.p1_phone && client.phone) patch.p1_phone = client.phone;
    if (!fields.p1_name && client.family) patch.p1_name = client.family;
    if (Object.keys(patch).length > 0) {
      setFields((p) => ({ ...p, ...patch }));
    }
    prefilledRef.current = true;
  }, [hydrated, client, fields.p1_email, fields.p1_phone, fields.p1_name, setFields]);

  const setField = useCallback(
    (name: string, value: string) => {
      setFields((p) => ({ ...p, [name]: value }));
      // When employment type changes, notify business-scope gate
      if (name === "p1_emp_type" || name === "p2_emp_type") {
        // Small delay so persisted state writes first
        setTimeout(notifyBusinessScopeChanged, 200);
      }
    },
    [setFields]
  );

  const goNext = useCallback(() => {
    setStep((s: number) => Math.min(s + 1, TOTAL_STEPS));
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, [setStep]);

  const goPrev = useCallback(() => {
    setStep((s: number) => Math.max(s - 1, 1));
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, [setStep]);

  const goToStep = useCallback(
    (n: number) => {
      setStep(n);
      window.scrollTo({ top: 0, behavior: "smooth" });
    },
    [setStep]
  );

  const handleFinish = useCallback(async () => {
    // Flush all persisted state to localStorage immediately before sync.
    // Must use scopedKey() so the sync engine and store migrations read
    // from the same client-scoped namespace (verdant:c:{id}:...).
    try {
      localStorage.setItem(scopedKey("verdant:onboarding:fields"), JSON.stringify(fields));
      localStorage.setItem(scopedKey("verdant:onboarding:children"), JSON.stringify(children));
      localStorage.setItem(scopedKey("verdant:onboarding:assets"), JSON.stringify(assets));
      localStorage.setItem(
        scopedKey("verdant:onboarding:liabilities"),
        JSON.stringify(liabilities)
      );
      localStorage.setItem(scopedKey("verdant:onboarding:insurance"), JSON.stringify(insurance));
      localStorage.setItem(scopedKey("verdant:onboarding:goals"), JSON.stringify(goals));
      localStorage.setItem(scopedKey("verdant:onboarding:incomes"), JSON.stringify(incomes));
    } catch {}
    syncOnboardingToStores();
    pushOnboardingSnapshot();
    // Flip household.stage from 'onboarding' → 'active' so the (client)
    // layout stops redirecting back here on next navigation. Fire-and-forget:
    // a failure shouldn't block the user from reaching their dashboard.
    fetch("/api/onboarding/complete", { method: "POST" }).catch(() => {});
    router.push("/dashboard");
  }, [router, fields, children, assets, liabilities, insurance, goals, incomes]);

  // Guard: don't render the form until remote hydration has resolved.
  // Otherwise usePersistedState initializes with localStorage defaults
  // and the effect's window.location.reload() yanks the page mid-render.
  if (!hydrated) {
    return (
      <div className="mx-auto max-w-5xl">
        <div className="card-pad flex items-center gap-3 text-[13px] text-verdant-muted">
          <span className="material-symbols-outlined animate-spin text-[18px]">
            progress_activity
          </span>
          טוען שאלון...
        </div>
      </div>
    );
  }

  if (showWelcome) {
    return <Step0Welcome onStart={() => setShowWelcome(false)} />;
  }

  return (
    <div className="mx-auto max-w-5xl">
      <ProgressBar step={step} saveStatus={saveStatus} onGoToStep={goToStep} />

      <form onSubmit={(e) => e.preventDefault()} className="space-y-4">
        {step === 1 && (
          <Step1Family
            fields={fields}
            setField={setField}
            children={children}
            setChildren={setChildren}
          />
        )}
        {step === 2 && (
          <Step2Finances
            fields={fields}
            setField={setField}
            incomes={incomes}
            setIncomes={setIncomes}
            assets={assets}
            setAssets={setAssets}
            liabilities={liabilities}
            setLiabilities={setLiabilities}
          />
        )}
        {step === 3 && (
          <Step3Risk
            fields={fields}
            setField={setField}
            insurance={insurance}
            setInsurance={setInsurance}
          />
        )}
        {step === 4 && (
          <Step4Goals fields={fields} setField={setField} goals={goals} setGoals={setGoals} />
        )}
        {step === 5 && <Step5Retirement fields={fields} setField={setField} />}

        <Navigation step={step} onPrev={goPrev} onNext={goNext} onFinish={handleFinish} />
      </form>

      <SaveIndicator status={saveStatus} />
    </div>
  );
}
