/**
 * ═══════════════════════════════════════════════════════════
 *  Portfolio Migration — Legacy → Unified Store
 * ═══════════════════════════════════════════════════════════
 *
 * One-shot, idempotent migration from the two legacy stores into the
 * unified portfolio-store:
 *   verdant:securities      → portfolio:positions (regular + flat RSU)
 *   verdant:equity_grants   → portfolio:positions (full §102 vesting)
 *
 * The legacy keys are NOT deleted — the old pages keep working until they
 * are removed in a later step. Re-running is a no-op (flag check).
 *
 * Field mapping:
 *   SecurityRow.broker  → Account.label (one account per unique broker)
 *   EquityGrant.company → Account.label (one account per company)
 *
 * Flat-RSU translation:
 *   /investments stores a single `vest_date`. We translate it to a
 *   one-month vesting schedule starting on that date — so before
 *   vest_date the shares show as unvested, on/after they're fully vested.
 *   Identical observable behaviour to the legacy model.
 */

import { scopedKey } from "./client-scope";
import {
  loadAccounts,
  loadPositions,
  saveAccounts,
  savePositions,
  type Account,
  type AssetKind,
  type Currency,
  type Position,
} from "./portfolio-store";

const MIGRATED_FLAG_KEY = "verdant:portfolio:migrated";
const LEGACY_SECURITIES_KEY = "verdant:securities";
const LEGACY_EQUITY_GRANTS_KEY = "verdant:equity_grants";

/* ─── Legacy shapes (subset — only the fields we read) ───── */

interface LegacySecurityRow {
  id?: string;
  kind?: string;
  symbol?: string;
  broker?: string | null;
  currency?: string;
  quantity?: number;
  avg_cost?: number;
  current_price?: number;
  fx_rate_to_ils?: number;
  vest_date?: string | null;
  strike_price?: number | null;
}

interface LegacyEquityGrant {
  id?: string;
  company?: string;
  ticker?: string;
  type?: "rsu" | "espp" | "options";
  totalShares?: number;
  grantPricePerShare?: number;
  currentPricePerShare?: number;
  vestStart?: string;
  vestMonths?: number;
  cliffMonths?: number;
  frequency?: "monthly" | "quarterly";
  currency?: "USD" | "ILS";
  usdIlsRate?: number;
  notes?: string;
}

/* ─── Public report ────────────────────────────────────────── */

export interface MigrationReport {
  alreadyMigrated: boolean;
  accountsCreated: number;
  positionsCreated: number;
  fromSecurities: number;
  fromGrants: number;
}

const EMPTY_REPORT: MigrationReport = {
  alreadyMigrated: true,
  accountsCreated: 0,
  positionsCreated: 0,
  fromSecurities: 0,
  fromGrants: 0,
};

/* ─── Helpers ──────────────────────────────────────────────── */

export function hasMigrated(): boolean {
  if (typeof window === "undefined") return true;
  try {
    return localStorage.getItem(scopedKey(MIGRATED_FLAG_KEY)) === "1";
  } catch {
    return true;
  }
}

function markMigrated(): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(scopedKey(MIGRATED_FLAG_KEY), "1");
  } catch {}
}

/**
 * Clears the migration flag. Caller still owns deleting the migrated rows
 * if they want a clean re-run — this only unblocks `migrateLegacyToPortfolio`.
 */
export function resetMigrationFlag(): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(scopedKey(MIGRATED_FLAG_KEY));
  } catch {}
}

function readJsonArray<T>(key: string): T[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(scopedKey(key));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as T[]) : [];
  } catch {
    return [];
  }
}

function normalizeCurrency(c: string | undefined): Currency {
  const upper = (c || "").toUpperCase();
  if (upper === "USD" || upper === "EUR" || upper === "GBP") return upper;
  if (upper === "NIS") return "ILS";
  return "ILS";
}

function normalizeKind(k: string | undefined): AssetKind {
  const lower = (k || "").toLowerCase();
  if (lower === "options") return "option";
  if (lower === "mutual_fund" || lower === "mutual-fund") return "fund";
  const valid: AssetKind[] = ["stock", "etf", "crypto", "bond", "fund", "rsu", "espp", "option"];
  return (valid as string[]).includes(lower) ? (lower as AssetKind) : "stock";
}

let idCounter = 0;
function makeId(prefix: string): string {
  idCounter += 1;
  return `${prefix}-${Date.now()}-${idCounter}-${Math.random().toString(36).slice(2, 6)}`;
}

function nowIso(): string {
  return new Date().toISOString();
}

/* ─── Migration ────────────────────────────────────────────── */

export function migrateLegacyToPortfolio(): MigrationReport {
  if (typeof window === "undefined") return EMPTY_REPORT;
  if (hasMigrated()) return EMPTY_REPORT;

  const legacySecs = readJsonArray<LegacySecurityRow>(LEGACY_SECURITIES_KEY);
  const legacyGrants = readJsonArray<LegacyEquityGrant>(LEGACY_EQUITY_GRANTS_KEY);

  if (legacySecs.length === 0 && legacyGrants.length === 0) {
    markMigrated();
    return { ...EMPTY_REPORT, alreadyMigrated: false };
  }

  const existingAccounts = loadAccounts();
  const existingPositions = loadPositions();

  // Re-use any account that already has a matching label; create new otherwise.
  const accountByLabel = new Map<string, Account>();
  for (const a of existingAccounts) accountByLabel.set(a.label, a);

  const newAccounts: Account[] = [];
  const newPositions: Position[] = [];

  function ensureAccount(label: string, currency: Currency, broker?: string): Account {
    const existing = accountByLabel.get(label);
    if (existing) return existing;
    const created: Account = {
      id: makeId("acc"),
      label,
      broker,
      currency,
      createdAt: nowIso(),
      updatedAt: nowIso(),
    };
    accountByLabel.set(label, created);
    newAccounts.push(created);
    return created;
  }

  // ── /investments rows ─────────────────────────────────────
  for (const s of legacySecs) {
    if (!s || !s.symbol) continue;
    const label = (s.broker && s.broker.trim()) || "ללא חשבון";
    const currency = normalizeCurrency(s.currency);
    const account = ensureAccount(label, currency, s.broker || undefined);
    const kind = normalizeKind(s.kind);

    const pos: Position = {
      // Preserve the legacy id so any asset→goal links keyed on it still resolve.
      id: s.id || makeId("pos"),
      accountId: account.id,
      kind,
      symbol: String(s.symbol),
      quantity: Number(s.quantity) || 0,
      avgCost: Number(s.avg_cost) || 0,
      currentPrice: Number(s.current_price) || 0,
      currency,
      fxRateToIls: Number(s.fx_rate_to_ils) || 1,
      createdAt: nowIso(),
      updatedAt: nowIso(),
    };

    // Flat vest_date → 1-month vesting (cliff 0, single slice).
    // Result: nothing vested before vest_date, everything vested on/after.
    if ((kind === "rsu" || kind === "option" || kind === "espp") && s.vest_date) {
      pos.grant = {
        vesting: {
          startDate: s.vest_date,
          totalMonths: 1,
          cliffMonths: 0,
          frequency: "monthly",
        },
      };
      if (kind === "option" && s.strike_price != null) {
        pos.grant.strikePrice = Number(s.strike_price);
      }
    }

    newPositions.push(pos);
  }

  // ── /equity grants ────────────────────────────────────────
  for (const g of legacyGrants) {
    if (!g) continue;
    const company = (g.company && g.company.trim()) || "Equity";
    const currency: Currency = g.currency === "USD" ? "USD" : "ILS";
    const account = ensureAccount(company, currency);

    const pos: Position = {
      id: g.id || makeId("pos"),
      accountId: account.id,
      kind: normalizeKind(g.type),
      symbol: g.ticker || g.company || "EQUITY",
      quantity: Number(g.totalShares) || 0,
      avgCost: Number(g.grantPricePerShare) || 0,
      currentPrice: Number(g.currentPricePerShare) || 0,
      currency,
      fxRateToIls: currency === "USD" ? Number(g.usdIlsRate) || 1 : 1,
      grant: {
        company: g.company,
        vesting: {
          startDate: g.vestStart || nowIso().slice(0, 10),
          totalMonths: Number(g.vestMonths) || 48,
          cliffMonths: Number(g.cliffMonths) || 0,
          frequency: g.frequency === "monthly" ? "monthly" : "quarterly",
        },
      },
      notes: g.notes,
      createdAt: nowIso(),
      updatedAt: nowIso(),
    };

    newPositions.push(pos);
  }

  if (newAccounts.length > 0) {
    saveAccounts([...existingAccounts, ...newAccounts]);
  }
  if (newPositions.length > 0) {
    savePositions([...existingPositions, ...newPositions]);
  }

  markMigrated();

  return {
    alreadyMigrated: false,
    accountsCreated: newAccounts.length,
    positionsCreated: newPositions.length,
    fromSecurities: legacySecs.length,
    fromGrants: legacyGrants.length,
  };
}
