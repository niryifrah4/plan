/**
 * Document upload history store.
 *
 * Persists the list of uploaded source documents (bank statements,
 * credit-card files, parsed PDFs) and their per-file summary stats so the
 * mapping page can show provenance — "this transaction came from
 * 'הפועלים-march.xlsx' on 12/04/2026".
 *
 * Storage: localStorage, scoped per household via `scopedKey`.
 *
 * Naming note: storage key still says "verdant" (legacy brand). Do not
 * rename without a migration — existing client data lives under that key.
 */

import { scopedKey } from "./client-scope";

/** Parsed transactions array (scoped). */
export const STORAGE_KEY = "verdant:parsed_transactions";

/** Unsaved review-phase draft (scoped). */
export const DRAFT_KEY = "verdant:doc_draft";

/** Persistent list of uploaded documents (scoped). */
export const HISTORY_KEY = "verdant:doc_history";

export interface DocHistoryEntry {
  id: string;
  filename: string;
  bankHint: string;
  /** ISO timestamp of the save. */
  uploadedAt: string;
  txCount: number;
  chargesSum: number;
  creditsSum: number;
  /** Mapped = category is NOT in UNMAPPED_KEYS. */
  mappedCount?: number;
  unmappedCount?: number;
  /** Date range of transactions in the file. */
  periodFrom?: string;
  periodTo?: string;
  /** True when every transaction was mapped at save time. */
  fullyMapped?: boolean;
  /** Cross-session duplicates skipped on save (e.g. same charge already in a previous upload). */
  crossDupsSkipped?: number;
}

export function loadDocHistory(): DocHistoryEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(scopedKey(HISTORY_KEY));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveDocHistory(history: DocHistoryEntry[]): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(scopedKey(HISTORY_KEY), JSON.stringify(history));
  } catch {}
}
