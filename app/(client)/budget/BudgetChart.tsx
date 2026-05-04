"use client";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  ResponsiveContainer,
  LabelList,
} from "recharts";
import { fmtILS } from "@/lib/format";

interface Props {
  incBudget: number;
  incActual: number;
  expBudget: number;
  expActual: number;
}

/* ── Color scheme ── */
const C = {
  incPlan: "#a7f3d0", // green light — income plan
  incActual: "#012d1d", // emerald dark — income actual
  expPlan: "#fecaca", // red light — expense plan
  expActual: "#dc2626", // red strong — expense actual
};

/* ── Custom bar shapes — income=green, expense=red per group ── */
function IncomeBar(props: any) {
  const { x, y, width, height, index } = props;
  if (!height || height <= 0) return <rect />;
  const fill = index === 0 ? C.incPlan : C.incActual;
  const r = Math.min(6, width / 2);
  return (
    <path
      d={`M${x},${y + height} V${y + r} Q${x},${y} ${x + r},${y}
          H${x + width - r} Q${x + width},${y} ${x + width},${y + r}
          V${y + height} Z`}
      fill={fill}
    />
  );
}

function ExpenseBar(props: any) {
  const { x, y, width, height, index } = props;
  if (!height || height <= 0) return <rect />;
  const fill = index === 0 ? C.expPlan : C.expActual;
  const r = Math.min(6, width / 2);
  return (
    <path
      d={`M${x},${y + height} V${y + r} Q${x},${y} ${x + r},${y}
          H${x + width - r} Q${x + width},${y} ${x + width},${y + r}
          V${y + height} Z`}
      fill={fill}
    />
  );
}

/* ── Label renderers ── */
function IncomeLabel(props: any) {
  const { x, y, width, value, index } = props;
  if (!value || value <= 0) return <text />;
  const color = index === 0 ? "#065f46" : "#012d1d";
  return (
    <text
      x={x + width / 2}
      y={y - 18}
      textAnchor="middle"
      fontSize={11}
      fontWeight={700}
      fontFamily="Assistant"
      fill={color}
    >
      {fmtILS(value)}
    </text>
  );
}

function ExpenseLabel(props: any) {
  const { x, y, width, value, index } = props;
  if (!value || value <= 0) return <text />;
  const color = index === 0 ? "#b91c1c" : "#dc2626";
  return (
    <text
      x={x + width / 2}
      y={y - 6}
      textAnchor="middle"
      fontSize={11}
      fontWeight={700}
      fontFamily="Assistant"
      fill={color}
    >
      {fmtILS(value)}
    </text>
  );
}

export default function BudgetChart({ incBudget, incActual, expBudget, expActual }: Props) {
  /* Two groups: תכנון (plan/simulation) on right, ביצוע (actual) on left */
  const data = [
    { name: "תכנון / הדמיה", income: incBudget, expense: expBudget },
    { name: "ביצוע בפועל", income: incActual, expense: expActual },
  ];

  return (
    <section
      className="mb-4 rounded-2xl p-5 md:p-7"
      style={{
        background: "#f9faf2",
        border: "1px solid #e2e8d8",
        boxShadow: "0 1px 2px rgba(1,45,29,.04), 0 8px 24px rgba(1,45,29,.05)",
      }}
    >
      <div className="mb-4">
        <div className="text-base font-extrabold" style={{ color: "#012d1d" }}>
          תמונת מצב חודשית
        </div>
        <div className="mt-0.5 text-[11px] font-semibold" style={{ color: "#5a7a6a" }}>
          הדמיית תכנון לעומת ביצוע — ירוק = הכנסות, אדום = הוצאות
        </div>
      </div>

      <div
        className="rounded-xl bg-white p-3"
        style={{ width: "100%", height: 300, direction: "ltr" }}
      >
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={data}
            barGap={4}
            barCategoryGap="30%"
            margin={{ top: 35, right: 20, left: 15, bottom: 0 }}
          >
            <XAxis
              dataKey="name"
              tick={{ fontSize: 13, fontWeight: 700, fontFamily: "Assistant", fill: "#012d1d" }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              tick={{ fontSize: 11, fontWeight: 700, fontFamily: "Assistant", fill: "#5a7a6a" }}
              axisLine={false}
              tickLine={false}
              tickFormatter={(v: number) => (v >= 1000 ? `₪${Math.round(v / 1000)}K` : `₪${v}`)}
              width={55}
            />
            <Tooltip
              content={<CustomTooltip />}
              cursor={{ fill: "rgba(1,45,29,0.04)", radius: 8 }}
            />
            <Legend content={<CustomLegend />} />

            {/* Income bars — green per group */}
            <Bar dataKey="income" name="הכנסות" shape={<IncomeBar />} isAnimationActive={false}>
              <LabelList dataKey="income" position="top" content={<IncomeLabel />} />
            </Bar>

            {/* Expense bars — red per group */}
            <Bar dataKey="expense" name="הוצאות" shape={<ExpenseBar />} isAnimationActive={false}>
              <LabelList dataKey="expense" position="top" content={<ExpenseLabel />} />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}

/* ── Rich Tooltip — shows income vs expense with ₪ balance ── */
function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;

  const income = payload.find((p: any) => p.dataKey === "income")?.value ?? 0;
  const expense = payload.find((p: any) => p.dataKey === "expense")?.value ?? 0;
  const isPlan = label === "תכנון / הדמיה";
  const incColor = isPlan ? C.incPlan : C.incActual;
  const expColor = isPlan ? C.expPlan : C.expActual;
  const balance = income - expense;
  const isPositive = balance >= 0;

  return (
    <div
      className="rounded-xl px-4 py-3 shadow-lg"
      style={{ background: "#fff", border: "1px solid #e2e8d8", direction: "rtl", minWidth: 200 }}
    >
      <div className="mb-2 text-[13px] font-extrabold" style={{ color: "#012d1d" }}>
        {label}
      </div>

      {/* Income row */}
      <div className="mb-1 flex items-center justify-between gap-4">
        <div className="flex items-center gap-1.5">
          <div className="h-2.5 w-2.5 rounded-sm" style={{ background: incColor }} />
          <span className="text-[11px] font-semibold" style={{ color: "#5a7a6a" }}>
            הכנסות
          </span>
        </div>
        <span
          className="text-[13px] font-bold tabular-nums"
          style={{ color: "#012d1d", fontFamily: "Assistant" }}
        >
          {fmtILS(income)}
        </span>
      </div>

      {/* Expense row */}
      <div className="mb-2 flex items-center justify-between gap-4">
        <div className="flex items-center gap-1.5">
          <div className="h-2.5 w-2.5 rounded-sm" style={{ background: expColor }} />
          <span className="text-[11px] font-semibold" style={{ color: "#5a7a6a" }}>
            הוצאות
          </span>
        </div>
        <span
          className="text-[13px] font-bold tabular-nums"
          style={{ color: "#dc2626", fontFamily: "Assistant" }}
        >
          {fmtILS(expense)}
        </span>
      </div>

      {/* Balance badge */}
      <div className="mt-1 border-t pt-2" style={{ borderColor: "#eef2e8" }}>
        <div
          className="rounded-md px-2 py-1.5 text-center text-[12px] font-bold"
          style={{
            background: isPositive ? "#d1fae5" : "#fee2e2",
            color: isPositive ? "#065f46" : "#991b1b",
          }}
        >
          {isPositive ? "רווח" : "גירעון"}{" "}
          <span className="tabular-nums" style={{ fontFamily: "Assistant" }}>
            {fmtILS(Math.abs(balance))}
          </span>
          {income > 0 && (
            <span className="mr-1 text-[10px]">({((balance / income) * 100).toFixed(1)}%)</span>
          )}
        </div>
      </div>
    </div>
  );
}

/* ── Custom Legend ── */
function CustomLegend() {
  return (
    <div className="mt-2 flex items-center justify-center gap-5" style={{ direction: "rtl" }}>
      <div className="flex items-center gap-1.5">
        <div className="h-3 w-3 rounded-sm" style={{ background: C.incPlan }} />
        <span className="text-[11px] font-bold" style={{ color: "#5a7a6a" }}>
          הכנסות תכנון
        </span>
      </div>
      <div className="flex items-center gap-1.5">
        <div className="h-3 w-3 rounded-sm" style={{ background: C.expPlan }} />
        <span className="text-[11px] font-bold" style={{ color: "#5a7a6a" }}>
          הוצאות תכנון
        </span>
      </div>
      <div className="flex items-center gap-1.5">
        <div className="h-3 w-3 rounded-sm" style={{ background: C.incActual }} />
        <span className="text-[11px] font-bold" style={{ color: "#5a7a6a" }}>
          הכנסות ביצוע
        </span>
      </div>
      <div className="flex items-center gap-1.5">
        <div className="h-3 w-3 rounded-sm" style={{ background: C.expActual }} />
        <span className="text-[11px] font-bold" style={{ color: "#5a7a6a" }}>
          הוצאות ביצוע
        </span>
      </div>
    </div>
  );
}
