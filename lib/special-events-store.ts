/**
 * Special Events Store — one-time cashflow events the user expects in the
 * coming year (annual bonus, tax refund, planned car purchase, wedding gift,
 * etc.). Plugged into the 12-month forecast on /budget.
 *
 * Storage: localStorage, scoped per client (advisor impersonating different
 * households gets each household's events separately). Sync via the standard
 * fireSync('verdant:special-events:updated') pattern so the forecast updates
 * live when the user adds or removes an event.
 */

import { fireSync } from "./sync-engine";
import { scopedKey } from "./client-scope";

export const SPECIAL_EVENTS_STORAGE_KEY = "verdant:special_events";
export const SPECIAL_EVENTS_EVENT = "verdant:special-events:updated";

export type SpecialEventType = "income" | "expense";

export interface SpecialEvent {
  id: string;
  /** Human-readable label, e.g. "בונוס שנתי", "החזר מס", "רכישת רכב". */
  label: string;
  /** Year-month, e.g. "2027-05". */
  ym: string;
  /** Always positive — the type field controls sign in cashflow. */
  amount: number;
  type: SpecialEventType;
  /** Material Symbols icon name. Optional — defaults are picked per type. */
  icon?: string;
  /** Optional free-text notes. */
  notes?: string;
}

function genId(): string {
  return `se_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export function loadSpecialEvents(): SpecialEvent[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(scopedKey(SPECIAL_EVENTS_STORAGE_KEY));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isValidEvent);
  } catch {
    return [];
  }
}

export function saveSpecialEvents(events: SpecialEvent[]): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(scopedKey(SPECIAL_EVENTS_STORAGE_KEY), JSON.stringify(events));
    fireSync(SPECIAL_EVENTS_EVENT);
  } catch {}
}

export function createSpecialEvent(input: Omit<SpecialEvent, "id">): SpecialEvent {
  return {
    id: genId(),
    label: input.label.trim(),
    ym: input.ym,
    amount: Math.max(0, Math.round(input.amount)),
    type: input.type,
    icon: input.icon,
    notes: input.notes?.trim() || undefined,
  };
}

export function addSpecialEvent(events: SpecialEvent[], input: Omit<SpecialEvent, "id">): SpecialEvent[] {
  return [...events, createSpecialEvent(input)];
}

export function updateSpecialEvent(
  events: SpecialEvent[],
  id: string,
  patch: Partial<Omit<SpecialEvent, "id">>
): SpecialEvent[] {
  return events.map((e) =>
    e.id === id
      ? {
          ...e,
          ...patch,
          amount: patch.amount !== undefined ? Math.max(0, Math.round(patch.amount)) : e.amount,
          label: patch.label !== undefined ? patch.label.trim() : e.label,
        }
      : e
  );
}

export function removeSpecialEvent(events: SpecialEvent[], id: string): SpecialEvent[] {
  return events.filter((e) => e.id !== id);
}

/** Sort events chronologically (earliest first), tie-break by label. */
export function sortSpecialEvents(events: SpecialEvent[]): SpecialEvent[] {
  return [...events].sort((a, b) => {
    if (a.ym !== b.ym) return a.ym.localeCompare(b.ym);
    return a.label.localeCompare(b.label, "he");
  });
}

function isValidEvent(e: unknown): e is SpecialEvent {
  if (!e || typeof e !== "object") return false;
  const v = e as Record<string, unknown>;
  return (
    typeof v.id === "string" &&
    typeof v.label === "string" &&
    typeof v.ym === "string" &&
    /^\d{4}-\d{2}$/.test(v.ym) &&
    typeof v.amount === "number" &&
    (v.type === "income" || v.type === "expense")
  );
}
