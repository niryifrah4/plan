"use client";

import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { fmtILS } from "@/lib/format";
import type { NetWorthSnapshot } from "@/lib/balance-history-store";

interface Props {
  snapshots: NetWorthSnapshot[];
}

function fmtMonth(iso: string): string {
  // YYYY-MM-DD → MM/YY
  const [y, m] = iso.split("-");
  return `${m}/${y.slice(2)}`;
}

function fmtFullDate(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

export function NetWorthHistoryChart({ snapshots }: Props) {
  if (snapshots.length === 0) {
    return (
      <div className="card-pad text-center" style={{ background: "#f4f7ed" }}>
        <div className="mb-2 text-3xl">📈</div>
        <div className="mb-1 text-sm font-extrabold text-verdant-ink">עדיין אין היסטוריה</div>
        <div className="text-xs text-verdant-muted">
          לחץ על &quot;עדכון מהיר&quot; כדי לשמור את הצילום הראשון שלך.
        </div>
      </div>
    );
  }

  const data = snapshots.map((s) => ({
    date: s.date,
    month: fmtMonth(s.date),
    netWorth: s.netWorth,
  }));

  const current = snapshots[snapshots.length - 1].netWorth;
  const peak = snapshots.reduce((m, s) => Math.max(m, s.netWorth), 0);

  // YTD delta
  const thisYear = new Date().getFullYear();
  const ytdFirst = snapshots.find((s) => s.date.startsWith(`${thisYear}-`));
  let ytdPct: number | null = null;
  if (ytdFirst && ytdFirst.netWorth !== 0) {
    ytdPct = ((current - ytdFirst.netWorth) / Math.abs(ytdFirst.netWorth)) * 100;
  }
  const ytdColor = ytdPct === null ? "#5a7a6a" : ytdPct >= 0 ? "#1B4332" : "#dc2626";

  return (
    <div>
      <div className="w-full" style={{ direction: "ltr" }}>
        <ResponsiveContainer width="100%" height={240}>
          <AreaChart data={data} margin={{ top: 12, right: 16, left: 12, bottom: 8 }}>
            <defs>
              <linearGradient id="nwFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#1B4332" stopOpacity={0.35} />
                <stop offset="100%" stopColor="#1B4332" stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="2 4" stroke="#eef2e8" vertical={false} />
            <XAxis
              dataKey="month"
              tick={{ fontSize: 11, fontWeight: 700, fill: "#012d1d" }}
              axisLine={{ stroke: "#d8e0d0" }}
              tickLine={false}
            />
            <YAxis
              tick={{ fontSize: 10, fill: "#5a7a6a", fontWeight: 700 }}
              axisLine={{ stroke: "#d8e0d0" }}
              tickLine={false}
              tickFormatter={(v: number) => `${Math.round(v / 1000)}K`}
              orientation="right"
              width={55}
            />
            <Tooltip
              formatter={(v: number) => [fmtILS(v), "שווי נקי"]}
              labelFormatter={(_label, payload) => {
                const p = payload?.[0]?.payload as { date?: string } | undefined;
                return p?.date ? fmtFullDate(p.date) : "";
              }}
              contentStyle={{
                background: "#fff",
                border: "1px solid #d8e0d0",
                borderRadius: 8,
                fontSize: 12,
                direction: "rtl",
              }}
            />
            <Area
              type="monotone"
              dataKey="netWorth"
              stroke="#1B4332"
              strokeWidth={2.5}
              fill="url(#nwFill)"
              dot={{ r: 3, fill: "#1B4332", stroke: "#fff", strokeWidth: 1.5 }}
              activeDot={{ r: 5 }}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      <div className="mt-3 flex items-center justify-center gap-3 text-[11px] font-bold text-verdant-muted">
        <span>
          מצב נוכחי: <span className="tabular text-verdant-ink">{fmtILS(current)}</span>
        </span>
        <span className="opacity-40">·</span>
        <span>
          שיא: <span className="tabular text-verdant-ink">{fmtILS(peak)}</span>
        </span>
        {ytdPct !== null && (
          <>
            <span className="opacity-40">·</span>
            <span>
              שינוי YTD:{" "}
              <span className="tabular" style={{ color: ytdColor }}>
                {ytdPct >= 0 ? "+" : ""}
                {ytdPct.toFixed(1)}%
              </span>
            </span>
          </>
        )}
      </div>
    </div>
  );
}
