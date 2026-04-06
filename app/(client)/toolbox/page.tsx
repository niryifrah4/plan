import { PageHeader } from "@/components/ui/PageHeader";
import { ToolboxTabs } from "@/components/toolbox/ToolboxTabs";
import { CompoundCalc } from "@/components/toolbox/CompoundCalc";
import { RealEstateCalc } from "@/components/toolbox/RealEstateCalc";
import { MiluimCalc } from "@/components/toolbox/MiluimCalc";

const TABS = [
  { id: "compound",      label: "ריבית דריבית",     icon: "trending_up" },
  { id: "mortgage",      label: "מחשבון משכנתא",    icon: "home" },
  { id: "consolidation", label: "איחוד הלוואות",    icon: "merge" },
  { id: "realestate",    label: "נדל״ן להשקעה",     icon: "apartment" },
  { id: "miluim",        label: "סימולטור מילואים",  icon: "military_tech" },
  { id: "tax",           label: "מס רווח הון",       icon: "receipt_long" },
];

export default function ToolboxPage() {
  return (
    <div className="max-w-6xl mx-auto">
      <PageHeader
        subtitle="Toolbox · מחשבונים פיננסיים"
        title="ארגז כלים"
        description="מחשבונים מקצועיים — שומרים כסיטואציות ניתנות להשוואה"
      />
      <ToolboxTabs tabs={TABS}>
        {{
          compound: <CompoundCalc />,
          mortgage: (
            <div className="v-card p-7">
              <h3 className="text-base font-bold text-verdant-ink mb-2 text-right">מחשבון משכנתא</h3>
              <p className="text-sm text-verdant-muted text-right leading-relaxed">
                פירוק למסלולים, לוח סילוקין ושינוי ריבית. תשתית הפיננסית (PMT + amortSchedule) מוכנה ב-lib/financial-math.ts.
              </p>
            </div>
          ),
          consolidation: (
            <div className="v-card p-7">
              <h3 className="text-base font-bold text-verdant-ink mb-2 text-right">איחוד הלוואות</h3>
              <p className="text-sm text-verdant-muted text-right leading-relaxed">
                הצגת חיסכון בריבית משוקללת אחרי איחוד. יתווסף בגרסה הבאה.
              </p>
            </div>
          ),
          realestate: <RealEstateCalc />,
          miluim: <MiluimCalc />,
          tax: (
            <div className="v-card p-7">
              <h3 className="text-base font-bold text-verdant-ink mb-2 text-right">סימולטור מס רווח הון</h3>
              <p className="text-sm text-verdant-muted text-right leading-relaxed">
                חישוב מס רווח הון עתידי (25%/30%) על ני&quot;ע ישראלים וזרים.
                המנוע (capitalGainsTax) כבר פעיל ומחובר לטבלת ני&quot;ע במפת העושר.
              </p>
            </div>
          ),
        }}
      </ToolboxTabs>
    </div>
  );
}
