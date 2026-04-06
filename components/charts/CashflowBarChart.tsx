"use client";

import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, LabelList, Cell, Legend,
} from "recharts";
import { gapColor, GAP_COLOURS, isLowSafetyMargin } from "@/lib/safety-margin";
import { fmtILS, fmtK } from "@/lib/format";

export interface CashflowMonthPoint {
  month: string;      // e.g. "מרץ 2026"
  income: number;
  expense: number;
  gap: number;        // income - expense
}

interface Props {
  data: CashflowMonthPoint[];
  height?: number;
}

/**
 * Grouped bar chart: income · expense · gap per month.
 * Gap bars switch colour automatically per safety-margin rule.
 * Exact ILS data labels sit above each bar.
 */
export function CashflowBarChart({ data, height = 280 }: Props) {
  return (
    <div className="w-full">
      <ResponsiveContainer width="100%" height={height}>
        <BarChart data={data} margin={{ top: 24, right: 16, left: 8, bottom: 32 }}>
          <CartesianGrid strokeDasharray="2 4" stroke="#eef2ea" vertical={false} />
          <XAxis
            dataKey="month"
            tick={{ fontSize: 11, fontWeight: 800, fill: "#012d1d" }}
            axisLine={{ stroke: "#d8e0d0" }}
            tickLine={false}
            reversed /* RTL */
          />
          <YAxis
            tick={{ fontSize: 10, fill: "#5a7a6a", fontWeight: 700 }}
            axisLine={{ stroke: "#d8e0d0" }}
            tickLine={false}
            tickFormatter={fmtK}
            orientation="right"
          />
          <Tooltip
            formatter={(v: number) => fmtILS(v)}
            contentStyle={{
              background: "#fff", border: "1px solid #d8e0d0", borderRadius: 8,
              fontFamily: "Assistant", fontWeight: 700,
            }}
          />
          <Legend
            verticalAlign="bottom" height={28}
            formatter={(v) => <span style={{ color: "#012d1d", fontWeight: 700 }}>{v}</span>}
          />
          <Bar dataKey="income" name="הכנסה" fill={GAP_COLOURS.safe} radius={[3,3,0,0]}>
            <LabelList
              dataKey="income" position="top"
              formatter={(v: number) => fmtILS(v)}
              style={{ fontSize: 10, fontWeight: 800, fill: GAP_COLOURS.safe }}
            />
          </Bar>
          <Bar dataKey="expense" name="הוצאה" fill={GAP_COLOURS.shortfall} radius={[3,3,0,0]}>
            <LabelList
              dataKey="expense" position="top"
              formatter={(v: number) => fmtILS(v)}
              style={{ fontSize: 10, fontWeight: 800, fill: GAP_COLOURS.shortfall }}
            />
          </Bar>
          <Bar dataKey="gap" name="פער (תזרים)" radius={[3,3,0,0]}>
            {data.map((d, i) => <Cell key={i} fill={gapColor(d.gap)} />)}
            <LabelList
              dataKey="gap" position="top"
              formatter={(v: number) => fmtILS(v)}
              style={{ fontSize: 10, fontWeight: 800, fill: "#012d1d" }}
            />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
      {data.some((d) => isLowSafetyMargin(d.gap)) && (
        <div
          className="mt-2 text-[11px] font-bold px-3 py-2 rounded-lg"
          style={{ background: "#fef3c7", color: "#92400e" }}
        >
          ⚠ חודש אחד או יותר במרווח ביטחון נמוך — אזור לא בטוח לתכנון תקציב
        </div>
      )}
    </div>
  );
}
