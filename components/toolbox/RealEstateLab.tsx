"use client";

import { useState } from "react";
import { AffordabilityCalc } from "./AffordabilityCalc";
import { InvestmentPropertyCalc } from "./InvestmentPropertyCalc";
import { RealEstateCalc } from "./RealEstateCalc";
import { MortgageCalc } from "./MortgageCalc";

const SUB_TABS = [
  { id: "affordability", label: "יכולת רכישה", icon: "real_estate_agent", description: "מחיר דירה מקסימלי לפי הון וכושר החזר" },
  { id: "mortgage",      label: "משכנתא",        icon: "home",              description: "מסלולי הלוואה, החזרים חודשיים וריבית" },
  { id: "second",        label: "דירה שנייה",   icon: "domain_add",        description: "מס רכישה, מימון ותשואה" },
  { id: "advanced",      label: "ניתוח השקעה",  icon: "apartment",         description: "IRR, Equity Multiple ותחזית יציאה" },
];

export function RealEstateLab() {
  const [activeTab, setActiveTab] = useState("affordability");

  return (
    <div style={{ fontFamily: "'Assistant', sans-serif" }}>
      {/* Header */}
      <div className="flex items-center gap-3 mb-8">
        <div className="w-11 h-11 rounded-xl flex items-center justify-center" style={{ background: "linear-gradient(135deg,#012d1d,#0a7a4a)" }}>
          <span className="material-symbols-outlined text-[24px] text-white">home_work</span>
        </div>
        <div>
          <h2 className="text-base font-extrabold text-verdant-ink">מעבדת נדל״ן</h2>
          <p className="text-[11px] text-verdant-muted">יכולת רכישה · משכנתא · דירה שנייה · ניתוח השקעה מתקדם</p>
        </div>
      </div>

      {/* Sub-tabs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-8">
        {SUB_TABS.map(tab => {
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className="rounded-xl p-4 text-right transition-all duration-200"
              style={{
                background: isActive ? "linear-gradient(135deg,#012d1d,#0a7a4a)" : "#fff",
                border: `1.5px solid ${isActive ? "#0a7a4a" : "#d8e0d0"}`,
                color: isActive ? "#fff" : "#012d1d",
              }}
            >
              <div className="flex items-center gap-2 mb-1.5">
                <span className="material-symbols-outlined text-[20px]" style={{ color: isActive ? "#58e1b0" : "#0a7a4a" }}>{tab.icon}</span>
                <span className="text-[12px] font-extrabold">{tab.label}</span>
              </div>
              <div className="text-[10px] font-bold" style={{ opacity: isActive ? 0.7 : 0.5 }}>{tab.description}</div>
            </button>
          );
        })}
      </div>

      {/* Active content */}
      <div>
        {activeTab === "affordability" && <AffordabilityCalc />}
        {activeTab === "mortgage" && <MortgageCalc />}
        {activeTab === "second" && <InvestmentPropertyCalc />}
        {activeTab === "advanced" && <RealEstateCalc />}
      </div>
    </div>
  );
}
