/**
 * Shared types for the onboarding questionnaire.
 *
 * Each interface mirrors one row of a localStorage-persisted slice:
 *   • Fields       — verdant:onboarding:fields (flat key/value bag)
 *   • Child        — verdant:onboarding:children[i]
 *   • AssetRow     — verdant:onboarding:assets[i]
 *   • LiabRow      — verdant:onboarding:liabilities[i]
 *   • InsRow       — verdant:onboarding:insurance[i]
 *   • GoalRow      — verdant:onboarding:goals[i]
 *   • IncomeRow    — verdant:onboarding:incomes[i]
 *
 * All values are stored as strings because the inputs are HTML form fields.
 * Numeric coercion happens at the sync boundary (see onboarding-sync.ts).
 */

export interface Fields {
  [key: string]: string;
}

export interface Child {
  [key: string]: string;
  name: string;
  dob: string;
  gender: string;
  age: string;
  framework: string;
  special: string;
  savings_provider: string;
  savings_track: string;
  savings_balance: string;
  savings_parent_deposit: string;
}

export interface AssetRow {
  [key: string]: string;
  type: string;
  desc: string;
  value: string;
  /** Monthly gross rent (investment properties only). */
  rent: string;
  /** Monthly operating expenses — ועד בית, ניהול, ארנונה (non-mortgage). */
  rentExpenses: string;
}

export interface LiabRow {
  [key: string]: string;
  type: string;
  lender: string;
  balance: string;
  rate: string;
  monthly: string;
}

export interface InsRow {
  [key: string]: string | undefined;
  type: string;
  has: string;
  company: string;
  coverage: string;
  premium: string;
  for?: string;
  isCustom?: string;
}

export interface GoalRow {
  [key: string]: string;
  name: string;
  cost: string;
  horizon: string;
  priority: string;
}

export interface IncomeRow {
  [key: string]: string;
  label: string;
  value: string;
}
