"use client";

import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import { PageHeader } from "@/components/ui/PageHeader";
import { SaveStatus } from "@/components/ui/SaveStatus";
import { SolidKpi, type KpiTone } from "@/components/ui/SolidKpi";
import { useSaveStatus } from "@/lib/hooks/useSaveStatus";
import { fmtILS } from "@/lib/format";
import {
  loadProperties,
  addProperty,
  updateProperty,
  deleteProperty,
  propertyTaxStatus,
  propertyCAGR,
  EVENT_NAME,
  type Property,
} from "@/lib/realestate-store";
import { loadDebtData, type MortgageData } from "@/lib/debt-store";
import { generateRERecommendations } from "@/lib/realestate-recommendations";
import { AcquisitionSimulator } from "@/components/realestate/AcquisitionSimulator";
import { SaleSimulator } from "@/components/realestate/SaleSimulator";
import { GoalLinker } from "@/components/GoalLinker";
import { removeLinksForAsset } from "@/lib/asset-goal-linking";

/* ═══════════════════════════════════════════════════════════
   Helper: MiniStat
   ═══════════════════════════════════════════════════════════ */

function MiniStat({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div>
      <div className="text-[10px] text-verdant-muted font-bold">{label}</div>
      <div className="text-xs font-extrabold tabular" style={{ color: color ?? "#012d1d" }}>
        {value}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   Helper: Property Form Modal
   ═══════════════════════════════════════════════════════════ */

const TYPE_LABELS: Record<Property["type"], string> = {
  residence: "מגורים",
  investment: "השקעה",
  commercial: "מסחרי",
  land: "קרקע",
};

interface PropertyFormProps {
  initial?: Property;
  onSave: (p: Property) => void;
  onCancel: () => void;
}

function PropertyForm({ initial, onSave, onCancel }: PropertyFormProps) {
  const [name, setName] = useState(initial?.name ?? "");
  const [type, setType] = useState<Property["type"]>(initial?.type ?? "residence");
  const [city, setCity] = useState(initial?.city ?? "");
  const [address, setAddress] = useState(initial?.address ?? "");
  const [area, setArea] = useState(initial?.area?.toString() ?? "");
  const [rooms, setRooms] = useState(initial?.rooms?.toString() ?? "");
  const [purchasePrice, setPurchasePrice] = useState(initial?.purchasePrice?.toString() ?? "");
  const [currentValue, setCurrentValue] = useState(initial?.currentValue?.toString() ?? "");
  const [monthlyRent, setMonthlyRent] = useState(initial?.monthlyRent?.toString() ?? "");
  const [monthlyMortgage, setMonthlyMortgage] = useState(initial?.monthlyMortgage?.toString() ?? "");
  const [mortgageBalance, setMortgageBalance] = useState(initial?.mortgageBalance?.toString() ?? "");
  const [monthlyExpenses, setMonthlyExpenses] = useState(initial?.monthlyExpenses?.toString() ?? "");
  const [annualAppreciation, setAnnualAppreciation] = useState(
    initial?.annualAppreciation != null ? (initial.annualAppreciation * 100).toString() : "3"
  );
  const [oneTimeAppreciation, setOneTimeAppreciation] = useState(initial?.oneTimeAppreciation?.toString() ?? "");
  const [oneTimeAppreciationYear, setOneTimeAppreciationYear] = useState(initial?.oneTimeAppreciationYear?.toString() ?? "");
  const [holdingYears, setHoldingYears] = useState(initial?.holdingYears?.toString() ?? "10");
  // ברירת מחדל: גידול שכ״ד = עליית ערך (בד״כ 3%)
  const [annualRentGrowth, setAnnualRentGrowth] = useState(
    initial?.annualRentGrowth != null
      ? (initial.annualRentGrowth * 100).toString()
      : (initial?.annualAppreciation != null ? (initial.annualAppreciation * 100).toString() : "3")
  );
  // 2026-04-28: tax exemption flag — drives the מס שבח badge.
  const [purchaseDate, setPurchaseDate] = useState(initial?.purchaseDate ?? "");
  const [isPrimaryResidence, setIsPrimaryResidence] = useState(initial?.isPrimaryResidence ?? true);
  // Default: investment properties are included in retirement, residences are not.
  const [includeInRetirement, setIncludeInRetirement] = useState(
    initial?.includeInRetirement ?? (initial?.type ? initial.type === "investment" : false),
  );

  const handleSubmit = () => {
    if (!name.trim() || !purchasePrice) return;
    const prop: Property = {
      id: initial?.id ?? `prop_${Date.now()}`,
      name: name.trim(),
      type,
      city: city.trim() || undefined,
      address: address.trim() || undefined,
      area: area ? Number(area) : undefined,
      rooms: rooms ? Number(rooms) : undefined,
      purchasePrice: Number(purchasePrice) || 0,
      currentValue: Number(currentValue) || Number(purchasePrice) || 0,
      monthlyRent: monthlyRent ? Number(monthlyRent) : undefined,
      monthlyMortgage: monthlyMortgage ? Number(monthlyMortgage) : undefined,
      mortgageBalance: mortgageBalance ? Number(mortgageBalance) : undefined,
      monthlyExpenses: monthlyExpenses ? Number(monthlyExpenses) : undefined,
      annualAppreciation: (Number(annualAppreciation) || 3) / 100,
      oneTimeAppreciation: oneTimeAppreciation ? Number(oneTimeAppreciation) : undefined,
      oneTimeAppreciationYear: oneTimeAppreciationYear ? Number(oneTimeAppreciationYear) : undefined,
      holdingYears: holdingYears ? Math.max(1, Number(holdingYears)) : undefined,
      annualRentGrowth: annualRentGrowth !== "" ? (Number(annualRentGrowth) || 0) / 100 : undefined,
      purchaseDate: purchaseDate || initial?.purchaseDate,
      isPrimaryResidence,
      includeInRetirement,
      mortgageLinked: initial?.mortgageLinked,
      notes: initial?.notes,
    };
    onSave(prop);
  };

  const inputCls =
    "w-full px-3 py-2 rounded-lg text-sm border focus:outline-none focus:ring-2 focus:ring-verdant-emerald/30 bg-white text-verdant-ink";
  const labelCls = "text-[11px] font-bold text-verdant-muted block mb-1";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onCancel}>
      <div
        className="bg-white rounded-organic shadow-soft w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
        dir="rtl"
      >
        <div className="px-6 py-4 border-b v-divider flex items-center justify-between">
          <span className="text-sm font-extrabold text-verdant-ink">
            {initial ? "עריכת נכס" : "הוספת נכס חדש"}
          </span>
          <button onClick={onCancel} className="p-1 rounded hover:bg-[#f4f7ed]">
            <span className="material-symbols-outlined text-[18px] text-verdant-muted">close</span>
          </button>
        </div>

        <div className="px-6 py-5 grid grid-cols-2 gap-4">
          {/* שם */}
          <div className="col-span-2">
            <label className={labelCls}>שם הנכס</label>
            <input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} placeholder='דירת מגורים רחוב הרצל 5' />
          </div>
          {/* סוג */}
          <div>
            <label className={labelCls}>סוג</label>
            <select className={inputCls} value={type} onChange={(e) => setType(e.target.value as Property["type"])}>
              {Object.entries(TYPE_LABELS).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
          </div>
          {/* עיר */}
          <div>
            <label className={labelCls}>עיר</label>
            <input className={inputCls} value={city} onChange={(e) => setCity(e.target.value)} placeholder="תל אביב" />
          </div>
          {/* כתובת */}
          <div className="col-span-2">
            <label className={labelCls}>כתובת (אופציונלי)</label>
            <input className={inputCls} value={address} onChange={(e) => setAddress(e.target.value)} placeholder="רחוב הרצל 5" />
          </div>
          {/* תאריך רכישה — לחישוב מס שבח */}
          <div>
            <label className={labelCls}>תאריך רכישה</label>
            <input
              className={inputCls}
              type="month"
              value={purchaseDate}
              onChange={(e) => setPurchaseDate(e.target.value)}
            />
          </div>
          {/* דירה יחידה — פטור ממס שבח */}
          <div className="flex items-end">
            <label className="flex items-center gap-2 text-[12px] font-bold text-verdant-ink select-none cursor-pointer">
              <input
                type="checkbox"
                checked={isPrimaryResidence}
                onChange={(e) => setIsPrimaryResidence(e.target.checked)}
                className="w-4 h-4 accent-[#1B4332]"
              />
              דירה יחידה (פטור ממס שבח)
            </label>
          </div>
          <div className="flex items-end col-span-2">
            <label className="flex items-center gap-2 text-[12px] font-bold text-verdant-ink select-none cursor-pointer">
              <input
                type="checkbox"
                checked={includeInRetirement}
                onChange={(e) => setIncludeInRetirement(e.target.checked)}
                className="w-4 h-4 accent-[#1B4332]"
              />
              כלול נכס זה בתכנון הפרישה
              <span className="text-[10px] text-verdant-muted font-medium">
                (שווי נכס + שכ״ד יחושבו כחלק מההון לפרישה)
              </span>
            </label>
          </div>
          {/* שטח */}
          <div>
            <label className={labelCls}>שטח מ&quot;ר</label>
            <input className={inputCls} type="number" value={area} onChange={(e) => setArea(e.target.value)} placeholder="80" />
          </div>
          {/* חדרים */}
          <div>
            <label className={labelCls}>חדרים</label>
            <input className={inputCls} type="number" value={rooms} onChange={(e) => setRooms(e.target.value)} placeholder="3" />
          </div>
          {/* מחיר רכישה */}
          <div>
            <label className={labelCls}>מחיר רכישה (₪)</label>
            <input className={inputCls} type="number" value={purchasePrice} onChange={(e) => setPurchasePrice(e.target.value)} placeholder="1,500,000" />
          </div>
          {/* שווי נוכחי */}
          <div>
            <label className={labelCls}>שווי נוכחי (₪)</label>
            <input className={inputCls} type="number" value={currentValue} onChange={(e) => setCurrentValue(e.target.value)} placeholder="2,000,000" />
          </div>
          {/* שכ"ד — רק להשקעה */}
          {(type === "investment" || type === "commercial") && (
            <div>
              <label className={labelCls}>הכנסה משכ&quot;ד חודשי (₪)</label>
              <input className={inputCls} type="number" value={monthlyRent} onChange={(e) => setMonthlyRent(e.target.value)} placeholder="5,000" />
            </div>
          )}
          {/* משכנתא */}
          <div>
            <label className={labelCls}>החזר משכנתא חודשי (₪)</label>
            <input className={inputCls} type="number" value={monthlyMortgage} onChange={(e) => setMonthlyMortgage(e.target.value)} placeholder="3,500" />
          </div>
          <div>
            <label className={labelCls}>יתרת משכנתא (₪)</label>
            <input className={inputCls} type="number" value={mortgageBalance} onChange={(e) => setMortgageBalance(e.target.value)} placeholder="500,000" />
          </div>
          {/* לוח סילוקין — Upload placeholder (parser coming) */}
          <div className="md:col-span-2">
            <label className={labelCls}>לוח סילוקין (PDF מהבנק)</label>
            <button
              type="button"
              disabled
              className="w-full inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2 text-[12px] font-bold"
              style={{ background: "#f4f5ed", color: "#7a8a7e", border: "1px dashed #c9d3c0", cursor: "not-allowed" }}
            >
              <span className="material-symbols-outlined text-[16px]">upload_file</span>
              פרסור PDF — בקרוב
            </button>
          </div>
          {/* הוצאות */}
          <div>
            <label className={labelCls}>הוצאות חודשיות (₪)</label>
            <input className={inputCls} type="number" value={monthlyExpenses} onChange={(e) => setMonthlyExpenses(e.target.value)} placeholder="800" />
          </div>
          {/* עליית ערך */}
          <div>
            <label className={labelCls}>עליית ערך שנתית (%)</label>
            <input className={inputCls} type="number" step="0.1" value={annualAppreciation} onChange={(e) => setAnnualAppreciation(e.target.value)} placeholder="3" />
          </div>
          {/* עליית ערך חד-פעמית */}
          <div>
            <label className={labelCls}>עליית ערך חד-פעמית — שיפוץ/תמ&quot;א (₪)</label>
            <input className={inputCls} type="number" value={oneTimeAppreciation} onChange={(e) => setOneTimeAppreciation(e.target.value)} placeholder="200,000" />
          </div>
          <div>
            <label className={labelCls}>באיזו שנה? (1 = השנה הראשונה)</label>
            <input className={inputCls} type="number" value={oneTimeAppreciationYear} onChange={(e) => setOneTimeAppreciationYear(e.target.value)} placeholder="3" />
          </div>
          {/* תקופת החזקה מתוכננת */}
          <div>
            <label className={labelCls}>תקופת החזקה מתוכננת (שנים)</label>
            <input className={inputCls} type="number" min="1" value={holdingYears} onChange={(e) => setHoldingYears(e.target.value)} placeholder="10" />
          </div>
          {/* גידול שנתי של שכ״ד */}
          {(type === "investment" || type === "commercial") && (
            <div>
              <label className={labelCls}>גידול שכ&quot;ד שנתי (%)</label>
              <input className={inputCls} type="number" step="0.1" value={annualRentGrowth} onChange={(e) => setAnnualRentGrowth(e.target.value)} placeholder="3" />
              <div className="text-[9px] text-verdant-muted mt-0.5">ברירת מחדל: מותאם לעליית הערך</div>
            </div>
          )}
        </div>

        <div className="px-6 pb-5 flex gap-3">
          <button
            onClick={handleSubmit}
            className="btn-botanical flex-1 text-sm !py-2.5"
          >
            {initial ? "שמור שינויים" : "הוסף נכס"}
          </button>
          <button onClick={onCancel} className="btn-botanical-ghost text-sm !px-6 !py-2.5">
            ביטול
          </button>
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   SVG Bar Chart — Forecast
   ═══════════════════════════════════════════════════════════ */

interface ForecastRow {
  year: number;
  value: number;
  equity: number;
  cumulativeCashflow: number;
}

function ForecastChart({ data }: { data: ForecastRow[] }) {
  if (data.length === 0) return null;

  const W = 700;
  const H = 260;
  const PAD = { top: 20, right: 16, bottom: 32, left: 60 };
  const plotW = W - PAD.left - PAD.right;
  const plotH = H - PAD.top - PAD.bottom;

  const maxVal = Math.max(...data.map((d) => d.value), 1);
  const barW = Math.max(4, plotW / data.length - 4);
  const gap = (plotW - barW * data.length) / (data.length + 1);

  const y = (v: number) => PAD.top + plotH - (v / maxVal) * plotH;
  const x = (i: number) => PAD.left + gap + i * (barW + gap);

  // Y-axis ticks
  const ticks = 5;
  const yTicks = Array.from({ length: ticks + 1 }, (_, i) => (maxVal / ticks) * i);

  // Cashflow line
  const maxCF = Math.max(Math.abs(Math.min(...data.map((d) => d.cumulativeCashflow))), Math.max(...data.map((d) => d.cumulativeCashflow)), 1);
  const yCF = (v: number) => PAD.top + plotH / 2 - (v / maxCF) * (plotH / 2);

  const cfPoints = data.map((d, i) => `${x(i) + barW / 2},${yCF(d.cumulativeCashflow)}`).join(" ");

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ maxHeight: 280 }}>
      {/* Grid */}
      {yTicks.map((t) => (
        <g key={t}>
          <line x1={PAD.left} x2={W - PAD.right} y1={y(t)} y2={y(t)} stroke="#e5e7d8" strokeWidth={0.5} />
          <text x={PAD.left - 6} y={y(t) + 3} textAnchor="end" className="fill-verdant-muted" style={{ fontSize: 8 }}>
            {t >= 1_000_000 ? `${(t / 1_000_000).toFixed(1)}M` : `${Math.round(t / 1000)}K`}
          </text>
        </g>
      ))}

      {/* Bars */}
      {data.map((d, i) => (
        <g key={d.year}>
          {/* Value bar */}
          <rect x={x(i)} y={y(d.value)} width={barW / 2} height={y(0) - y(d.value)} rx={2} fill="#1B4332" opacity={0.3} />
          {/* Equity bar */}
          <rect x={x(i) + barW / 2} y={y(d.equity)} width={barW / 2} height={y(0) - y(d.equity)} rx={2} fill="#1B4332" />
          {/* X label */}
          {(i === 0 || (i + 1) % 5 === 0 || i === data.length - 1) && (
            <text x={x(i) + barW / 2} y={H - 8} textAnchor="middle" className="fill-verdant-muted" style={{ fontSize: 8 }}>
              {d.year}
            </text>
          )}
        </g>
      ))}

      {/* Cashflow polyline */}
      <polyline points={cfPoints} fill="none" stroke="#2B694D" strokeWidth={2} strokeLinejoin="round" />

      {/* Legend */}
      <rect x={PAD.left} y={4} width={8} height={8} rx={2} fill="#1B4332" opacity={0.3} />
      <text x={PAD.left + 12} y={11} className="fill-verdant-muted" style={{ fontSize: 8 }}>שווי</text>
      <rect x={PAD.left + 38} y={4} width={8} height={8} rx={2} fill="#1B4332" />
      <text x={PAD.left + 50} y={11} className="fill-verdant-muted" style={{ fontSize: 8 }}>הון עצמי</text>
      <line x1={PAD.left + 90} y1={8} x2={PAD.left + 102} y2={8} stroke="#2B694D" strokeWidth={2} />
      <text x={PAD.left + 106} y={11} className="fill-verdant-muted" style={{ fontSize: 8 }}>תזרים מצטבר</text>
    </svg>
  );
}

/* ═══════════════════════════════════════════════════════════
   Main Page
   ═══════════════════════════════════════════════════════════ */

export default function RealEstatePage() {
  /* ── Save status indicator ── */
  const { status: saveStatus, pulse } = useSaveStatus();

  /* ── State ── */
  const [properties, setProperties] = useState<Property[]>([]);
  const [mortgage, setMortgage] = useState<MortgageData | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingPropId, setEditingPropId] = useState<string | null>(null);
  const [salePropId, setSalePropId] = useState<string | null>(null);

  /* Forecast sliders */
  const [forecastYears, setForecastYears] = useState(15);
  const [forecastAppreciation, setForecastAppreciation] = useState(3.0);
  const [forecastRentGrowth, setForecastRentGrowth] = useState(2.0);

  /* ── Load data ── */
  useEffect(() => {
    setProperties(loadProperties());
    const debt = loadDebtData();
    if (debt.mortgage) setMortgage(debt.mortgage);

    const handler = () => setProperties(loadProperties());
    window.addEventListener(EVENT_NAME, handler);
    window.addEventListener("storage", handler);
    return () => {
      window.removeEventListener(EVENT_NAME, handler);
      window.removeEventListener("storage", handler);
    };
  }, []);

  /* ── Computed KPIs ── */
  const totalValue = properties.reduce((s, p) => s + p.currentValue, 0);
  const totalPurchaseValue = properties.reduce((s, p) => s + p.purchasePrice, 0);
  // Mortgage: prefer per-property data, fallback to debt-store
  const totalMortgageBalanceFromProps = properties.reduce((s, p) => s + (p.mortgageBalance ?? 0), 0);
  const totalMortgageBalanceFromDebt = mortgage?.tracks.reduce((s, t) => s + t.remainingBalance, 0) ?? 0;
  const totalMortgageBalance = totalMortgageBalanceFromProps > 0 ? totalMortgageBalanceFromProps : totalMortgageBalanceFromDebt;
  const totalMonthlyRent = properties.reduce((s, p) => s + (p.monthlyRent ?? 0), 0);
  const totalMonthlyMortgageFromProps = properties.reduce((s, p) => s + (p.monthlyMortgage ?? 0), 0);
  const totalMonthlyMortgageFromDebt = mortgage?.tracks.reduce((s, t) => s + t.monthlyPayment, 0) ?? 0;
  const totalMonthlyMortgage = totalMonthlyMortgageFromProps > 0 ? totalMonthlyMortgageFromProps : totalMonthlyMortgageFromDebt;
  const totalMonthlyExpenses = properties.reduce((s, p) => s + (p.monthlyExpenses ?? 0), 0);
  const equity = totalValue - totalMortgageBalance;
  const ltv = totalValue > 0 ? (totalMortgageBalance / totalValue) * 100 : 0;
  const appreciation = totalPurchaseValue > 0 ? ((totalValue - totalPurchaseValue) / totalPurchaseValue) * 100 : 0;
  // DSCR = NOI / Debt Service = (Rent - Expenses) / Mortgage
  const noi = totalMonthlyRent - totalMonthlyExpenses;
  const dscr = totalMonthlyMortgage > 0 ? noi / totalMonthlyMortgage : 0;
  const netCashflow = totalMonthlyRent - totalMonthlyExpenses - totalMonthlyMortgage;
  // ROI — total return including appreciation + cashflow vs. equity invested
  const totalEquityInvested = properties.reduce((s, p) => {
    const invested = p.purchasePrice - (p.mortgageBalance ?? 0);
    return s + Math.max(invested, 0);
  }, 0);
  const totalReturn = (totalValue - totalPurchaseValue) + (netCashflow * 12); // annual
  const roi = totalEquityInvested > 0 ? (totalReturn / totalEquityInvested) * 100 : 0;

  /* ── Forecast ── */
  const forecast = useMemo(() => {
    const years: ForecastRow[] = [];
    let cumulativeCF = 0;

    // Sum one-time appreciations by year
    const oneTimeByYear: Record<number, number> = {};
    for (const p of properties) {
      if (p.oneTimeAppreciation && p.oneTimeAppreciationYear) {
        oneTimeByYear[p.oneTimeAppreciationYear] = (oneTimeByYear[p.oneTimeAppreciationYear] || 0) + p.oneTimeAppreciation;
      }
    }

    let runningValue = totalValue;
    for (let y = 1; y <= forecastYears; y++) {
      runningValue = runningValue * (1 + forecastAppreciation / 100);
      // Add one-time appreciation (renovation/TAMA) in the specified year
      if (oneTimeByYear[y]) runningValue += oneTimeByYear[y];
      const yearlyRent = totalMonthlyRent * 12 * Math.pow(1 + forecastRentGrowth / 100, y);
      const yearlyExpenses = properties.reduce((s, p) => s + (p.monthlyExpenses ?? 0), 0) * 12;
      const yearlyMortgage = totalMonthlyMortgage * 12;
      cumulativeCF += yearlyRent - yearlyExpenses - yearlyMortgage;

      years.push({
        year: y,
        value: Math.round(runningValue),
        cumulativeCashflow: Math.round(cumulativeCF),
        equity: Math.round(runningValue - Math.max(0, totalMortgageBalance - (totalMortgageBalance / forecastYears) * y)),
      });
    }
    return years;
  }, [forecastYears, forecastAppreciation, forecastRentGrowth, totalValue, totalMonthlyRent, totalMonthlyMortgage, totalMortgageBalance, properties]);

  const finalValue = forecast[forecast.length - 1]?.value ?? totalValue;
  const finalEquity = forecast[forecast.length - 1]?.equity ?? equity;
  const totalCashflow = forecast[forecast.length - 1]?.cumulativeCashflow ?? 0;
  const equityMultiple = equity > 0 ? (finalEquity + totalCashflow) / equity : 0;
  const irrEstimate = equity > 0 ? (Math.pow((finalEquity + totalCashflow) / equity, 1 / forecastYears) - 1) * 100 : 0;

  /* ── CRUD handlers ── */
  const handleAdd = (p: Property) => {
    addProperty(p);
    pulse();
    setProperties(loadProperties());
    setShowAddForm(false);
  };

  const handleUpdate = (p: Property) => {
    updateProperty(p.id, p);
    pulse();
    setProperties(loadProperties());
    setEditingPropId(null);
  };

  const handleDelete = (id: string) => {
    deleteProperty(id);
    removeLinksForAsset("realestate", id);
    pulse();
    setProperties(loadProperties());
  };

  /* ── Recommendations ── */
  const recommendations = useMemo(() => generateRERecommendations(properties), [properties]);

  /* ── KPI data ── */
  const kpis = [
    { label: "שווי נכסים", value: fmtILS(totalValue), sub: `הון עצמי: ${fmtILS(equity)}`, icon: "home", color: "#1B4332" },
    {
      label: "תזרים חודשי נטו",
      value: fmtILS(netCashflow),
      sub: totalMonthlyRent > 0 ? `שכ״ד ${fmtILS(totalMonthlyRent)} − הוצאות ${fmtILS(totalMonthlyExpenses + totalMonthlyMortgage)}` : undefined,
      icon: netCashflow >= 0 ? "trending_up" : "trending_down",
      color: netCashflow >= 0 ? "#1B4332" : "#b91c1c",
    },
    {
      label: "ROI כולל",
      value: totalEquityInvested > 0 ? `${roi.toFixed(1)}%` : "—",
      sub: totalEquityInvested > 0 ? `תשואה על הון עצמי מושקע של ${fmtILS(totalEquityInvested)}` : undefined,
      icon: "monitoring",
      color: roi > 10 ? "#1B4332" : roi > 0 ? "#f59e0b" : "#b91c1c",
    },
    {
      label: "DSCR",
      value: totalMonthlyMortgage > 0 ? dscr.toFixed(2) : "—",
      sub: totalMonthlyMortgage > 0
        ? dscr >= 1.25 ? "בריא — הכנסות מכסות חוב" : dscr >= 1.0 ? "גבולי — כיסוי מינימלי" : "שלילי — ההכנסות לא מכסות"
        : "אין משכנתא",
      icon: "shield",
      color: dscr >= 1.25 ? "#1B4332" : dscr >= 1.0 ? "#f59e0b" : "#b91c1c",
    },
    {
      label: "LTV",
      value: `${ltv.toFixed(0)}%`,
      sub: ltv <= 60 ? "יחס בריא" : ltv <= 75 ? "סביר" : "גבוה — סיכון",
      icon: "percent",
      color: ltv <= 60 ? "#1B4332" : ltv <= 75 ? "#f59e0b" : "#b91c1c",
    },
  ];

  const editingProp = editingPropId ? properties.find((p) => p.id === editingPropId) : undefined;

  /* ═══════════════════════════════════════════════════════════
     Render
     ═══════════════════════════════════════════════════════════ */
  return (
    <div className="max-w-5xl mx-auto" dir="rtl">
      {/* ── 1. PageHeader ── */}
      <PageHeader subtitle="שלב 6" title="נדל״ן" description={`שווי נכסים: ${fmtILS(totalValue)}`} />
      {/* אינדיקטור שמירה */}
      <div className="flex justify-end -mt-4 mb-3 min-h-[18px]">
        <SaveStatus status={saveStatus} />
      </div>

      {/* ── 2. KPI Row ── */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3 mb-6">
        {kpis.map((k) => {
          const tone: KpiTone =
            k.color === "#1B4332" ? "emerald" :
            k.color === "#b91c1c" ? "red" :
            k.color === "#f59e0b" ? "amber" : "forest";
          return (
            <SolidKpi key={k.label} label={k.label} value={String(k.value)} icon={k.icon} tone={tone} sub={k.sub ?? null} />
          );
        })}
      </div>

      {/* Recommendations moved to bottom of page (2026-04-28 per Nir):
          "המרכז חייב להיות נקי לנתונים ותכנון". See section at end of page. */}

      {/* ── 3. Property Cards + CRUD ── */}
      <h2 className="text-sm font-extrabold text-verdant-ink mb-3">הנכסים שלי</h2>

      {properties.map((prop) => {
        const propRecs = recommendations.filter(r => r.propertyId === prop.id);
        return (
        <section key={prop.id} className="v-card mb-4">
          <div className="px-5 py-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div
                className="w-10 h-10 rounded-xl flex items-center justify-center relative"
                style={{ background: prop.type === "investment" ? "#f0fdf4" : "#ecfdf5", border: "1.5px solid #d1fae5" }}
              >
                <span className="material-symbols-outlined text-[22px] text-verdant-emerald">
                  {prop.type === "investment" ? "apartment" : prop.type === "commercial" ? "store" : prop.type === "land" ? "landscape" : "home"}
                </span>
                {propRecs.length > 0 && (
                  <div className="absolute -top-1 -left-1 w-4 h-4 rounded-full bg-amber-500 text-white text-[9px] font-bold flex items-center justify-center">
                    {propRecs.length}
                  </div>
                )}
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <div className="text-sm font-extrabold text-verdant-ink">{prop.name}</div>
                  {(() => {
                    // Tax-status badge — Israeli capital-gains exemption logic.
                    // Hides for "land" + "commercial" (different rules apply).
                    if (prop.type !== "residence" && prop.type !== "investment") return null;
                    const tx = propertyTaxStatus(prop, properties);
                    const styleByStatus: Record<typeof tx.status, { bg: string; fg: string }> = {
                      exempt:  { bg: "#D1FAE5", fg: "#065F46" },
                      overlap: { bg: "#FEF3C7", fg: "#92400E" },
                      taxable: { bg: "#FEE2E2", fg: "#991B1B" },
                      unknown: { bg: "#E5E7EB", fg: "#374151" },
                    };
                    const s = styleByStatus[tx.status];
                    return (
                      <span
                        className="text-[10px] font-bold px-2 py-0.5 rounded-full"
                        style={{ background: s.bg, color: s.fg }}
                        title={tx.message}
                      >
                        {tx.message}
                      </span>
                    );
                  })()}
                </div>
                <div className="text-[10px] text-verdant-muted">
                  {TYPE_LABELS[prop.type]}
                  {prop.city && ` · ${prop.city}`}
                  {prop.rooms && ` · ${prop.rooms} חד׳`}
                  {prop.area && ` · ${prop.area} מ"ר`}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <div className="text-left">
                <div className="text-[10px] text-verdant-muted font-bold">שווי נוכחי</div>
                <div className="text-base font-extrabold text-verdant-ink tabular">{fmtILS(prop.currentValue)}</div>
                {(() => {
                  const r = propertyCAGR(prop);
                  if (!r) return null;
                  if (r.cagrPct == null) {
                    return <div className="text-[10px] text-verdant-muted">חזקה {r.yearsHeld < 1/12 ? "פחות מחודש" : `${r.yearsHeld.toFixed(1)} שנים`}</div>;
                  }
                  const color = r.cagrPct >= 0 ? "#1B4332" : "#8B2E2E";
                  return (
                    <div className="text-[10px] font-bold tabular-nums mt-0.5" style={{ color }} title={`סה"כ תשואה ${r.totalReturnPct.toFixed(1)}% מאז הרכישה (${r.yearsHeld.toFixed(1)} שנים)`}>
                      תשואה שנתית {r.cagrPct >= 0 ? "+" : ""}{r.cagrPct.toFixed(1)}%
                    </div>
                  );
                })()}
              </div>
              <div className="flex gap-1.5 items-center">
                <button
                  onClick={() => setSalePropId(prop.id)}
                  title="סימולציית מכירה — מה יישאר ביד אם תמכור"
                  className="px-2.5 py-1.5 rounded-lg hover:bg-[#eef7f1] flex items-center gap-1 text-[11px] font-bold border"
                  style={{ color: "#1B4332", borderColor: "#c9e3d4" }}
                >
                  <span className="material-symbols-outlined text-[16px]">sell</span>
                  מכירה
                </button>
                <button onClick={() => setEditingPropId(prop.id)} className="p-1 rounded hover:bg-[#f4f7ed]">
                  <span className="material-symbols-outlined text-[14px] text-verdant-muted">edit</span>
                </button>
                <button onClick={() => handleDelete(prop.id)} className="p-1 rounded hover:bg-red-50">
                  <span className="material-symbols-outlined text-[14px] text-red-400">delete</span>
                </button>
              </div>
            </div>
          </div>

          {/* Property details grid */}
          {(() => {
            const rent = prop.monthlyRent ?? 0;
            const expenses = prop.monthlyExpenses ?? 0;
            const mtg = prop.monthlyMortgage ?? 0;
            const mtgBal = prop.mortgageBalance ?? 0;
            const propCashflow = rent - expenses - mtg;
            const propNoi = rent - expenses;
            const propDscr = mtg > 0 ? propNoi / mtg : 0;
            const netEquity = prop.currentValue - mtgBal;
            const equityPct = prop.currentValue > 0 ? (netEquity / prop.currentValue) * 100 : 100;
            const annualCashflow = propCashflow * 12;
            const equityInvested = prop.purchasePrice - (prop.purchasePrice - mtgBal > 0 ? mtgBal : 0);
            const coc = equityInvested > 0 ? (annualCashflow / equityInvested) * 100 : 0;
            const isInvestment = prop.type === "investment" || prop.type === "commercial";
            return (
              <div className="px-5 pb-4 grid grid-cols-2 md:grid-cols-4 gap-3">
                <MiniStat label="מחיר רכישה" value={fmtILS(prop.purchasePrice)} />
                <MiniStat
                  label="עליית ערך"
                  value={`${(((prop.currentValue - prop.purchasePrice) / (prop.purchasePrice || 1)) * 100).toFixed(1)}%`}
                  color={prop.currentValue >= prop.purchasePrice ? "#1B4332" : "#b91c1c"}
                />
                <MiniStat label="הון עצמי נטו" value={fmtILS(netEquity)} color="#1B4332" />
                <MiniStat
                  label="אחוז הון"
                  value={`${equityPct.toFixed(0)}%`}
                  color={equityPct > 70 ? "#1B4332" : equityPct > 50 ? "#f59e0b" : "#b91c1c"}
                />
                {rent > 0 && <MiniStat label="שכ״ד חודשי" value={fmtILS(rent)} />}
                {rent > 0 && (
                  <MiniStat label="תשואת שכירות" value={`${((rent * 12 / (prop.currentValue || 1)) * 100).toFixed(1)}%`} />
                )}
                {mtg > 0 && <MiniStat label="החזר משכנתא" value={fmtILS(mtg)} />}
                {mtgBal > 0 && (
                  <MiniStat label="יתרת משכנתא" value={fmtILS(mtgBal)} color="#b91c1c" />
                )}
                {isInvestment && rent > 0 && (
                  <MiniStat
                    label="תזרים חודשי נטו"
                    value={`${propCashflow >= 0 ? "+" : ""}${fmtILS(propCashflow)}`}
                    color={propCashflow >= 0 ? "#1B4332" : "#b91c1c"}
                  />
                )}
                {isInvestment && mtg > 0 && rent > 0 && (
                  <MiniStat
                    label="DSCR"
                    value={propDscr.toFixed(2)}
                    color={propDscr >= 1.25 ? "#1B4332" : propDscr >= 1.0 ? "#f59e0b" : "#b91c1c"}
                  />
                )}
                {isInvestment && rent > 0 && (
                  <MiniStat
                    label="Cash-on-Cash"
                    value={`${coc.toFixed(1)}%`}
                    color={coc > 5 ? "#1B4332" : coc > 0 ? "#f59e0b" : "#b91c1c"}
                  />
                )}
                {prop.holdingYears != null && prop.holdingYears > 0 && (
                  <MiniStat
                    label="תקופת החזקה"
                    value={`${prop.holdingYears} שנים`}
                  />
                )}
                {isInvestment && rent > 0 && prop.holdingYears && prop.holdingYears > 0 && (() => {
                  const g = prop.annualRentGrowth ?? prop.annualAppreciation ?? 0.03;
                  const rentAtExit = rent * Math.pow(1 + g, prop.holdingYears);
                  return (
                    <MiniStat
                      label={`שכ״ד בעוד ${prop.holdingYears} שנים`}
                      value={fmtILS(Math.round(rentAtExit))}
                      color="#1B4332"
                    />
                  );
                })()}
              </div>
            );
          })()}
          {/* Goal linking — color this property's equity to specific buckets */}
          <div className="px-5 pb-5 pt-1 border-t v-divider">
            <div className="flex items-center gap-2 mb-2">
              <span className="material-symbols-outlined text-[14px]" style={{ color: "#1B4332" }}>flag</span>
              <span className="text-[11px] font-bold text-verdant-muted">שיוך הון עצמי ליעד</span>
            </div>
            <GoalLinker
              assetType="realestate"
              assetId={prop.id}
              assetValue={prop.currentValue - (prop.mortgageBalance ?? 0)}
              variant="card"
            />
          </div>
        </section>
        );
      })}

      {/* Add button */}
      <button
        onClick={() => setShowAddForm(true)}
        className="w-full py-3 rounded-xl border-2 border-dashed text-sm font-bold text-verdant-emerald hover:bg-[#f4f7ed] transition-colors mb-6"
        style={{ borderColor: "#b6d4a8" }}
      >
        <span className="material-symbols-outlined text-[16px] align-middle ml-1">add</span>
        הוסף נכס
      </button>

      {/* ── 3.5 Property Comparison ── */}
      {properties.length >= 2 && (
        <section className="v-card mb-6 overflow-x-auto">
          <div className="px-5 py-4 flex items-center gap-2 border-b v-divider">
            <span className="material-symbols-outlined text-[18px] text-verdant-emerald">compare</span>
            <span className="text-sm font-extrabold text-verdant-ink">השוואת נכסים</span>
          </div>
          <div className="px-5 py-4">
            <table className="w-full text-xs" dir="rtl">
              <thead>
                <tr className="text-[10px] text-verdant-muted font-bold border-b v-divider">
                  <th className="py-2 text-right">מדד</th>
                  {properties.map((p) => (
                    <th key={p.id} className="py-2 text-center">{p.name}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {[
                  { label: "שווי", fn: (p: Property) => fmtILS(p.currentValue) },
                  { label: "הון עצמי", fn: (p: Property) => fmtILS(p.currentValue - (p.mortgageBalance ?? 0)) },
                  { label: "שכ״ד", fn: (p: Property) => p.monthlyRent ? fmtILS(p.monthlyRent) : "—" },
                  { label: "הוצאות + משכנתא", fn: (p: Property) => fmtILS((p.monthlyExpenses ?? 0) + (p.monthlyMortgage ?? 0)) },
                  { label: "תזרים נטו", fn: (p: Property) => {
                    const cf = (p.monthlyRent ?? 0) - (p.monthlyExpenses ?? 0) - (p.monthlyMortgage ?? 0);
                    return <span style={{ color: cf >= 0 ? "#1B4332" : "#b91c1c" }}>{cf >= 0 ? "+" : ""}{fmtILS(cf)}</span>;
                  }},
                  { label: "תשואת שכירות", fn: (p: Property) => p.monthlyRent && p.currentValue ? `${((p.monthlyRent * 12 / p.currentValue) * 100).toFixed(1)}%` : "—" },
                  { label: "DSCR", fn: (p: Property) => {
                    const mtg = p.monthlyMortgage ?? 0;
                    if (!mtg || !p.monthlyRent) return "—";
                    const d = ((p.monthlyRent ?? 0) - (p.monthlyExpenses ?? 0)) / mtg;
                    return <span style={{ color: d >= 1.25 ? "#1B4332" : d >= 1.0 ? "#f59e0b" : "#b91c1c" }}>{d.toFixed(2)}</span>;
                  }},
                  { label: "LTV", fn: (p: Property) => {
                    const l = p.currentValue > 0 ? ((p.mortgageBalance ?? 0) / p.currentValue) * 100 : 0;
                    return <span style={{ color: l <= 60 ? "#1B4332" : l <= 75 ? "#f59e0b" : "#b91c1c" }}>{l.toFixed(0)}%</span>;
                  }},
                  { label: "עליית ערך", fn: (p: Property) => {
                    const a = p.purchasePrice > 0 ? ((p.currentValue - p.purchasePrice) / p.purchasePrice) * 100 : 0;
                    return <span style={{ color: a >= 0 ? "#1B4332" : "#b91c1c" }}>{a.toFixed(1)}%</span>;
                  }},
                ].map((row) => (
                  <tr key={row.label} className="border-b v-divider last:border-0">
                    <td className="py-2 font-bold text-verdant-ink">{row.label}</td>
                    {properties.map((p) => (
                      <td key={p.id} className="py-2 text-center tabular font-bold">{row.fn(p)}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* ── 3.6 Acquisition Simulator ── */}
      <AcquisitionSimulator />

      {/* ── 4. Forecast Section ── */}
      <section className="v-card mb-6">
        <div className="px-5 py-4 flex items-center gap-2 border-b v-divider">
          <span className="material-symbols-outlined text-[18px] text-verdant-emerald">query_stats</span>
          <span className="text-sm font-extrabold text-verdant-ink">תחזית ערך עתידי</span>
        </div>

        <div className="px-5 py-4">
          {/* 3 Sliders */}
          <div className="grid grid-cols-3 gap-4 mb-4">
            <div>
              <label className="text-[10px] font-bold text-verdant-muted block mb-1">שנות תחזית: {forecastYears}</label>
              <input
                type="range"
                min={5}
                max={30}
                value={forecastYears}
                onChange={(e) => setForecastYears(+e.target.value)}
                className="w-full accent-verdant-emerald"
              />
              <div className="flex justify-between text-[9px] text-verdant-muted">
                <span>5</span>
                <span>30</span>
              </div>
            </div>
            <div>
              <label className="text-[10px] font-bold text-verdant-muted block mb-1">
                עליית ערך שנתית: {forecastAppreciation.toFixed(1)}%
              </label>
              <input
                type="range"
                min={0}
                max={80}
                value={forecastAppreciation * 10}
                onChange={(e) => setForecastAppreciation(+e.target.value / 10)}
                className="w-full accent-verdant-emerald"
              />
              <div className="flex justify-between text-[9px] text-verdant-muted">
                <span>0%</span>
                <span>8%</span>
              </div>
            </div>
            <div>
              <label className="text-[10px] font-bold text-verdant-muted block mb-1">
                עליית שכ״ד: {forecastRentGrowth.toFixed(1)}%
              </label>
              <input
                type="range"
                min={0}
                max={50}
                value={forecastRentGrowth * 10}
                onChange={(e) => setForecastRentGrowth(+e.target.value / 10)}
                className="w-full accent-verdant-emerald"
              />
              <div className="flex justify-between text-[9px] text-verdant-muted">
                <span>0%</span>
                <span>5%</span>
              </div>
            </div>
          </div>

          {/* SVG Chart */}
          <ForecastChart data={forecast} />

          {/* 4 Forecast Metrics */}
          <div className="grid grid-cols-4 gap-3 mt-4">
            <div className="text-center">
              <div className="text-[10px] text-verdant-muted font-bold">שווי עתידי</div>
              <div className="text-sm font-extrabold text-verdant-ink">{fmtILS(finalValue)}</div>
            </div>
            <div className="text-center">
              <div className="text-[10px] text-verdant-muted font-bold">הון עצמי עתידי</div>
              <div className="text-sm font-extrabold text-verdant-emerald">{fmtILS(finalEquity)}</div>
            </div>
            <div className="text-center">
              <div className="text-[10px] text-verdant-muted font-bold">מכפיל הון</div>
              <div className="text-sm font-extrabold text-verdant-ink">{equityMultiple.toFixed(1)}x</div>
            </div>
            <div className="text-center">
              <div className="text-[10px] text-verdant-muted font-bold">IRR משוער</div>
              <div className="text-sm font-extrabold text-verdant-emerald">{irrEstimate.toFixed(1)}%</div>
            </div>
          </div>
        </div>
      </section>

      {/* ── 5. Mortgage Detail ── */}
      {mortgage && (
        <section className="v-card mb-6">
          <div className="px-5 py-4 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-[18px]" style={{ color: "#1B4332" }}>
                home_work
              </span>
              <span className="text-sm font-extrabold text-verdant-ink">משכנתא — {mortgage.bank}</span>
            </div>
            <div className="text-left">
              <div className="text-[10px] text-verdant-muted font-bold">יתרה כוללת</div>
              <div className="text-sm font-extrabold tabular" style={{ color: "#b91c1c" }}>
                {fmtILS(totalMortgageBalance)}
              </div>
            </div>
          </div>

          {/* Tracks table */}
          <div className="px-5 pb-4">
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-[10px] text-verdant-muted font-bold border-b v-divider">
                    <th className="py-2 text-right">מסלול</th>
                    <th className="py-2 text-right">הצמדה</th>
                    <th className="py-2 text-right">ריבית</th>
                    <th className="py-2 text-right">שיטת החזר</th>
                    <th className="py-2 text-left">סכום מקורי</th>
                    <th className="py-2 text-left">יתרה</th>
                    <th className="py-2 text-left">תשלום חודשי</th>
                    <th className="py-2 text-left">סיום</th>
                  </tr>
                </thead>
                <tbody>
                  {mortgage.tracks.map((track) => (
                    <tr key={track.id} className="border-b v-divider last:border-0">
                      <td className="py-2.5 font-bold text-verdant-ink">{track.name}</td>
                      <td className="py-2.5">{track.indexation}</td>
                      <td className="py-2.5 tabular">{track.interestRate}%</td>
                      <td className="py-2.5">{track.repaymentMethod}</td>
                      <td className="py-2.5 text-left tabular">{fmtILS(track.originalAmount)}</td>
                      <td className="py-2.5 text-left tabular font-bold" style={{ color: "#b91c1c" }}>
                        {fmtILS(track.remainingBalance)}
                      </td>
                      <td className="py-2.5 text-left tabular">{fmtILS(track.monthlyPayment)}</td>
                      <td className="py-2.5 text-left tabular text-verdant-muted">{track.endDate}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Overall progress bar */}
          <div className="px-5 pb-4">
            <div className="flex items-center justify-between text-[10px] text-verdant-muted mb-1">
              <span>שולם: {fmtILS(mortgage.tracks.reduce((s, t) => s + t.originalAmount - t.remainingBalance, 0))}</span>
              <span>נותר: {fmtILS(totalMortgageBalance)}</span>
            </div>
            <div className="w-full h-2.5 rounded-full" style={{ background: "#fee2e2" }}>
              <div
                className="h-full rounded-full transition-all duration-500"
                style={{
                  width: `${Math.round((1 - totalMortgageBalance / (mortgage.tracks.reduce((s, t) => s + t.originalAmount, 0) || 1)) * 100)}%`,
                  background: "linear-gradient(90deg, #1B4332, #a78bfa)",
                }}
              />
            </div>
          </div>
        </section>
      )}

      {!mortgage && (
        <div className="card-pad text-center mb-6">
          <span className="material-symbols-outlined text-[28px] text-verdant-muted mb-2 block">add_home</span>
          <div className="text-xs text-verdant-muted">
            לא הוגדרה משכנתא.
            <Link href="/debt" className="text-verdant-emerald font-bold hover:underline mr-1">
              הוסף בדף חובות
            </Link>
          </div>
        </div>
      )}

      {/* ── 6. Madlan Value Check ── */}
      <section className="card mb-6 overflow-hidden">
        <div className="px-5 py-4 flex items-center justify-between" style={{ background: "var(--botanical-deep)" }}>
          <div className="flex items-center gap-3">
            <div className="icon-sm" style={{ background: "rgba(193,236,212,0.18)", color: "#C1ECD4" }}>
              <span className="material-symbols-outlined text-[20px]">travel_explore</span>
            </div>
            <div>
              <div className="t-sm font-extrabold text-white">בדיקת שווי נכס — מדלן</div>
            </div>
          </div>
        </div>
        <div className="px-5 py-4">
          <div className="flex flex-wrap gap-2">
            {properties
              .filter((p) => p.city || p.address)
              .map((p) => (
                <a
                  key={p.id}
                  href={`https://www.madlan.co.il/address/${encodeURIComponent((p.address || "") + " " + (p.city || ""))}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold text-verdant-emerald hover:bg-[#f4f7ed] transition-colors"
                  style={{ border: "1.5px solid #d1fae5" }}
                >
                  <span className="material-symbols-outlined text-[14px]">open_in_new</span>
                  {p.name || p.city}
                </a>
              ))}
            <a
              href="https://www.madlan.co.il"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold text-white"
              style={{ background: "#1B4332" }}
            >
              <span className="material-symbols-outlined text-[14px]">search</span>
              חפש במדלן
            </a>
          </div>
        </div>
      </section>

      {/* ── Recommendations — moved to bottom 2026-04-28 ── */}
      {recommendations.length > 0 ? (
        <section className="mb-6 mt-8 pt-6 border-t v-divider">
          <div className="flex items-center gap-2 mb-3">
            <span className="material-symbols-outlined text-[18px] text-verdant-emerald">lightbulb</span>
            <h2 className="text-sm font-extrabold text-verdant-ink">תובנות והמלצות</h2>
          </div>
          <div className="space-y-2">
            {recommendations.map((rec) => {
              const sevColors: Record<string, { bg: string; border: string; text: string }> = {
                critical:    { bg: "#fef2f2", border: "#fca5a5", text: "#b91c1c" },
                warning:     { bg: "#fffbeb", border: "#fcd34d", text: "#92400e" },
                info:        { bg: "#eff6ff", border: "#93c5fd", text: "#1d4ed8" },
                opportunity: { bg: "#f0fdf4", border: "#86efac", text: "#166534" },
              };
              const c = sevColors[rec.severity];
              return (
                <div key={rec.id} className="flex items-start gap-3 p-3 rounded-xl" style={{ background: c.bg, borderRight: `3px solid ${c.border}` }}>
                  <span className="material-symbols-outlined text-[18px] mt-0.5" style={{ color: c.text }}>{rec.icon}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-extrabold" style={{ color: c.text }}>{rec.title}</span>
                      {rec.impact && (
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ background: c.border + "40", color: c.text }}>
                          {rec.impact}
                        </span>
                      )}
                    </div>
                    <div className="text-[11px] text-verdant-muted mt-0.5">{rec.propertyName} — {rec.detail}</div>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      ) : null}

      {/* ── Modals ── */}
      {showAddForm && <PropertyForm onSave={handleAdd} onCancel={() => setShowAddForm(false)} />}
      {editingProp && <PropertyForm initial={editingProp} onSave={handleUpdate} onCancel={() => setEditingPropId(null)} />}
      {salePropId && (() => {
        const sp = properties.find(p => p.id === salePropId);
        if (!sp) return null;
        return <SaleSimulator property={sp} allProperties={properties} onClose={() => setSalePropId(null)} />;
      })()}
    </div>
  );
}
