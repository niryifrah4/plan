"use client";

/**
 * Client import / export / delete helpers.
 * All localStorage access is SSR-guarded. Strings are in Hebrew.
 */

import {
  CLIENTS_REGISTRY_KEY,
  CURRENT_HH_KEY,
  dispatchAllRefreshEvents,
  getActiveClientId,
  setActiveClientId,
} from "@/lib/client-scope";
import type { LocalClient } from "@/lib/client-context";

export interface ClientExportPayload {
  version: 1;
  exportedAt: string;
  client: LocalClient;
  data: Record<string, unknown>;
}

export interface FullBackupPayload {
  version: 1;
  exportedAt: string;
  clients: ClientExportPayload[];
}

/* ───── internal helpers ───── */

function loadRegistry(): LocalClient[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(CLIENTS_REGISTRY_KEY);
    const arr = raw ? (JSON.parse(raw) as LocalClient[]) : [];
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

function saveRegistry(list: LocalClient[]): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(CLIENTS_REGISTRY_KEY, JSON.stringify(list));
  } catch {}
}

function clientPrefix(id: number): string {
  return `verdant:c:${id}:`;
}

function scanClientKeys(id: number): string[] {
  if (typeof window === "undefined") return [];
  const prefix = clientPrefix(id);
  const keys: string[] = [];
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith(prefix)) keys.push(k);
    }
  } catch {}
  return keys;
}

function collectClientData(id: number): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (typeof window === "undefined") return out;
  const prefix = clientPrefix(id);
  const keys = scanClientKeys(id);
  for (const fullKey of keys) {
    const subKey = fullKey.slice(prefix.length);
    try {
      const raw = localStorage.getItem(fullKey);
      if (raw == null) continue;
      try {
        out[subKey] = JSON.parse(raw);
      } catch {
        out[subKey] = raw;
      }
    } catch {}
  }
  return out;
}

function writeClientData(id: number, data: Record<string, unknown>): void {
  if (typeof window === "undefined") return;
  const prefix = clientPrefix(id);
  for (const [subKey, value] of Object.entries(data)) {
    try {
      const raw = typeof value === "string" ? value : JSON.stringify(value);
      localStorage.setItem(prefix + subKey, raw);
    } catch {}
  }
}

function deleteClientData(id: number): void {
  if (typeof window === "undefined") return;
  const keys = scanClientKeys(id);
  for (const k of keys) {
    try {
      localStorage.removeItem(k);
    } catch {}
  }
}

function slugifyFamily(family: string): string {
  return (family || "client")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/[^\p{L}\p{N}\-_]/gu, "");
}

function todayStamp(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function nowISO(): string {
  return new Date().toISOString();
}

function nextClientId(list: LocalClient[]): number {
  return list.reduce((max, c) => Math.max(max, c.id || 0), 0) + 1;
}

function ensureUniqueFamily(list: LocalClient[], family: string): string {
  const exists = list.some((c) => c.family === family);
  if (!exists) return family;
  let name = `${family} (מיובא)`;
  let i = 2;
  while (list.some((c) => c.family === name)) {
    name = `${family} (מיובא ${i})`;
    i++;
  }
  return name;
}

/* ───── public API ───── */

export function exportClient(clientId: number): ClientExportPayload {
  if (typeof window === "undefined") {
    throw new Error("ייצוא זמין רק בדפדפן");
  }
  const list = loadRegistry();
  const client = list.find((c) => c.id === clientId);
  if (!client) throw new Error("לקוח לא נמצא במערכת");
  return {
    version: 1,
    exportedAt: nowISO(),
    client,
    data: collectClientData(clientId),
  };
}

export function downloadClientAsJSON(clientId: number): void {
  if (typeof window === "undefined") return;
  const payload = exportClient(clientId);
  const blob = new Blob([JSON.stringify(payload, null, 2)], {
    type: "application/json;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `verdant-${slugifyFamily(payload.client.family)}-${todayStamp()}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

export function importClientFromJSON(
  payload: ClientExportPayload,
  mode: "new" | "overwrite",
): LocalClient {
  if (typeof window === "undefined") {
    throw new Error("ייבוא זמין רק בדפדפן");
  }
  if (!payload || typeof payload !== "object") {
    throw new Error("קובץ לא תקין");
  }
  if (payload.version !== 1) {
    throw new Error("גרסת קובץ לא נתמכת");
  }
  if (!payload.client || typeof payload.client !== "object") {
    throw new Error("חסר מידע לקוח בקובץ");
  }
  if (!payload.data || typeof payload.data !== "object") {
    throw new Error("חסרים נתוני לקוח בקובץ");
  }

  const list = loadRegistry();
  let targetId: number;
  let finalClient: LocalClient;

  if (mode === "new") {
    targetId = nextClientId(list);
    const uniqueFamily = ensureUniqueFamily(list, payload.client.family);
    finalClient = { ...payload.client, id: targetId, family: uniqueFamily };
    saveRegistry([...list, finalClient]);
    writeClientData(targetId, payload.data);
  } else {
    // overwrite
    const existingIdx = list.findIndex((c) => c.id === payload.client.id);
    if (existingIdx >= 0) {
      targetId = payload.client.id;
      finalClient = { ...payload.client };
      const updated = [...list];
      updated[existingIdx] = finalClient;
      saveRegistry(updated);
      deleteClientData(targetId);
      writeClientData(targetId, payload.data);
    } else {
      targetId = nextClientId(list);
      finalClient = { ...payload.client, id: targetId };
      saveRegistry([...list, finalClient]);
      writeClientData(targetId, payload.data);
    }
  }

  setActiveClientId(targetId);
  return finalClient;
}

export function deleteClient(id: number): void {
  if (typeof window === "undefined") return;
  const list = loadRegistry();
  const remaining = list.filter((c) => c.id !== id);
  saveRegistry(remaining);
  deleteClientData(id);

  const wasActive = getActiveClientId() === id;
  if (wasActive) {
    if (remaining.length > 0) {
      setActiveClientId(remaining[0].id);
      return;
    }
    // create a fresh default "ראשון" client
    const fresh: LocalClient = {
      id: 1,
      family: "ראשון",
      step: 1,
      totalSteps: 3,
      netWorth: 0,
      trend: "+0%",
      members: 1,
      joined: todayStamp(),
      docsUploaded: 0,
      docsTotal: 0,
      monthlyRevenue: 0,
      riskProfile: "מאוזן",
    };
    saveRegistry([fresh]);
    try {
      localStorage.setItem(CURRENT_HH_KEY, String(fresh.id));
    } catch {}
    setActiveClientId(fresh.id);
    return;
  }

  dispatchAllRefreshEvents();
}

export function exportAllClients(): FullBackupPayload {
  if (typeof window === "undefined") {
    throw new Error("ייצוא זמין רק בדפדפן");
  }
  const list = loadRegistry();
  const clients: ClientExportPayload[] = list.map((c) => ({
    version: 1,
    exportedAt: nowISO(),
    client: c,
    data: collectClientData(c.id),
  }));
  return {
    version: 1,
    exportedAt: nowISO(),
    clients,
  };
}

export function downloadAllClientsAsJSON(): void {
  if (typeof window === "undefined") return;
  const payload = exportAllClients();
  const blob = new Blob([JSON.stringify(payload, null, 2)], {
    type: "application/json;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `verdant-backup-${todayStamp()}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
