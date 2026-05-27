/**
 * ═══════════════════════════════════════════════════════════
 *  Accounts Sync — auto-link mapped instruments → AccountsTab
 * ═══════════════════════════════════════════════════════════
 *
 * When a bank/credit-card statement is uploaded and parsed, the doc-parser
 * extracts `FinancialInstrument[]` (last-4 digits, account numbers, issuer
 * names). This module pushes those instruments into the AccountsTab data
 * model automatically so the user never has to add a card or account by
 * hand — uploading the statement is enough.
 *
 * Idempotent: a `verdant:accounts_synced_instruments` registry tracks which
 * instrument keys have already been pushed, so re-running the sync after
 * every upload doesn't create duplicates.
 *
 * Match policy:
 *   - bank account: match by `accountNumber === instrument.identifier`
 *   - credit card: match by `lastFourDigits === instrument.identifier`
 *   - exists already (user added manually) → mark as synced + skip
 *   - new → insert with `notes: "מזוהה אוטומטית מהמיפוי"` so the UI can show a badge
 */

import { scopedKey } from "./client-scope";
import { loadInstruments, type FinancialInstrument } from "./doc-parser/instruments";
import {
  loadAccounts,
  addBankAccount,
  addCreditCard,
  updateCreditCard,
  ACCOUNTS_EVENT,
} from "./accounts-store";

const SYNCED_KEY = "verdant:accounts_synced_instruments";

/** Badge prefix the AccountsTab UI looks for to mark auto-detected entries. */
export const AUTO_SYNC_BADGE = "מזוהה אוטומטית מהמיפוי";

interface SyncedRegistry {
  /** keys: `${type}::${institution}::${identifier}` — same shape as the dedup key in instruments */
  synced: string[];
  syncedAt: string;
}

function instKey(inst: FinancialInstrument): string {
  return `${inst.type}::${inst.institution}::${inst.identifier}`;
}

function today(): string {
  return new Date().toISOString().split("T")[0];
}

function loadSynced(): SyncedRegistry {
  if (typeof window === "undefined") return { synced: [], syncedAt: "" };
  try {
    const raw = localStorage.getItem(scopedKey(SYNCED_KEY));
    return raw ? JSON.parse(raw) : { synced: [], syncedAt: "" };
  } catch {
    return { synced: [], syncedAt: "" };
  }
}

function saveSynced(reg: SyncedRegistry) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(scopedKey(SYNCED_KEY), JSON.stringify(reg));
  } catch {}
}

/**
 * Run the sync. Returns counts so the caller can show a toast.
 *
 * Called from:
 *   - DocumentsTab after a successful save (`handleTransfer`)
 *   - AccountsTab on mount (idempotent)
 *   - manual "rescan" button if we expose one
 */
export function syncInstrumentsToAccounts(): { added: number; skipped: number } {
  if (typeof window === "undefined") return { added: 0, skipped: 0 };

  const instruments = loadInstruments();
  const accounts = loadAccounts();
  const reg = loadSynced();
  const alreadySynced = new Set(reg.synced);

  let added = 0;
  let skipped = 0;

  for (const inst of instruments) {
    const key = instKey(inst);
    if (alreadySynced.has(key)) {
      skipped++;
      continue;
    }

    if (inst.type === "credit_card") {
      const existing = accounts.creditCards.find(
        (c) => c.lastFourDigits === inst.identifier
      );
      if (existing) {
        // Card exists. Two flavors:
        //  1. The user added it manually (notes !== AUTO_SYNC_BADGE) — leave
        //     untouched, just mark synced. They picked their own billingDay.
        //  2. WE auto-synced it earlier (notes === AUTO_SYNC_BADGE). If we
        //     fell back to billingDay=10 last time but THIS statement parsed
        //     a real value, upgrade in place so the dashboard shows the right
        //     debit date instead of the default.
        if (
          existing.notes === AUTO_SYNC_BADGE &&
          inst.billingDay != null &&
          existing.billingDay !== inst.billingDay
        ) {
          updateCreditCard(existing.id, { billingDay: inst.billingDay });
        }
        alreadySynced.add(key);
        skipped++;
        continue;
      }
      addCreditCard({
        company: inst.institution,
        lastFourDigits: inst.identifier,
        creditLimit: 0,
        currentCharge: 0,
        // Use the billing day extracted from the statement when present.
        // Fallback 10 is the median across Israeli issuers; user can edit.
        billingDay: inst.billingDay ?? 10,
        linkedBankId: "", // future: guess from cross-account dedup matches
        lastUpdated: today(),
        notes: AUTO_SYNC_BADGE,
      });
      alreadySynced.add(key);
      added++;
    } else if (inst.type === "bank_account") {
      const existing = accounts.banks.find(
        (b) => b.accountNumber === inst.identifier
      );
      if (existing) {
        alreadySynced.add(key);
        skipped++;
        continue;
      }
      addBankAccount({
        bankName: inst.institution,
        accountNumber: inst.identifier,
        branchNumber: "",
        balance: 0,
        creditLimit: 0,
        isMain: accounts.banks.length === 0, // first bank wins "ראשי"
        lastUpdated: today(),
        notes: AUTO_SYNC_BADGE,
        accountType: "private",
      });
      alreadySynced.add(key);
      added++;
    }
  }

  saveSynced({ synced: Array.from(alreadySynced), syncedAt: new Date().toISOString() });

  if (added > 0 && typeof window !== "undefined") {
    window.dispatchEvent(new Event(ACCOUNTS_EVENT));
  }

  return { added, skipped };
}

/**
 * Wipe the sync registry. Used when the user deletes all accounts and wants
 * the next upload to re-add them, or to force a full re-sync after a bug fix.
 */
export function resetAccountsSync(): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(scopedKey(SYNCED_KEY));
  } catch {}
}
