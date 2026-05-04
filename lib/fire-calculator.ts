/**
 * Verdant Ledger · FIRE Compass
 * ─────────────────────────────
 * Computes the point at which liquid capital generates passive income
 * equal to monthly expenses — "Financial Independence / Retire Early".
 *
 * Given a holistic trajectory (see dashboard `trajectory` useMemo), this
 * module overlays a second line: expected monthly passive income at every
 * age. The intersection with monthlyExpenses defines `fireAge`.
 *
 * Core formula:
 *   passiveIncomeMonthly(age) =
 *     (liquid(age) × SWR)/12
 *   + realEstateCashflow(age)
 *   + pensionAnnuity(age)         ← only once age ≥ retirementAge
 *
 * Pension corpus is EXCLUDED from the pre-retirement calc (illiquid), but
 * once the user hits retirementAge the pension annuity starts flowing and
 * MUST be counted — otherwise a client who retires at 67 with ₪5K/month
 * pension appears to "fail FIRE" even though their real passive income
 * covers expenses comfortably. Annuity uses conversionFactor (מקדם המרה)
 * from pension funds; fallback 200 matches the default on pension-store.
 */

export interface TrajectoryPoint {
  age: number;
  year: number;
  month: number;
  liquid: number;
  pension: number;
  realestate: number;
  total: number;
}

export interface FirePoint {
  age: number;
  year: number;
  /** Expected monthly passive income at this age (ILS). */
  passiveMonthly: number;
}

export interface FireResult {
  /** Line to overlay on the chart — one entry per trajectory point. */
  line: FirePoint[];
  /** Age at which passive income first covers monthly expenses. Null if never. */
  fireAge: number | null;
  /** Year corresponding to fireAge. */
  fireYear: number | null;
  /** Years from startAge until FIRE. */
  yearsToFire: number | null;
  /** Current passive income (at trajectory start). */
  currentPassiveMonthly: number;
  /** How much more liquid capital is needed today to hit FIRE now. */
  gapToFireCapital: number;
  /** Monthly expenses threshold used for the crossover. */
  monthlyExpenses: number;
}

/**
 * Estimate monthly net rental cashflow from real estate value.
 * Simplified: assumes 4% net yield on RE value. When the user has a real
 * realestate store with rent + expenses this should be swapped out — the
 * caller can override by passing `realEstateNetMonthly` directly.
 */
export function estimateRealEstatePassive(realEstateValue: number, netYield = 0.035): number {
  return (realEstateValue * netYield) / 12;
}

/**
 * Estimate monthly pension annuity from a corpus.
 * Simple linear model: corpus ÷ conversionFactor.
 * Default factor 200 = ~₪1,000/month per ₪200,000 corpus (matches the
 * Israeli old-funds default). Real funds have their own factors stored
 * per-fund; the caller can pass a weighted-average factor if available.
 */
export function estimatePensionAnnuity(pensionCorpus: number, conversionFactor = 200): number {
  if (pensionCorpus <= 0 || conversionFactor <= 0) return 0;
  return pensionCorpus / conversionFactor;
}

/**
 * Compute FIRE trajectory.
 * @param trajectory  output of the dashboard `trajectory` useMemo
 * @param monthlyExpenses threshold that must be covered (ILS/month)
 * @param swr Safe Withdrawal Rate (default 4%)
 * @param opts.includeRealEstate whether to add estimated RE net rental (default true)
 * @param opts.reNetYield net rental yield assumption (default 3.5%)
 * @param opts.retirementAge age at which pension annuity starts flowing (default 67)
 * @param opts.pensionConversionFactor weighted-avg factor from pension-store (default 200)
 */
export function computeFireTrajectory(
  trajectory: TrajectoryPoint[],
  monthlyExpenses: number,
  swr = 0.04,
  opts: {
    includeRealEstate?: boolean;
    reNetYield?: number;
    retirementAge?: number;
    pensionConversionFactor?: number;
  } = {}
): FireResult {
  const includeRE = opts.includeRealEstate ?? true;
  const reYield = opts.reNetYield ?? 0.035;
  const retirementAge = opts.retirementAge ?? 67;
  const pensionFactor = opts.pensionConversionFactor ?? 200;

  const line: FirePoint[] = trajectory.map((p) => {
    const liqPassive = (p.liquid * swr) / 12;
    const rePassive = includeRE ? estimateRealEstatePassive(p.realestate, reYield) : 0;
    // Pension annuity only flows AFTER retirement age — the corpus is
    // illiquid before then, and post-retirement the corpus in the
    // trajectory is being drawn down, so `p.pension` is the live balance.
    const pensionPassive =
      p.age >= retirementAge ? estimatePensionAnnuity(p.pension, pensionFactor) : 0;
    return {
      age: p.age,
      year: p.year,
      passiveMonthly: liqPassive + rePassive + pensionPassive,
    };
  });

  // Find first crossover (passive >= expenses)
  let fireAge: number | null = null;
  let fireYear: number | null = null;
  if (monthlyExpenses > 0) {
    for (const p of line) {
      if (p.passiveMonthly >= monthlyExpenses) {
        fireAge = p.age;
        fireYear = p.year;
        break;
      }
    }
  }

  const startAge = trajectory[0]?.age ?? 0;
  const yearsToFire = fireAge !== null ? fireAge - startAge : null;
  const currentPassiveMonthly = line[0]?.passiveMonthly ?? 0;
  const requiredCapital = monthlyExpenses > 0 ? (monthlyExpenses * 12) / swr : 0;
  const currentLiquid = trajectory[0]?.liquid ?? 0;
  const currentRE = includeRE ? (trajectory[0]?.realestate ?? 0) : 0;
  // Effective capital contributing to passive income today
  const effectiveCapital = currentLiquid + currentRE * (reYield / swr);
  const gapToFireCapital = Math.max(0, requiredCapital - effectiveCapital);

  return {
    line,
    fireAge,
    fireYear,
    yearsToFire,
    currentPassiveMonthly,
    gapToFireCapital,
    monthlyExpenses,
  };
}
