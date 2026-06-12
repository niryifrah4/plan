import React, { useState, useEffect } from "react";
import type { MortgageData } from "@/lib/debt-store";

interface Props {
  mortgage: MortgageData;
  onClose: () => void;
  onSave: (bank: string, balance: number, monthly: number) => void;
}

export function MortgageShellModal({ mortgage, onClose, onSave }: Props) {
  const [bank, setBank] = useState(mortgage.bank || "");
  const m_tracks = mortgage.tracks || [];
  const m_balance = m_tracks.reduce((s, t) => s + (t.remainingBalance || 0), 0);
  const m_monthly = m_tracks.reduce((s, t) => s + (t.monthlyPayment || 0), 0);
  
  const [balance, setBalance] = useState(m_balance.toString());
  const [monthly, setMonthly] = useState(m_monthly.toString());

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  return (
    <div 
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 p-4" 
      dir="rtl"
      onClick={onClose}
    >
      <div 
        className="w-full max-w-sm rounded-2xl bg-[#FFFFFF] p-5 shadow-2xl" 
        style={{ border: "1px solid #E5E7EB" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-5 flex items-center gap-2 text-[#0F6E56]">
          <span className="material-symbols-outlined text-[20px]">edit_document</span>
          <h2 className="text-base font-extrabold text-[#1A1A1A]">עריכת שלד משכנתא</h2>
        </div>
        
        <p className="mb-4 text-[12px] leading-relaxed text-[#6B7280]">
          עריכת הנתונים כאן תעדכן גם את קובץ שאלון האפיון (Onboarding). כדי לדייק ברמת המסלולים, מומלץ להעלות דוח סילוקין.
        </p>
        
        <div className="mb-4">
          <label className="mb-1.5 block text-[12px] font-bold text-[#6B7280]">שם הבנק / גוף מלווה</label>
          <input 
            type="text" 
            className="w-full rounded-xl border border-[#E5E7EB] bg-[#FAFAF7] p-2.5 text-[14px] outline-none transition-colors focus:border-[#0F6E56] focus:bg-white"
            value={bank}
            onChange={(e) => setBank(e.target.value)}
            placeholder="למשל: מזרחי טפחות"
          />
        </div>

        <div className="mb-4">
          <label className="mb-1.5 block text-[12px] font-bold text-[#6B7280]">יתרה כוללת (₪)</label>
          <input 
            type="number" 
            className="w-full rounded-xl border border-[#E5E7EB] bg-[#FAFAF7] p-2.5 text-[14px] outline-none transition-colors focus:border-[#0F6E56] focus:bg-white"
            value={balance}
            onChange={(e) => setBalance(e.target.value)}
            dir="ltr"
            placeholder="0"
          />
        </div>

        <div className="mb-6">
          <label className="mb-1.5 block text-[12px] font-bold text-[#6B7280]">החזר חודשי (₪)</label>
          <input 
            type="number" 
            className="w-full rounded-xl border border-[#E5E7EB] bg-[#FAFAF7] p-2.5 text-[14px] outline-none transition-colors focus:border-[#0F6E56] focus:bg-white"
            value={monthly}
            onChange={(e) => setMonthly(e.target.value)}
            dir="ltr"
            placeholder="0"
          />
        </div>

        <div className="flex gap-3">
          <button 
            onClick={() => onSave(bank, parseFloat(balance) || 0, parseFloat(monthly) || 0)}
            className="flex-1 rounded-xl bg-[#0F6E56] py-2.5 text-[13px] font-bold text-white transition-colors hover:bg-[#0A4D3C]"
          >
            שמור נתונים
          </button>
          <button 
            onClick={onClose}
            className="flex-1 rounded-xl border border-[#E5E7EB] bg-[#FFFFFF] py-2.5 text-[13px] font-bold text-[#1A1A1A] transition-colors hover:bg-[#F3F4F6]"
          >
            ביטול
          </button>
        </div>
      </div>
    </div>
  );
}
