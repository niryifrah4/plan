/**
 * ═══════════════════════════════════════════════════════════
 *  Accounts Store — חשבונות בנק וכרטיסי אשראי
 * ═══════════════════════════════════════════════════════════
 *
 * localStorage key: verdant:accounts
 */

import { scopedKey } from "./client-scope";
import { pushBlobInBackground, pullBlob } from "./sync/blob-sync";

const STORAGE_KEY = "verdant:accounts";
export const ACCOUNTS_EVENT = "verdant:accounts:updated";
const BLOB_KEY = "accounts";

/* ── Bank Account ── */
export interface BankAccount {
  id: string;
  bankName: string;
  accountNumber: string;
  branchNumber: string;
  balance: number;
  creditLimit?: number;  // מסגרת אשראי (overdraft)
  lastUpdated: string;   // YYYY-MM-DD
  isMain: boolean;
  notes: string;
}

/* ── Credit Card ── */
export interface CreditCard {
  id: string;
  company: string;
  lastFourDigits: string;
  creditLimit: number;
  currentCharge: number;
  billingDay: number;      // 1-28
  linkedBankId: string;
  lastUpdated: string;
  notes: string;
}

/* ── Combined Data ── */
export interface AccountsData {
  banks: BankAccount[];
  creditCards: CreditCard[];
}

/* ── Israeli banks & credit companies ── */
export const ISRAELI_BANKS = [
  "הפועלים", "לאומי", "דיסקונט", "מזרחי טפחות", "הבינלאומי",
  "מרכנתיל", "יהב", "אוצר החייל", "ירושלים", "דיגיבנק",
  "ONE ZERO", "פרי בנק",
];

export const CREDIT_COMPANIES = [
  "ישראכרט", "כאל", "מקס (לאומי קארד)", "אמריקן אקספרס", "דיינרס",
];

/* ── CRUD ── */

export function loadAccounts(): AccountsData {
  if (typeof window === "undefined") return { banks: [], creditCards: [] };
  try {
    const raw = localStorage.getItem(scopedKey(STORAGE_KEY));
    if (raw) {
      const parsed = JSON.parse(raw);
      return { banks: parsed.banks || [], creditCards: parsed.creditCards || [] };
    }
  } catch {}
  return { banks: [], creditCards: [] };
}

function save(data: AccountsData) {
  if (typeof window === "undefined") return;
  localStorage.setItem(scopedKey(STORAGE_KEY), JSON.stringify(data));
  window.dispatchEvent(new Event(ACCOUNTS_EVENT));
  pushBlobInBackground(BLOB_KEY, data);
}

/** Pull accounts from Supabase and overwrite local cache. */
export async function hydrateAccountsFromRemote(): Promise<boolean> {
  const remote = await pullBlob<AccountsData>(BLOB_KEY);
  if (!remote) return false;
  try {
    localStorage.setItem(scopedKey(STORAGE_KEY), JSON.stringify(remote));
    if (typeof window !== "undefined") {
      window.dispatchEvent(new Event(ACCOUNTS_EVENT));
    }
    return true;
  } catch {
    return false;
  }
}

// Banks
export function addBankAccount(bank: Omit<BankAccount, "id">): void {
  const data = loadAccounts();
  data.banks.push({ ...bank, id: `bank_${Date.now()}` });
  save(data);
}

export function updateBankAccount(id: string, patch: Partial<BankAccount>): void {
  const data = loadAccounts();
  const idx = data.banks.findIndex(b => b.id === id);
  if (idx >= 0) data.banks[idx] = { ...data.banks[idx], ...patch };
  save(data);
}

export function deleteBankAccount(id: string): void {
  const data = loadAccounts();
  data.banks = data.banks.filter(b => b.id !== id);
  save(data);
}

// Credit Cards
export function addCreditCard(card: Omit<CreditCard, "id">): void {
  const data = loadAccounts();
  data.creditCards.push({ ...card, id: `cc_${Date.now()}` });
  save(data);
}

export function updateCreditCard(id: string, patch: Partial<CreditCard>): void {
  const data = loadAccounts();
  const idx = data.creditCards.findIndex(c => c.id === id);
  if (idx >= 0) data.creditCards[idx] = { ...data.creditCards[idx], ...patch };
  save(data);
}

export function deleteCreditCard(id: string): void {
  const data = loadAccounts();
  data.creditCards = data.creditCards.filter(c => c.id !== id);
  save(data);
}

/* ── Computed ── */
export function totalBankBalance(data: AccountsData): number {
  return data.banks.reduce((s, b) => s + b.balance, 0);
}

export function totalCreditCharges(data: AccountsData): number {
  return data.creditCards.reduce((s, c) => s + c.currentCharge, 0);
}

/** Total credit limit across all banks + credit cards */
export function totalCreditLimit(data: AccountsData): number {
  const bankLimits = data.banks.reduce((s, b) => s + (b.creditLimit || 0), 0);
  const cardLimits = data.creditCards.reduce((s, c) => s + c.creditLimit, 0);
  return bankLimits + cardLimits;
}
