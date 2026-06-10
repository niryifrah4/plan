"use client";

import { useState, useEffect, useRef, useMemo } from "react";
import rawCities from "@/lib/israel-cities.json";

// The first item is a header row, so we slice it off.
// We also map and clean the names if needed.
const CITIES = rawCities.slice(1).map((c: any) => c.name);

export function CityAutocomplete({
  value,
  onChange,
  label = "עיר",
}: {
  value: string;
  onChange: (val: string) => void;
  label?: string;
}) {
  const [query, setQuery] = useState(value || "");
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  // Sync external value changes
  useEffect(() => {
    setQuery(value || "");
  }, [value]);

  // Compute results synchronously
  const results = useMemo(() => {
    if (!query || query === value) return [];
    const lowerQuery = query.toLowerCase();
    return CITIES.filter((city) => city.toLowerCase().startsWith(lowerQuery)).slice(0, 10);
  }, [query, value]);

  // click outside to close
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <div className="relative" ref={wrapperRef}>
      <label className="mb-1 block text-[10px] font-bold text-verdant-muted">{label}</label>
      <input
        type="text"
        className="inp w-full"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
          // If the input becomes empty, clear the parent state too
          if (e.target.value === "") {
            onChange("");
          }
        }}
        onFocus={() => setOpen(true)}
        placeholder="חפש עיר..."
        dir="rtl"
      />
      {open && query && query !== value && (
        <div className="absolute z-10 mt-1 w-full rounded-md border border-gray-200 bg-white shadow-lg">
          {results.length > 0 ? (
            <ul className="max-h-48 overflow-y-auto py-1">
              {results.map((cityName) => (
                <li
                  key={cityName}
                  className="cursor-pointer px-3 py-2 text-[12px] hover:bg-gray-50"
                  onClick={() => {
                    onChange(cityName);
                    setQuery(cityName);
                    setOpen(false);
                  }}
                >
                  {cityName}
                </li>
              ))}
            </ul>
          ) : (
            <div className="p-3 text-center">
              <div className="mb-2 text-[11px] text-gray-500">העיר לא נמצאה ברשימה</div>
              <button
                type="button"
                onClick={() => {
                  onChange(query);
                  setOpen(false);
                }}
                className="w-full rounded-md bg-verdant-emerald px-3 py-2 text-[11px] font-bold text-white transition-colors hover:bg-emerald-700"
              >
                הוסף כעיר חדשה
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
