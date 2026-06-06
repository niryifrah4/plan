"use client";

import { useState, useEffect, useRef } from "react";

interface Props {
  initialValue: number | string;
  title?: string;
  onSave: (val: number) => void;
  onClose: () => void;
}

export function NumberEditModal({ initialValue, title = "עריכת סכום", onSave, onClose }: Props) {
  const [val, setVal] = useState<number>(Number(initialValue) || 0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    // Focus on mount and highlight text
    if (inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, []);

  const handleAdd = (amount: number) => {
    setVal((prev) => prev + amount);
    if (inputRef.current) {
      inputRef.current.focus();
    }
  };

  const handleSubmit = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    onSave(val);
  };

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-[#1A1A1A]/40 backdrop-blur-sm transition-opacity"
      dir="rtl"
      onClick={onClose}
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

        <form onSubmit={handleSubmit}>
          <div className="mb-6">
            <input
              ref={inputRef}
              type="number"
              value={val === 0 && !inputRef.current?.value ? "" : val}
              onChange={(e) => setVal(Number(e.target.value))}
              className="no-spinners w-full rounded-xl border-2 border-transparent bg-[#FAFAF7] p-4 text-center text-4xl font-extrabold tabular-nums text-[#1A1A1A] outline-none transition-colors focus:border-[#2C7A5A]/30 focus:bg-[#FFFFFF]"
              placeholder="0"
            />
          </div>

          <div className="mb-6 grid grid-cols-3 gap-2">
            <button type="button" onClick={() => handleAdd(100)} className="rounded-lg bg-[#FAFAF7] py-2 text-sm font-bold text-[#2C7A5A] transition-colors hover:bg-[#E5E7EB]">+100</button>
            <button type="button" onClick={() => handleAdd(500)} className="rounded-lg bg-[#FAFAF7] py-2 text-sm font-bold text-[#2C7A5A] transition-colors hover:bg-[#E5E7EB]">+500</button>
            <button type="button" onClick={() => handleAdd(1000)} className="rounded-lg bg-[#FAFAF7] py-2 text-sm font-bold text-[#2C7A5A] transition-colors hover:bg-[#E5E7EB]">+1,000</button>
            <button type="button" onClick={() => handleAdd(-100)} className="rounded-lg bg-[#FAFAF7] py-2 text-sm font-bold text-[#DC2626] transition-colors hover:bg-[#E5E7EB]">-100</button>
            <button type="button" onClick={() => handleAdd(-500)} className="rounded-lg bg-[#FAFAF7] py-2 text-sm font-bold text-[#DC2626] transition-colors hover:bg-[#E5E7EB]">-500</button>
            <button type="button" onClick={() => handleAdd(-1000)} className="rounded-lg bg-[#FAFAF7] py-2 text-sm font-bold text-[#DC2626] transition-colors hover:bg-[#E5E7EB]">-1,000</button>
          </div>

          <button
            type="submit"
            className="w-full rounded-xl bg-[#2C7A5A] py-3 text-sm font-bold text-white transition-opacity hover:opacity-90"
          >
            שמור
          </button>
        </form>
      </div>
    </div>
  );
}
