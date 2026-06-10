"use client";

import { useState, useEffect, useRef } from "react";
import { createClient } from "@/lib/supabase/client";

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
  const [results, setResults] = useState<{ name: string }[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);
  
  // Create client once per component
  const supabase = createClient();

  // Sync external value changes
  useEffect(() => {
    setQuery(value || "");
  }, [value]);

  useEffect(() => {
    const fetchCities = async () => {
      // Don't search if query matches exactly the selected value
      if (!query || query === value) {
        setResults([]);
        return;
      }
      
      setLoading(true);
      const { data, error } = await supabase
        .from("israel_cities")
        .select("name")
        .ilike("name", `${query}%`)
        .limit(10);
        
      if (!error && data) {
        setResults(data);
      }
      setLoading(false);
    };
    
    const timeout = setTimeout(fetchCities, 300);
    return () => clearTimeout(timeout);
  }, [query, value, supabase]);

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

  const handleAddNewCity = async () => {
    setLoading(true);
    // Add to DB
    const { error } = await supabase.from("israel_cities").insert({ name: query });
    setLoading(false);
    
    // Even if it errors (e.g. duplicate constraint or network), we let the user continue
    onChange(query);
    setOpen(false);
  };

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
          {loading ? (
            <div className="p-3 text-center text-[11px] text-gray-500">מחפש...</div>
          ) : results.length > 0 ? (
            <ul className="max-h-48 overflow-y-auto py-1">
              {results.map((cityName) => (
                <li
                  key={cityName.name}
                  className="cursor-pointer px-3 py-2 text-[12px] hover:bg-gray-50"
                  onClick={() => {
                    onChange(cityName.name);
                    setQuery(cityName.name);
                    setOpen(false);
                  }}
                >
                  {cityName.name}
                </li>
              ))}
            </ul>
          ) : (
            <div className="p-3 text-center">
              <div className="mb-2 text-[11px] text-gray-500">העיר לא נמצאה ברשימה</div>
              <button
                type="button"
                disabled={loading}
                onClick={handleAddNewCity}
                className="w-full rounded-md bg-verdant-emerald px-3 py-2 text-[11px] font-bold text-white transition-colors hover:bg-emerald-700 disabled:opacity-50"
              >
                {loading ? "מוסיף..." : "הוסף כעיר חדשה"}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
