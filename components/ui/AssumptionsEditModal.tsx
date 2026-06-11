"use client";

import { useState } from "react";

interface Props {
  initialCurrentAge: number;
  initialRetirementAge: number;
  initialMonthlyInvestment: number;
  initialRetireIncome: number;
  onSave: (data: {
    currentAge: number;
    retirementAge: number;
    monthlyInvestment: number;
    retireIncome: number;
  }) => void;
  onClose: () => void;
}

export function AssumptionsEditModal({
  initialCurrentAge,
  initialRetirementAge,
  initialMonthlyInvestment,
  initialRetireIncome,
  onSave,
  onClose,
}: Props) {
  const [currentAge, setCurrentAge] = useState(String(initialCurrentAge || ""));
  const [retirementAge, setRetirementAge] = useState(String(initialRetirementAge || ""));
  const [monthlyInvestment, setMonthlyInvestment] = useState(String(initialMonthlyInvestment || ""));
  const [retireIncome, setRetireIncome] = useState(String(initialRetireIncome || ""));

  const handleSubmit = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    onSave({
      currentAge: Number(currentAge.replace(/,/g, "")) || 0,
      retirementAge: Number(retirementAge.replace(/,/g, "")) || 0,
      monthlyInvestment: Number(monthlyInvestment.replace(/,/g, "")) || 0,
      retireIncome: Number(retireIncome.replace(/,/g, "")) || 0,
    });
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
      <div
        className="w-full max-w-md rounded-2xl bg-[#FFFFFF] p-6 shadow-xl mx-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-6 flex items-center justify-between">
          <h3 className="text-lg font-extrabold text-[#1A1A1A]">עריכת נתונים (משפיע על הגרף)</h3>
          <button
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-full bg-[#FAFAF7] text-[#6B7280] transition-colors hover:bg-[#E5E7EB] hover:text-[#1A1A1A]"
          >
            <span className="material-symbols-outlined text-[18px]">close</span>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="mb-1.5 block text-sm font-bold text-verdant-ink">גיל נוכחי</label>
            <input
              type="text"
              inputMode="numeric"
              value={currentAge}
              onChange={(e) => setCurrentAge(e.target.value.replace(/[^\d]/g, ""))}
              className="w-full rounded-xl border border-gray-200 bg-[#FAFAF7] p-3 text-right font-medium text-[#1A1A1A] outline-none transition-colors focus:border-[#2C7A5A] focus:bg-[#FFFFFF]"
              placeholder="0"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-bold text-verdant-ink">גיל פרישה רצוי</label>
            <input
              type="text"
              inputMode="numeric"
              value={retirementAge}
              onChange={(e) => setRetirementAge(e.target.value.replace(/[^\d]/g, ""))}
              className="w-full rounded-xl border border-gray-200 bg-[#FAFAF7] p-3 text-right font-medium text-[#1A1A1A] outline-none transition-colors focus:border-[#2C7A5A] focus:bg-[#FFFFFF]"
              placeholder="0"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-bold text-verdant-ink">
              הפקדות חודשיות לחיסכון והשקעה (₪)
            </label>
            <input
              type="text"
              inputMode="numeric"
              value={monthlyInvestment}
              onChange={(e) => setMonthlyInvestment(e.target.value.replace(/[^\d]/g, ""))}
              className="w-full rounded-xl border border-gray-200 bg-[#FAFAF7] p-3 text-right font-medium text-[#1A1A1A] outline-none transition-colors focus:border-[#2C7A5A] focus:bg-[#FFFFFF]"
              placeholder="0"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-bold text-verdant-ink">
              הכנסה חודשית יעד בפרישה (₪)
            </label>
            <input
              type="text"
              inputMode="numeric"
              value={retireIncome}
              onChange={(e) => setRetireIncome(e.target.value.replace(/[^\d]/g, ""))}
              className="w-full rounded-xl border border-gray-200 bg-[#FAFAF7] p-3 text-right font-medium text-[#1A1A1A] outline-none transition-colors focus:border-[#2C7A5A] focus:bg-[#FFFFFF]"
              placeholder="0"
            />
          </div>

          <div className="pt-4">
            <button
              type="submit"
              className="w-full rounded-xl bg-[#2C7A5A] py-3 text-sm font-bold text-white transition-opacity hover:opacity-90"
            >
              שמור נתונים
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
