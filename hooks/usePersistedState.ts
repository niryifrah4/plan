"use client";

import { useState, useEffect, useCallback, useRef } from "react";

/**
 * useState that automatically persists to localStorage.
 * Survives page refresh. Debounced writes (default 500ms).
 *
 * @param key   - unique localStorage key (e.g. "verdant:leads")
 * @param initial - default value when nothing is stored
 * @param debounceMs - write delay in ms (default 500)
 */
export function usePersistedState<T>(
  key: string,
  initial: T,
  debounceMs = 500,
): [T, React.Dispatch<React.SetStateAction<T>>, boolean] {
  // Lazy init from localStorage
  const [value, setValue] = useState<T>(() => {
    if (typeof window === "undefined") return initial;
    try {
      const stored = localStorage.getItem(key);
      return stored ? (JSON.parse(stored) as T) : initial;
    } catch {
      return initial;
    }
  });

  const [saving, setSaving] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isFirstRender = useRef(true);

  // Debounced write to localStorage
  useEffect(() => {
    // Skip first render (initial load from localStorage)
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }

    setSaving(true);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      try {
        localStorage.setItem(key, JSON.stringify(value));
      } catch (e) {
        console.warn("[usePersistedState] localStorage write failed:", e);
      }
      setSaving(false);
    }, debounceMs);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [value, key, debounceMs]);

  return [value, setValue, saving];
}
