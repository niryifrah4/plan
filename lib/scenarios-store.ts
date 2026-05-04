// תרחישי "מה אם" — שמירת מצבי סימולציה לפנסיה (ובעתיד: נדל״ן, משכנתא).
// נשמר ב-localStorage תחת verdant:scenarios. דיווח שינוי דרך אירוע verdant:scenarios:updated.

export type ScenarioType = "pension"; // עתידי: "realestate" | "mortgage"

export interface PensionScenarioPayload {
  extraMonthly: number;
  retireAge: number;
  annualReturn: number; // באחוזים, למשל 5
  inflation: number; // באחוזים, למשל 2.5
  mgmtFeeBalance: number; // באחוזים, למשל 0.5
  mgmtFeeDeposit: number; // באחוזים, למשל 2
}

export interface ScenarioResult {
  projectedBalance: number;
  monthlyPension: number;
}

export interface Scenario {
  id: string;
  type: ScenarioType;
  name: string;
  createdAt: string; // ISO
  payload: PensionScenarioPayload;
  result: ScenarioResult;
}

import { scopedKey } from "./client-scope";
import { pushBlobInBackground, pullBlob } from "./sync/blob-sync";

const STORAGE_KEY = "verdant:scenarios";
const BLOB_KEY = "scenarios";
export const SCENARIOS_EVENT = "verdant:scenarios:updated";

function hasWindow(): boolean {
  return typeof window !== "undefined";
}

function emit() {
  if (!hasWindow()) return;
  window.dispatchEvent(new CustomEvent(SCENARIOS_EVENT));
}

function readAll(): Scenario[] {
  if (!hasWindow()) return [];
  try {
    const raw = window.localStorage.getItem(scopedKey(STORAGE_KEY));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as Scenario[]) : [];
  } catch {
    return [];
  }
}

function writeAll(list: Scenario[]): void {
  if (!hasWindow()) return;
  try {
    window.localStorage.setItem(scopedKey(STORAGE_KEY), JSON.stringify(list));
  } catch {
    // שקט
  }
}

export function loadScenarios(type?: ScenarioType): Scenario[] {
  const all = readAll();
  return type ? all.filter((s) => s.type === type) : all;
}

export function saveScenarios(list: Scenario[]): void {
  writeAll(list);
  emit();
  pushBlobInBackground(BLOB_KEY, list);
}

export async function hydrateScenariosFromRemote(): Promise<boolean> {
  const remote = await pullBlob<Scenario[]>(BLOB_KEY);
  if (!remote || !Array.isArray(remote)) return false;
  writeAll(remote);
  emit();
  return true;
}

function genId(): string {
  return `sc_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export function addScenario(s: Omit<Scenario, "id" | "createdAt">): Scenario {
  const scenario: Scenario = {
    ...s,
    id: genId(),
    createdAt: new Date().toISOString(),
  };
  const all = readAll();
  all.push(scenario);
  writeAll(all);
  emit();
  return scenario;
}

export function updateScenario(id: string, patch: Partial<Scenario>): void {
  const all = readAll();
  const idx = all.findIndex((s) => s.id === id);
  if (idx === -1) return;
  all[idx] = { ...all[idx], ...patch, id: all[idx].id };
  writeAll(all);
  emit();
}

export function deleteScenario(id: string): void {
  const all = readAll().filter((s) => s.id !== id);
  writeAll(all);
  emit();
}
