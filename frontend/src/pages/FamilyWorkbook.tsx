import { useEffect, useMemo, useState } from "react";
import { loadAccounts, totalBankBalance } from "@/lib/accounts-store";
import { loadDebtData } from "@/lib/debt-store";
import { loadBuckets } from "@/lib/buckets-store";
import { loadProperties } from "@/lib/realestate-store";
import { hydrateWorkbookFromSite, loadWorkbook, saveWorkbook, syncWorkbookRowToSite, updateWorkbookCell, updateWorkbookRow, WORKBOOK_TABS, type WorkbookData, type WorkbookRow } from "@/lib/family-workbook";
import { useClient } from "@/lib/client-context";
import { writeFamilyWorkbookXlsx } from "@/lib/family-workbook-export";

const money = (n: number) => new Intl.NumberFormat("he-IL", { maximumFractionDigits: 0 }).format(Math.round(n)) + " ₪";

export function FamilyWorkbookPage() {
  const { familyName } = useClient();
  const [active, setActive] = useState("home");
  const [data, setData] = useState<WorkbookData>({});
  const [saved, setSaved] = useState(true);
  const [summary, setSummary] = useState({ assets: 0, debt: 0, goals: 0 });

  const hydrate = () => {
    const accounts = loadAccounts(); const debt = loadDebtData(); const properties = loadProperties(); const buckets = loadBuckets();
    const assets = totalBankBalance(accounts) + properties.reduce((sum, p) => sum + Number(p.currentValue || 0), 0);
    const debtTotal = debt.loans.reduce((sum, l) => sum + Number(l.monthlyPayment || 0), 0) + debt.mortgages.reduce((sum, m) => sum + m.tracks.reduce((trackSum, track) => trackSum + Number(track.remainingBalance || 0), 0), 0);
    setSummary({ assets, debt: debtTotal, goals: buckets.length });
    const workbook = hydrateWorkbookFromSite(loadWorkbook());
    const balanceValues: Record<string, string> = {
      "עו״ש ופיקדונות": String(totalBankBalance(accounts)),
      "דירה (שווי שוק)": String(properties.reduce((sum, p) => sum + Number(p.currentValue || 0), 0)),
      "סה״כ נכסים": String(assets),
      "משכנתא": String(debt.mortgages.reduce((sum, m) => sum + m.tracks.reduce((trackSum, track) => trackSum + Number(track.remainingBalance || 0), 0), 0)),
      "הלוואות (נמשך מדף חובות)": String(debt.loans.reduce((sum, l) => sum + Number(l.monthlyPayment || 0), 0)),
      "סה״כ התחייבויות": String(debtTotal),
      "השווי הנקי של המשפחה": String(assets - debtTotal),
    };
    workbook.balance = workbook.balance.map((row) => balanceValues[row.label] !== undefined ? { ...row, value: balanceValues[row.label], calculated: true } : row);
    const debtRows = debt.loans.map((loan) => ({ id: `loan-${loan.id}`, label: loan.lender || "הלוואה", value: String(loan.monthlyPayment || 0), note: "החזר חודשי" }));
    if (debtRows.length) workbook.debts = debtRows;
    const insightValues: Record<string, string> = { "שווי נקי": money(assets - debtTotal), "מימון המטרות": String(buckets.length), "מינוף — חוב מהנכסים": assets ? `${Math.round((debtTotal / assets) * 100)}%` : "0%" };
    workbook.insights = workbook.insights.map((row) => insightValues[row.label] !== undefined ? { ...row, value: insightValues[row.label], calculated: true } : row);
    setData(workbook);
  };

  useEffect(() => {
    hydrate();
    const events = ["storage", "verdant:family_workbook:updated", "verdant:onboarding:updated", "verdant:assumptions", "verdant:assumptions:updated", "verdant:budgets:updated", "verdant:debt:updated", "verdant:buckets:updated", "verdant:goals:updated", "verdant:realestate:updated"];
    events.forEach((event) => window.addEventListener(event, hydrate));
    return () => events.forEach((event) => window.removeEventListener(event, hydrate));
  }, []);

  const netWorth = useMemo(() => summary.assets - summary.debt, [summary]);
  const updateRow = (row: WorkbookRow, value: string) => {
    const next = updateWorkbookRow(data, active, row.id, value);
    syncWorkbookRowToSite(active, row, value);
    setData(next); setSaved(false); saveWorkbook(next); setSaved(true);
  };
  const addRow = () => {
    const row = { id: `${active}-custom-${Date.now()}`, label: "אחר — ערוך שם סעיף", value: "", note: "שדה דינמי" };
    const next = { ...data, [active]: [...(data[active] || []), row] };
    setData(next); saveWorkbook(next);
  };
  const updateCell = (row: WorkbookRow, index: number, value: string) => {
    const next = updateWorkbookCell(data, active, row.id, index, value);
    if (index === 0) syncWorkbookRowToSite(active, row, value);
    setData(next); setSaved(false); saveWorkbook(next); setSaved(true);
  };
  const rows = data[active] || [];

  const exportXlsx = async () => {
    // Read latest persisted workbook at click time. Avoid stale React closure
    // after an input event and keep export identical to what user sees.
    await writeFamilyWorkbookXlsx(hydrateWorkbookFromSite(loadWorkbook()), familyName || "לקוח");
  };

  return <main dir="rtl" className="min-h-screen px-3 py-5 md:px-8" style={{ background: "var(--verdant-bg, #f4f7f2)" }}><div className="mx-auto max-w-[1500px]">
    <header className="mb-4 flex flex-wrap items-center justify-between gap-3"><div><h1 className="text-2xl font-black text-slate-800">חוברת משפחה</h1><p className="text-sm text-slate-500">{familyName || "לקוח חדש"} · מבנה זהה לאקסל</p></div><div className="flex items-center gap-2"><button type="button" onClick={exportXlsx} className="rounded-xl bg-slate-800 px-4 py-2 text-xs font-black text-white">ייצוא XLSX</button><div className="rounded-xl bg-white px-4 py-2 text-xs font-bold text-slate-500">{saved ? "נשמר" : "שומר..."}</div></div></header>
    <nav aria-label="לשוניות חוברת המשפחה" className="mb-4 flex gap-1 overflow-x-auto rounded-2xl bg-white p-2 shadow-sm">{WORKBOOK_TABS.map((tab) => <button key={tab.id} type="button" onClick={() => setActive(tab.id)} className={`shrink-0 rounded-xl px-4 py-2 text-sm font-extrabold transition ${active === tab.id ? "bg-emerald-700 text-white" : "text-slate-600 hover:bg-emerald-50"}`}>{tab.label}</button>)}</nav>
    {active === "home" ? <HomeSummary summary={{ ...summary, netWorth }} onTab={setActive} /> : <WorkbookSheet tab={active} label={WORKBOOK_TABS.find((tab) => tab.id === active)?.label || "לשונית"} rows={rows} onUpdate={updateRow} onCellUpdate={updateCell} onAdd={addRow} />}
  </div></main>;
}

function HomeSummary({ summary, onTab }: { summary: { assets: number; debt: number; goals: number; netWorth: number }; onTab: (tab: string) => void }) {
  const cards: [string, string | number][] = [["נכסים", money(summary.assets)], ["חובות", money(summary.debt)], ["שווי נקי", money(summary.netWorth)], ["מטרות פעילות", summary.goals]];
  return <div className="space-y-4"><section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{cards.map(([label, value]) => <div key={label} className="rounded-2xl bg-white p-5 shadow-sm"><div className="text-xs font-bold text-slate-500">{label}</div><div className="mt-1 text-2xl font-black text-slate-800">{value}</div></div>)}</section><section className="rounded-2xl bg-white p-5 shadow-sm"><h2 className="mb-3 text-lg font-black text-slate-800">שלבי העבודה</h2><div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">{WORKBOOK_TABS.slice(1).map((tab, i) => <button key={tab.id} type="button" onClick={() => onTab(tab.id)} className="flex items-center gap-3 rounded-xl border border-slate-200 p-3 text-right hover:border-emerald-400"><span className="flex h-7 w-7 items-center justify-center rounded-full bg-emerald-100 text-sm font-black text-emerald-800">{i + 1}</span><span className="font-bold text-slate-700">{tab.label}</span></button>)}</div></section></div>;
}

function WorkbookSheet({ tab, label, rows, onUpdate, onCellUpdate, onAdd }: { tab: string; label: string; rows: WorkbookRow[]; onUpdate: (row: WorkbookRow, value: string) => void; onCellUpdate: (row: WorkbookRow, index: number, value: string) => void; onAdd: () => void }) {
  const monthly = tab === "cashflow" || tab === "business";
  if (monthly) return <MonthlySheet label={label} rows={rows} onCellUpdate={onCellUpdate} onAdd={onAdd} />;
  return <section className="overflow-hidden rounded-2xl bg-white shadow-sm"><div className="flex items-center justify-between border-b border-slate-200 px-5 py-4"><div><h2 className="text-lg font-black text-slate-800">{label}</h2><p className="text-xs text-slate-500">צהוב = שדה לעריכה · אפור = חישוב אוטומטי</p></div><button type="button" onClick={onAdd} className="rounded-lg bg-emerald-700 px-3 py-2 text-xs font-black text-white">+ הוסף אחר</button></div><div className="overflow-x-auto"><table className="w-full min-w-[650px] border-collapse"><thead><tr className="bg-slate-100 text-right text-xs font-black text-slate-600"><th className="w-1/3 border border-slate-200 p-3">סעיף</th><th className="border border-slate-200 p-3">ערך / תכנון</th><th className="border border-slate-200 p-3">הערות</th></tr></thead><tbody>{rows.length ? rows.map((row) => <tr key={row.id}><td className="border border-slate-200 p-3 font-bold text-slate-700">{row.label}</td><td className="border border-slate-200 p-2">{row.calculated ? <span className="block rounded-lg bg-slate-100 p-2 text-slate-700">{row.value}</span> : <input aria-label={row.label} value={row.value} onChange={(event) => onUpdate(row, event.target.value)} className="w-full rounded-lg border border-amber-300 bg-amber-50 p-2 text-sm outline-none focus:ring-2 focus:ring-emerald-400" />}</td><td className="border border-slate-200 p-3 text-sm text-slate-500">{row.note || ""}</td></tr>) : <tr><td colSpan={3} className="p-8 text-center text-slate-500">אין עדיין נתונים.</td></tr>}</tbody></table></div></section>;
}

function MonthlySheet({ label, rows, onCellUpdate, onAdd }: { label: string; rows: WorkbookRow[]; onCellUpdate: (row: WorkbookRow, index: number, value: string) => void; onAdd: () => void }) {
  const months = ["ינואר", "פברואר", "מרץ", "אפריל", "מאי", "יוני", "יולי", "אוגוסט", "ספטמבר", "אוקטובר", "נובמבר", "דצמבר"];
  return <section className="overflow-hidden rounded-2xl bg-white shadow-sm"><div className="flex items-center justify-between border-b border-slate-200 px-5 py-4"><div><h2 className="text-lg font-black text-slate-800">{label}</h2><p className="text-xs text-slate-500">כל חודש: תכנון וביצוע · גלילה אופקית כמו באקסל</p></div><button type="button" onClick={onAdd} className="rounded-lg bg-emerald-700 px-3 py-2 text-xs font-black text-white">+ הוסף אחר</button></div><div className="overflow-x-auto"><table className="min-w-[1900px] border-collapse text-xs"><thead><tr className="bg-slate-100"><th rowSpan={2} className="sticky right-0 z-10 border border-slate-200 bg-slate-100 p-2 text-right">קטגוריה</th>{months.map((month) => <th key={month} colSpan={2} className="border border-slate-200 p-2">{month}</th>)}</tr><tr className="bg-slate-50">{months.flatMap((month) => [<th key={`${month}-p`} className="border border-slate-200 p-1">תכנון</th>, <th key={`${month}-a`} className="border border-slate-200 p-1">ביצוע</th>])}</tr></thead><tbody>{rows.map((row) => <tr key={row.id}><td className="sticky right-0 z-10 border border-slate-200 bg-white p-2 font-bold">{row.label}</td>{(row.cells || Array.from({ length: 24 }, () => "")).map((value, index) => <td key={index} className="border border-slate-200 p-1"><input aria-label={`${row.label} ${months[Math.floor(index / 2)]} ${index % 2 ? "ביצוע" : "תכנון"}`} value={value} onChange={(event) => onCellUpdate(row, index, event.target.value)} className="w-20 rounded border border-amber-300 bg-amber-50 p-1 text-left" /></td>)}</tr>)}</tbody></table></div></section>;
}
