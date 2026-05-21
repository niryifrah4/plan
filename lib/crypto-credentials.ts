/**
 * Crypto Exchange Credentials — local storage of API key + secret per
 * connected exchange, tied to a portfolio Account.
 *
 * Security note (READ THIS):
 *   • Credentials are stored in localStorage as plaintext.
 *   • This is acceptable ONLY for read-only API keys (no trade/withdraw).
 *   • The UI mandates a "Read Only" warning before the user pastes a key.
 *   • Anyone with access to the user's browser profile can read these.
 *
 * When we move to a server-rendered B2C product, these should be encrypted
 * at rest server-side and never round-trip to the client in cleartext.
 */

import { scopedKey } from "./client-scope";

export type CryptoExchange = "binance" | "coinbase";

export interface CryptoCredentials {
  id: string;
  exchange: CryptoExchange;
  label: string;
  apiKey: string;
  secret: string;
  /** The portfolio Account these balances sync into. */
  accountId: string;
  createdAt: string;
  updatedAt: string;
  /** ISO timestamp of the last successful sync. */
  lastSyncAt?: string;
  /** Last error message (cleared on success). */
  lastErrorMsg?: string;
}

const CREDS_KEY = "verdant:crypto:credentials";
export const CRYPTO_CREDS_EVENT = "verdant:crypto-credentials:updated";

function nowIso(): string {
  return new Date().toISOString();
}
function uid(): string {
  return `cred-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function loadCryptoCredentials(): CryptoCredentials[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(scopedKey(CREDS_KEY));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveCryptoCredentials(creds: CryptoCredentials[]): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(scopedKey(CREDS_KEY), JSON.stringify(creds));
    window.dispatchEvent(new Event(CRYPTO_CREDS_EVENT));
  } catch {}
}

export function addCryptoCredential(
  input: Omit<CryptoCredentials, "id" | "createdAt" | "updatedAt">
): CryptoCredentials {
  const cred: CryptoCredentials = {
    ...input,
    id: uid(),
    createdAt: nowIso(),
    updatedAt: nowIso(),
  };
  saveCryptoCredentials([...loadCryptoCredentials(), cred]);
  return cred;
}

export function updateCryptoCredential(
  id: string,
  patch: Partial<Omit<CryptoCredentials, "id" | "createdAt">>
): void {
  const next = loadCryptoCredentials().map((c) =>
    c.id === id ? { ...c, ...patch, updatedAt: nowIso() } : c
  );
  saveCryptoCredentials(next);
}

export function deleteCryptoCredential(id: string): void {
  saveCryptoCredentials(loadCryptoCredentials().filter((c) => c.id !== id));
}

export function markCryptoSyncOk(id: string): void {
  updateCryptoCredential(id, { lastSyncAt: nowIso(), lastErrorMsg: undefined });
}

export function markCryptoSyncFailed(id: string, msg: string): void {
  updateCryptoCredential(id, { lastErrorMsg: msg });
}
