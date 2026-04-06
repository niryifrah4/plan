import { PageHeader } from "@/components/ui/PageHeader";
import { PensionCard } from "@/components/PensionCard";
import { fmtILS } from "@/lib/format";
import { demoAssets } from "@/lib/stub-data";

export default function RetirementPage() {
  const pension = demoAssets
    .filter((a) => a.asset_group === "pension")
    .reduce((acc, a) => acc + a.balance, 0);

  return (
    <div className="max-w-6xl mx-auto">
      <PageHeader
        subtitle="Retirement Planning · פרישה"
        title="פנסיה ופרישה"
        description="נכסים ארוכי טווח, כיסויי ביטוח, ותחזית FV לגיל פרישה"
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 mb-6">
        <div className="v-card p-5">
          <div className="text-[10px] font-bold uppercase tracking-[0.15em] text-verdant-muted mb-1">צבירה פנסיונית</div>
          <div className="text-2xl font-extrabold text-verdant-ink tabular">{fmtILS(pension)}</div>
        </div>
        <div className="v-card p-5">
          <div className="text-[10px] font-bold uppercase tracking-[0.15em] text-verdant-muted mb-1">צפי בפרישה</div>
          <div className="text-2xl font-extrabold text-verdant-emerald tabular">{fmtILS(pension * 2.4)}</div>
        </div>
        <PensionCard monthlyPension={22400} replacementRate={0.78} />
      </div>

      <div className="v-card p-7">
        <h3 className="text-base font-bold text-verdant-ink mb-2 text-right">חברות פנסיה</h3>
        <p className="text-sm text-verdant-muted text-right leading-relaxed">
          רשימת כל הקרנות (מנורה, מגדל, כלל, הראל, הפניקס, אלטשולר, מיטב) עם יתרות, דמי ניהול, מסלולי השקעה ושירות מילואים.
        </p>
      </div>
    </div>
  );
}
