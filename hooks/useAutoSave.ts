"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { getSupabaseBrowser } from "@/lib/supabase/browser";

type SaveStatus = "idle" | "saving" | "saved" | "error";

interface AutoSaveOptions {
  /** Supabase table name */
  table: string;
  /** Primary key field */
  idField?: string;
  /** Debounce delay in ms */
  debounceMs?: number;
}

/**
 * Hook that auto-saves a record to Supabase with debounce.
 * Falls back to localStorage if Supabase is not configured.
 *
 * Returns [status, triggerSave] where:
 * - status: "idle" | "saving" | "saved" | "error"
 * - triggerSave(data): manually trigger a save
 */
export function useAutoSave({ table, idField = "id", debounceMs = 1500 }: AutoSaveOptions) {
  const [status, setStatus] = useState<SaveStatus>("idle");
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latestData = useRef<Record<string, unknown> | null>(null);

  const save = useCallback(
    async (data: Record<string, unknown>) => {
      const supabase = getSupabaseBrowser();

      // If Supabase is configured, do upsert
      if (supabase) {
        setStatus("saving");
        try {
          const { error } = await supabase
            .from(table)
            .upsert(data, { onConflict: idField });
          if (error) throw error;
          setStatus("saved");
        } catch (e) {
          console.error(`[useAutoSave] ${table} save failed:`, e);
          setStatus("error");
          // Fallback: save to localStorage
          try {
            const key = `verdant:${table}:${data[idField] ?? "draft"}`;
            localStorage.setItem(key, JSON.stringify(data));
          } catch {}
        }
      } else {
        // No Supabase — use localStorage
        setStatus("saving");
        try {
          const key = `verdant:${table}:${data[idField] ?? "draft"}`;
          localStorage.setItem(key, JSON.stringify(data));
          setStatus("saved");
        } catch {
          setStatus("error");
        }
      }

      // Reset to idle after 2s
      setTimeout(() => setStatus("idle"), 2000);
    },
    [table, idField],
  );

  const triggerSave = useCallback(
    (data: Record<string, unknown>) => {
      latestData.current = data;
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        if (latestData.current) save(latestData.current);
      }, debounceMs);
    },
    [save, debounceMs],
  );

  // Cleanup
  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  return { status, triggerSave, saveNow: save } as const;
}
