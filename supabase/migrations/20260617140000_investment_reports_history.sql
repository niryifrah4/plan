-- =============================================================================
-- Investment reports — support multiple historical periods
-- =============================================================================
--   We are dropping the portfolio-only unique constraint and replacing it with
--   one that includes `report_date`, allowing a household to save multiple
--   snapshots (periods) for the same broker account.
-- =============================================================================

-- 1. Ensure report_date is not null before using it in a unique constraint.
--    We can coalesce it to a dummy '1970-01-01' if it's somehow null, but it
--    really shouldn't be for valid reports.
UPDATE public.investment_reports SET report_date = '1970-01-01' WHERE report_date IS NULL;
ALTER TABLE public.investment_reports ALTER COLUMN report_date SET NOT NULL;

-- 2. Drop the old constraint
DROP INDEX IF EXISTS investment_reports_portfolio_key;

-- 3. Create the new constraint
CREATE UNIQUE INDEX IF NOT EXISTS investment_reports_portfolio_period_key
  ON public.investment_reports(household_id, broker, account_number, report_date);
