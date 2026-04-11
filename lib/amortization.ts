/**
 * Amortization Schedule Rebuilder
 *
 * Precisely reconstructs loan schedules (mortgage, consumer loans) from
 * source data so the liability side of the net-worth statement is always
 * 100% accurate — including CPI (Israeli madad) indexation.
 *
 * Supports:
 *   • Spitzer (equal monthly payment)
 *   • Equal-principal (קרן שווה)
 *   • Bullet / balloon (one-time)
 *   • CPI-linked adjustments (צמוד מדד)
 */

export type ScheduleType = "spitzer" | "equal_principal" | "bullet";

export interface LoanInput {
  principal: number;          // original principal ₪
  annualRate: number;         // decimal, e.g. 0.045 = 4.5%
  termMonths: number;
  startDate: string;          // ISO
  type: ScheduleType;
  /** Optional: CPI multiplier applied to outstanding principal (1.0 = none) */
  cpiMultiplier?: number;
  /** Optional: months already paid (for mid-life balance computation) */
  monthsPaid?: number;
}

export interface ScheduleRow {
  month: number;              // 1..termMonths
  date: string;               // ISO
  payment: number;            // total installment
  interest: number;
  principal: number;          // principal portion of payment
  balance: number;            // remaining principal after this payment
}

export interface AmortizationResult {
  rows: ScheduleRow[];
  /** Current outstanding principal (after monthsPaid) */
  currentBalance: number;
  /** Total interest paid over entire loan */
  totalInterest: number;
  /** Total amount paid over entire loan */
  totalPaid: number;
  /** First monthly installment */
  firstPayment: number;
}

/**
 * Rebuild a full amortization schedule from source parameters.
 */
export function buildSchedule(input: LoanInput): AmortizationResult {
  const { principal, annualRate, termMonths, startDate, type } = input;
  const cpiMult = input.cpiMultiplier ?? 1;
  const r = annualRate / 12;
  const rows: ScheduleRow[] = [];

  let balance = principal * cpiMult;
  let totalInterest = 0;
  let totalPaid = 0;
  let firstPayment = 0;

  const start = new Date(startDate);

  if (type === "bullet") {
    // Interest-only until term end, balloon at maturity
    const monthlyInterest = balance * r;
    for (let m = 1; m <= termMonths; m++) {
      const date = addMonths(start, m).toISOString().slice(0, 10);
      const isLast = m === termMonths;
      const principalPaid = isLast ? balance : 0;
      const payment = monthlyInterest + principalPaid;
      balance = balance - principalPaid;
      rows.push({ month: m, date, payment, interest: monthlyInterest, principal: principalPaid, balance: Math.max(0, balance) });
      totalInterest += monthlyInterest;
      totalPaid += payment;
      if (m === 1) firstPayment = payment;
    }
  } else if (type === "spitzer") {
    // Equal monthly payment: PMT = P · r / (1 − (1+r)^−n)
    const pmt = r === 0
      ? balance / termMonths
      : balance * r / (1 - Math.pow(1 + r, -termMonths));
    firstPayment = pmt;
    for (let m = 1; m <= termMonths; m++) {
      const date = addMonths(start, m).toISOString().slice(0, 10);
      const interest = balance * r;
      const principalPaid = pmt - interest;
      balance = Math.max(0, balance - principalPaid);
      rows.push({ month: m, date, payment: pmt, interest, principal: principalPaid, balance });
      totalInterest += interest;
      totalPaid += pmt;
    }
  } else {
    // Equal principal (קרן שווה): principal portion constant, interest decays
    const principalPortion = balance / termMonths;
    for (let m = 1; m <= termMonths; m++) {
      const date = addMonths(start, m).toISOString().slice(0, 10);
      const interest = balance * r;
      const payment = principalPortion + interest;
      balance = Math.max(0, balance - principalPortion);
      rows.push({ month: m, date, payment, interest, principal: principalPortion, balance });
      totalInterest += interest;
      totalPaid += payment;
      if (m === 1) firstPayment = payment;
    }
  }

  const monthsPaid = Math.min(input.monthsPaid ?? 0, termMonths);
  const currentBalance = monthsPaid > 0
    ? (rows[monthsPaid - 1]?.balance ?? 0)
    : principal * cpiMult;

  return { rows, currentBalance, totalInterest, totalPaid, firstPayment };
}

/**
 * Given a detected payment history (e.g. from bank records), infer the
 * current outstanding balance by matching payments to scheduled rows.
 */
export function inferBalanceFromPayments(
  schedule: ScheduleRow[],
  paymentsMade: number
): number {
  if (paymentsMade <= 0) return schedule[0]?.balance ?? 0;
  if (paymentsMade >= schedule.length) return 0;
  return schedule[paymentsMade - 1].balance;
}

function addMonths(date: Date, n: number): Date {
  const d = new Date(date);
  d.setMonth(d.getMonth() + n);
  return d;
}
