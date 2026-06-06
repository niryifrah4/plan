import { scopedKey } from "@/lib/client-scope";
import { pullBlob, pullBlobsByPrefix } from "@/lib/sync/blob-sync";
import { pullFromRemote, type SyncConfig } from "@/lib/sync/remote-sync";
import { syncOnboardingToStores } from "@/lib/onboarding-sync";
import type { PensionFund } from "@/lib/pension-store";

const BLOB_EVENTS: Record<string, string> = {
  accounts: "verdant:accounts:updated",
  budget: "verdant:budgets:updated",
  debt: "verdant:debt:updated",
  kids: "verdant:kids_savings:updated",
  pension: "verdant:pension:updated",
  properties: "verdant:realestate:updated",
  parsed_transactions: "verdant:parsed_transactions:updated",
  risk: "verdant:risk:updated",
  scenarios: "verdant:scenarios:updated",
  balance_history: "verdant:balance_history:updated",
  salary: "verdant:salary_profile:updated",
  docs: "verdant:docs:updated",
  portfolio: "verdant:portfolio:updated",
};

const BLOB_KEYS = {
  accounts: "accounts",
  budget: "budgets",
  debt: "debt_data",
  kids: "kids_savings",
  properties: "realestate_properties",
  parsed_transactions: "parsed_transactions",
  risk: "risk_items",
  scenarios: "scenarios",
  balance_history: "balance_history",
  salary: "salary_profile",
  spouse_salary: "spouse_salary_profile",
  docs: "doc_history",
  onboarding: "onboarding_snapshot",
  pension: "pension_products",
  portfolio_accounts: "portfolio_accounts",
  portfolio_positions: "portfolio_positions",
} as const;

const SALARY_KEY = "verdant:salary_profile";
const SPOUSE_SALARY_KEY = "verdant:spouse_salary_profile";
const ONBOARDING_KEYS = [
  "verdant:onboarding:step",
  "verdant:onboarding:fields",
  "verdant:onboarding:children",
  "verdant:onboarding:assets",
  "verdant:onboarding:liabilities",
  "verdant:onboarding:insurance",
  "verdant:onboarding:goals",
  "verdant:onboarding:incomes",
  "verdant:onboarding:planner_notes",
] as const;

const ONBOARDING_SENTINELS = [
  "verdant:onboarding_synced_at",
  "verdant:onboarding:budget_seeded",
  "verdant:onboarding:assumptions_seeded",
  "verdant:onboarding:goals_seeded",
  "verdant:onboarding:emergency_seeded",
  "verdant:onboarding:salary_seeded",
] as const;

const MONTHLY_BUDGET_RE = /:budget_\d{4}_\d{2}$/;

type PensionRow = {
  id: string;
  company: string;
  product_type: string;
  accumulated_balance: number;
  mgmt_fee_deposits_pct: number;
  mgmt_fee_accumulated_pct: number;
  investment_track: string | null;
  employee_contribution: number;
  start_date: string | null;
  surance_raw_json: Record<string, unknown> | null;
};

const PENSION_CFG: SyncConfig<PensionFund, PensionRow> = {
  table: "pension_products",
  select: "id, company, product_type, accumulated_balance, mgmt_fee_deposits_pct, mgmt_fee_accumulated_pct, investment_track, employee_contribution, start_date, surance_raw_json",
  toRow: () => ({}),
  fromRow: (r) => {
    const raw = r.surance_raw_json || {};
    const mapTypeFromDb = (t: string): PensionFund["type"] => {
      if (t === "gemel") return "gemel";
      if (t === "keren_hishtalmut") return "hishtalmut";
      if (t === "bituach_menahalim") return "bituach";
      return "pension";
    };
    return {
      id: raw.id ? String(raw.id) : r.id,
      company: r.company,
      type: mapTypeFromDb(r.product_type),
      subtype: raw.subtype as PensionFund["subtype"],
      conversionFactor: typeof raw.conversionFactor === "number" ? raw.conversionFactor : undefined,
      guaranteedRate: typeof raw.guaranteedRate === "number" ? raw.guaranteedRate : undefined,
      balance: Number(r.accumulated_balance || 0),
      mgmtFeeDeposit: Number(r.mgmt_fee_deposits_pct || 0),
      mgmtFeeBalance: Number(r.mgmt_fee_accumulated_pct || 0),
      track: r.investment_track || "",
      monthlyContrib: Number(r.employee_contribution || 0),
      insuranceCover: raw.insuranceCover as PensionFund["insuranceCover"],
      registeredFundId: raw.registeredFundId as string | undefined,
      openingDate: r.start_date || undefined,
      isEmployed: raw.isEmployed as boolean | undefined,
    };
  },
};

function dispatch(name: string): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(name));
}

function writeJson(key: string, value: unknown): void {
  localStorage.setItem(scopedKey(key), JSON.stringify(value));
}

function removeKey(key: string): void {
  localStorage.removeItem(scopedKey(key));
}

function removeMonthlyBudgets(): void {
  const keys: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key && MONTHLY_BUDGET_RE.test(key)) keys.push(key);
  }
  keys.forEach((key) => localStorage.removeItem(key));
}

function setOnboardingBlob(remote: { savedAt: string; data: Record<string, string> } | null): boolean {
  let wrote = false;
  if (!remote || !remote.data) {
    for (const key of ONBOARDING_KEYS) removeKey(key);
    removeKey("verdant:onboarding:savedAt");
    for (const key of ONBOARDING_SENTINELS) removeKey(key);
    return false;
  }
  for (const key of ONBOARDING_KEYS) {
    const raw = remote.data[key];
    if (typeof raw === "string") {
      localStorage.setItem(scopedKey(key), raw);
      wrote = true;
    } else {
      removeKey(key);
    }
  }
  if (remote.savedAt) {
    localStorage.setItem(scopedKey("verdant:onboarding:savedAt"), remote.savedAt);
    wrote = true;
  } else {
    removeKey("verdant:onboarding:savedAt");
  }
  return wrote;
}

/**
 * Refresh the dashboard's local caches from Supabase.
 *
 * The page continues to render the current cache immediately, then this
 * function reconciles it with the server and dispatches the usual update
 * events so the dashboard state re-renders in place.
 */
export async function refreshDashboardFromRemote(): Promise<boolean> {
  if (typeof window === "undefined") return false;

  const tasks: Array<Promise<boolean>> = [
    (async () => {
      const remote = await pullBlob<unknown>(BLOB_KEYS.debt);
      const wrote = !!remote && typeof remote === "object";
      if (wrote) writeJson(BLOB_KEYS.debt, remote);
      else removeKey(BLOB_KEYS.debt);
      dispatch(BLOB_EVENTS.debt);
      return wrote;
    })(),
    (async () => {
      const remote = await pullBlob<unknown>(BLOB_KEYS.properties);
      const wrote = !!remote && Array.isArray(remote);
      if (wrote) writeJson(BLOB_KEYS.properties, remote);
      else removeKey(BLOB_KEYS.properties);
      dispatch(BLOB_EVENTS.properties);
      return wrote;
    })(),
    (async () => {
      const remote = await pullBlob<unknown>(BLOB_KEYS.accounts);
      const wrote = !!remote && typeof remote === "object";
      if (wrote) writeJson(BLOB_KEYS.accounts, remote);
      else removeKey(BLOB_KEYS.accounts);
      dispatch(BLOB_EVENTS.accounts);
      return wrote;
    })(),
    (async () => {
      const remote = await pullFromRemote(PENSION_CFG);
      const wrote = !!remote && Array.isArray(remote);
      if (wrote) writeJson(BLOB_KEYS.pension, remote);
      else removeKey(BLOB_KEYS.pension);
      dispatch(BLOB_EVENTS.pension);
      return wrote;
    })(),
    (async () => {
      const remote = await pullBlob<unknown>(BLOB_KEYS.kids);
      const wrote = !!remote && Array.isArray(remote);
      if (wrote) writeJson(BLOB_KEYS.kids, remote);
      else removeKey(BLOB_KEYS.kids);
      dispatch(BLOB_EVENTS.kids);
      return wrote;
    })(),
    (async () => {
      const remote = await pullBlob<unknown>(BLOB_KEYS.risk);
      const wrote = !!remote && Array.isArray(remote);
      if (wrote) writeJson(BLOB_KEYS.risk, remote);
      else removeKey(BLOB_KEYS.risk);
      dispatch(BLOB_EVENTS.risk);
      return wrote;
    })(),
    (async () => {
      const remote = await pullBlob<unknown>(BLOB_KEYS.scenarios);
      const wrote = !!remote && Array.isArray(remote);
      if (wrote) writeJson(BLOB_KEYS.scenarios, remote);
      else removeKey(BLOB_KEYS.scenarios);
      dispatch(BLOB_EVENTS.scenarios);
      return wrote;
    })(),
    (async () => {
      const remote = await pullBlob<unknown>(BLOB_KEYS.balance_history);
      const wrote = !!remote && Array.isArray(remote);
      if (wrote) writeJson(BLOB_KEYS.balance_history, remote);
      else removeKey(BLOB_KEYS.balance_history);
      dispatch(BLOB_EVENTS.balance_history);
      return wrote;
    })(),
    (async () => {
      const remote = await pullBlob<unknown>(BLOB_KEYS.salary);
      const wrote = !!remote && typeof remote === "object";
      if (wrote) writeJson(BLOB_KEYS.salary, remote);
      else removeKey(SALARY_KEY);
      const spouseRemote = await pullBlob<unknown>(BLOB_KEYS.spouse_salary);
      const spouseWrote = !!spouseRemote && typeof spouseRemote === "object";
      if (spouseWrote) writeJson(BLOB_KEYS.spouse_salary, spouseRemote);
      else removeKey(SPOUSE_SALARY_KEY);
      dispatch(BLOB_EVENTS.salary);
      return wrote || spouseWrote;
    })(),
    (async () => {
      const remote = await pullBlob<unknown>(BLOB_KEYS.parsed_transactions);
      const wrote = !!remote && Array.isArray(remote);
      if (wrote) writeJson(BLOB_KEYS.parsed_transactions, remote);
      else removeKey(BLOB_KEYS.parsed_transactions);
      dispatch(BLOB_EVENTS.parsed_transactions);
      return wrote;
    })(),
    (async () => {
      const remote = await pullBlob<unknown>(BLOB_KEYS.docs);
      const wrote = !!remote && Array.isArray(remote);
      if (wrote) writeJson(BLOB_KEYS.docs, remote);
      else removeKey(BLOB_KEYS.docs);
      dispatch(BLOB_EVENTS.docs);
      return wrote;
    })(),
    (async () => {
      const remoteAccounts = await pullBlob<unknown>(BLOB_KEYS.portfolio_accounts);
      const remotePositions = await pullBlob<unknown>(BLOB_KEYS.portfolio_positions);
      let wrote = false;
      if (Array.isArray(remoteAccounts)) {
        writeJson(BLOB_KEYS.portfolio_accounts, remoteAccounts);
        wrote = true;
      } else {
        removeKey(BLOB_KEYS.portfolio_accounts);
      }
      if (Array.isArray(remotePositions)) {
        writeJson(BLOB_KEYS.portfolio_positions, remotePositions);
        wrote = true;
      } else {
        removeKey(BLOB_KEYS.portfolio_positions);
      }
      // Clear the legacy securities fallback so it cannot override the fresh portfolio state.
      removeKey("verdant:securities");
      dispatch(BLOB_EVENTS.portfolio);
      dispatch("verdant:investments:updated");
      return wrote;
    })(),
    (async () => {
      const remote = await pullBlobsByPrefix("budget_");
      let wrote = false;
      if (Object.keys(remote).length === 0) {
        removeMonthlyBudgets();
      } else {
        for (const [key, value] of Object.entries(remote)) {
          if (!/^budget_\d{4}_\d{2}$/.test(key)) continue;
          localStorage.setItem(scopedKey(`verdant:${key}`), JSON.stringify(value));
          wrote = true;
        }
      }
      dispatch(BLOB_EVENTS.budget);
      return wrote;
    })(),
    (async () => {
      const remote = await pullBlob<{ data: Record<string, string>; savedAt: string }>(BLOB_KEYS.onboarding);
      const wrote = setOnboardingBlob(remote ?? null);
      if (remote && remote.data) {
        syncOnboardingToStores();
      }
      return wrote;
    })(),
  ];

  const results = await Promise.allSettled(tasks);
  return results.some((r) => r.status === "fulfilled" && r.value);
}
