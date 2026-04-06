import { PageHeader } from "@/components/ui/PageHeader";

export default function BudgetPage() {
  return (
    <div className="max-w-6xl mx-auto">
      <PageHeader
        subtitle="Budget Control · תכנון מול ביצוע"
        title="תקציב ובקרה"
        description="השוואת תכנון מול Actuals — מזהה סטיות וחוסרי משמעת"
      />
      <div className="v-card p-7">
        <h3 className="text-base font-bold text-verdant-ink mb-2 text-right">Budget vs Actual</h3>
        <p className="text-sm text-verdant-muted text-right leading-relaxed">
          כאן תוצג טבלת השוואה חודשית: תקציב מתוכנן, ביצוע בפועל, סטייה ו-%. הסטיות משמשות לאיתור אוטומטי של מטרות בסיכון.
        </p>
      </div>
    </div>
  );
}
