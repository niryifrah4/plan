/**
 * ═══════════════════════════════════════════════════════════
 *  Boot bootstrap — אתחול sync אחרי login/signup
 * ═══════════════════════════════════════════════════════════
 *
 * 1. resolveActiveHousehold() — בוחר household ראשון של ה-advisor
 *    ושומר ב-localStorage (`verdant:active_household_id`).
 * 2. hydrateAllFromRemote() — מושך את כל ה-blobs והטבלאות
 *    מהשרת → overwrite של cache ב-localStorage.
 *
 * נקרא פעם אחת מ-(client)/layout בטעינה, וגם אחרי signup.
 */

import { getSupabaseBrowser, isSupabaseConfigured } from "@/lib/supabase/browser";

const ACTIVE_HH_KEY = "verdant:active_household_id";
const BOOTSTRAP_FLAG = "verdant:bootstrap_done";

export async function resolveActiveHousehold(): Promise<string | null> {
  if (typeof window === "undefined") return null;
  if (!isSupabaseConfigured()) return null;

  // כבר נבחר?
  const existing = localStorage.getItem(ACTIVE_HH_KEY);
  if (existing) return existing;

  const sb = getSupabaseBrowser();
  if (!sb) return null;

  try {
    const {
      data: { user },
    } = await sb.auth.getUser();
    if (!user) return null;

    // first household owned by this advisor (trigger in 0008 creates one on signup)
    const { data, error } = await sb
      .from("households")
      .select("id")
      .eq("advisor_id", user.id)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();

    if (error || !data?.id) return null;
    localStorage.setItem(ACTIVE_HH_KEY, data.id);
    return data.id;
  } catch {
    return null;
  }
}

/**
 * מושך את כל ה-blobs והטבלאות מהשרת → overwrite של cache ב-localStorage.
 * רץ אחרי resolveActiveHousehold. בטוח לקריאה כפולה.
 */
export async function hydrateAllFromRemote(): Promise<void> {
  if (typeof window === "undefined") return;
  if (!isSupabaseConfigured()) return;

  const hh = localStorage.getItem(ACTIVE_HH_KEY);
  if (!hh) return;

  // dynamic imports כדי לא לטעון את כל החנויות ב-SSR
  const [
    pension,
    debt,
    realestate,
    accounts,
    budget,
    balanceHist,
    risk,
    scenarios,
    kids,
    blobSync,
  ] = await Promise.all([
    import("@/lib/pension-store"),
    import("@/lib/debt-store"),
    import("@/lib/realestate-store"),
    import("@/lib/accounts-store"),
    import("@/lib/budget-store"),
    import("@/lib/balance-history-store"),
    import("@/lib/risk-store"),
    import("@/lib/scenarios-store"),
    import("@/lib/kids-savings-store"),
    import("@/lib/sync/blob-sync"),
  ]);

  // הרץ במקביל — כל אחד עצמאי, כישלון אחד לא מפיל אחרים
  await Promise.allSettled([
    pension.hydratePensionFundsFromRemote?.(),
    debt.hydrateDebtFromRemote?.(),
    realestate.hydratePropertiesFromRemote?.(),
    accounts.hydrateAccountsFromRemote?.(),
    budget.hydrateBudgetsFromRemote?.(),
    balanceHist.hydrateHistoryFromRemote?.(),
    risk.hydrateRiskFromRemote?.(),
    scenarios.hydrateScenariosFromRemote?.(),
    kids.hydrateKidsSavingsFromRemote?.(),
    hydrateSecurities(blobSync),
  ]);
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
export async function bootstrapSessionOnce(): Promise<void> {
  if (typeof window === "undefined") return;
  if (sessionStorage.getItem(BOOTSTRAP_FLAG) === "1") return;
  await resolveActiveHousehold();
  await hydrateAllFromRemote();
  sessionStorage.setItem(BOOTSTRAP_FLAG, "1");
}
