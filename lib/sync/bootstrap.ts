/**
 * ═══════════════════════════════════════════════════════════
 *  Boot bootstrap — אתחול sync אחרי login/signup
 * ═══════════════════════════════════════════════════════════
 *
 * 1. resolveActiveHousehold() — בוחר household ראשון של ה-advisor/לקוח
 *    ושומר ב-localStorage (`verdant:active_household_id`).
 * 2. hydrateAllFromRemote() — מושך את כל ה-blobs והטבלאות
 *    מהשרת → overwrite של cache ב-localStorage.
 *
 * נקרא פעם אחת מ-(client)/layout בטעינה, וגם אחרי signup.
 */

import { getSupabaseBrowser, isSupabaseConfigured } from "@/lib/supabase/browser";
import { CURRENT_HH_KEY, dispatchStoreRefreshEvents } from "@/lib/client-scope";
import { reportError } from "@/lib/report-error";

const ACTIVE_HH_KEY = "verdant:active_household_id";
const BOOTSTRAP_FLAG = "verdant:bootstrap_done";
const BOOTSTRAP_USER_KEY = "verdant:bootstrap_user_id";
const BOOTSTRAP_HOUSEHOLD_KEY = "verdant:bootstrap_household_id";
let bootstrapInFlight: Promise<boolean> | null = null;
let bootstrapInFlightKey: string | null = null;
let remoteRefreshInFlight: Promise<void> | null = null;
let remoteRefreshInFlightKey: string | null = null;
let scopeBootstrapInFlight: Promise<boolean> | null = null;
let scopeBootstrapInFlightKey: string | null = null;

function clearBootstrapMarkers(): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.removeItem(BOOTSTRAP_FLAG);
    sessionStorage.removeItem("verdant:last_impersonated");
    sessionStorage.removeItem("verdant:legacy_purge_done");
    sessionStorage.removeItem(BOOTSTRAP_USER_KEY);
    sessionStorage.removeItem(BOOTSTRAP_HOUSEHOLD_KEY);
  } catch (e) { reportError("sync/bootstrap", e); }
  try {
    localStorage.removeItem(ACTIVE_HH_KEY);
    localStorage.removeItem(CURRENT_HH_KEY);
  } catch (e) { reportError("sync/bootstrap", e); }
}

export async function resolveActiveHousehold(): Promise<string | null> {
  if (typeof window === "undefined") return null;
  if (!isSupabaseConfigured()) return null;

  const sb = getSupabaseBrowser();
  if (!sb) return null;

  try {
    const {
      data: { user },
    } = await sb.auth.getUser();
    if (!user) {
      console.debug("[bootstrap] no user yet");
      return null;
    }

    const { data: clientHousehold, error: clientError } = await sb
      .from("client_users")
      .select("household_id")
      .eq("user_id", user.id)
      .maybeSingle();

    if (!clientError && clientHousehold?.household_id) {
      const hh = clientHousehold.household_id;
      try {
        localStorage.setItem(ACTIVE_HH_KEY, hh);
      } catch (e) { reportError("sync/bootstrap", e); }
      return hh;
    }

    // first household owned by this advisor (trigger in 0008 creates one on signup)
    const { data, error } = await sb
      .from("households")
      .select("id")
      .eq("advisor_id", user.id)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();

    if (error || !data?.id) {
      console.debug("[bootstrap] no household resolved", {
        userId: user.id,
        reason: error?.message || "missing household row",
      });
      return null;
    }
    try {
      localStorage.setItem(ACTIVE_HH_KEY, data.id);
    } catch (e) { reportError("sync/bootstrap", e); }
    return data.id;
  } catch {
    return null;
  }
}

async function resolveBootstrapUserId(): Promise<string | null> {
  if (!isSupabaseConfigured()) return null;
  const sb = getSupabaseBrowser();
  if (!sb) return null;
  try {
    const {
      data: { user },
    } = await sb.auth.getUser();
    return user?.id || null;
  } catch {
    return null;
  }
}

async function ensureBootstrapForCurrentUser(): Promise<string | null> {
  if (typeof window === "undefined") return null;
  const userId = await resolveBootstrapUserId();
  if (!userId) return null;
  try {
    const previous = sessionStorage.getItem(BOOTSTRAP_USER_KEY);
    if (previous && previous !== userId) {
      clearBootstrapMarkers();
    }
    sessionStorage.setItem(BOOTSTRAP_USER_KEY, userId);
  } catch (e) { reportError("sync/bootstrap", e); }
  return userId;
}

function readActiveHousehold(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return localStorage.getItem(ACTIVE_HH_KEY);
  } catch {
    return null;
  }
}

function lockActiveHousehold(householdId: string): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(ACTIVE_HH_KEY, householdId);
    localStorage.removeItem(CURRENT_HH_KEY);
  } catch (e) { reportError("sync/bootstrap", e); }
}

/**
 * מושך את כל ה-blobs והטבלאות מהשרת → overwrite של cache ב-localStorage.
 * רץ אחרי resolveActiveHousehold. בטוח לקריאה כפולה.
 */
export async function hydrateAllFromRemote(lockedHouseholdId?: string | null): Promise<void> {
  if (typeof window === "undefined") return;
  if (!isSupabaseConfigured()) return;

  if (lockedHouseholdId) lockActiveHousehold(lockedHouseholdId);

  const hh = readActiveHousehold();
  if (!hh) return;

  // dynamic imports כדי לא לטעון את כל החנויות ב-SSR
  const [
    merchantRules,
    pension,
    debt,
    realestate,
    accounts,
    budget,
    budgetImport,
    documents,
    balanceHist,
    risk,
    scenarios,
    kids,
    annualEvents,
    portfolio,
    salary,
    subscriptionsRadar,
    onboarding,
    specialEvents,
    blobSync,
  ] = await Promise.all([
    import("@/lib/doc-parser/merchant-category-rules"),
    import("@/lib/pension-store"),
    import("@/lib/debt-store"),
    import("@/lib/realestate-store"),
    import("@/lib/accounts-store"),
    import("@/lib/budget-store"),
    import("@/lib/budget-import"),
    import("@/lib/documents-store"),
    import("@/lib/balance-history-store"),
    import("@/lib/risk-store"),
    import("@/lib/scenarios-store"),
    import("@/lib/kids-savings-store"),
    import("@/lib/annual-events-store"),
    import("@/lib/portfolio-store"),
    import("@/lib/salary-engine"),
    import("@/lib/subscriptions-radar-exclusions"),
    import("@/lib/onboarding-remote"),
    import("@/lib/special-events-store"),
    import("@/lib/sync/blob-sync"),
  ]);

  const [subOverrides, subCatalog] = await Promise.all([
    import("@/lib/subscriptions/overrides-store"),
    import("@/lib/subscriptions/catalog-store"),
  ]);

  // הרץ במקביל — כל אחד עצמאי, כישלון אחד לא מפיל אחרים
  await merchantRules.migrateLocalMerchantCategoryRulesToRemote?.();
  await merchantRules.refreshMerchantCategoryRules?.(true);

  await Promise.allSettled([
    pension.hydratePensionFundsFromRemote?.(),
    debt.hydrateDebtFromRemote?.(),
    realestate.hydratePropertiesFromRemote?.(),
    accounts.hydrateAccountsFromRemote?.(),
    budget.hydrateBudgetsFromRemote?.(),
    budget.hydrateMonthlyBudgetsFromRemote?.(),
    budgetImport.hydrateTransactionsFromRemote?.(),
    documents.hydrateDocHistoryFromRemote?.(),
    balanceHist.hydrateHistoryFromRemote?.(),
    risk.hydrateRiskFromRemote?.(),
    scenarios.hydrateScenariosFromRemote?.(),
    kids.hydrateKidsSavingsFromRemote?.(),
    annualEvents.hydrateAnnualEventsFromRemote?.(),
    portfolio.hydratePortfolioFromRemote?.(),
    salary.hydrateSalaryFromRemote?.(),
    subscriptionsRadar.hydrateSubscriptionRadarExclusionsFromRemote?.(),
    subOverrides.hydrateOverridesFromRemote?.(),
    subCatalog.hydrateCatalogFromRemote?.(),
    hydrateSecurities(blobSync),
    specialEvents.hydrateSpecialEventsFromRemote?.(),
  ]);

  await onboarding.hydrateOnboardingFromRemote?.();
  if (lockedHouseholdId && readActiveHousehold() !== lockedHouseholdId) {
    lockActiveHousehold(lockedHouseholdId);
  }
  const { syncOnboardingToStores } = await import("@/lib/onboarding-sync");
  syncOnboardingToStores();
}

/**
 * Force a remote rehydrate even if the session was already bootstrapped.
 *
 * Used by the realtime/polling watcher so changes made in another browser
 * or phone are pulled back into every open client tab.
 */
export async function refreshAllFromRemote(
  trigger = "manual",
  lockedHouseholdId?: string | null
): Promise<void> {
  if (typeof window === "undefined") return;
  if (!isSupabaseConfigured()) return;
  const taskKey = lockedHouseholdId || readActiveHousehold() || "__auto__";
  if (remoteRefreshInFlight && remoteRefreshInFlightKey === taskKey) {
    return remoteRefreshInFlight;
  }

  const task = (async () => {
    if (lockedHouseholdId) lockActiveHousehold(lockedHouseholdId);
    const hh = readActiveHousehold();
    if (!hh) {
      await resolveActiveHousehold();
    }
    await hydrateAllFromRemote(lockedHouseholdId);
    if (lockedHouseholdId && readActiveHousehold() !== lockedHouseholdId) {
      lockActiveHousehold(lockedHouseholdId);
      await hydrateAllFromRemote(lockedHouseholdId);
    }
    dispatchStoreRefreshEvents();
    console.info("[bootstrap] remote refresh completed", { trigger });
  })().finally(() => {
    remoteRefreshInFlight = null;
    remoteRefreshInFlightKey = null;
  });

  remoteRefreshInFlight = task;
  remoteRefreshInFlightKey = taskKey;
  return task;
}

/**
 * Fast path for desktop route transitions: resolve the active household first,
 * then hydrate remote stores in the background. This keeps tenant scoping
 * correct without blocking the whole app shell on every first paint.
 */
export async function prepareSessionScopeOnce(
  trigger = "manual",
  lockedHouseholdId?: string | null
): Promise<boolean> {
  if (typeof window === "undefined") return false;
  if (!isSupabaseConfigured()) return true;
  const taskKey = lockedHouseholdId || readActiveHousehold() || "__auto__";
  if (scopeBootstrapInFlight && scopeBootstrapInFlightKey === taskKey) {
    return scopeBootstrapInFlight;
  }

  const task = (async () => {
    const userId = await ensureBootstrapForCurrentUser();
    if (!userId) return false;
    if (lockedHouseholdId) lockActiveHousehold(lockedHouseholdId);

    const activeHousehold = readActiveHousehold();
    const hasHousehold = Boolean(activeHousehold);
    const bootstrapped = sessionStorage.getItem(BOOTSTRAP_FLAG) === "1";
    const recordedUserId = sessionStorage.getItem(BOOTSTRAP_USER_KEY);
    const recordedHousehold = sessionStorage.getItem(BOOTSTRAP_HOUSEHOLD_KEY);
    if (
      bootstrapped &&
      hasHousehold &&
      recordedUserId === userId &&
      recordedHousehold === activeHousehold
    ) {
      console.info("[bootstrap] scope ready; hydration already completed", { trigger });
      return true;
    }

    const hh = lockedHouseholdId || (await resolveActiveHousehold());
    if (!hh) return false;
    if (lockedHouseholdId) lockActiveHousehold(lockedHouseholdId);

    void refreshAllFromRemote(`${trigger}:background-hydrate`, lockedHouseholdId)
      .then(() => {
        try {
          sessionStorage.setItem(BOOTSTRAP_FLAG, "1");
          sessionStorage.setItem(BOOTSTRAP_HOUSEHOLD_KEY, hh);
        } catch (e) { reportError("sync/bootstrap", e); }
      })
      .catch((reason) => {
        console.warn("[bootstrap] background hydration failed", { trigger, reason });
      });

    console.info("[bootstrap] scope ready; hydration continuing in background", {
      trigger,
      householdId: hh,
    });
    return true;
  })().finally(() => {
    scopeBootstrapInFlight = null;
    scopeBootstrapInFlightKey = null;
  });

  scopeBootstrapInFlight = task;
  scopeBootstrapInFlightKey = taskKey;
  return task;
}

export function watchRemoteHouseholdChanges(
  triggerPrefix: string,
  onReady?: (ready: boolean) => void
): (() => void) | undefined {
  if (typeof window === "undefined" || !isSupabaseConfigured()) return undefined;

  const sb = getSupabaseBrowser();
  if (!sb) return undefined;

  const householdId = localStorage.getItem(ACTIVE_HH_KEY);
  if (!householdId) return undefined;

  let disposed = false;
  let refreshTimer: number | null = null;
  let pollTimer: number | null = null;

  const scheduleRefresh = (reason: string) => {
    if (disposed) return;
    if (refreshTimer != null) return;
    refreshTimer = window.setTimeout(() => {
      refreshTimer = null;
      void refreshAllFromRemote(`${triggerPrefix}:${reason}`, householdId).then(() => {
        if (!disposed) onReady?.(true);
      });
    }, 350);
  };

  const tables = [
    "client_state",
    "pension_products",
    "households",
    "client_users",
  ] as const;

  const channels = tables.map((table) =>
    sb
      .channel(`verdant:${triggerPrefix}:${table}:${householdId.slice(0, 8)}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table,
          filter:
            table === "households"
              ? `id=eq.${householdId}`
              : `household_id=eq.${householdId}`,
        },
        () => scheduleRefresh(`realtime:${table}`)
      )
      .subscribe((status) => {
        if (status === "SUBSCRIBED") onReady?.(true);
      })
  );

  const onFocusOrVisible = () => {
    if (document.visibilityState === "hidden") return;
    scheduleRefresh("focus");
  };

  const onOnline = () => scheduleRefresh("online");

  window.addEventListener("focus", onFocusOrVisible);
  document.addEventListener("visibilitychange", onFocusOrVisible);
  window.addEventListener("online", onOnline);

  pollTimer = window.setInterval(() => {
    if (document.visibilityState === "visible") {
      scheduleRefresh("poll");
    }
  }, 45_000);

  scheduleRefresh("start");

  return () => {
    disposed = true;
    if (refreshTimer != null) window.clearTimeout(refreshTimer);
    if (pollTimer != null) window.clearInterval(pollTimer);
    window.removeEventListener("focus", onFocusOrVisible);
    document.removeEventListener("visibilitychange", onFocusOrVisible);
    window.removeEventListener("online", onOnline);
    channels.forEach((channel) => {
      void sb.removeChannel(channel);
    });
  };
}

async function hydrateSecurities(blobSync: typeof import("@/lib/sync/blob-sync")) {
  try {
    const remote = await blobSync.pullBlob<unknown[]>("securities");
    if (!Array.isArray(remote)) return;
    const { scopedKey } = await import("@/lib/client-scope");
    localStorage.setItem(scopedKey("verdant:securities"), JSON.stringify(remote));
  } catch {
    /* שקט */
  }
}

/**
 * נקודת כניסה: פעם אחת לכל session, מבצע גם resolve וגם hydrate.
 */
export async function bootstrapSessionOnce(
  trigger = "manual",
  lockedHouseholdId?: string | null
): Promise<boolean> {
  if (typeof window === "undefined") return false;
  const taskKey = lockedHouseholdId || readActiveHousehold() || "__auto__";
  if (bootstrapInFlight && bootstrapInFlightKey === taskKey) return bootstrapInFlight;

  const task = (async () => {
    const userId = await ensureBootstrapForCurrentUser();
    if (!userId) {
      return false;
    }
    if (lockedHouseholdId) lockActiveHousehold(lockedHouseholdId);
    const activeHousehold = readActiveHousehold();
    const hasHousehold = Boolean(activeHousehold);
    const bootstrapped = sessionStorage.getItem(BOOTSTRAP_FLAG) === "1";
    const recordedUserId = sessionStorage.getItem(BOOTSTRAP_USER_KEY);
    const recordedHousehold = sessionStorage.getItem(BOOTSTRAP_HOUSEHOLD_KEY);
    if (
      bootstrapped &&
      hasHousehold &&
      recordedUserId === userId &&
      recordedHousehold === activeHousehold
    ) {
      console.info("[bootstrap] hydration skipped because already bootstrapped", { trigger });
      return true;
    }

    const hh = lockedHouseholdId || (await resolveActiveHousehold());
    if (!hh) {
      return false;
    }
    if (lockedHouseholdId) lockActiveHousehold(lockedHouseholdId);

    await hydrateAllFromRemote(lockedHouseholdId);

    try {
      sessionStorage.setItem(BOOTSTRAP_FLAG, "1");
      sessionStorage.setItem(BOOTSTRAP_HOUSEHOLD_KEY, hh);
    } catch (e) { reportError("sync/bootstrap", e); }

    console.info("[bootstrap] hydration completed", { trigger, householdId: hh });
    return true;
  })().finally(() => {
    bootstrapInFlight = null;
    bootstrapInFlightKey = null;
  });

  bootstrapInFlight = task;
  bootstrapInFlightKey = taskKey;
  return task;
}

export function clearBootstrapState(): void {
  clearBootstrapMarkers();
}

export function watchBootstrapAuthState(
  triggerPrefix: string,
  onReady?: (ready: boolean) => void,
  lockedHouseholdId?: string | null
): (() => void) | undefined {
  if (typeof window === "undefined" || !isSupabaseConfigured()) return undefined;
  const sb = getSupabaseBrowser();
  if (!sb) return undefined;

  const {
    data: { subscription },
  } = sb.auth.onAuthStateChange((event, session) => {
    if (event === "SIGNED_OUT") {
      clearBootstrapMarkers();
      onReady?.(false);
      return;
    }

    if (session?.user) {
      void bootstrapSessionOnce(`${triggerPrefix}:${event}`, lockedHouseholdId).then((ready) => {
        if (ready) onReady?.(true);
      });
    }
  });

  return () => subscription.unsubscribe();
}
