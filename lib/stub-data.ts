/**
 * Demo data — drives the UI before Supabase env is wired.
 * Mirrors the shape of the real queries so pages can swap 1-for-1.
 */

import type {
  CashflowSummary, NetWorth, Goal, Task, Asset, Liability, SecurityValued,
} from "@/types/db";
import type { CashflowMonthPoint } from "@/components/charts/CashflowBarChart";
import { HE_MONTHS } from "./format";

const HH_ID = "demo-household";
const ISO = new Date().toISOString();

export const demoCashflow: CashflowSummary[] = [
  { household_id: HH_ID, month_id: "m-2026-03", year: 2026, month: 3, closed: false, income_total: 28500, expense_total: 27200, cashflow_gap:  1300 },
  { household_id: HH_ID, month_id: "m-2026-02", year: 2026, month: 2, closed: true,  income_total: 28500, expense_total: 28100, cashflow_gap:   400 },
  { household_id: HH_ID, month_id: "m-2026-01", year: 2026, month: 1, closed: true,  income_total: 28500, expense_total: 29400, cashflow_gap:  -900 },
  { household_id: HH_ID, month_id: "m-2025-12", year: 2025, month: 12, closed: true, income_total: 32500, expense_total: 31800, cashflow_gap:   700 },
  { household_id: HH_ID, month_id: "m-2025-11", year: 2025, month: 11, closed: true, income_total: 28500, expense_total: 27600, cashflow_gap:   900 },
  { household_id: HH_ID, month_id: "m-2025-10", year: 2025, month: 10, closed: true, income_total: 28500, expense_total: 26900, cashflow_gap:  1600 },
];

export const demoNetWorth: NetWorth = {
  household_id: HH_ID,
  total_assets: 1_245_000,
  total_liabilities: 420_000,
  net_worth: 825_000,
};

export const demoGoals: Goal[] = [
  { id: "g1", household_id: HH_ID, name: "קרן חירום", target_amount: 60000, target_date: "2027-01-01",
    lump_today: 21000, monthly_contrib: 1500, instrument: "money-market", linked_asset_id: null,
    track: "behind", fv_projected: 48000, created_at: ISO, updated_at: ISO },
  { id: "g2", household_id: HH_ID, name: "חינוך ילדים", target_amount: 250000, target_date: "2034-09-01",
    lump_today: 34000, monthly_contrib: 900, instrument: "etf-global", linked_asset_id: null,
    track: "at_risk", fv_projected: 198000, created_at: ISO, updated_at: ISO },
  { id: "g3", household_id: HH_ID, name: "פרישה מוקדמת", target_amount: 2500000, target_date: "2045-06-01",
    lump_today: 380000, monthly_contrib: 3200, instrument: "pension", linked_asset_id: null,
    track: "on", fv_projected: 2650000, created_at: ISO, updated_at: ISO },
];

export const demoTasks: Task[] = [
  { id: "t1", household_id: HH_ID, rule_id: "low_emergency_fund", title: "קרן חירום מתחת ל-3 חודשים",
    detail: "יש לך נזילות של 1.8 חודשי הוצאה. מומלץ להגיע ל-3-6.",
    severity: "medium", status: "open", cta_href: "/balance", done_at: null, created_at: ISO },
  { id: "t2", household_id: HH_ID, rule_id: "expensive_loan", title: "הלוואה יקרה (1)",
    detail: "זוהתה הלוואה בריבית 9.2%. שקול מיחזור ב'ארגז כלים'.",
    severity: "medium", status: "open", cta_href: "/tools", done_at: null, created_at: ISO },
  { id: "t3", household_id: HH_ID, rule_id: "goal_at_risk", title: "מטרה בסיכון (1)",
    detail: "חינוך ילדים — פער בין FV צפוי ליעד.",
    severity: "medium", status: "open", cta_href: "/goals", done_at: null, created_at: ISO },
];

export const demoAssets: Asset[] = [
  { id: "a1", household_id: HH_ID, asset_group: "liquid",      name: "עו״ש + פיקדון",    balance:  48000, yield_annual_pct: 2.0, auto_sourced: false, created_at: ISO, updated_at: ISO },
  { id: "a2", household_id: HH_ID, asset_group: "investments", name: "תיק השקעות",        balance: 180000, yield_annual_pct: 6.5, auto_sourced: false, created_at: ISO, updated_at: ISO },
  { id: "a3", household_id: HH_ID, asset_group: "pension",     name: "קרן פנסיה — מנורה", balance: 380000, yield_annual_pct: 5.0, auto_sourced: true,  created_at: ISO, updated_at: ISO },
  { id: "a4", household_id: HH_ID, asset_group: "realestate",  name: "דירת מגורים",       balance: 637000, yield_annual_pct: 3.0, auto_sourced: false, created_at: ISO, updated_at: ISO },
];

export const demoLiabilities: Liability[] = [
  { id: "l1", household_id: HH_ID, liability_group: "mortgage", name: "משכנתא",      balance: 380000, rate_pct: 4.8,  monthly_payment: 2950, prepay_fee: 0, from_scanner: false, created_at: ISO, updated_at: ISO },
  { id: "l2", household_id: HH_ID, liability_group: "loans",    name: "הלוואת רכב",  balance:  28000, rate_pct: 9.2,  monthly_payment:  950, prepay_fee: 0, from_scanner: false, created_at: ISO, updated_at: ISO },
  { id: "l3", household_id: HH_ID, liability_group: "cc",       name: "אשראי",        balance:  12000, rate_pct: 11.5, monthly_payment:  600, prepay_fee: 0, from_scanner: false, created_at: ISO, updated_at: ISO },
];

export const demoSecurities: SecurityValued[] = [
  { id: "s1", household_id: HH_ID, kind: "etf",    symbol: "VTI",   broker: "IBKR",   currency: "USD",
    quantity: 120, avg_cost: 220, current_price: 275, fx_rate_to_ils: 3.72,
    cost_basis_local: 26400, market_value_local: 33000, cost_basis_ils: 98208, market_value_ils: 122760,
    unrealized_pnl_ils: 24552, unrealized_pnl_pct: 25.0, vest_date: null, strike_price: null },
  { id: "s2", household_id: HH_ID, kind: "stock",  symbol: "AAPL",  broker: "IBKR",   currency: "USD",
    quantity: 40, avg_cost: 150, current_price: 225, fx_rate_to_ils: 3.72,
    cost_basis_local: 6000, market_value_local: 9000, cost_basis_ils: 22320, market_value_ils: 33480,
    unrealized_pnl_ils: 11160, unrealized_pnl_pct: 50.0, vest_date: null, strike_price: null },
  { id: "s3", household_id: HH_ID, kind: "rsu",    symbol: "META",  broker: "E*TRADE", currency: "USD",
    quantity: 85, avg_cost: 310, current_price: 560, fx_rate_to_ils: 3.72,
    cost_basis_local: 26350, market_value_local: 47600, cost_basis_ils: 98022, market_value_ils: 177072,
    unrealized_pnl_ils: 79050, unrealized_pnl_pct: 80.6, vest_date: "2025-08-15", strike_price: null },
  { id: "s4", household_id: HH_ID, kind: "crypto", symbol: "BTC",   broker: "Binance", currency: "USD",
    quantity: 0.35, avg_cost: 28000, current_price: 68000, fx_rate_to_ils: 3.72,
    cost_basis_local: 9800, market_value_local: 23800, cost_basis_ils: 36456, market_value_ils: 88536,
    unrealized_pnl_ils: 52080, unrealized_pnl_pct: 142.9, vest_date: null, strike_price: null },
  { id: "s5", household_id: HH_ID, kind: "option", symbol: "GOOGL", broker: "Carta",   currency: "USD",
    quantity: 500, avg_cost: 0, current_price: 170, fx_rate_to_ils: 3.72,
    cost_basis_local: 0, market_value_local: 85000, cost_basis_ils: 0, market_value_ils: 316200,
    unrealized_pnl_ils: 316200, unrealized_pnl_pct: 100, vest_date: "2026-11-01", strike_price: 95 },
];

/**
 * Holistic exposure — maps underlying index/sector across ALL instruments.
 * pension track, hishtalmut track, self-managed portfolio.
 */
export interface ExposureSlice {
  index: string;       // e.g. "S&P 500", "אג\"ח ממשלתי"
  pension: number;     // ₪ amount in pension
  hishtalmut: number;  // ₪ amount in hishtalmut
  selfManaged: number; // ₪ amount in self-managed portfolio
  total: number;
}

export const demoExposure: ExposureSlice[] = [
  { index: "S&P 500",         pension: 190000, hishtalmut: 28000, selfManaged: 156240, total: 374240 },
  { index: "אג\"ח ממשלתי",     pension: 114000, hishtalmut: 10500, selfManaged: 0,      total: 124500 },
  { index: "נדל\"ן ישראל",     pension: 38000,  hishtalmut: 3500,  selfManaged: 0,      total: 41500 },
  { index: "אג\"ח קונצרני",    pension: 19000,  hishtalmut: 2000,  selfManaged: 0,      total: 21000 },
  { index: "שווקים מתעוררים",  pension: 19000,  hishtalmut: 1000,  selfManaged: 88536,  total: 108536 },
  { index: "קריפטו",           pension: 0,      hishtalmut: 0,     selfManaged: 88536,  total: 88536 },
];

/** Benchmark models for investment comparison */
export interface BenchmarkModel {
  id: string;
  name: string;
  description: string;
  allocation: { label: string; pct: number; color: string }[];
  expectedReturn: number; // annual
  risk: "low" | "medium" | "high";
}

export const demoBenchmarks: BenchmarkModel[] = [
  {
    id: "conservative",
    name: "סולידי 20/80",
    description: "20% מניות, 80% אג\"ח — מתאים לשמרנים",
    allocation: [
      { label: "מניות", pct: 20, color: "#1B4332" },
      { label: "אג\"ח ממשלתי", pct: 50, color: "#2B694D" },
      { label: "אג\"ח קונצרני", pct: 20, color: "#2B694D" },
      { label: "מזומן", pct: 10, color: "#d8e0d0" },
    ],
    expectedReturn: 0.045,
    risk: "low",
  },
  {
    id: "balanced",
    name: "מאוזן 60/40",
    description: "60% מניות, 40% אג\"ח — קלאסי",
    allocation: [
      { label: "מניות ארה\"ב", pct: 35, color: "#1B4332" },
      { label: "מניות בינלאומי", pct: 25, color: "#1a6b42" },
      { label: "אג\"ח", pct: 30, color: "#2B694D" },
      { label: "מזומן", pct: 10, color: "#d8e0d0" },
    ],
    expectedReturn: 0.07,
    risk: "medium",
  },
  {
    id: "aggressive",
    name: "אגרסיבי S&P 500",
    description: "100% מניות — מבוסס S&P 500",
    allocation: [
      { label: "S&P 500", pct: 80, color: "#1B4332" },
      { label: "מניות צמיחה", pct: 15, color: "#1a6b42" },
      { label: "קריפטו", pct: 5, color: "#f59e0b" },
    ],
    expectedReturn: 0.10,
    risk: "high",
  },
];

/** Financial infrastructure — bank accounts & credit cards extracted from mapping */
export interface FinancialInstrument {
  id: string;
  type: "bank" | "credit_card" | "investment";
  name: string;
  institution: string;
  last4?: string;
  balance?: number;
  lastUpdated?: string; // ISO date
  accountNumber?: string;
}

export const demoInstruments: FinancialInstrument[] = [
  { id: "fi1", type: "bank",        name: "חשבון עו\"ש",   institution: "לאומי",    last4: "4521", balance: 32000, lastUpdated: "2026-04-05", accountNumber: "12-456-4521" },
  { id: "fi2", type: "bank",        name: "חשבון חיסכון",  institution: "לאומי",    last4: "4522", balance: 16000, lastUpdated: "2026-03-10", accountNumber: "12-456-4522" },
  { id: "fi3", type: "credit_card", name: "ויזה פלטינום",   institution: "לאומי קארד", last4: "8834", lastUpdated: "2026-04-01" },
  { id: "fi4", type: "credit_card", name: "מאסטרקארד",      institution: "ישראכרט",   last4: "1209", lastUpdated: "2026-02-15" },
  { id: "fi5", type: "investment",  name: "תיק השקעות IBKR", institution: "Interactive Brokers", balance: 122760, lastUpdated: "2026-04-08", accountNumber: "U98765" },
  { id: "fi6", type: "investment",  name: "תיק E*TRADE",    institution: "E*TRADE",   balance: 177072, lastUpdated: "2026-03-28", accountNumber: "6734-2211" },
];

/** Map CashflowSummary rows → chart points (chronological oldest→newest). */
export function toChartPoints(rows: CashflowSummary[]): CashflowMonthPoint[] {
  return [...rows]
    .sort((a, b) => (a.year - b.year) * 100 + (a.month - b.month))
    .map((r) => ({
      month: `${HE_MONTHS[r.month - 1]} ${r.year}`,
      income: r.income_total,
      expense: r.expense_total,
      gap: r.cashflow_gap,
    }));
}
