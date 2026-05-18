"use client";

import { useState, useMemo } from "react";
import { fmtILS } from "@/lib/format";

interface VestingTranche {
  date: string;
  units: number;
  vested: boolean;
}

// Section 102 capital track: 25% CGT on gain at sale
const CGT_RATE = 0.25;

export function RsuCalc() {
  const [totalUnits, setTotalUnits] = useState(1000);
  const [grantPrice, setGrantPrice] = useState(150);
  const [currentPrice, setCurrentPrice] = useState(220);
  const [vestingMonths, setVestingMonths] = useState(48);
  const [cliffMonths, setCliffMonths] = useState(12);
  const [monthsElapsed, setMonthsElapsed] = useState(18);
  const [showNominal, setShowNominal] = useState(true);

  const analysis = useMemo(() => {
    // Build vesting schedule (monthly after cliff)
    const tranches: VestingTranche[] = [];
    const unitsPerMonth = totalUnits / vestingMonths;
    for (let m = 1; m <= vestingMonths; m++) {
      if (m < cliffMonths) continue; // cliff — nothing vests
      const units =
        m === cliffMonths
          ? unitsPerMonth * cliffMonths // cliff release
          : unitsPerMonth;
      tranches.push({
        date: `חודש ${m}`,
        units: Math.round(units),
        vested: m <= monthsElapsed,
      });
    }

    const vestedUnits = tranches.filter((t) => t.vested).reduce((s, t) => s + t.units, 0);
    const unvestedUnits = totalUnits - vestedUnits;

    const grossValueVested = vestedUnits * currentPrice;
    const grossValueTotal = totalUnits * currentPrice;
    const costBasisVested = vestedUnits * grantPrice;
    const costBasisTotal = totalUnits * grantPrice;

    const gainVested = Math.max(0, grossValueVested - costBasisVested);
    const gainTotal = Math.max(0, grossValueTotal - costBasisTotal);

    const taxVested = gainVested * CGT_RATE;
    const taxTotal = gainTotal * CGT_RATE;

    const netVested = grossValueVested - taxVested;
    const netTotal = grossValueTotal - taxTotal;

    return {
      tranches,
      vestedUnits,
      unvestedUnits,
      grossValueVested,
      grossValueTotal,
      costBasisVested,
      costBasisTotal,
      gainVested,
      gainTotal,
      taxVested,
      taxTotal,
      netVested,
      netTotal,
      vestedPct: totalUnits > 0 ? (vestedUnits / totalUnits) * 100 : 0,
    };
  }, [totalUnits, grantPrice, currentPrice, vestingMonths, cliffMonths, monthsElapsed]);

  return (
    <div className="space-y-6">
      <div className="card-pad">
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-verdant-emerald">inventory_2</span>
            <h3 className="text-sm font-extrabold text-verdant-ink">מחשבון RSU / אופציות</h3>
          </div>
          {/* Nominal / Net toggle */}
          <button
            onClick={() => setShowNominal(!showNominal)}
            className="flex items-center gap-1 rounded-full px-3 py-1 text-[10px] font-bold"
            style={{
              background: showNominal ? "#A8E04012" : "#A8E04012",
              color: showNominal ? "#A8E040" : "#A8E040",
            }}
          >
            <span className="material-symbols-outlined text-[12px]">swap_horiz</span>
            {showNominal ? "ברוטו" : "נטו (אחרי מס)"}
          </button>
        </div>
        <p className="mb-5 text-xs leading-relaxed text-verdant-muted">
          סעיף 102 מסלול רווח הון — מס 25% על הרווח במועד המכירה. הזן את פרטי ה-RSU/Options שלך.
        </p>

        <div className="mb-5 grid grid-cols-2 gap-4 md:grid-cols-3">
          <Field label="סה״כ יחידות" value={totalUnits} onChange={setTotalUnits} />
          <Field label="מחיר הענקה ($)" value={grantPrice} onChange={setGrantPrice} suffix="$" />
          <Field
            label="מחיר נוכחי ($)"
            value={currentPrice}
            onChange={setCurrentPrice}
            suffix="$"
          />
          <Field label="תקופת הבשלה (חודשים)" value={vestingMonths} onChange={setVestingMonths} />
          <Field label="Cliff (חודשים)" value={cliffMonths} onChange={setCliffMonths} />
          <Field label="חודשים שעברו" value={monthsElapsed} onChange={setMonthsElapsed} />
        </div>

        {/* Vesting progress */}
        <div className="mb-5">
          <div className="mb-1 flex items-center justify-between text-[10px] font-bold">
            <span className="text-verdant-muted">התקדמות הבשלה</span>
            <span style={{ color: "#A8E040" }}>{Math.round(analysis.vestedPct)}% הבשילו</span>
          </div>
          <div className="h-3 overflow-hidden rounded-full" style={{ background: "#1F2A3F" }}>
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{
                width: `${analysis.vestedPct}%`,
                background: "linear-gradient(90deg, #F8FAFC, #A8E040)",
              }}
            />
          </div>
          <div className="mt-1 flex justify-between text-[9px] font-bold text-verdant-muted">
            <span>{analysis.vestedUnits} הבשילו</span>
            <span>{analysis.unvestedUnits} טרם הבשילו</span>
          </div>
        </div>

        {/* Results grid */}
        <div className="mb-4 grid grid-cols-2 gap-3">
          <div
            className="rounded-xl p-4"
            style={{ background: "#1A2438", border: "1px solid #A8E04022" }}
          >
            <div className="mb-1 text-[9px] font-bold uppercase tracking-[0.1em] text-verdant-muted">
              יחידות שהבשילו
            </div>
            <div className="tabular text-lg font-extrabold text-verdant-ink">
              {showNominal
                ? fmtILS(Math.round(analysis.grossValueVested))
                : fmtILS(Math.round(analysis.netVested))}
            </div>
            <div className="mt-1 text-[9px] font-bold" style={{ color: "#A8E040" }}>
              {analysis.vestedUnits} יחידות × ${currentPrice}
            </div>
            {!showNominal && analysis.taxVested > 0 && (
              <div className="mt-0.5 text-[9px] font-bold" style={{ color: "#F87171" }}>
                מס: {fmtILS(Math.round(analysis.taxVested))}
              </div>
            )}
          </div>
          <div
            className="rounded-xl p-4"
            style={{ background: "#F8FAFC", border: "1px solid #1F2A3F22" }}
          >
            <div className="mb-1 text-[9px] font-bold uppercase tracking-[0.1em] text-verdant-muted">
              סה״כ (כולל לא מובשל)
            </div>
            <div className="tabular text-lg font-extrabold text-verdant-ink">
              {showNominal
                ? fmtILS(Math.round(analysis.grossValueTotal))
                : fmtILS(Math.round(analysis.netTotal))}
            </div>
            <div className="mt-1 text-[9px] font-bold text-verdant-muted">
              {totalUnits} יחידות × ${currentPrice}
            </div>
            {!showNominal && analysis.taxTotal > 0 && (
              <div className="mt-0.5 text-[9px] font-bold" style={{ color: "#F87171" }}>
                מס: {fmtILS(Math.round(analysis.taxTotal))}
              </div>
            )}
          </div>
        </div>

        {/* Breakdown */}
        <div className="space-y-2 rounded-xl p-3" style={{ background: "#F8FAFC" }}>
          <div className="text-[9px] font-bold uppercase tracking-[0.1em] text-verdant-muted">
            פירוט מס (סעיף 102)
          </div>
          <Row label="שווי ברוטו (הבשיל)" value={fmtILS(Math.round(analysis.grossValueVested))} />
          <Row label="בסיס עלות" value={fmtILS(Math.round(analysis.costBasisVested))} />
          <Row
            label="רווח חייב במס"
            value={fmtILS(Math.round(analysis.gainVested))}
            color="#f59e0b"
          />
          <Row
            label={`מס רווח הון (${CGT_RATE * 100}%)`}
            value={fmtILS(Math.round(analysis.taxVested))}
            color="#F87171"
          />
          <div className="v-divider border-t pt-2">
            <Row
              label="נטו בכיס"
              value={fmtILS(Math.round(analysis.netVested))}
              color="#A8E040"
              bold
            />
          </div>
        </div>
      </div>

      {/* Vesting Schedule */}
      {analysis.tranches.length > 0 && (
        <div className="card-pad">
          <h4 className="mb-3 text-sm font-extrabold text-verdant-ink">לוח הבשלה</h4>
          <div className="grid grid-cols-4 gap-1.5 md:grid-cols-6">
            {analysis.tranches.map((t, i) => (
              <div
                key={i}
                className="rounded-lg p-2 text-center text-[9px] font-bold transition-all"
                style={{
                  background: t.vested ? "#A8E04015" : "#1A2438",
                  color: t.vested ? "#A8E040" : "#999",
                  border: t.vested ? "1px solid #A8E04030" : "1px solid transparent",
                }}
              >
                <div>{t.date}</div>
                <div className="tabular">{t.units}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  suffix,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  suffix?: string;
}) {
  return (
    <div>
      <label className="mb-1 block text-[10px] font-bold uppercase tracking-[0.1em] text-verdant-muted">
        {label}
      </label>
      <div
        className="flex items-center rounded-lg border px-3 py-2"
        style={{ borderColor: "#1F2A3F", background: "#F8FAFC" }}
      >
        <input
          type="number"
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          className="tabular flex-1 bg-transparent text-sm font-bold text-verdant-ink outline-none"
          dir="ltr"
        />
        {suffix && <span className="mr-1 text-xs font-bold text-verdant-muted">{suffix}</span>}
      </div>
    </div>
  );
}

function Row({
  label,
  value,
  color,
  bold,
}: {
  label: string;
  value: string;
  color?: string;
  bold?: boolean;
}) {
  return (
    <div className="flex items-center justify-between">
      <span className={`text-[10px] ${bold ? "font-extrabold" : "font-bold"} text-verdant-muted`}>
        {label}
      </span>
      <span
        className={`text-[11px] ${bold ? "font-extrabold" : "font-bold"} tabular`}
        style={{ color: color || "#F8FAFC" }}
      >
        {value}
      </span>
    </div>
  );
}
