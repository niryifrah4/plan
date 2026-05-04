"use client";

/**
 * SaleSimulator — modal for simulating a property sale.
 * Built 2026-05-02 per Nir.
 *
 * Opens from a "סימולציית מכירה" button on each property card. User picks
 * planned sale date + (optionally) overrides appreciation/fees/rate, sees
 * projected sale price, mortgage balance, tax, and net cash in hand.
 */

import { useMemo, useState } from "react";
import { fmtILS } from "@/lib/format";
import { simulatePropertySale, type SaleSimInputs } from "@/lib/realestate-sale-sim";
import type { Property } from "@/lib/realestate-store";

interface Props {
  property: Property;
  allProperties: Property[];
  onClose: () => void;
}

export function SaleSimulator({ property, allProperties, onClose }: Props) {
  const [yearsToSale, setYearsToSale] = useState(2);
  const [appreciation, setAppreciation] = useState(
    Math.round((property.annualAppreciation ?? 0.03) * 100)
  );
  const [feesPct, setFeesPct] = useState(5);
  const [rate, setRate] = useState(5);

  const inputs: SaleSimInputs = useMemo(
    () => ({
      yearsToSale,
      annualAppreciationOverride: appreciation / 100,
      sellingFeesPct: feesPct / 100,
      mortgageRateOverride: rate / 100,
    }),
    [yearsToSale, appreciation, feesPct, rate]
  );

  const result = useMemo(
    () => simulatePropertySale(property, allProperties, inputs),
    [property, allProperties, inputs]
  );

  const taxColor =
    result.taxStatus === "exempt"
      ? "#1B4332"
      : result.taxStatus === "exempt_partial"
        ? "#B45309"
        : result.taxStatus === "overlap"
          ? "#B45309"
          : result.taxStatus === "taxable"
            ? "#8B2E2E"
            : "#5a7a6a";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4"
      onClick={onClose}
    >
      <div
        className="max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-2xl bg-white shadow-soft"
        onClick={(e) => e.stopPropagation()}
        dir="rtl"
      >
        {/* Header */}
        <div className="v-divider sticky top-0 z-10 flex items-center justify-between border-b bg-white px-6 py-4">
          <div>
            <div className="text-[10px] font-bold uppercase tracking-[0.15em] text-verdant-muted">
              סימולציית מכירה
            </div>
            <h2 className="text-lg font-extrabold text-verdant-ink">{property.name}</h2>
            <div className="mt-0.5 text-[11px] text-verdant-muted">
              שווי נוכחי: {fmtILS(property.currentValue)}
              {property.mortgageBalance
                ? ` · יתרת משכנתא: ${fmtILS(property.mortgageBalance)}`
                : ""}
            </div>
          </div>
          <button onClick={onClose} className="rounded-lg p-2 hover:bg-verdant-bg">
            <span className="material-symbols-outlined text-[20px] text-verdant-muted">close</span>
          </button>
        </div>

        {/* Inputs */}
        <div className="grid grid-cols-1 gap-4 px-6 py-5 md:grid-cols-2">
          <SliderField
            label="מתי תמכור"
            value={yearsToSale}
            min={0.25}
            max={20}
            step={0.25}
            unit={yearsToSale === 1 ? "שנה" : "שנים"}
            onChange={setYearsToSale}
          />
          <SliderField
            label="עליית ערך שנתית"
            value={appreciation}
            min={0}
            max={10}
            step={0.5}
            unit="%"
            onChange={setAppreciation}
          />
          <SliderField
            label="עמלות מכירה (תיווך + עו״ד)"
            value={feesPct}
            min={0}
            max={8}
            step={0.5}
            unit="%"
            onChange={setFeesPct}
          />
          <SliderField
            label="ריבית משכנתא נוכחית"
            value={rate}
            min={1}
            max={10}
            step={0.1}
            unit="%"
            onChange={setRate}
          />
        </div>

        {/* Results */}
        <div className="v-divider space-y-3 border-t px-6 py-5" style={{ background: "#F9FAF2" }}>
          {/* The big number */}
          <div
            className="rounded-2xl py-4 text-center"
            style={{
              background: "linear-gradient(135deg, #1B4332 0%, #012D1D 100%)",
              color: "#F9FAF2",
            }}
          >
            <div
              className="text-[11px] font-bold uppercase tracking-[0.18em]"
              style={{ color: "rgba(255,255,255,0.7)" }}
            >
              כסף ביד אחרי המכירה
            </div>
            <div
              className="mt-2 text-[42px] font-extrabold tabular-nums leading-none"
              style={{ fontFamily: "Manrope, Assistant, sans-serif" }}
            >
              {fmtILS(result.netCashProceeds)}
            </div>
            <div className="mt-2 text-[12px]" style={{ color: "rgba(255,255,255,0.85)" }}>
              ב-
              {new Date(result.saleDate).toLocaleDateString("he-IL", {
                month: "long",
                year: "numeric",
              })}
              {result.estimatedROI > 0 && ` · תשואה שנתית ${result.estimatedROI.toFixed(1)}%`}
            </div>
          </div>

          {/* Breakdown */}
          <div className="rounded-xl bg-white p-4" style={{ border: "1px solid #eef2e8" }}>
            <Row label="מחיר מכירה צפוי" value={result.projectedSalePrice} />
            <Row label="עמלות מכירה" value={-result.sellingFees} negative />
            <Row label="יתרת משכנתא לתשלום" value={-result.mortgageBalanceAtSale} negative />
            <Row label={result.taxLabel} value={-result.estimatedTax} negative color={taxColor} />
            <hr className="my-2" style={{ borderColor: "#eef2e8" }} />
            <Row label="נטו ביד" value={result.netCashProceeds} bold />
          </div>

          {/* Context */}
          <div className="px-1 text-[11px] leading-relaxed text-verdant-muted">
            הערכה אינדיקטיבית בלבד. מס שבח חושב על הרווח הנומינלי (ללא הצמדה למדד — ההפחתה האמיתית
            עשויה להיות נמוכה יותר). עמלות תיווך משתנות לפי הסוכן.
          </div>
        </div>

        {/* Footer */}
        <div className="v-divider flex justify-end border-t px-6 py-3">
          <button
            onClick={onClose}
            className="rounded-lg px-4 py-2 text-[13px] font-bold"
            style={{ background: "#1B4332", color: "#fff" }}
          >
            סגור
          </button>
        </div>
      </div>
    </div>
  );
}

function SliderField({
  label,
  value,
  min,
  max,
  step,
  unit,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  unit: string;
  onChange: (v: number) => void;
}) {
  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between">
        <label className="text-[12px] font-bold text-verdant-ink">{label}</label>
        <span className="text-[13px] font-extrabold tabular-nums text-verdant-ink">
          {value} {unit}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="h-1.5 w-full accent-[#1B4332]"
      />
    </div>
  );
}

function Row({
  label,
  value,
  negative,
  bold,
  color,
}: {
  label: string;
  value: number;
  negative?: boolean;
  bold?: boolean;
  color?: string;
}) {
  const textColor = color || (bold ? "#012D1D" : negative ? "#5a7a6a" : "#1B4332");
  return (
    <div className="flex items-center justify-between py-1.5">
      <span className="text-[12px]" style={{ color: textColor, fontWeight: bold ? 800 : 500 }}>
        {label}
      </span>
      <span
        className="tabular-nums"
        style={{
          color: textColor,
          fontWeight: bold ? 800 : 600,
          fontSize: bold ? "16px" : "13px",
        }}
      >
        {value < 0 ? `−${fmtILS(Math.abs(value))}` : fmtILS(value)}
      </span>
    </div>
  );
}
