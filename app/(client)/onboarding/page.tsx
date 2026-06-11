"use client";

/**
 * Onboarding page — orchestrator.
 *
 * Owns the 7 persisted slices (fields, children, assets, liabilities,
 * insurance, goals, incomes), the remote hydration guard, one-shot
 * migrations, CRM-prefill, and the sync-out cascade. Per-step rendering
 * is delegated to the 5 Step* components under `page-files/`.
 *
 * Persistence layout (per page snapshot, all scoped per household):
 *   • verdant:onboarding:step         — current step number
 *   • verdant:onboarding:fields       — flat key/value bag
 *   • verdant:onboarding:children     — Child[]
 *   • verdant:onboarding:assets       — AssetRow[]
 *   • verdant:onboarding:liabilities  — LiabRow[]
 *   • verdant:onboarding:insurance    — InsRow[]
 *   • verdant:onboarding:goals        — GoalRow[]
 *   • verdant:onboarding:incomes      — IncomeRow[]
 *
 * The questionnaire now saves once per page transition:
 *   1. Inputs update in-memory React state only.
 *   2. Clicking Next / Back / a step chip writes the whole snapshot.
 *   3. The sync cascade runs after the snapshot is committed.
 */

import { useState, useCallback, useEffect, useRef, type SetStateAction } from "react";
import { useRouter } from "next/navigation";
import { SaveIndicator } from "@/components/SaveIndicator";
import { useSaveStatus } from "@/lib/hooks/useSaveStatus";
import { syncOnboardingToStores } from "@/lib/onboarding-sync";
import { pushOnboardingSnapshot, hydrateOnboardingFromRemote } from "@/lib/onboarding-remote";
import { notifyBusinessScopeChanged } from "@/lib/business-scope";
import { scopedKey } from "@/lib/client-scope";
import { getLocalClientByHouseholdId, useClient } from "@/lib/client-context";
import { useImpersonation } from "@/lib/impersonation-context";
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

const ONBOARDING_STEP_KEY = "verdant:onboarding:step";
const ONBOARDING_FIELDS_KEY = "verdant:onboarding:fields";
const ONBOARDING_CHILDREN_KEY = "verdant:onboarding:children";
const ONBOARDING_ASSETS_KEY = "verdant:onboarding:assets";
const ONBOARDING_LIABILITIES_KEY = "verdant:onboarding:liabilities";
const ONBOARDING_INSURANCE_KEY = "verdant:onboarding:insurance";
const ONBOARDING_GOALS_KEY = "verdant:onboarding:goals";
const ONBOARDING_INCOMES_KEY = "verdant:onboarding:incomes";

function readScopedJSON<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = localStorage.getItem(scopedKey(key));
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function writeScopedJSON(key: string, value: unknown): void {
  localStorage.setItem(scopedKey(key), JSON.stringify(value));
}

function loadInitialOnboardingState() {
  return {
    step: readScopedJSON<number>(ONBOARDING_STEP_KEY, 1),
    fields: readScopedJSON<Fields>(ONBOARDING_FIELDS_KEY, {}),
    children: readScopedJSON<Child[]>(ONBOARDING_CHILDREN_KEY, []),
    assets: readScopedJSON<AssetRow[]>(ONBOARDING_ASSETS_KEY, [
      { type: 'נדל"ן למגורים', desc: "", value: "", rent: "", rentExpenses: "" },
    ]),
    liabilities: readScopedJSON<LiabRow[]>(ONBOARDING_LIABILITIES_KEY, [
      { type: "משכנתא", lender: "", balance: "", rate: "", monthly: "" },
    ]),
    insurance: readScopedJSON<InsRow[]>(ONBOARDING_INSURANCE_KEY, INS_DEFAULTS),
    goals: readScopedJSON<GoalRow[]>(ONBOARDING_GOALS_KEY, [
      { name: "", cost: "", horizon: "", priority: "" },
    ]),
    incomes: readScopedJSON<IncomeRow[]>(ONBOARDING_INCOMES_KEY, INCOME_DEFAULTS),
  };
}

export default function OnboardingPage() {
  const router = useRouter();

  /* ── Hydrate from Supabase BEFORE rendering the form ──
   * Prevents the page from rendering a stale local snapshot when the user
   * re-opens the questionnaire on a different browser. */
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
        // If we wrote new data, force a full remount so the local state
        // initializers re-read from localStorage. Otherwise just proceed.
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
  const [initial] = useState(loadInitialOnboardingState);
  const [step, setStep] = useState<number>(initial.step);

  /* ── In-memory page state; persisted only on page transitions ── */
  const [fields, setFields] = useState<Fields>(initial.fields);
  const [children, setChildren] = useState<Child[]>(initial.children);
  const [assets, setAssets] = useState<AssetRow[]>(initial.assets);
  const [liabilities, setLiabilities] = useState<LiabRow[]>(initial.liabilities);
  const [insurance, setInsurance] = useState<InsRow[]>(initial.insurance);
  const [goals, setGoals] = useState<GoalRow[]>(initial.goals);
  const [incomes, setIncomes] = useState<IncomeRow[]>(initial.incomes);

  const { status: saveStatus, pulse: pulseSaveStatus } = useSaveStatus({ savedMs: 2000 });
  const [hasUserEdited, setHasUserEdited] = useState(false);
  const markUserEdited = useCallback(() => {
    setHasUserEdited(true);
  }, []);

  const setChildrenWithEdit = useCallback(
    (next: SetStateAction<Child[]>) => {
      markUserEdited();
      setChildren(next);
    },
    [markUserEdited, setChildren]
  );

  const setAssetsWithEdit = useCallback(
    (next: SetStateAction<AssetRow[]>) => {
      markUserEdited();
      setAssets(next);
    },
    [markUserEdited, setAssets]
  );

  const setLiabilitiesWithEdit = useCallback(
    (next: SetStateAction<LiabRow[]>) => {
      markUserEdited();
      setLiabilities(next);
    },
    [markUserEdited, setLiabilities]
  );

  const setInsuranceWithEdit = useCallback(
    (next: SetStateAction<InsRow[]>) => {
      markUserEdited();
      setInsurance(next);
    },
    [markUserEdited, setInsurance]
  );

  const setGoalsWithEdit = useCallback(
    (next: SetStateAction<GoalRow[]>) => {
      markUserEdited();
      setGoals(next);
    },
    [markUserEdited, setGoals]
  );

  const setIncomesWithEdit = useCallback(
    (next: SetStateAction<IncomeRow[]>) => {
      markUserEdited();
      setIncomes(next);
    },
    [markUserEdited, setIncomes]
  );

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
  const impersonation = useImpersonation();
  const activeClient =
    impersonation?.householdId ? getLocalClientByHouseholdId(impersonation.householdId) : client;
  const prefilledRef = useRef(false);
  useEffect(() => {
    if (!hydrated || prefilledRef.current) return;
    const patch: Record<string, string> = {};
    const familyName = activeClient?.family || impersonation?.familyName || "";
    if (!fields.p1_email && activeClient?.email) patch.p1_email = activeClient.email;
    if (!fields.p1_phone && activeClient?.phone) patch.p1_phone = activeClient.phone;
    if (!fields.p1_name && familyName) patch.p1_name = familyName;
    if (Object.keys(patch).length > 0) {
      setFields((p) => ({ ...p, ...patch }));
    }
    prefilledRef.current = true;
  }, [
    hydrated,
    activeClient,
    impersonation?.familyName,
    fields.p1_email,
    fields.p1_phone,
    fields.p1_name,
    setFields,
  ]);

  const setField = useCallback(
    (name: string, value: string) => {
      markUserEdited();
      setFields((p) => ({ ...p, [name]: value }));
    },
    [markUserEdited, setFields]
  );

  const persistSnapshot = useCallback(
    (nextStep: number) => {
      try {
        writeScopedJSON(ONBOARDING_STEP_KEY, nextStep);
        writeScopedJSON(ONBOARDING_FIELDS_KEY, fields);
        writeScopedJSON(ONBOARDING_CHILDREN_KEY, children);
        writeScopedJSON(ONBOARDING_ASSETS_KEY, assets);
        writeScopedJSON(ONBOARDING_LIABILITIES_KEY, liabilities);
        writeScopedJSON(ONBOARDING_INSURANCE_KEY, insurance);
        writeScopedJSON(ONBOARDING_GOALS_KEY, goals);
        writeScopedJSON(ONBOARDING_INCOMES_KEY, incomes);
      } catch (e) {
        console.warn("[onboarding] snapshot save failed:", e);
        return;
      }
      syncOnboardingToStores();
      pushOnboardingSnapshot();
      notifyBusinessScopeChanged();
      pulseSaveStatus();
    },
    [fields, children, assets, liabilities, insurance, goals, incomes, pulseSaveStatus]
  );

  const goNext = useCallback(() => {
    const next = Math.min(step + 1, TOTAL_STEPS);
    persistSnapshot(next);
    setStep(next);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, [persistSnapshot, setStep, step]);

  const goPrev = useCallback(() => {
    const prev = Math.max(step - 1, 1);
    persistSnapshot(prev);
    setStep(prev);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, [persistSnapshot, setStep, step]);

  const goToStep = useCallback(
    (n: number) => {
      persistSnapshot(n);
      setStep(n);
      window.scrollTo({ top: 0, behavior: "smooth" });
    },
    [persistSnapshot, setStep]
  );

  const handleFinish = useCallback(async () => {
    persistSnapshot(step);
    // Flip household.stage from 'onboarding' → 'active' so the (client)
    // layout stops redirecting back here on next navigation. Fire-and-forget:
    // a failure shouldn't block the user from reaching their dashboard.
    fetch("/api/onboarding/complete", { method: "POST" }).catch(() => {});
    router.push("/dashboard");
  }, [persistSnapshot, router, step]);

  // Guard: don't render the form until remote hydration has resolved.
  // Otherwise the page could render before the remote/local snapshot check
  // decides whether a full reload is needed.
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
            setChildren={setChildrenWithEdit}
          />
        )}
        {step === 2 && (
          <Step2Finances
            fields={fields}
            setField={setField}
            incomes={incomes}
            setIncomes={setIncomesWithEdit}
            assets={assets}
            setAssets={setAssetsWithEdit}
            liabilities={liabilities}
            setLiabilities={setLiabilitiesWithEdit}
          />
        )}
        {step === 3 && (
          <Step3Risk
            fields={fields}
            setField={setField}
            insurance={insurance}
            setInsurance={setInsuranceWithEdit}
          />
        )}
        {step === 4 && (
          <Step4Goals fields={fields} setField={setField} goals={goals} setGoals={setGoalsWithEdit} />
        )}
        {step === 5 && <Step5Retirement fields={fields} setField={setField} />}

        <Navigation step={step} onPrev={goPrev} onNext={goNext} onFinish={handleFinish} />
      </form>

      {hasUserEdited && <SaveIndicator status={saveStatus} />}
    </div>
  );
}
