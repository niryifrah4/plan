import { PageHeader } from "@/components/ui/PageHeader";
import { ToolboxTabs } from "@/components/toolbox/ToolboxTabs";
import { CompoundCalc } from "@/components/toolbox/CompoundCalc";
import { MiluimCalc } from "@/components/toolbox/MiluimCalc";
import { TaxCalc } from "@/components/toolbox/TaxCalc";
import { RealReturnCalc } from "@/components/toolbox/RealReturnCalc";
import { BituachLeumiCalc } from "@/components/toolbox/BituachLeumiCalc";
import { RsuCalc } from "@/components/toolbox/RsuCalc";
import { RealEstateLab } from "@/components/toolbox/RealEstateLab";
import { GoalContextStrip } from "@/components/toolbox/GoalContextStrip";

const TABS = [
  { id: "realestate", label: "מעבדת נדל״ן",            icon: "home_work" },
  { id: "tax",        label: "מס הכנסה ורווח הון",   icon: "receipt_long" },
  { id: "realreturn", label: "תשואה ריאלית",          icon: "analytics" },
  { id: "bituach",    label: "ביטוח לאומי",            icon: "shield" },
  { id: "compound",   label: "ריבית דריבית",           icon: "trending_up" },
  { id: "rsu",        label: "מחשבון RSU",             icon: "inventory_2" },
  { id: "miluim",     label: "סימולטור מילואים",        icon: "military_tech" },
];

export default function ToolboxPage() {
  return (
    <div className="max-w-6xl mx-auto">
      <PageHeader
        subtitle="Calculators & Tools · מחשבונים וכלים"
        title="מחשבונים וכלים"
        description="כלי תכנון דינמיים — נדל״ן, מיסוי, תשואה ריאלית, RSU וזכויות"
      />
      <ToolboxTabs tabs={TABS}>
        {{
          realestate: <><GoalContextStrip domain="realestate" /><RealEstateLab /></>,
          tax: <><GoalContextStrip domain="tax" /><TaxCalc /></>,
          realreturn: <><GoalContextStrip domain="investments" /><RealReturnCalc /></>,
          bituach: <><GoalContextStrip domain="retirement" /><BituachLeumiCalc /></>,
          compound: <><GoalContextStrip domain="freedom" /><CompoundCalc /></>,
          rsu: <><GoalContextStrip domain="investments" /><RsuCalc /></>,
          miluim: <><GoalContextStrip domain="general" title="איך ימי המילואים משפיעים על תכנית החיסכון שלך?" /><MiluimCalc /></>,
        }}
      </ToolboxTabs>
    </div>
  );
}
