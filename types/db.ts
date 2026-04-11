/**
 * Verdant Ledger · Typed DB Schema
 * Mirrors the Supabase tables from supabase/migrations/0001_initial_schema.sql
 * (In production, regenerate via `npm run db:types` from the live DB.)
 */

export type PlannerRole   = "advisor" | "admin" | "viewer";
export type HouseholdStage = "onboarding" | "actuals" | "planning" | "active";
export type TxKind        = "income" | "expense";
export type TxCatGroup    = "income" | "fixed" | "variable" | "installments";
export type AssetGroup    = "liquid" | "investments" | "pension" | "realestate" | "other";
export type LiabilityGroup = "mortgage" | "loans" | "cc";
export type GoalTrack     = "on" | "behind" | "at_risk";
export type TaskSeverity  = "low" | "medium" | "high";
export type TaskStatus    = "open" | "done" | "snoozed";

export interface Advisor {
  id: string;
  full_name: string;
  email: string;
  role: PlannerRole;
  created_at: string;
}

export interface Household {
  id: string;
  advisor_id: string;
  family_name: string;
  members_count: number;
  stage: HouseholdStage;
  onboarded_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface Profile {
  household_id: string;
  head_name: string | null;
  partner_name: string | null;
  kids_under_5: number;
  kids_6_17: number;
  occupation: string | null;
  net_salary: number | null;
  risk_appetite: "low" | "medium" | "high" | null;
  notes: string | null;
  answered_at: string | null;
}

export interface CashflowMonth {
  id: string;
  household_id: string;
  year: number;
  month: number;
  closed: boolean;
  closed_at: string | null;
}

export interface CashflowTx {
  id: string;
  household_id: string;
  month_id: string;
  kind: TxKind;
  cat_group: TxCatGroup;
  category: string;
  subcategory: string | null;
  merchant: string | null;
  amount: number;
  tx_date: string | null;
  source: "manual" | "scan" | "import";
  created_at: string;
}

export interface BudgetPlan {
  id: string;
  household_id: string;
  category: string;
  cat_group: TxCatGroup;
  planned_monthly: number;
}

export interface Asset {
  id: string;
  household_id: string;
  asset_group: AssetGroup;
  name: string;
  balance: number;
  yield_annual_pct: number | null;
  auto_sourced: boolean;
  created_at: string;
  updated_at: string;
}

export interface Liability {
  id: string;
  household_id: string;
  liability_group: LiabilityGroup;
  name: string;
  balance: number;
  monthly_payment: number;
  rate_pct: number;
  prepay_fee: number;
  from_scanner: boolean;
  created_at: string;
  updated_at: string;
}

export interface LoanScheduleRow {
  id: string;
  liability_id: string;
  payment_no: number;
  principal: number;
  interest: number;
  balance_after: number;
}

export interface Goal {
  id: string;
  household_id: string;
  name: string;
  target_amount: number;
  target_date: string;
  lump_today: number;
  monthly_contrib: number;
  instrument: string | null;
  linked_asset_id: string | null;
  track: GoalTrack;
  fv_projected: number | null;
  updated_at: string;
  created_at: string;
}

export interface Task {
  id: string;
  household_id: string;
  rule_id: string;
  title: string;
  detail: string | null;
  severity: TaskSeverity;
  status: TaskStatus;
  cta_href: string | null;
  done_at: string | null;
  created_at: string;
}

export interface Scenario {
  id: string;
  household_id: string;
  kind: "realestate" | "compound" | "mortgage" | "consolidation" | "miluim" | "alternatives" | "tax";
  label: string;
  inputs_json: Record<string, unknown>;
  outputs_json: Record<string, unknown>;
  saved_at: string;
}

// ===== Client Instruments (bank accounts + credit cards) =====
export type InstrumentType = "bank_account" | "credit_card";

export interface ClientInstrument {
  id: string;
  household_id: string;
  type: InstrumentType;
  institution: string;
  identifier: string;
  label: string;
  source_file: string | null;
  detected_at: string;
  created_at: string;
}

// ===== Securities / Crypto / RSU / Options =====
export type SecurityKind = "stock" | "etf" | "crypto" | "rsu" | "option" | "bond" | "fund";
export type CurrencyCode = "ILS" | "USD" | "EUR" | "GBP";

export interface Security {
  id: string;
  household_id: string;
  asset_id: string | null;
  kind: SecurityKind;
  symbol: string;
  broker: string | null;
  quantity: number;
  avg_cost: number;
  current_price: number;
  currency: CurrencyCode;
  fx_rate_to_ils: number;
  vest_date: string | null;
  strike_price: number | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface SecurityValued {
  id: string;
  household_id: string;
  kind: SecurityKind;
  symbol: string;
  broker: string | null;
  currency: CurrencyCode;
  quantity: number;
  avg_cost: number;
  current_price: number;
  fx_rate_to_ils: number;
  cost_basis_local: number;
  market_value_local: number;
  cost_basis_ils: number;
  market_value_ils: number;
  unrealized_pnl_ils: number;
  unrealized_pnl_pct: number;
  vest_date: string | null;
  strike_price: number | null;
}

// ===== Masleka (pension clearinghouse) =====
export type MaslekaStatus = "uploaded" | "parsing" | "parsed" | "mapped" | "failed";

export interface MaslekaFile {
  id: string;
  household_id: string;
  file_name: string;
  storage_path: string | null;
  file_size_kb: number | null;
  status: MaslekaStatus;
  uploaded_by: string | null;
  uploaded_at: string;
  parsed_at: string | null;
  error_msg: string | null;
}

export interface MaslekaEntry {
  id: string;
  file_id: string;
  household_id: string;
  asset_id: string | null;
  product_type: string | null;
  company: string | null;
  policy_number: string | null;
  balance: number;
  monthly_deposit: number | null;
  management_fee_pct: number | null;
  deposit_fee_pct: number | null;
  investment_track: string | null;
  as_of_date: string | null;
  created_at: string;
}

// ------- Views -------
export interface CashflowSummary {
  household_id: string;
  month_id: string;
  year: number;
  month: number;
  closed: boolean;
  income_total: number;
  expense_total: number;
  cashflow_gap: number;
}

export interface NetWorth {
  household_id: string;
  total_assets: number;
  total_liabilities: number;
  net_worth: number;
}

export interface BudgetVsActual {
  household_id: string;
  category: string;
  cat_group: TxCatGroup;
  planned_monthly: number;
  actual_monthly_avg: number;
  variance: number;
  variance_pct: number | null;
}
