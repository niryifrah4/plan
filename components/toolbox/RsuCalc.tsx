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
              background: showNominal ? "#1B433212" : "#1B433212",
              color: showNominal ? "#1B4332" : "#1B4332",
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
            <span style={{ color: "#1B4332" }}>{Math.round(analysis.vestedPct)}% הבשילו</span>
          </div>
          <div className="h-3 overflow-hidden rounded-full" style={{ background: "#eef2e8" }}>
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{
                width: `${analysis.vestedPct}%`,
                background: "linear-gradient(90deg, #012d1d, #1B4332)",
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
            style={{ background: "#f0fdf4", border: "1px solid #1B433222" }}
          >
            <div className="mb-1 text-[9px] font-bold uppercase tracking-[0.1em] text-verdant-muted">
              יחידות שהבשילו
            </div>
            <div className="tabular text-lg font-extrabold text-verdant-ink">
              {showNominal
                ? fmtILS(Math.round(analysis.grossValueVested))
                : fmtILS(Math.round(analysis.netVested))}
            </div>
            <div className="mt-1 text-[9px] font-bold" style={{ color: "#1B4332" }}>
              {analysis.vestedUnits} יחידות × ${currentPrice}
            </div>
            {!showNominal && analysis.taxVested > 0 && (
              <div className="mt-0.5 text-[9px] font-bold" style={{ color: "#b91c1c" }}>
                מס: {fmtILS(Math.round(analysis.taxVested))}
              </div>
            )}
          </div>
          <div
            className="rounded-xl p-4"
            style={{ background: "#f9faf2", border: "1px solid #d8e0d022" }}
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
              <div className="mt-0.5 text-[9px] font-bold" style={{ color: "#b91c1c" }}>
                מס: {fmtILS(Math.round(analysis.taxTotal))}
              </div>
            )}
          </div>
        </div>

        {/* Breakdown */}
        <div className="space-y-2 rounded-xl p-3" style={{ background: "#f9faf2" }}>
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
            color="#b91c1c"
          />
          <div className="v-divider border-t pt-2">
            <Row
              label="נטו בכיס"
              value={fmtILS(Math.round(analysis.netVested))}
              color="#1B4332"
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
                  background: t.vested ? "#1B433215" : "#f4f7ed",
                  color: t.vested ? "#1B4332" : "#999",
                  border: t.vested ? "1px solid #1B433230" : "1px solid transparent",
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
        style={{ borderColor: "#d8e0d0", background: "#f9faf2" }}
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
        style={{ color: color || "#012d1d" }}
      >
        {value}
      </span>
    </div>
  );
}
