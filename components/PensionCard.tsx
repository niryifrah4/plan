import { fmtILS } from "@/lib/format";
import { MoneyText } from "@/components/ui/MoneyText";

interface Props {
  monthlyPension: number;
  replacementRate: number;
}

/**
 * Projected Pension — dark card matching original HTML exactly.
 * Background: #FFFFFF, accent: #059669.
 */
export function PensionCard({ monthlyPension, replacementRate }: Props) {
  const pct = Math.round(replacementRate * 100);

  return (
    <div className="rounded-organic bg-botanical-deep p-7 text-white shadow-soft">
      <div
        className="mb-2 text-[10px] font-bold uppercase tracking-[0.25em]"
        style={{ color: "#059669" }}
      >
        קצבה חזויה בפרישה
      </div>
      <div className="mb-4 text-sm opacity-70">גיל 67 · חישוב מהמסלקה הפנסיונית</div>
      <MoneyText className="mb-1 text-5xl font-extrabold tracking-tight">
        {fmtILS(monthlyPension)}
      </MoneyText>
      <div className="mb-6 text-sm opacity-70">לחודש · במונחי היום</div>
      <div className="border-t border-white/10 pt-5">
        <div className="mb-2 flex items-center justify-between text-xs">
          <span className="opacity-70">שיעור החלפת הכנסה</span>
          <span className="font-bold" style={{ color: "#059669" }}>
            {pct}%
          </span>
        </div>
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/10">
          <div
            className="h-full rounded-full"
            style={{ width: `${pct}%`, background: "#059669" }}
          />
        </div>
      </div>
    </div>
  );
}
