import { fmtILS } from "@/lib/format";

interface Props {
  monthlyPension: number;
  replacementRate: number;
}

/**
 * Projected Pension — dark card matching original HTML exactly.
 * Background: #012d1d, accent: #58e1b0.
 */
export function PensionCard({ monthlyPension, replacementRate }: Props) {
  const pct = Math.round(replacementRate * 100);

  return (
    <div className="p-7 rounded-[14px]" style={{ background: "#012d1d", color: "#fff" }}>
      <div
        className="text-[10px] uppercase tracking-[0.25em] font-bold mb-2"
        style={{ color: "#58e1b0" }}
      >
        קצבה חזויה בפרישה
      </div>
      <div className="text-sm opacity-70 mb-4">גיל 67 · חישוב מהמסלקה הפנסיונית</div>
      <div className="text-5xl font-extrabold tracking-tight mb-1">{fmtILS(monthlyPension)}</div>
      <div className="text-sm opacity-70 mb-6">לחודש · במונחי היום</div>
      <div className="pt-5 border-t border-white/10">
        <div className="flex items-center justify-between text-xs mb-2">
          <span className="opacity-70">שיעור החלפת הכנסה</span>
          <span className="font-bold" style={{ color: "#58e1b0" }}>
            {pct}%
          </span>
        </div>
        <div className="w-full h-1.5 rounded-full bg-white/10 overflow-hidden">
          <div
            className="h-full rounded-full"
            style={{ width: `${pct}%`, background: "#58e1b0" }}
          />
        </div>
      </div>
    </div>
  );
}
