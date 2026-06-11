"use client";

import { useState, useEffect, useRef } from "react";

interface Props {
  initialValue: number | string;
  title?: string;
  steps?: number[];
  min?: number;
  onSave: (val: number) => void;
  onClose: () => void;
}

export function NumberEditModal({ initialValue, title = "עריכת סכום", steps = [100, 500, 1000], min, onSave, onClose }: Props) {
  const [text, setText] = useState<string>(
    initialValue === undefined || initialValue === null ? "" : String(initialValue)
  );
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    // Focus on mount and highlight text
    if (inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, []);



  const handleAdd = (amount: number) => {
    let current = Number(text.replace(/,/g, "")) || 0;
    current += amount;
    if (min !== undefined && current < min) {
      current = min;
    }
    setText(String(current));
    if (inputRef.current) {
      inputRef.current.focus();
    }
  };

  const handleSubmit = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    let parsed = Number(text.replace(/,/g, ""));
    if (!Number.isFinite(parsed)) parsed = 0;
    if (min !== undefined && parsed < min) parsed = min;
    onSave(parsed);
  };

  const shiftLabel = (amount: number) => {
    const abs = Math.abs(amount).toLocaleString("en-US");
    const sign = amount >= 0 ? "+" : "-";
    return (
      <span dir="ltr" style={{ unicodeBidi: "isolate", display: "inline-block" }}>
        {sign}
        {abs}
      </span>
    );
  };

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-[#1A1A1A]/40 backdrop-blur-sm transition-opacity"
      dir="rtl"
      onClick={onClose}
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.stopPropagation();
          onClose();
        }
      }}
    >
      <style>{`
        .no-spinners::-webkit-outer-spin-button,
        .no-spinners::-webkit-inner-spin-button {
          -webkit-appearance: none;
          margin: 0;
        }
        .no-spinners {
          -moz-appearance: textfield;
        }
      `}</style>
      <div
        className="w-full max-w-sm rounded-2xl bg-[#FFFFFF] p-6 shadow-xl mx-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-6 flex items-center justify-between">
          <h3 className="text-lg font-extrabold text-[#1A1A1A]">{title}</h3>
          <button
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-full bg-[#FAFAF7] text-[#6B7280] transition-colors hover:bg-[#E5E7EB] hover:text-[#1A1A1A]"
          >
            <span className="material-symbols-outlined text-[18px]">close</span>
          </button>
        </div>

        <div
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              handleSubmit();
            }
          }}
        >
          <div className="mb-6">
            <input
              ref={inputRef}
              type="text"
              inputMode="decimal"
              dir="ltr"
              value={text}
              onChange={(e) => {
                const val = e.target.value.replace(/[^\d,.-]/g, "");
                setText(val);
              }}
              className="no-spinners w-full rounded-xl border-2 border-transparent bg-[#FAFAF7] p-4 text-center text-4xl font-extrabold tabular-nums text-[#1A1A1A] outline-none transition-colors focus:border-[#2C7A5A]/30 focus:bg-[#FFFFFF]"
              placeholder="0"
            />
          </div>

          <div className="mb-6 grid grid-cols-3 gap-2">
            {steps.map((amount) => (
              <button key={`plus-${amount}`} type="button" dir="ltr" onClick={() => handleAdd(amount)} className="rounded-lg bg-[#FAFAF7] py-2 text-sm font-bold text-[#2C7A5A] transition-colors hover:bg-[#E5E7EB]">
                {shiftLabel(amount)}
              </button>
            ))}
            {steps.map((amount) => (
              <button key={`minus-${amount}`} type="button" dir="ltr" onClick={() => handleAdd(-amount)} className="rounded-lg bg-[#FAFAF7] py-2 text-sm font-bold text-[#DC2626] transition-colors hover:bg-[#E5E7EB]">
                {shiftLabel(-amount)}
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={() => handleSubmit()}
            className="w-full rounded-xl bg-[#2C7A5A] py-3 text-sm font-bold text-white transition-opacity hover:opacity-90"
          >
            שמור
          </button>
        </div>
      </div>
    </div>
  );
}
