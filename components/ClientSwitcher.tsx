"use client";

/**
 * ClientSwitcher — Compact dropdown at the top of every client page.
 * Lists all local clients from verdant:clients and switches active one
 * via setActiveClientId(), which dispatches all refresh events so every
 * store rehydrates from the new per-client namespace.
 *
 * Also supports: per-row export (download JSON) + delete (double confirm),
 * footer actions for "גיבוי הכל" and "ייבא לקוח מקובץ".
 */

import { useEffect, useMemo, useRef, useState } from "react";
import {
  ACTIVE_CLIENT_CHANGED,
  CLIENTS_REGISTRY_KEY,
  CURRENT_HH_KEY,
  getActiveClientId,
  setActiveClientId,
} from "@/lib/client-scope";
import {
  deleteClient,
  downloadAllClientsAsJSON,
  downloadClientAsJSON,
  importClientFromJSON,
  type ClientExportPayload,
} from "@/lib/client-io";
import type { LocalClient } from "@/lib/client-context";

function loadClients(): LocalClient[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(CLIENTS_REGISTRY_KEY);
    const arr = raw ? (JSON.parse(raw) as LocalClient[]) : [];
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

function saveClients(list: LocalClient[]) {
  try {
    localStorage.setItem(CLIENTS_REGISTRY_KEY, JSON.stringify(list));
  } catch {}
}

function todayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function ClientSwitcher() {
  const [clients, setClients] = useState<LocalClient[]>([]);
  const [activeId, setActiveIdState] = useState<number | null>(null);
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // delete-confirm modal state
  const [pendingDelete, setPendingDelete] = useState<LocalClient | null>(null);
  const [confirmText, setConfirmText] = useState("");

  // Hydrate on mount and re-sync on any active-client change
  useEffect(() => {
    const sync = () => {
      setClients(loadClients());
      setActiveIdState(getActiveClientId());
    };
    sync();
    window.addEventListener(ACTIVE_CLIENT_CHANGED, sync);
    const onStorage = (e: StorageEvent) => {
      if (e.key === CLIENTS_REGISTRY_KEY || e.key === CURRENT_HH_KEY) sync();
    };
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener(ACTIVE_CLIENT_CHANGED, sync);
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  // Click-outside
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!wrapRef.current) return;
      if (!wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const active = useMemo(() => clients.find((c) => c.id === activeId) ?? null, [clients, activeId]);

  function handleSelect(id: number) {
    setOpen(false);
    if (id === activeId) return;
    setActiveClientId(id);
  }

  function handleCreate() {
    const name = window.prompt("שם משפחה של הלקוח החדש:");
    if (!name || !name.trim()) return;
    const list = loadClients();
    const nextId = list.reduce((max, c) => Math.max(max, c.id || 0), 0) + 1;
    const fresh: LocalClient = {
      id: nextId,
      family: name.trim(),
      step: 1,
      totalSteps: 3,
      netWorth: 0,
      trend: "+0%",
      members: 1,
      joined: todayISO(),
      docsUploaded: 0,
      docsTotal: 0,
      monthlyRevenue: 0,
      riskProfile: "מאוזן",
    };
    const updated = [...list, fresh];
    saveClients(updated);
    setClients(updated);
    setOpen(false);
    setActiveClientId(nextId);
  }

  function handleExportRow(e: React.MouseEvent, id: number) {
    e.stopPropagation();
    try {
      downloadClientAsJSON(id);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "שגיאה בייצוא";
      window.alert(`שגיאה: ${msg}`);
    }
  }

  function handleDeleteRow(e: React.MouseEvent, c: LocalClient) {
    e.stopPropagation();
    setPendingDelete(c);
    setConfirmText("");
  }

  function handleConfirmDelete() {
    if (!pendingDelete) return;
    if (confirmText.trim() !== pendingDelete.family.trim()) return;
    try {
      deleteClient(pendingDelete.id);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "שגיאה במחיקה";
      window.alert(`שגיאה: ${msg}`);
    } finally {
      setPendingDelete(null);
      setConfirmText("");
      setClients(loadClients());
      setActiveIdState(getActiveClientId());
    }
  }

  function handleCancelDelete() {
    setPendingDelete(null);
    setConfirmText("");
  }

  function handleBackupAll() {
    try {
      downloadAllClientsAsJSON();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "שגיאה בגיבוי";
      window.alert(`שגיאה: ${msg}`);
    }
  }

  function handleImportClick() {
    fileInputRef.current?.click();
  }

  function handleImportChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    // clear the input so selecting the same file again re-triggers change
    if (fileInputRef.current) fileInputRef.current.value = "";
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const text = String(reader.result ?? "");
        const parsed = JSON.parse(text) as ClientExportPayload;
        const created = importClientFromJSON(parsed, "new");
        setClients(loadClients());
        setActiveIdState(getActiveClientId());
        setOpen(false);
        window.alert(`הלקוח "${created.family}" יובא בהצלחה`);
      } catch (err) {
        const msg = err instanceof Error ? err.message : "קובץ לא תקין";
        window.alert(`שגיאה בייבוא: ${msg}`);
      }
    };
    reader.onerror = () => window.alert("לא ניתן לקרוא את הקובץ");
    reader.readAsText(file);
  }

  const label = active ? active.family : "בחר לקוח";
  const canConfirmDelete = !!pendingDelete && confirmText.trim() === pendingDelete.family.trim();

  return (
    <div
      ref={wrapRef}
      className="relative"
      dir="rtl"
      style={{ fontFamily: "'Assistant', sans-serif" }}
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 rounded-full border px-4 py-2 transition"
        style={{
          background: "#ffffff",
          borderColor: "#eef2e8",
          color: "#012d1d",
          boxShadow: "0 1px 2px rgba(1,45,29,0.04)",
        }}
      >
        <span
          className="material-symbols-outlined"
          style={{ fontSize: 18, color: "#1B4332" }}
          aria-hidden
        >
          group
        </span>
        <span className="text-sm font-medium">{label}</span>
        <span
          className="material-symbols-outlined"
          style={{ fontSize: 18, color: "#1B4332" }}
          aria-hidden
        >
          {open ? "expand_less" : "expand_more"}
        </span>
      </button>

      {open && (
        <div
          className="absolute left-0 z-50 mt-2 min-w-[280px] overflow-hidden rounded-xl border"
          style={{
            background: "#ffffff",
            borderColor: "#eef2e8",
            boxShadow: "0 10px 30px rgba(1,45,29,0.12)",
          }}
          role="listbox"
        >
          <div className="max-h-[260px] overflow-y-auto py-1">
            {clients.length === 0 && (
              <div className="px-4 py-3 text-sm" style={{ color: "#6b7a70" }}>
                אין לקוחות עדיין
              </div>
            )}
            {clients.map((c) => {
              const isActive = c.id === activeId;
              return (
                <div
                  key={c.id}
                  className="group flex items-center gap-1 px-2 py-1 transition"
                  style={{
                    background: isActive ? "#eef2e8" : "transparent",
                  }}
                >
                  {/* row actions (appear on the LEFT in RTL → opposite of name) */}
                  <button
                    type="button"
                    onClick={(e) => handleDeleteRow(e, c)}
                    className="rounded-md p-1 transition"
                    style={{ color: "#b91c1c", opacity: 0.55 }}
                    title="מחיקה"
                    aria-label={`מחק את משפחת ${c.family}`}
                  >
                    <span
                      className="material-symbols-outlined"
                      style={{ fontSize: 16 }}
                      aria-hidden
                    >
                      delete
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={(e) => handleExportRow(e, c.id)}
                    className="rounded-md p-1 transition"
                    style={{ color: "#6b7a70", opacity: 0.7 }}
                    title="ייצוא JSON"
                    aria-label={`ייצוא משפחת ${c.family}`}
                  >
                    <span
                      className="material-symbols-outlined"
                      style={{ fontSize: 16 }}
                      aria-hidden
                    >
                      download
                    </span>
                  </button>

                  {/* name / select */}
                  <button
                    type="button"
                    onClick={() => handleSelect(c.id)}
                    className="flex flex-1 items-center justify-between gap-2 rounded-md px-2 py-1 text-right transition"
                    style={{ color: "#012d1d" }}
                    role="option"
                    aria-selected={isActive}
                  >
                    <span className="truncate text-sm font-medium">משפחת {c.family}</span>
                    {isActive && (
                      <span
                        className="material-symbols-outlined"
                        style={{ fontSize: 18, color: "#1B4332" }}
                        aria-hidden
                      >
                        check
                      </span>
                    )}
                  </button>
                </div>
              );
            })}
          </div>
          <div style={{ borderTop: "1px solid #eef2e8" }}>
            <button
              type="button"
              onClick={handleCreate}
              className="flex w-full items-center gap-2 px-4 py-2 text-right transition"
              style={{ color: "#1B4332" }}
            >
              <span className="material-symbols-outlined" style={{ fontSize: 18 }} aria-hidden>
                add
              </span>
              <span className="text-sm font-medium">לקוח חדש</span>
            </button>
            <button
              type="button"
              onClick={handleBackupAll}
              className="flex w-full items-center gap-2 px-4 py-2 text-right transition"
              style={{ color: "#012d1d" }}
              title="גיבוי של כל הלקוחות לקובץ אחד"
            >
              <span
                className="material-symbols-outlined"
                style={{ fontSize: 18, color: "#1B4332" }}
                aria-hidden
              >
                save
              </span>
              <span className="text-sm font-medium">גיבוי הכל</span>
            </button>
            <button
              type="button"
              onClick={handleImportClick}
              className="flex w-full items-center gap-2 px-4 py-2 text-right transition"
              style={{ color: "#012d1d" }}
            >
              <span
                className="material-symbols-outlined"
                style={{ fontSize: 18, color: "#1B4332" }}
                aria-hidden
              >
                upload_file
              </span>
              <span className="text-sm font-medium">ייבא לקוח מקובץ</span>
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".json,application/json"
              onChange={handleImportChange}
              style={{ display: "none" }}
            />
          </div>
        </div>
      )}

      {/* delete-confirm modal */}
      {pendingDelete && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center"
          style={{
            background: "rgba(1,45,29,0.4)",
            backdropFilter: "blur(4px)",
            WebkitBackdropFilter: "blur(4px)",
          }}
          onClick={handleCancelDelete}
          dir="rtl"
        >
          <div
            className="w-[90%] max-w-[420px] rounded-organic border p-6 shadow-soft"
            style={{
              background: "#ffffff",
              borderColor: "#eef2e8",
              fontFamily: "'Assistant', sans-serif",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex items-center gap-2">
              <span
                className="material-symbols-outlined"
                style={{ fontSize: 22, color: "#b91c1c" }}
                aria-hidden
              >
                warning
              </span>
              <h3 className="text-base font-bold" style={{ color: "#012d1d" }}>
                מחיקת לקוח — לא ניתן לשחזר
              </h3>
            </div>
            <p className="mb-4 text-sm leading-relaxed" style={{ color: "#374151" }}>
              כל הנתונים של{" "}
              <span className="font-bold" style={{ color: "#b91c1c" }}>
                משפחת {pendingDelete.family}
              </span>{" "}
              יימחקו לצמיתות מהמחשב שלך.
            </p>
            <label className="mb-1 block text-xs" style={{ color: "#6b7a70" }}>
              הקלד את שם המשפחה כדי לאשר:
            </label>
            <input
              type="text"
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              placeholder={pendingDelete.family}
              autoFocus
              className="mb-4 w-full rounded-lg border px-3 py-2 text-sm outline-none"
              style={{
                borderColor: "#eef2e8",
                background: "#ffffff",
                color: "#012d1d",
                fontFamily: "'Assistant', sans-serif",
              }}
            />
            <div className="flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={handleCancelDelete}
                className="btn-botanical-ghost text-sm"
              >
                ביטול
              </button>
              <button
                type="button"
                onClick={handleConfirmDelete}
                disabled={!canConfirmDelete}
                className="rounded-lg px-4 py-2 text-sm font-bold transition"
                style={{
                  background: canConfirmDelete ? "#b91c1c" : "#e5e7eb",
                  color: canConfirmDelete ? "#ffffff" : "#9ca3af",
                  cursor: canConfirmDelete ? "pointer" : "not-allowed",
                }}
              >
                מחק לצמיתות
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
