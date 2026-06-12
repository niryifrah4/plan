"use client";

import { useState, useEffect, useMemo, useRef } from "react";
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
import { INSURANCE_PROFILE_EVENT, loadInsuranceProfile } from "@/lib/insurance-needs";
import {
  loadDebtData,
  getMortgagesForProperty,
  getUnassignedMortgages,
  effectiveTrackRate,
  type DebtData,
  type MortgageData,
  type MortgageTrack,
} from "@/lib/debt-store";
import { useAssumptions } from "@/lib/hooks/useAssumptions";
import { generateRERecommendations } from "@/lib/realestate-recommendations";
import { AcquisitionSimulator } from "@/components/realestate/AcquisitionSimulator";
import { SaleSimulator } from "@/components/realestate/SaleSimulator";
import { RefinanceAlerts } from "@/components/debt/RefinanceAlerts";
import { GoalLinker } from "@/components/GoalLinker";
import { CityAutocomplete } from "@/components/ui/CityAutocomplete";
import { removeLinksForAsset } from "@/lib/asset-goal-linking";
import { useConfirm } from "@/components/ui/ConfirmModal";

/**
 * Project remaining mortgage balance after `yearsAhead` years.
 * Solves for remaining months from (balance, monthly, rate), then forwards
 * the standard amortization formula B(t) = B₀·(1+r)^t − M·((1+r)^t − 1)/r.
 *
 * Why this matters: a linear approximation (balance − balance/years × y)
 * overstates the equity in the early years of a קל"צ mortgage by 15–25% —
 * for a couple with 2 apartments this skews their forecast significantly.
 */
function projectedMortgageBalance(
  balance: number,
  monthly: number,
  annualRate: number,
  yearsAhead: number
): number {
  if (balance <= 0 || monthly <= 0 || yearsAhead <= 0) return Math.max(0, balance);
  const r = annualRate / 12;
  if (r <= 0) return Math.max(0, balance - monthly * yearsAhead * 12);
  // Payment must cover at least the monthly interest, otherwise balance grows.
  if (monthly <= balance * r) return balance;
  const remainingMonths = -Math.log(1 - (balance * r) / monthly) / Math.log(1 + r);
  if (!isFinite(remainingMonths) || remainingMonths <= 0) return 0;
  const monthsForward = Math.min(yearsAhead * 12, remainingMonths);
  const growth = Math.pow(1 + r, monthsForward);
  return Math.max(0, balance * growth - (monthly * (growth - 1)) / r);
}

/* ═══════════════════════════════════════════════════════════
   Helper: PropertyMortgagePanel
   ───────────────────────────────────────────────────────────
   Renders the mortgage(s) linked to a given property — read-only
   summary, with a CTA to /debt for editing. Built 2026-05-18 as
   part of the multi-mortgage refactor.
   ═══════════════════════════════════════════════════════════ */

function PropertyMortgagePanel({
  propertyId,
  debt,
  primeRate,
}: {
  propertyId: string;
  debt: DebtData;
  primeRate: number;
}) {
  const linked = getMortgagesForProperty(debt, propertyId);

  // No mortgages assigned to this property
  if (linked.length === 0) {
    return null;
  }

  // One or more mortgages — render each
  return (
    <div className="v-divider border-t" style={{ background: "#FAFAF7" }}>
      {linked.map((mortgage) => {
        const tracks = mortgage.tracks || [];
        const monthly = tracks.reduce((s, t) => s + (t.monthlyPayment || 0), 0);
        const balance = tracks.reduce((s, t) => s + (t.remainingBalance || 0), 0);
        const originalAmount = tracks.reduce((s, t) => s + (t.originalAmount || 0), 0);
        const progress = originalAmount > 0 ? (originalAmount - balance) / originalAmount : 0;
        const totalBal = tracks.reduce((s, t) => s + (t.remainingBalance || 0), 0);
        const avgRate =
          totalBal > 0
            ? tracks.reduce(
                (s, t) => s + effectiveTrackRate(t, primeRate) * (t.remainingBalance || 0),
                0
              ) / totalBal
            : 0;

        return (
          <div key={mortgage.id} className="px-5 py-4">
            {/* Header */}
            <div className="mb-3 flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span
                  className="material-symbols-outlined text-[16px]"
                  style={{ color: "#2C7A5A" }}
                >
                  home_work
                </span>
                <span className="text-[12px] font-extrabold" style={{ color: "#1A1A1A" }}>
                  משכנתא — {mortgage.bank || "לא צוין בנק"}
                </span>
                {tracks.length > 0 && (
                  <span
                    className="rounded-full px-2 py-0.5 text-[10px] font-bold"
                    style={{ background: "#FAFAF7", color: "#6B7280" }}
                  >
                    {tracks.length} מסלולים
                  </span>
                )}
              </div>
              <Link
                href="/debt"
                className="text-[10px] font-bold hover:underline"
                style={{ color: "#2C7A5A" }}
                title="ערוך משכנתא בדף החובות"
              >
                ערוך ←
              </Link>
            </div>

            {/* Tracks — compact list */}
            {tracks.length > 0 && (
              <div className="mb-3 space-y-1.5">
                {tracks.map((t) => {
                  const effRate = effectiveTrackRate(t, primeRate);
                  return (
                    <div
                      key={t.id}
                      className="flex items-center justify-between rounded-lg px-3 py-2"
                      style={{
                        background: "#FFFFFF",
                        border: "1px solid #FAFAF7",
                      }}
                    >
                      <div className="flex items-center gap-2 truncate">
                        <span
                          className="truncate text-[12px] font-bold"
                          style={{ color: "#1A1A1A" }}
                        >
                          {t.name || "מסלול"}
                        </span>
                        <span
                          className="rounded-full px-1.5 py-0.5 text-[9px] font-bold"
                          style={{ background: "#FAFAF7", color: "#6B7280" }}
                        >
                          {t.indexation}
                        </span>
                        <span
                          className="text-[11px] font-bold tabular-nums"
                          style={{ color: "#2C7A5A", fontFamily: "inherit" }}
                        >
                          {(effRate * 100).toFixed(2)}%
                        </span>
                      </div>
                      <div className="flex items-center gap-3 text-[11px] tabular-nums">
                        <span style={{ color: "#6B7280", fontFamily: "inherit" }}>
                          {fmtILS(t.remainingBalance || 0)}
                        </span>
                        <span style={{ color: "#1A1A1A", fontFamily: "inherit" }}>
                          {fmtILS(t.monthlyPayment || 0)}/חודש
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Summary row */}
            <div className="flex flex-wrap items-center justify-between gap-2 text-[11px]">
              <div className="flex flex-wrap items-center gap-3" style={{ color: "#6B7280" }}>
                <span>
                  סה״כ נותר:{" "}
                  <span
                    className="font-extrabold tabular-nums"
                    style={{ color: "#1A1A1A", fontFamily: "inherit" }}
                  >
                    {fmtILS(balance)}
                  </span>
                </span>
                <span>
                  החזר חודשי:{" "}
                  <span
                    className="font-extrabold tabular-nums"
                    style={{ color: "#2C7A5A", fontFamily: "inherit" }}
                  >
                    {fmtILS(monthly)}
                  </span>
                </span>
                <span>
                  ריבית משוקללת:{" "}
                  <span
                    className="font-extrabold tabular-nums"
                    style={{ color: "#2C7A5A", fontFamily: "inherit" }}
                  >
                    {(avgRate * 100).toFixed(2)}%
                  </span>
                </span>
              </div>
            </div>

            {/* Progress */}
            {originalAmount > 0 && (
              <div className="mt-2">
                <div
                  className="h-1.5 overflow-hidden rounded-full"
                  style={{ background: "#FAFAF7" }}
                >
                  <div
                    className="h-full rounded-full"
                    style={{
                      width: `${progress * 100}%`,
                      background: "linear-gradient(90deg, #059669, #2C7A5A)",
                    }}
                  />
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   Helper: MiniStat
   ═══════════════════════════════════════════════════════════ */

function MiniStat({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div>
      <div className="text-[11px] font-semibold" style={{ color: "#6B7280" }}>
        {label}
      </div>
      <div className="tabular text-xs font-extrabold" style={{ color: color ?? "#1A1A1A" }}>
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

type NumericFieldKey =
  | "rooms"
  | "purchasePrice"
  | "currentValue"
  | "monthlyRent"
  | "monthlyMortgage"
  | "mortgageBalance"
  | "monthlyExpenses"
  | "annualAppreciation"
  | "oneTimeAppreciation"
  | "oneTimeAppreciationYear"
  | "holdingYears"
  | "annualRentGrowth";

type NumericFieldKind = "money-millions" | "money" | "percent" | "integer";

type NumericEditorState = {
  key: NumericFieldKey;
  label: string;
  kind: NumericFieldKind;
  value: string;
  placeholder: string;
  helper?: string;
};

function formatMoneyMillions(raw: string): string {
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return raw ? raw : "—";
  const inMillions = n / 1_000_000;
  const pretty = Number.isInteger(inMillions)
    ? inMillions.toFixed(0)
    : inMillions.toFixed(inMillions >= 10 ? 1 : 2);
  return `${pretty} מ׳ ₪`;
}

function formatMoney(raw: string): string {
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return raw ? raw : "—";
  return fmtILS(n);
}

function formatPercent(raw: string): string {
  const n = Number(raw);
  if (!Number.isFinite(n) && raw) return raw;
  if (!raw) return "—";
  return `${n}%`;
}

function formatInteger(raw: string): string {
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return raw ? raw : "—";
  return n.toLocaleString("he-IL");
}

function cleanNumericInput(raw: string): string {
  return raw.replace(/,/g, "").replace(/[^\d.-]/g, "");
}

function parseMoneyMillions(raw: string): string {
  const cleaned = cleanNumericInput(raw);
  if (!cleaned) return "";
  const n = Number(cleaned);
  if (!Number.isFinite(n)) return "";
  return String(Math.round(n * 1_000_000));
}

function parseMoney(raw: string): string {
  const cleaned = cleanNumericInput(raw);
  if (!cleaned) return "";
  const n = Number(cleaned);
  if (!Number.isFinite(n)) return "";
  return String(Math.round(n));
}

function parsePercent(raw: string): string {
  const cleaned = cleanNumericInput(raw);
  if (!cleaned) return "";
  const n = Number(cleaned);
  if (!Number.isFinite(n)) return "";
  return String(n);
}

function parseInteger(raw: string): string {
  const cleaned = cleanNumericInput(raw);
  if (!cleaned) return "";
  const n = Number(cleaned);
  if (!Number.isFinite(n)) return "";
  return String(Math.max(1, Math.round(n)));
}

function fieldMeta(key: NumericFieldKey): Omit<NumericEditorState, "value"> {
  switch (key) {
    case "rooms":
      return {
        key,
        label: "חדרים",
        kind: "integer",
        placeholder: "3",
        helper: "הקלדה חופשית בלבד, בלי שינוי בגלגלת.",
      };
    case "purchasePrice":
      return {
        key,
        label: "מחיר רכישה",
        kind: "money-millions",
        placeholder: "1.6",
        helper: "הזן במיליוני שקלים, למשל 1.6 = ₪1,600,000.",
      };
    case "currentValue":
      return {
        key,
        label: "שווי נוכחי",
        kind: "money-millions",
        placeholder: "2.0",
        helper: "הזן במיליוני שקלים.",
      };
    case "monthlyRent":
      return {
        key,
        label: 'הכנסה משכ"ד חודשי',
        kind: "money",
        placeholder: "5,000",
      };
    case "monthlyMortgage":
      return {
        key,
        label: "החזר משכנתא חודשי",
        kind: "money",
        placeholder: "3,500",
      };
    case "mortgageBalance":
      return {
        key,
        label: "יתרת משכנתא",
        kind: "money-millions",
        placeholder: "0.5",
        helper: "הזן במיליוני שקלים.",
      };
    case "monthlyExpenses":
      return {
        key,
        label: "הוצאות חודשיות",
        kind: "money",
        placeholder: "800",
      };
    case "annualAppreciation":
      return {
        key,
        label: "עליית ערך שנתית",
        kind: "percent",
        placeholder: "3",
      };
    case "oneTimeAppreciation":
      return {
        key,
        label: "עליית ערך חד-פעמית",
        kind: "money-millions",
        placeholder: "0.2",
        helper: "למשל 0.2 = ₪200,000.",
      };
    case "oneTimeAppreciationYear":
      return {
        key,
        label: "באיזו שנה",
        kind: "integer",
        placeholder: "3",
      };
    case "holdingYears":
      return {
        key,
        label: "תקופת החזקה מתוכננת",
        kind: "integer",
        placeholder: "10",
      };
    case "annualRentGrowth":
      return {
        key,
        label: 'גידול שכ"ד שנתי',
        kind: "percent",
        placeholder: "3",
      };
  }
}

function formatNumericValue(key: NumericFieldKey, value: string): string {
  const meta = fieldMeta(key);
  switch (meta.kind) {
    case "money-millions":
      return formatMoneyMillions(value);
    case "money":
      return formatMoney(value);
    case "percent":
      return formatPercent(value);
    case "integer":
      return formatInteger(value);
  }
}

function parseNumericValue(key: NumericFieldKey, value: string): string {
  const meta = fieldMeta(key);
  switch (meta.kind) {
    case "money-millions":
      return parseMoneyMillions(value);
    case "money":
      return parseMoney(value);
    case "percent":
      return parsePercent(value);
    case "integer":
      return parseInteger(value);
  }
}

function NumericEditorModal({
  editor,
  onCancel,
  onSave,
}: {
  editor: NumericEditorState | null;
  onCancel: () => void;
  onSave: (key: NumericFieldKey, value: string) => void;
}) {
  const [draft, setDraft] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!editor) return;
    setDraft(editor.value ? editor.value : "");
    const id = window.setTimeout(() => inputRef.current?.focus(), 0);
    return () => window.clearTimeout(id);
  }, [editor]);

  if (!editor) return null;

  const handleSave = () => {
    onSave(editor.key, parseNumericValue(editor.key, draft));
  };

  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-black/40 px-4"
      onClick={onCancel}
    >
      <div
        dir="rtl"
        className="w-full max-w-md rounded-3xl bg-white shadow-soft"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b px-5 py-4">
          <div>
            <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-verdant-muted">
              עריכת מספר
            </div>
            <div className="mt-1 text-sm font-extrabold text-verdant-ink">{editor.label}</div>
          </div>
          <button type="button" onClick={onCancel} className="rounded-full p-2 hover:bg-gray-100">
            <span className="material-symbols-outlined text-[18px] text-verdant-muted">close</span>
          </button>
        </div>
        <div className="space-y-4 px-5 py-5">
          {editor.helper && (
            <div className="text-[11px] leading-relaxed text-verdant-muted">{editor.helper}</div>
          )}
          <label className="block">
            <span className="mb-1 block text-[11px] font-bold text-verdant-muted">ערך</span>
            <input
              ref={inputRef}
              type="text"
              inputMode={
                editor.kind === "integer" || editor.kind === "money" ? "numeric" : "decimal"
              }
              value={draft}
              onChange={(e) => setDraft(cleanNumericInput(e.target.value))}
              onWheel={(e) => e.preventDefault()}
              className="w-full rounded-2xl border border-gray-200 bg-white px-4 py-3 text-right text-base font-bold text-verdant-ink outline-none focus:border-verdant-emerald focus:ring-2 focus:ring-verdant-emerald/20"
              placeholder={editor.placeholder}
              dir="ltr"
            />
          </label>
          <div className="flex items-center justify-between gap-3">
            <div className="text-[10px] font-bold text-verdant-muted">
              {formatNumericValue(editor.key, draft || editor.value)}
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={onCancel}
                className="rounded-xl border border-gray-200 px-4 py-2 text-sm font-bold text-verdant-ink hover:bg-gray-50"
              >
                ביטול
              </button>
              <button
                type="button"
                onClick={handleSave}
                className="rounded-xl bg-verdant-emerald px-4 py-2 text-sm font-bold text-white hover:bg-emerald-700"
              >
                שמור
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function EditableNumericRow({
  label,
  value,
  onEdit,
}: {
  label: string;
  value: string;
  onEdit: () => void;
}) {
  return (
    <div>
      <label className="mb-1 block text-[11px] font-bold text-verdant-muted">{label}</label>
      <div className="flex items-stretch gap-2">
        <div className="flex min-h-11 flex-1 items-center justify-between rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-right text-sm font-bold text-verdant-ink shadow-sm">
          <span className="tabular-nums">{value}</span>
        </div>
        <button
          type="button"
          onClick={onEdit}
          className="flex items-center gap-1 rounded-xl border border-gray-200 bg-[#FAFAF7] px-3 text-[11px] font-bold text-verdant-ink transition-colors hover:bg-gray-100"
        >
          <span className="material-symbols-outlined text-[16px]">edit</span>
          עריכה
        </button>
      </div>
    </div>
  );
}

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
  const [monthlyMortgage, setMonthlyMortgage] = useState(
    initial?.monthlyMortgage?.toString() ?? ""
  );
  const [mortgageBalance, setMortgageBalance] = useState(
    initial?.mortgageBalance?.toString() ?? ""
  );
  const [monthlyExpenses, setMonthlyExpenses] = useState(
    initial?.monthlyExpenses?.toString() ?? ""
  );
  const [annualAppreciation, setAnnualAppreciation] = useState(
    initial?.annualAppreciation != null ? (initial.annualAppreciation * 100).toString() : "3"
  );
  const [oneTimeAppreciation, setOneTimeAppreciation] = useState(
    initial?.oneTimeAppreciation?.toString() ?? ""
  );
  const [oneTimeAppreciationYear, setOneTimeAppreciationYear] = useState(
    initial?.oneTimeAppreciationYear?.toString() ?? ""
  );
  const [holdingYears, setHoldingYears] = useState(initial?.holdingYears?.toString() ?? "10");
  // ברירת מחדל: גידול שכ״ד = עליית ערך (בד״כ 3%)
  const [annualRentGrowth, setAnnualRentGrowth] = useState(
    initial?.annualRentGrowth != null
      ? (initial.annualRentGrowth * 100).toString()
      : initial?.annualAppreciation != null
        ? (initial.annualAppreciation * 100).toString()
        : "3"
  );
  // 2026-04-28: tax exemption flag — drives the מס שבח badge.
  const [purchaseDate, setPurchaseDate] = useState(initial?.purchaseDate ?? "");
  const [isPrimaryResidence, setIsPrimaryResidence] = useState(initial?.isPrimaryResidence ?? true);
  // Default: investment properties are included in retirement, residences are not.
  const [includeInRetirement, setIncludeInRetirement] = useState(
    initial?.includeInRetirement ?? (initial?.type ? initial.type === "investment" : false)
  );
  const [editor, setEditor] = useState<NumericEditorState | null>(null);

  const openEditor = (key: NumericFieldKey, value: string) => {
    const meta = fieldMeta(key);
    setEditor({ ...meta, value });
  };

  const saveEditor = (key: NumericFieldKey, nextValue: string) => {
    switch (key) {
      case "rooms":
        setRooms(nextValue);
        break;
      case "purchasePrice":
        setPurchasePrice(nextValue);
        break;
      case "currentValue":
        setCurrentValue(nextValue);
        break;
      case "monthlyRent":
        setMonthlyRent(nextValue);
        break;
      case "monthlyMortgage":
        setMonthlyMortgage(nextValue);
        break;
      case "mortgageBalance":
        setMortgageBalance(nextValue);
        break;
      case "monthlyExpenses":
        setMonthlyExpenses(nextValue);
        break;
      case "annualAppreciation":
        setAnnualAppreciation(nextValue);
        break;
      case "oneTimeAppreciation":
        setOneTimeAppreciation(nextValue);
        break;
      case "oneTimeAppreciationYear":
        setOneTimeAppreciationYear(nextValue);
        break;
      case "holdingYears":
        setHoldingYears(nextValue);
        break;
      case "annualRentGrowth":
        setAnnualRentGrowth(nextValue);
        break;
    }
    setEditor(null);
  };

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
      oneTimeAppreciationYear: oneTimeAppreciationYear
        ? Number(oneTimeAppreciationYear)
        : undefined,
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
    "w-full px-3 py-2 rounded-lg text-sm border focus:outline-none focus:ring-2 focus:ring-verdant-emerald/30 bg-[#FFFFFF] text-verdant-ink";
  const labelCls = "text-[11px] font-bold text-verdant-muted block mb-1";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onClick={onCancel}
    >
      <div
        className="mx-4 max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-organic bg-[#FFFFFF] shadow-soft"
        onClick={(e) => e.stopPropagation()}
        dir="rtl"
      >
        <div className="v-divider flex items-center justify-between border-b px-6 py-4">
          <span className="text-sm font-extrabold text-verdant-ink">
            {initial ? "עריכת נכס" : "הוספת נכס חדש"}
          </span>
          <button onClick={onCancel} className="rounded p-1 hover:bg-[#FAFAF7]">
            <span className="material-symbols-outlined text-[18px] text-verdant-muted">close</span>
          </button>
        </div>

        <div className="grid grid-cols-2 gap-4 px-6 py-5">
          {/* שם */}
          <div className="col-span-2">
            <label className={labelCls}>שם הנכס</label>
            <input
              className={inputCls}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="דירת מגורים רחוב הרצל 5"
            />
          </div>
          {/* סוג */}
          <div>
            <label className={labelCls}>סוג</label>
            <select
              className={inputCls}
              value={type}
              onChange={(e) => setType(e.target.value as Property["type"])}
            >
              {Object.entries(TYPE_LABELS).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </div>
          {/* עיר */}
          <div>
            <CityAutocomplete label="עיר" value={city} onChange={setCity} />
          </div>
          {/* כתובת */}
          <div className="col-span-2">
            <label className={labelCls}>כתובת (אופציונלי)</label>
            <input
              className={inputCls}
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="רחוב הרצל 5"
            />
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
            <label className="flex cursor-pointer select-none items-center gap-2 text-[12px] font-bold text-verdant-ink">
              <input
                type="checkbox"
                checked={isPrimaryResidence}
                onChange={(e) => setIsPrimaryResidence(e.target.checked)}
                className="h-4 w-4 accent-[#2C7A5A]"
              />
              דירה יחידה (פטור ממס שבח)
            </label>
          </div>
          <div className="col-span-2 flex items-end">
            <label className="flex cursor-pointer select-none items-center gap-2 text-[12px] font-bold text-verdant-ink">
              <input
                type="checkbox"
                checked={includeInRetirement}
                onChange={(e) => setIncludeInRetirement(e.target.checked)}
                className="h-4 w-4 accent-[#2C7A5A]"
              />
              כלול נכס זה בתכנון הפרישה
              <span className="text-[10px] font-medium text-verdant-muted">
                (שווי נכס + שכ״ד יחושבו כחלק מההון לפרישה)
              </span>
            </label>
          </div>
          {/* שטח */}
          <div>
            <label className={labelCls}>שטח מ&quot;ר</label>
            <input
              className={inputCls}
              type="number"
              value={area}
              onChange={(e) => setArea(e.target.value)}
              placeholder="80"
            />
          </div>
          {/* חדרים */}
          <div>
            <EditableNumericRow
              label="חדרים"
              value={formatNumericValue("rooms", rooms)}
              onEdit={() => openEditor("rooms", rooms)}
            />
          </div>
          {/* מחיר רכישה */}
          <div>
            <EditableNumericRow
              label="מחיר רכישה (₪)"
              value={formatNumericValue("purchasePrice", purchasePrice)}
              onEdit={() => openEditor("purchasePrice", purchasePrice)}
            />
          </div>
          {/* שווי נוכחי */}
          <div>
            <EditableNumericRow
              label="שווי נוכחי (₪)"
              value={formatNumericValue("currentValue", currentValue)}
              onEdit={() => openEditor("currentValue", currentValue)}
            />
          </div>
          {/* שכ"ד — רק להשקעה */}
          {(type === "investment" || type === "commercial") && (
            <div>
              <EditableNumericRow
                label={'הכנסה משכ"ד חודשי (₪)'}
                value={formatNumericValue("monthlyRent", monthlyRent)}
                onEdit={() => openEditor("monthlyRent", monthlyRent)}
              />
            </div>
          )}
          {/* משכנתא */}
          <div>
            <EditableNumericRow
              label="החזר משכנתא חודשי (₪)"
              value={formatNumericValue("monthlyMortgage", monthlyMortgage)}
              onEdit={() => openEditor("monthlyMortgage", monthlyMortgage)}
            />
          </div>
          <div>
            <EditableNumericRow
              label="יתרת משכנתא (₪)"
              value={formatNumericValue("mortgageBalance", mortgageBalance)}
              onEdit={() => openEditor("mortgageBalance", mortgageBalance)}
            />
          </div>
          {/* לוח סילוקין PDF — parser still pending; hidden from clients so the
              "בקרוב" placeholder doesn't undermine trust in a half-built feature.
              Restore when /api/documents/parse handles mortgage schedules. */}
          {/* הוצאות */}
          <div>
            <EditableNumericRow
              label="הוצאות חודשיות (₪)"
              value={formatNumericValue("monthlyExpenses", monthlyExpenses)}
              onEdit={() => openEditor("monthlyExpenses", monthlyExpenses)}
            />
          </div>
          {/* עליית ערך */}
          <div>
            <EditableNumericRow
              label="עליית ערך שנתית (%)"
              value={formatNumericValue("annualAppreciation", annualAppreciation)}
              onEdit={() => openEditor("annualAppreciation", annualAppreciation)}
            />
          </div>
          {/* עליית ערך חד-פעמית */}
          <div>
            <EditableNumericRow
              label={'עליית ערך חד-פעמית — שיפוץ/תמ"א (₪)'}
              value={formatNumericValue("oneTimeAppreciation", oneTimeAppreciation)}
              onEdit={() => openEditor("oneTimeAppreciation", oneTimeAppreciation)}
            />
          </div>
          <div>
            <EditableNumericRow
              label="באיזו שנה? (1 = השנה הראשונה)"
              value={formatNumericValue("oneTimeAppreciationYear", oneTimeAppreciationYear)}
              onEdit={() => openEditor("oneTimeAppreciationYear", oneTimeAppreciationYear)}
            />
          </div>
          {/* תקופת החזקה מתוכננת */}
          <div>
            <EditableNumericRow
              label="תקופת החזקה מתוכננת (שנים)"
              value={formatNumericValue("holdingYears", holdingYears)}
              onEdit={() => openEditor("holdingYears", holdingYears)}
            />
          </div>
          {/* גידול שנתי של שכ״ד */}
          {(type === "investment" || type === "commercial") && (
            <div>
              <EditableNumericRow
                label={'גידול שכ"ד שנתי (%)'}
                value={formatNumericValue("annualRentGrowth", annualRentGrowth)}
                onEdit={() => openEditor("annualRentGrowth", annualRentGrowth)}
              />
              <div className="mt-0.5 text-[9px] text-verdant-muted">
                ברירת מחדל: מותאם לעליית הערך
              </div>
            </div>
          )}
        </div>
        <NumericEditorModal editor={editor} onCancel={() => setEditor(null)} onSave={saveEditor} />

        <div className="flex gap-3 px-6 pb-5">
          <button onClick={handleSubmit} className="btn-botanical flex-1 !py-2.5 text-sm">
            {initial ? "שמור שינויים" : "הוסף נכס"}
          </button>
          <button onClick={onCancel} className="btn-botanical-ghost !px-6 !py-2.5 text-sm">
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
  const maxCF = Math.max(
    Math.abs(Math.min(...data.map((d) => d.cumulativeCashflow))),
    Math.max(...data.map((d) => d.cumulativeCashflow)),
    1
  );
  const yCF = (v: number) => PAD.top + plotH / 2 - (v / maxCF) * (plotH / 2);

  const cfPoints = data.map((d, i) => `${x(i) + barW / 2},${yCF(d.cumulativeCashflow)}`).join(" ");

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ maxHeight: 280 }}>
      {/* Grid */}
      {yTicks.map((t) => (
        <g key={t}>
          <line
            x1={PAD.left}
            x2={W - PAD.right}
            y1={y(t)}
            y2={y(t)}
            stroke="#E5E7EB"
            strokeWidth={0.5}
          />
          <text
            x={PAD.left - 6}
            y={y(t) + 3}
            textAnchor="end"
            className="fill-verdant-muted"
            style={{ fontSize: 8 }}
          >
            {t >= 1_000_000 ? `${(t / 1_000_000).toFixed(1)}M` : `${Math.round(t / 1000)}K`}
          </text>
        </g>
      ))}

      {/* Bars */}
      {data.map((d, i) => (
        <g key={d.year}>
          {/* Value bar */}
          <rect
            x={x(i)}
            y={y(d.value)}
            width={barW / 2}
            height={y(0) - y(d.value)}
            rx={2}
            fill="#2C7A5A"
            opacity={0.3}
          />
          {/* Equity bar */}
          <rect
            x={x(i) + barW / 2}
            y={y(d.equity)}
            width={barW / 2}
            height={y(0) - y(d.equity)}
            rx={2}
            fill="#2C7A5A"
          />
          {/* X label */}
          {(i === 0 || (i + 1) % 5 === 0 || i === data.length - 1) && (
            <text
              x={x(i) + barW / 2}
              y={H - 8}
              textAnchor="middle"
              className="fill-verdant-muted"
              style={{ fontSize: 8 }}
            >
              {d.year}
            </text>
          )}
        </g>
      ))}

      {/* Cashflow polyline */}
      <polyline
        points={cfPoints}
        fill="none"
        stroke="#059669"
        strokeWidth={2}
        strokeLinejoin="round"
      />

      {/* Legend */}
      <rect x={PAD.left} y={4} width={8} height={8} rx={2} fill="#2C7A5A" opacity={0.3} />
      <text x={PAD.left + 12} y={11} className="fill-verdant-muted" style={{ fontSize: 8 }}>
        שווי
      </text>
      <rect x={PAD.left + 38} y={4} width={8} height={8} rx={2} fill="#2C7A5A" />
      <text x={PAD.left + 50} y={11} className="fill-verdant-muted" style={{ fontSize: 8 }}>
        הון עצמי
      </text>
      <line x1={PAD.left + 90} y1={8} x2={PAD.left + 102} y2={8} stroke="#059669" strokeWidth={2} />
      <text x={PAD.left + 106} y={11} className="fill-verdant-muted" style={{ fontSize: 8 }}>
        תזרים מצטבר
      </text>
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
  // Mount-time clock — Date.now() used directly in render causes hydration
  // mismatches (server clock vs. client clock differ by milliseconds). We
  // initialize to null on SSR, populate on mount, and treat null as "0 years"
  // so ROI shows "—" until hydration completes (one frame, imperceptible).
  const [nowMs, setNowMs] = useState<number | null>(null);
  useEffect(() => {
    setNowMs(Date.now());
  }, []);
  const [properties, setProperties] = useState<Property[]>([]);
  const [mortgage, setMortgage] = useState<MortgageData | null>(null);
  // Full DebtData — needed to look up per-property mortgages.
  const [debtData, setDebtData] = useState<DebtData>({
    loans: [],
    installments: [],
    mortgages: [],
  });
  const assumptions = useAssumptions();
  // Rates are stored as DECIMAL fractions across the debt module since
  // 2026-05-19. Pass primeRate as decimal (0.06 = 6%) and convert to percent
  // only at display time.
  const primeRate = assumptions.primeRate;
  const { confirm, modal: confirmModal } = useConfirm();
  const [insuranceProfile, setInsuranceProfile] = useState(loadInsuranceProfile());
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingPropId, setEditingPropId] = useState<string | null>(null);
  const [salePropId, setSalePropId] = useState<string | null>(null);
  const [expandedPropId, setExpandedPropId] = useState<string | null>(null);

  /* Forecast sliders */
  const [forecastYears, setForecastYears] = useState(15);
  const [forecastAppreciation, setForecastAppreciation] = useState(3.0);
  const [forecastRentGrowth, setForecastRentGrowth] = useState(2.0);

  /* ── Load data ── */
  useEffect(() => {
    const refresh = () => {
      setProperties(loadProperties());
      const debt = loadDebtData();
      setDebtData(debt);
      // Drive the legacy "Mortgage Detail" section from the first mortgage.
      // Per-property mortgage rendering is added in the property cards block.
      setMortgage(debt.mortgages[0] ?? null);
    };
    refresh();
    window.addEventListener(EVENT_NAME, refresh);
    window.addEventListener("storage", refresh);
    window.addEventListener("verdant:debt:updated", refresh);
    return () => {
      window.removeEventListener(EVENT_NAME, refresh);
      window.removeEventListener("storage", refresh);
      window.removeEventListener("verdant:debt:updated", refresh);
    };
  }, []);

  useEffect(() => {
    const refreshInsurance = () => setInsuranceProfile(loadInsuranceProfile());
    refreshInsurance();
    window.addEventListener(INSURANCE_PROFILE_EVENT, refreshInsurance);
    window.addEventListener("storage", refreshInsurance);
    return () => {
      window.removeEventListener(INSURANCE_PROFILE_EVENT, refreshInsurance);
      window.removeEventListener("storage", refreshInsurance);
    };
  }, []);

  /* ── Computed KPIs ── */
  const totalValue = properties.reduce((s, p) => s + p.currentValue, 0);
  const totalPurchaseValue = properties.reduce((s, p) => s + p.purchasePrice, 0);
  // Mortgage: prefer per-property data, fallback to debt-store
  const totalMortgageBalanceFromProps = properties.reduce(
    (s, p) => s + (p.mortgageBalance ?? 0),
    0
  );
  const totalMortgageBalanceFromDebt =
    mortgage?.tracks.reduce((s, t) => s + t.remainingBalance, 0) ?? 0;
  const totalMortgageBalance =
    totalMortgageBalanceFromProps > 0
      ? totalMortgageBalanceFromProps
      : totalMortgageBalanceFromDebt;
  const totalMonthlyRent = properties.reduce((s, p) => s + (p.monthlyRent ?? 0), 0);
  const totalMonthlyMortgageFromProps = properties.reduce(
    (s, p) => s + (p.monthlyMortgage ?? 0),
    0
  );
  const totalMonthlyMortgageFromDebt =
    mortgage?.tracks.reduce((s, t) => s + t.monthlyPayment, 0) ?? 0;
  const totalMonthlyMortgage =
    totalMonthlyMortgageFromProps > 0
      ? totalMonthlyMortgageFromProps
      : totalMonthlyMortgageFromDebt;
  const totalMonthlyExpenses = properties.reduce((s, p) => s + (p.monthlyExpenses ?? 0), 0);
  const equity = totalValue - totalMortgageBalance;
  const ltv = totalValue > 0 ? (totalMortgageBalance / totalValue) * 100 : 0;
  const appreciation =
    totalPurchaseValue > 0 ? ((totalValue - totalPurchaseValue) / totalPurchaseValue) * 100 : 0;
  // DSCR = NOI / Debt Service = (Rent - Expenses) / Mortgage
  const noi = totalMonthlyRent - totalMonthlyExpenses;
  const dscr = totalMonthlyMortgage > 0 ? noi / totalMonthlyMortgage : 0;
  const netCashflow = totalMonthlyRent - totalMonthlyExpenses - totalMonthlyMortgage;
  // ROI — annual return on equity. Two corrections vs. the prior implementation:
  // (1) equity uses `originalLoanAmount` (downpayment) — `mortgageBalance` is the
  //     current balance after payments, which inflates apparent equity and
  //     understates ROI as years pass.
  // (2) totalReturn must be annual: the prior formula mixed cumulative
  //     appreciation with annual cashflow. We weight by years-held and
  //     express appreciation as annual rate, then add the current cashflow.
  // If a property is missing `originalLoanAmount` or `purchaseDate`, it's
  // excluded — better to show "—" than a misleading number.
  const yearsBetween = (iso: string): number => {
    if (!iso || nowMs === null) return 0;
    const ms = new Date(iso.length === 7 ? iso + "-01" : iso).getTime();
    if (!isFinite(ms)) return 0;
    return Math.max(0, (nowMs - ms) / (1000 * 60 * 60 * 24 * 365.25));
  };
  const reliableProps = properties.filter(
    (p) =>
      typeof p.originalLoanAmount === "number" &&
      p.originalLoanAmount >= 0 &&
      p.purchasePrice > p.originalLoanAmount &&
      !!p.purchaseDate &&
      yearsBetween(p.purchaseDate) > 0
  );
  const totalEquityInvested = reliableProps.reduce(
    (s, p) => s + (p.purchasePrice - (p.originalLoanAmount ?? 0)),
    0
  );
  let roi = 0;
  if (totalEquityInvested > 0) {
    // Equity-weighted annual appreciation CAGR + annual cashflow yield on equity
    let weightedAppreciationCAGR = 0;
    for (const p of reliableProps) {
      const equity = p.purchasePrice - (p.originalLoanAmount ?? 0);
      const yrs = yearsBetween(p.purchaseDate!);
      const currentValue = p.currentValue || 0;
      if (yrs > 0 && p.purchasePrice > 0 && currentValue > 0) {
        const cagr = Math.pow(currentValue / p.purchasePrice, 1 / yrs) - 1;
        weightedAppreciationCAGR += cagr * (equity / totalEquityInvested);
      }
    }
    const cashflowYield = (netCashflow * 12) / totalEquityInvested;
    roi = (weightedAppreciationCAGR + cashflowYield) * 100;
  }

  const hasMortgageExposure = totalMortgageBalance > 0 || totalMonthlyMortgage > 0;
  const showLtvKpi = hasMortgageExposure && totalValue > 0;
  const showInsuranceBadge = hasMortgageExposure && !insuranceProfile.hasMortgageLifeInsurance;
  const showAnnualReturnBadge = totalEquityInvested > 0;
  const kpiGridClassName = showLtvKpi
    ? "grid grid-cols-2 gap-3 md:grid-cols-3"
    : "grid grid-cols-2 gap-3 md:grid-cols-2";

  /* ── Forecast ── */
  const forecast = useMemo(() => {
    const years: ForecastRow[] = [];
    let cumulativeCF = 0;

    // Sum one-time appreciations by year
    const oneTimeByYear: Record<number, number> = {};
    for (const p of properties) {
      if (p.oneTimeAppreciation && p.oneTimeAppreciationYear) {
        oneTimeByYear[p.oneTimeAppreciationYear] =
          (oneTimeByYear[p.oneTimeAppreciationYear] || 0) + p.oneTimeAppreciation;
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

      // Per-property remaining balance — true amortization, not linear.
      // Fallback rate: assumptions.avgMortgageRate (BoI quarterly publication).
      const projectedTotalMortgage = properties.reduce((sum, p) => {
        const bal = p.mortgageBalance ?? 0;
        const m = p.monthlyMortgage ?? 0;
        return sum + projectedMortgageBalance(bal, m, assumptions.avgMortgageRate, y);
      }, 0);

      years.push({
        year: y,
        value: Math.round(runningValue),
        cumulativeCashflow: Math.round(cumulativeCF),
        equity: Math.round(runningValue - projectedTotalMortgage),
      });
    }
    return years;
  }, [
    forecastYears,
    forecastAppreciation,
    forecastRentGrowth,
    totalValue,
    totalMonthlyRent,
    totalMonthlyMortgage,
    totalMortgageBalance,
    properties,
    assumptions.avgMortgageRate,
  ]);

  const finalValue = forecast[forecast.length - 1]?.value ?? totalValue;
  const finalEquity = forecast[forecast.length - 1]?.equity ?? equity;
  const totalCashflow = forecast[forecast.length - 1]?.cumulativeCashflow ?? 0;
  const equityMultiple = equity > 0 ? (finalEquity + totalCashflow) / equity : 0;
  const irrEstimate =
    equity > 0
      ? (Math.pow((finalEquity + totalCashflow) / equity, 1 / forecastYears) - 1) * 100
      : 0;

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

  const handleDelete = async (id: string) => {
    const prop = properties.find((p) => p.id === id);
    const valueText = prop?.currentValue ? ` בשווי ${fmtILS(prop.currentValue)}` : "";
    const ok = await confirm({
      title: "למחוק את הנכס?",
      body: `הנכס "${prop?.name ?? "ללא שם"}"${valueText} יימחק יחד עם הקישורים שלו ליעדים. הפעולה בלתי הפיכה.`,
      confirmLabel: "כן, מחק",
      cancelLabel: "ביטול",
      variant: "danger",
    });
    if (!ok) return;
    deleteProperty(id);
    removeLinksForAsset("realestate", id);
    pulse();
    setProperties(loadProperties());
  };

  /* ── Recommendations ── */
  const recommendations = useMemo(() => generateRERecommendations(properties), [properties]);

  /* ── KPI data ── */
  const kpis = [
    {
      label: "שווי נכסים נטו",
      value: fmtILS(equity),
      sub: totalValue > 0 ? `שווי ברוטו: ${fmtILS(totalValue)}` : undefined,
      icon: "home",
      color: "#2C7A5A",
    },
    {
      label: "תזרים חודשי נטו",
      value: fmtILS(netCashflow),
      sub:
        totalMonthlyRent > 0
          ? `שכ״ד ${fmtILS(totalMonthlyRent)} − הוצאות ${fmtILS(totalMonthlyExpenses + totalMonthlyMortgage)}`
          : undefined,
      icon: netCashflow >= 0 ? "trending_up" : "trending_down",
      color: netCashflow >= 0 ? "#2C7A5A" : "#DC2626",
    },
  ];

  if (showLtvKpi) {
    kpis.push({
      label: "מימון מהבנק (LTV ממוצע)",
      value: `${ltv.toFixed(0)}%`,
      sub: ltv <= 60 ? "רמת מינוף בריאה" : ltv <= 75 ? "מינוף סביר" : "מינוף גבוה",
      icon: "percent",
      color: ltv <= 60 ? "#2C7A5A" : ltv <= 75 ? "#D97706" : "#DC2626",
    });
  }

  const kpiBadges = [
    showInsuranceBadge
      ? {
          label: "אין כיסוי ביטוחי",
          icon: "shield",
          tone: "amber" as const,
        }
      : null,
    showAnnualReturnBadge
      ? {
          label: `תשואה שנתית ${roi.toFixed(1)}%`,
          icon: "trending_up",
          tone: roi >= 0 ? ("emerald" as const) : ("red" as const),
        }
      : null,
  ].filter(Boolean) as Array<{ label: string; icon: string; tone: KpiTone }>;

  const editingProp = editingPropId ? properties.find((p) => p.id === editingPropId) : undefined;

  /* ═══════════════════════════════════════════════════════════
     Render
     ═══════════════════════════════════════════════════════════ */
  return (
    <div className="mx-auto max-w-5xl" dir="rtl">
      {confirmModal}
      {/* ── 1. PageHeader ── */}
      <PageHeader
        subtitle="שלב 6"
        title="נדל״ן"
        description={`שווי נטו: ${fmtILS(equity)} · תזרים חודשי: ${fmtILS(netCashflow)}`}
      />
      {/* אינדיקטור שמירה */}
      <div className="-mt-4 mb-3 flex min-h-[18px] justify-end">
        <SaveStatus status={saveStatus} />
      </div>

      {/* ── 2. KPI Row ── */}
      <div className={`mb-3 ${kpiGridClassName}`}>
        {kpis.map((k) => {
          const tone: KpiTone =
            k.color === "#2C7A5A"
              ? "emerald"
              : k.color === "#DC2626"
                ? "red"
                : k.color === "#D97706"
                  ? "amber"
                  : "forest";
          return (
            <SolidKpi
              key={k.label}
              label={k.label}
              value={String(k.value)}
              icon={k.icon}
              tone={tone}
              sub={k.sub ?? null}
            />
          );
        })}
      </div>

      {kpiBadges.length > 0 && (
        <div className="mb-6 flex flex-wrap justify-end gap-2">
          {kpiBadges.map((badge) => (
            <span
              key={badge.label}
              className="inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[11px] font-bold"
              style={{
                borderColor:
                  badge.tone === "amber" ? "#F59E0B" : badge.tone === "red" ? "#DC2626" : "#2C7A5A",
                background:
                  badge.tone === "amber"
                    ? "rgba(245,158,11,0.10)"
                    : badge.tone === "red"
                      ? "rgba(220,38,38,0.08)"
                      : "rgba(44,122,90,0.08)",
                color:
                  badge.tone === "amber" ? "#B45309" : badge.tone === "red" ? "#DC2626" : "#2C7A5A",
              }}
            >
              <span className="material-symbols-outlined text-[13px]">{badge.icon}</span>
              {badge.label}
            </span>
          ))}
        </div>
      )}

      {/* Recommendations moved to bottom of page (2026-04-28 per Nir):
          "המרכז חייב להיות נקי לנתונים ותכנון". See section at end of page. */}

      {/* ── 3. Property Cards + CRUD ── */}
      <h2 className="mb-3 text-sm font-extrabold text-verdant-ink">הנכסים שלי</h2>

      {properties.map((prop) => {
        const propRecs = recommendations.filter((r) => r.propertyId === prop.id);

        const isExpanded = expandedPropId === prop.id;
        const mtgBal = prop.mortgageBalance ?? 0;
        const netEquity = prop.currentValue - mtgBal;
        const equityPct = prop.currentValue > 0 ? (netEquity / prop.currentValue) * 100 : 100;
        const appreciationPct =
          prop.purchasePrice > 0
            ? (((prop.currentValue - prop.purchasePrice) / prop.purchasePrice) * 100).toFixed(1)
            : "0.0";
        const hasHoldingYears = prop.holdingYears != null && prop.holdingYears > 0;

        const tx = propertyTaxStatus(prop, properties);
        const isMissingTax =
          (prop.type === "residence" || prop.type === "investment") && tx.status === "unknown";
        const linkedMortgages = getMortgagesForProperty(debtData, prop.id);
        const hasUnassignedMortgage =
          linkedMortgages.length === 0 && getUnassignedMortgages(debtData).length > 0;
        const showFooter = isMissingTax || hasUnassignedMortgage;

        return (
          <div key={prop.id}>
            <section className="v-card mb-4 hidden overflow-hidden md:block">
              <div className="flex items-center justify-between px-5 pb-2 pt-4">
                <div className="flex items-center gap-3">
                  <div
                    className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-xl"
                    style={{
                      background: prop.type === "investment" ? "#FAFAF7" : "#E1F5EE",
                      border: "1px solid #9FE1CB",
                    }}
                  >
                    <span
                      className="material-symbols-outlined text-[20px]"
                      style={{ color: prop.type === "investment" ? "#374151" : "#0F6E56" }}
                    >
                      {prop.type === "investment"
                        ? "apartment"
                        : prop.type === "commercial"
                          ? "store"
                          : prop.type === "land"
                            ? "landscape"
                            : "home"}
                    </span>
                    {propRecs.length > 0 && (
                      <div className="absolute -left-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-amber-500 text-[9px] font-bold text-white">
                        {propRecs.length}
                      </div>
                    )}
                  </div>
                  <div>
                    <div className="text-[13px] font-extrabold text-verdant-ink">
                      {prop.name}
                      <span className="ml-1 font-normal text-verdant-muted">
                        · {TYPE_LABELS[prop.type]}
                      </span>
                    </div>
                    <div className="mt-0.5 text-[16px] font-extrabold tabular-nums leading-tight text-verdant-ink">
                      {fmtILS(prop.currentValue)}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setSalePropId(prop.id)}
                    title="סימולציית מכירה"
                    className="mr-2 flex items-center gap-1 rounded-lg border px-2.5 py-1.5 text-[11px] font-bold hover:bg-[#FAFAF7]"
                    style={{ color: "#2C7A5A", borderColor: "#E5E7EB" }}
                  >
                    <span className="material-symbols-outlined text-[14px]">sell</span>
                    מכירה
                  </button>
                  <button
                    onClick={() => setEditingPropId(prop.id)}
                    title="עריכה"
                    className="flex shrink-0 items-center justify-center rounded-lg p-2.5 hover:bg-[#FAFAF7]"
                  >
                    <span className="material-symbols-outlined text-[16px] text-verdant-muted">
                      edit
                    </span>
                  </button>
                  <button
                    onClick={() => handleDelete(prop.id)}
                    title="מחיקה"
                    className="flex shrink-0 items-center justify-center rounded-lg p-2.5 hover:bg-red-50"
                  >
                    <span className="material-symbols-outlined text-[16px] text-red-400">
                      delete
                    </span>
                  </button>
                </div>
              </div>

              <div className="flex items-center gap-3 px-5 pb-3">
                <div className="flex-1">
                  <div className="text-[10px] text-verdant-muted">הון עצמי</div>
                  <div className="text-[13px] font-bold tabular-nums" style={{ color: "#0F6E56" }}>
                    {fmtILS(netEquity)} · {equityPct.toFixed(0)}%
                  </div>
                </div>
                <div className="h-4 w-px shrink-0 bg-gray-200"></div>
                <div className="flex-1">
                  <div className="text-[10px] text-verdant-muted">עליית ערך</div>
                  <div className="text-[13px] font-bold tabular-nums text-verdant-muted">
                    {appreciationPct}% {hasHoldingYears ? ` / ${prop.holdingYears} שנים` : ""}
                  </div>
                </div>
                <button
                  onClick={() => setExpandedPropId(isExpanded ? null : prop.id)}
                  className="mr-auto flex items-center gap-1 text-[11px] text-verdant-muted hover:text-verdant-ink"
                >
                  <span className="material-symbols-outlined text-[14px]">
                    {isExpanded ? "expand_less" : "expand_more"}
                  </span>
                  פרטים
                </button>
              </div>

              {isExpanded && (
                <div className="v-divider border-t bg-[#FAFAF7]/30 pb-2 pt-3">
                  {(() => {
                    const rent = prop.monthlyRent ?? 0;
                    const expenses = prop.monthlyExpenses ?? 0;
                    const mtg = prop.monthlyMortgage ?? 0;
                    const propCashflow = rent - expenses - mtg;
                    const propNoi = rent - expenses;
                    const propDscr = mtg > 0 ? propNoi / mtg : 0;
                    const annualCashflow = propCashflow * 12;
                    const equityInvested =
                      prop.purchasePrice - (prop.purchasePrice - mtgBal > 0 ? mtgBal : 0);
                    const coc = equityInvested > 0 ? (annualCashflow / equityInvested) * 100 : 0;
                    const isInvestment = prop.type === "investment" || prop.type === "commercial";
                    return (
                      <div className="grid grid-cols-2 gap-3 px-5 pb-2 md:grid-cols-4">
                        <MiniStat label="מחיר רכישה" value={fmtILS(prop.purchasePrice)} />
                        {rent > 0 && <MiniStat label="שכ״ד חודשי" value={fmtILS(rent)} />}
                        {rent > 0 && (
                          <MiniStat
                            label="תשואת שכירות"
                            value={`${(((rent * 12) / (prop.currentValue || 1)) * 100).toFixed(1)}%`}
                          />
                        )}
                        {mtg > 0 && <MiniStat label="החזר משכנתא" value={fmtILS(mtg)} />}
                        {mtgBal > 0 && (
                          <MiniStat label="יתרת משכנתא" value={fmtILS(mtgBal)} color="#DC2626" />
                        )}
                        {isInvestment && rent > 0 && (
                          <MiniStat
                            label="תזרים חודשי נטו"
                            value={`${propCashflow >= 0 ? "+" : ""}${fmtILS(propCashflow)}`}
                            color={propCashflow >= 0 ? "#2C7A5A" : "#DC2626"}
                          />
                        )}
                        {isInvestment && mtg > 0 && rent > 0 && (
                          <MiniStat
                            label="כיסוי החזר"
                            value={propDscr.toFixed(2)}
                            color={
                              propDscr >= 1.25 ? "#2C7A5A" : propDscr >= 1.0 ? "#D97706" : "#DC2626"
                            }
                          />
                        )}
                        {isInvestment && rent > 0 && (
                          <MiniStat
                            label="תשואה על הון"
                            value={`${coc.toFixed(1)}%`}
                            color={coc > 5 ? "#2C7A5A" : coc > 0 ? "#D97706" : "#DC2626"}
                          />
                        )}
                        {prop.city && <MiniStat label="עיר" value={prop.city} />}
                        {prop.rooms && <MiniStat label="חדרים" value={`${prop.rooms}`} />}
                        {prop.area && <MiniStat label='שטח במ"ר' value={`${prop.area}`} />}
                      </div>
                    );
                  })()}

                  {/* Linked mortgages for this property — multi-mortgage model */}
                  <PropertyMortgagePanel
                    propertyId={prop.id}
                    debt={debtData}
                    primeRate={primeRate}
                  />

                  {/* Goal linking */}
                  <div className="v-divider mt-2 border-t px-5 pb-3 pt-3">
                    <div className="mb-2 flex items-center gap-2">
                      <span
                        className="material-symbols-outlined text-[14px]"
                        style={{ color: "#2C7A5A" }}
                      >
                        flag
                      </span>
                      <span className="text-[11px] font-bold text-verdant-muted">
                        שיוך הון עצמי ליעד
                      </span>
                    </div>
                    <GoalLinker
                      assetType="realestate"
                      assetId={prop.id}
                      assetValue={netEquity}
                      variant="card"
                    />
                  </div>
                </div>
              )}

              {showFooter && (
                <div className="v-divider flex items-center justify-between border-t bg-[#FAFAF7] px-5 py-2.5">
                  <div className="flex items-center gap-2">
                    {isMissingTax && (
                      <span className="inline-flex items-center gap-1 rounded-md bg-[#FAEEDA] px-2 py-0.5 text-[10px] font-bold text-[#633806]">
                        <span className="material-symbols-outlined text-[12px]">warning</span>
                        מס שבח חסר
                      </span>
                    )}
                    {hasUnassignedMortgage && (
                      <span className="inline-flex items-center gap-1 rounded-md bg-[#FCEBEB] px-2 py-0.5 text-[10px] font-bold text-[#791F1F]">
                        <span className="material-symbols-outlined text-[12px]">link_off</span>
                        משכנתא לא משויכת
                      </span>
                    )}
                  </div>
                  <Link
                    href={hasUnassignedMortgage ? "/debt" : "#"}
                    className="rounded-md border border-[#0F6E56] bg-white px-3 py-1 text-[11px] font-bold text-[#0F6E56] shadow-sm transition-colors hover:bg-[#0F6E56] hover:text-white"
                    onClick={(e) => {
                      if (!hasUnassignedMortgage) {
                        e.preventDefault();
                        setEditingPropId(prop.id);
                      }
                    }}
                  >
                    תיקון ←
                  </Link>
                </div>
              )}
            </section>
            <section className="v-card mb-4 block overflow-hidden rounded-2xl border-[0.5px] border-gray-200 md:hidden">
              <div className="p-3.5">
                {/* Header Row */}
                <div className="mb-3 flex items-start justify-between gap-2.5">
                  <div className="flex min-w-0 flex-1 items-center gap-3">
                    <div
                      className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-xl"
                      style={{
                        background: prop.type === "investment" ? "#FAFAF7" : "#E1F5EE",
                        border: "1px solid #9FE1CB",
                      }}
                    >
                      <span
                        className="material-symbols-outlined text-[20px]"
                        style={{ color: prop.type === "investment" ? "#374151" : "#0F6E56" }}
                      >
                        {prop.type === "investment"
                          ? "apartment"
                          : prop.type === "commercial"
                            ? "store"
                            : prop.type === "land"
                              ? "landscape"
                              : "home"}
                      </span>
                      {propRecs.length > 0 && (
                        <div className="absolute -left-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-amber-500 text-[9px] font-bold text-white">
                          {propRecs.length}
                        </div>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[14px] font-medium text-verdant-ink">
                        {prop.name}
                        <span className="ml-1 font-normal text-verdant-muted">
                          · {TYPE_LABELS[prop.type]}
                        </span>
                      </div>
                      <div className="mt-0.5 text-[20px] font-medium tabular-nums leading-tight text-verdant-ink">
                        {fmtILS(prop.currentValue)}
                      </div>
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <button
                      onClick={() => setEditingPropId(prop.id)}
                      title="עריכה"
                      className="flex h-10 w-10 items-center justify-center rounded-xl border-[0.5px] border-gray-200 bg-transparent text-gray-500 hover:bg-gray-50"
                    >
                      <span className="material-symbols-outlined text-[18px]">edit</span>
                    </button>
                    <button
                      onClick={() => handleDelete(prop.id)}
                      title="מחיקה"
                      className="flex h-10 w-10 items-center justify-center rounded-xl border-[0.5px] border-gray-200 bg-transparent text-[#E24B4A] hover:bg-red-50"
                    >
                      <span className="material-symbols-outlined text-[18px]">delete</span>
                    </button>
                  </div>
                </div>

                {/* Metrics Row */}
                <div className="mb-3 grid grid-cols-2 gap-2">
                  <div className="rounded-xl bg-[#FAFAF7] px-3 py-2">
                    <div className="mb-0.5 text-[10px] text-verdant-muted">הון עצמי</div>
                    <div className="text-[13px] font-medium tabular-nums text-[#085041]">
                      {fmtILS(netEquity)} · {equityPct.toFixed(0)}%
                    </div>
                  </div>
                  <div className="rounded-xl bg-[#FAFAF7] px-3 py-2">
                    <div className="mb-0.5 text-[10px] text-verdant-muted">
                      עליית ערך{hasHoldingYears ? ` · ${prop.holdingYears} שנים` : ""}
                    </div>
                    <div className="text-[13px] font-medium tabular-nums text-gray-600">
                      {appreciationPct}%
                    </div>
                  </div>
                </div>

                {/* Actions Row */}
                <div className="flex gap-1.5">
                  <button
                    onClick={() => setSalePropId(prop.id)}
                    title="סימולציית מכירה"
                    className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border-[1.5px] border-[#1D9E75] bg-transparent p-2.5 text-[13px] font-medium text-[#0F6E56] hover:bg-gray-50"
                  >
                    <span className="material-symbols-outlined text-[16px]">sell</span>
                    סימולציית מכירה
                  </button>
                  <button
                    onClick={() => setExpandedPropId(isExpanded ? null : prop.id)}
                    className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border-[0.5px] border-gray-300 text-gray-500 hover:bg-gray-50"
                  >
                    <span className="material-symbols-outlined text-[18px]">
                      {isExpanded ? "expand_less" : "expand_more"}
                    </span>
                  </button>
                </div>
              </div>

              {isExpanded && (
                <div className="v-divider border-t border-gray-200 bg-[#FAFAF7]/30 pb-2 pt-3">
                  {(() => {
                    const rent = prop.monthlyRent ?? 0;
                    const expenses = prop.monthlyExpenses ?? 0;
                    const mtg = prop.monthlyMortgage ?? 0;
                    const propCashflow = rent - expenses - mtg;
                    const propNoi = rent - expenses;
                    const propDscr = mtg > 0 ? propNoi / mtg : 0;
                    const annualCashflow = propCashflow * 12;
                    const equityInvested =
                      prop.purchasePrice - (prop.purchasePrice - mtgBal > 0 ? mtgBal : 0);
                    const coc = equityInvested > 0 ? (annualCashflow / equityInvested) * 100 : 0;
                    const isInvestment = prop.type === "investment" || prop.type === "commercial";
                    return (
                      <div className="grid grid-cols-2 gap-3 px-4 pb-2 md:grid-cols-4">
                        <MiniStat label="מחיר רכישה" value={fmtILS(prop.purchasePrice)} />
                        {rent > 0 && <MiniStat label="שכ״ד חודשי" value={fmtILS(rent)} />}
                        {rent > 0 && (
                          <MiniStat
                            label="תשואת שכירות"
                            value={`${(((rent * 12) / (prop.currentValue || 1)) * 100).toFixed(1)}%`}
                          />
                        )}
                        {mtg > 0 && <MiniStat label="החזר משכנתא" value={fmtILS(mtg)} />}
                        {mtgBal > 0 && (
                          <MiniStat label="יתרת משכנתא" value={fmtILS(mtgBal)} color="#DC2626" />
                        )}
                        {isInvestment && rent > 0 && (
                          <MiniStat
                            label="תזרים חודשי נטו"
                            value={`${propCashflow >= 0 ? "+" : ""}${fmtILS(propCashflow)}`}
                            color={propCashflow >= 0 ? "#2C7A5A" : "#DC2626"}
                          />
                        )}
                        {isInvestment && mtg > 0 && rent > 0 && (
                          <MiniStat
                            label="כיסוי החזר"
                            value={propDscr.toFixed(2)}
                            color={
                              propDscr >= 1.25 ? "#2C7A5A" : propDscr >= 1.0 ? "#D97706" : "#DC2626"
                            }
                          />
                        )}
                        {isInvestment && rent > 0 && (
                          <MiniStat
                            label="תשואה על הון"
                            value={`${coc.toFixed(1)}%`}
                            color={coc > 5 ? "#2C7A5A" : coc > 0 ? "#D97706" : "#DC2626"}
                          />
                        )}
                        {prop.city && <MiniStat label="עיר" value={prop.city} />}
                        {prop.rooms && <MiniStat label="חדרים" value={`${prop.rooms}`} />}
                        {prop.area && <MiniStat label='שטח במ"ר' value={`${prop.area}`} />}
                      </div>
                    );
                  })()}

                  {/* Linked mortgages for this property — multi-mortgage model */}
                  <PropertyMortgagePanel
                    propertyId={prop.id}
                    debt={debtData}
                    primeRate={primeRate}
                  />

                  {/* Goal linking */}
                  <div className="v-divider mt-2 border-t border-gray-200 px-4 pb-3 pt-3">
                    <div className="mb-2 flex items-center gap-2">
                      <span
                        className="material-symbols-outlined text-[14px]"
                        style={{ color: "#2C7A5A" }}
                      >
                        flag
                      </span>
                      <span className="text-[11px] font-bold text-verdant-muted">
                        שיוך הון עצמי ליעד
                      </span>
                    </div>
                    <GoalLinker
                      assetType="realestate"
                      assetId={prop.id}
                      assetValue={netEquity}
                      variant="card"
                    />
                  </div>
                </div>
              )}

              {showFooter && (
                <div className="flex flex-col gap-2 border-t border-gray-200 bg-[#FAFAF7] px-3.5 py-2.5">
                  {isMissingTax && (
                    <div className="flex items-center justify-between gap-2">
                      <span className="inline-flex items-center gap-1.5 rounded-lg bg-[#FAEEDA] px-2.5 py-1 text-[11px] font-medium text-[#633806]">
                        <span className="material-symbols-outlined text-[13px]">warning</span>
                        מס שבח חסר
                      </span>
                      <Link
                        href="#"
                        onClick={(e) => {
                          e.preventDefault();
                          setEditingPropId(prop.id);
                        }}
                        className="flex items-center gap-1 whitespace-nowrap rounded-lg border-[1.5px] border-[#1D9E75] bg-transparent px-2.5 py-1.5 text-[11px] font-medium text-[#0F6E56] hover:bg-gray-50"
                      >
                        <span className="material-symbols-outlined scale-x-[-1] text-[13px]">
                          arrow_right_alt
                        </span>
                        תיקון
                      </Link>
                    </div>
                  )}
                  {hasUnassignedMortgage && (
                    <div className="flex items-center justify-between gap-2">
                      <span className="inline-flex items-center gap-1.5 rounded-lg bg-[#FCEBEB] px-2.5 py-1 text-[11px] font-medium text-[#791F1F]">
                        <span className="material-symbols-outlined text-[13px]">link_off</span>
                        משכנתא לא משויכת
                      </span>
                      <Link
                        href="/debt"
                        className="flex items-center gap-1 whitespace-nowrap rounded-lg border-[1.5px] border-[#1D9E75] bg-transparent px-2.5 py-1.5 text-[11px] font-medium text-[#0F6E56] hover:bg-gray-50"
                      >
                        <span className="material-symbols-outlined scale-x-[-1] text-[13px]">
                          arrow_right_alt
                        </span>
                        תיקון
                      </Link>
                    </div>
                  )}
                </div>
              )}
            </section>
          </div>
        );
      })}

      {/* Add button */}
      <button
        onClick={() => setShowAddForm(true)}
        className="mb-6 w-full rounded-xl border-2 border-dashed py-3 text-sm font-bold text-verdant-emerald transition-colors hover:bg-[#FAFAF7]"
        style={{ borderColor: "#E5E7EB" }}
      >
        <span className="material-symbols-outlined ml-1 align-middle text-[16px]">add</span>
        הוסף נכס
      </button>

      {/* ── 3.5 Property Comparison ── */}
      {properties.length >= 2 && (
        <section className="v-card mb-6 overflow-x-auto">
          <div className="v-divider flex items-center gap-2 border-b px-5 py-4">
            <span className="material-symbols-outlined text-[18px] text-verdant-emerald">
              compare
            </span>
            <span className="text-sm font-extrabold text-verdant-ink">השוואת נכסים</span>
          </div>
          <div className="px-5 py-4">
            <table className="w-full text-xs" dir="rtl">
              <thead>
                <tr className="v-divider border-b text-[10px] font-bold text-verdant-muted">
                  <th className="py-2 text-right">מדד</th>
                  {properties.map((p) => (
                    <th key={p.id} className="py-2 text-center">
                      {p.name}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {[
                  { label: "שווי", fn: (p: Property) => fmtILS(p.currentValue) },
                  {
                    label: "הון עצמי",
                    fn: (p: Property) => fmtILS(p.currentValue - (p.mortgageBalance ?? 0)),
                  },
                  {
                    label: "שכ״ד",
                    fn: (p: Property) => (p.monthlyRent ? fmtILS(p.monthlyRent) : "—"),
                  },
                  {
                    label: "הוצאות + משכנתא",
                    fn: (p: Property) =>
                      fmtILS((p.monthlyExpenses ?? 0) + (p.monthlyMortgage ?? 0)),
                  },
                  {
                    label: "תזרים נטו",
                    fn: (p: Property) => {
                      const cf =
                        (p.monthlyRent ?? 0) - (p.monthlyExpenses ?? 0) - (p.monthlyMortgage ?? 0);
                      return (
                        <span style={{ color: cf >= 0 ? "#2C7A5A" : "#DC2626" }}>
                          {cf >= 0 ? "+" : ""}
                          {fmtILS(cf)}
                        </span>
                      );
                    },
                  },
                  {
                    label: "תשואת שכירות",
                    fn: (p: Property) =>
                      p.monthlyRent && p.currentValue
                        ? `${(((p.monthlyRent * 12) / p.currentValue) * 100).toFixed(1)}%`
                        : "—",
                  },
                  {
                    label: "כיסוי החזר",
                    fn: (p: Property) => {
                      const mtg = p.monthlyMortgage ?? 0;
                      if (!mtg || !p.monthlyRent) return "—";
                      const d = ((p.monthlyRent ?? 0) - (p.monthlyExpenses ?? 0)) / mtg;
                      return (
                        <span
                          style={{
                            color: d >= 1.25 ? "#2C7A5A" : d >= 1.0 ? "#D97706" : "#DC2626",
                          }}
                        >
                          {d.toFixed(2)}
                        </span>
                      );
                    },
                  },
                  {
                    label: "LTV",
                    fn: (p: Property) => {
                      const l =
                        p.currentValue > 0 ? ((p.mortgageBalance ?? 0) / p.currentValue) * 100 : 0;
                      return (
                        <span
                          style={{ color: l <= 60 ? "#2C7A5A" : l <= 75 ? "#D97706" : "#DC2626" }}
                        >
                          {l.toFixed(0)}%
                        </span>
                      );
                    },
                  },
                  {
                    label: "עליית ערך",
                    fn: (p: Property) => {
                      const a =
                        p.purchasePrice > 0
                          ? ((p.currentValue - p.purchasePrice) / p.purchasePrice) * 100
                          : 0;
                      return (
                        <span style={{ color: a >= 0 ? "#2C7A5A" : "#DC2626" }}>
                          {a.toFixed(1)}%
                        </span>
                      );
                    },
                  },
                ].map((row) => (
                  <tr key={row.label} className="v-divider border-b last:border-0">
                    <td className="py-2 font-bold text-verdant-ink">{row.label}</td>
                    {properties.map((p) => (
                      <td key={p.id} className="tabular py-2 text-center font-bold">
                        {row.fn(p)}
                      </td>
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
        <div className="v-divider flex items-center gap-2 border-b px-5 py-4">
          <span className="material-symbols-outlined text-[18px] text-verdant-emerald">
            query_stats
          </span>
          <span className="text-sm font-extrabold text-verdant-ink">תחזית ערך עתידי</span>
        </div>

        <div className="px-5 py-4">
          {/* 3 Sliders */}
          <div className="mb-4 grid grid-cols-3 gap-4">
            <div>
              <label className="mb-1 block text-[10px] font-bold text-verdant-muted">
                שנות תחזית: {forecastYears}
              </label>
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
              <label className="mb-1 block text-[10px] font-bold text-verdant-muted">
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
              <label className="mb-1 block text-[10px] font-bold text-verdant-muted">
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
          <div className="mt-4 grid grid-cols-4 gap-3">
            <div className="text-center">
              <div className="text-[10px] font-bold text-verdant-muted">שווי עתידי</div>
              <div className="text-sm font-extrabold text-verdant-ink">{fmtILS(finalValue)}</div>
            </div>
            <div className="text-center">
              <div className="text-[10px] font-bold text-verdant-muted">הון עצמי עתידי</div>
              <div className="text-sm font-extrabold text-verdant-emerald">
                {fmtILS(finalEquity)}
              </div>
            </div>
            <div className="text-center">
              <div className="text-[10px] font-bold text-verdant-muted">מכפיל הון</div>
              <div className="text-sm font-extrabold text-verdant-ink">
                {equityMultiple.toFixed(1)}x
              </div>
            </div>
            <div className="text-center">
              <div
                className="text-[10px] font-bold text-verdant-muted"
                title="IRR — תשואה פנימית: הריבית האפקטיבית שהשקעה זו מייצרת לאורך זמן"
              >
                תשואה פנימית
              </div>
              <div className="text-sm font-extrabold text-verdant-emerald">
                {irrEstimate.toFixed(1)}%
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── 5. Mortgage Detail ── */}
      {mortgage && (
        <section className="v-card mb-6">
          <div className="flex items-center justify-between px-5 py-4">
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-[18px]" style={{ color: "#2C7A5A" }}>
                home_work
              </span>
              <span className="text-sm font-extrabold text-verdant-ink">
                משכנתא — {mortgage.bank}
              </span>
            </div>
            <div className="text-left">
              <div className="text-[10px] font-bold text-verdant-muted">יתרה כוללת</div>
              <div className="tabular text-sm font-extrabold" style={{ color: "#DC2626" }}>
                {fmtILS(totalMortgageBalance)}
              </div>
            </div>
          </div>

          {/* Tracks table */}
          <div className="px-5 pb-4">
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="v-divider border-b text-[10px] font-bold text-verdant-muted">
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
                    <tr key={track.id} className="v-divider border-b last:border-0">
                      <td className="py-2.5 font-bold text-verdant-ink">{track.name}</td>
                      <td className="py-2.5">{track.indexation}</td>
                      <td className="tabular py-2.5">{(track.interestRate * 100).toFixed(2)}%</td>
                      <td className="py-2.5">{track.repaymentMethod}</td>
                      <td className="tabular py-2.5 text-left">{fmtILS(track.originalAmount)}</td>
                      <td
                        className="tabular py-2.5 text-left font-bold"
                        style={{ color: "#DC2626" }}
                      >
                        {fmtILS(track.remainingBalance)}
                      </td>
                      <td className="tabular py-2.5 text-left">{fmtILS(track.monthlyPayment)}</td>
                      <td className="tabular py-2.5 text-left text-verdant-muted">
                        {track.endDate}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Overall progress bar */}
          <div className="px-5 pb-4">
            <div className="mb-1 flex items-center justify-between text-[10px] text-verdant-muted">
              <span>
                שולם:{" "}
                {fmtILS(
                  mortgage.tracks.reduce((s, t) => s + t.originalAmount - t.remainingBalance, 0)
                )}
              </span>
              <span>נותר: {fmtILS(totalMortgageBalance)}</span>
            </div>
            <div
              className="h-2.5 w-full rounded-full"
              style={{ background: "rgba(220,38,38,0.12)" }}
            >
              <div
                className="h-full rounded-full transition-all duration-500"
                style={{
                  width: `${Math.round((1 - totalMortgageBalance / (mortgage.tracks.reduce((s, t) => s + t.originalAmount, 0) || 1)) * 100)}%`,
                  background: "linear-gradient(90deg, #2C7A5A, #8B5CF6)",
                }}
              />
            </div>
          </div>
        </section>
      )}

      {!mortgage && (
        <div className="card-pad mb-6 text-center">
          <span className="material-symbols-outlined mb-2 block text-[28px] text-verdant-muted">
            add_home
          </span>
          <div className="text-xs text-verdant-muted">
            לא הוגדרה משכנתא.
            <Link href="/debt" className="mr-1 font-bold text-verdant-emerald hover:underline">
              הוסף בדף חובות
            </Link>
          </div>
        </div>
      )}

      {/* ── 6. Madlan Value Check ── */}
      <section className="card mb-6 overflow-hidden">
        <div
          className="flex items-center justify-between px-5 py-4"
          style={{ background: "var(--morning-ink)" }}
        >
          <div className="flex items-center gap-3">
            <div
              className="icon-sm"
              style={{ background: "rgba(193,236,212,0.18)", color: "#2C7A5A" }}
            >
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
                  className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold text-verdant-emerald transition-colors hover:bg-[#FAFAF7]"
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
              className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold text-white"
              style={{ background: "#2C7A5A" }}
            >
              <span className="material-symbols-outlined text-[14px]">search</span>
              חפש במדלן
            </a>
          </div>
        </div>
      </section>

      {/* ── Recommendations — moved to bottom 2026-04-28 ── */}
      {recommendations.length > 0 ? (
        <section className="v-divider mb-6 mt-8 border-t pt-6">
          <div className="mb-3 flex items-center gap-2">
            <span className="material-symbols-outlined text-[18px] text-verdant-emerald">
              lightbulb
            </span>
            <h2 className="text-sm font-extrabold text-verdant-ink">תובנות והמלצות</h2>
          </div>
          <div className="space-y-2">
            {recommendations.map((rec) => {
              const sevColors: Record<string, { bg: string; border: string; text: string }> = {
                critical: { bg: "rgba(220,38,38,0.08)", border: "#b91c1c", text: "#DC2626" },
                warning: { bg: "rgba(217,119,6,0.08)", border: "#D97706", text: "#92400e" },
                info: { bg: "#FAFAF7", border: "#93c5fd", text: "#1d4ed8" },
                opportunity: { bg: "#FAFAF7", border: "#86efac", text: "#166534" },
              };
              const c = sevColors[rec.severity];
              return (
                <div
                  key={rec.id}
                  className="flex items-start gap-3 rounded-xl p-3"
                  style={{ background: c.bg, borderRight: `3px solid ${c.border}` }}
                >
                  <span
                    className="material-symbols-outlined mt-0.5 text-[18px]"
                    style={{ color: c.text }}
                  >
                    {rec.icon}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-extrabold" style={{ color: c.text }}>
                        {rec.title}
                      </span>
                      {rec.impact && (
                        <span
                          className="rounded-full px-2 py-0.5 text-[10px] font-bold"
                          style={{ background: c.border + "40", color: c.text }}
                        >
                          {rec.impact}
                        </span>
                      )}
                    </div>
                    <div className="mt-0.5 text-[11px] text-verdant-muted">
                      {rec.propertyName} — {rec.detail}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      ) : null}

      {/* ── Refinance alerts (since 2026-05-18) ── */}
      <RefinanceAlerts />

      {/* ── Modals ── */}
      {showAddForm && <PropertyForm onSave={handleAdd} onCancel={() => setShowAddForm(false)} />}
      {editingProp && (
        <PropertyForm
          initial={editingProp}
          onSave={handleUpdate}
          onCancel={() => setEditingPropId(null)}
        />
      )}
      {salePropId &&
        (() => {
          const sp = properties.find((p) => p.id === salePropId);
          if (!sp) return null;
          return (
            <SaleSimulator
              property={sp}
              allProperties={properties}
              onClose={() => setSalePropId(null)}
            />
          );
        })()}
    </div>
  );
}
