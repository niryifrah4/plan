-- =============================================================================
-- 0018 — Debt module: typed tables for mortgages / tracks / loans / installments
-- =============================================================================
-- Phase 2 of the debt-page work (2026-05-19): move debt data out of the
-- `client_state` JSON blob and into proper relational tables.
--
-- The blob path (key 'debt_data' in `client_state`) is preserved for
-- backwards-compatibility during Phase 2 dual-write — see lib/sync/debt-tables.ts.
-- A later migration will drop client_state['debt_data'] rows once the read
-- path is switched to the typed tables.
--
-- Old `liabilities` + `loan_schedule` tables (from 0001) are LEFT IN PLACE
-- — they're empty and unused; a later cleanup migration can drop them.
-- =============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Mortgages — one per property (or unassigned)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.mortgages (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id    uuid NOT NULL REFERENCES public.households(id) ON DELETE CASCADE,
  -- Optional link to a property. SET NULL on property delete so the mortgage
  -- doesn't disappear — the user can reassign it. Property table is in 0006.
  property_id     uuid REFERENCES public.properties(id) ON DELETE SET NULL,
  bank            text NOT NULL DEFAULT '',
  property_value  numeric(14,2) NOT NULL DEFAULT 0,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS mortgages_household_idx ON public.mortgages(household_id);
CREATE INDEX IF NOT EXISTS mortgages_property_idx ON public.mortgages(property_id);

ALTER TABLE public.mortgages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_rw_mortgages ON public.mortgages;
CREATE POLICY tenant_rw_mortgages ON public.mortgages
  FOR ALL
  USING (public.owns_household(household_id))
  WITH CHECK (public.owns_household(household_id));

DROP TRIGGER IF EXISTS tg_mortgages_touch ON public.mortgages;
CREATE TRIGGER tg_mortgages_touch
  BEFORE UPDATE ON public.mortgages
  FOR EACH ROW EXECUTE FUNCTION public.tg_touch_updated_at();

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Mortgage tracks — multiple per mortgage (קל"צ, פריים, משתנה, etc.)
--    Rates stored as DECIMAL fractions (0.048 = 4.8%), matching the Phase 1
--    standardization across the debt module.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.mortgage_tracks (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mortgage_id         uuid NOT NULL REFERENCES public.mortgages(id) ON DELETE CASCADE,
  name                text NOT NULL DEFAULT '',
  -- Annual interest rate as a decimal fraction. 0.04800 = 4.8%.
  -- numeric(7,5) supports 0.00000 .. 9.99999 — well above any realistic rate.
  interest_rate       numeric(7,5) NOT NULL DEFAULT 0,
  -- Optional margin over Prime. Same decimal scale. NULL means fixed-rate.
  margin              numeric(7,5),
  indexation          text NOT NULL DEFAULT 'לא צמוד',
  repayment_method    text NOT NULL DEFAULT 'שפיצר',
  original_amount     numeric(14,2) NOT NULL DEFAULT 0,
  remaining_balance   numeric(14,2) NOT NULL DEFAULT 0,
  monthly_payment     numeric(12,2) NOT NULL DEFAULT 0,
  -- start_date/end_date are stored as text "YYYY-MM" to match the TS model
  -- (the `<input type="month">` in /debt page produces this format).
  start_date          text NOT NULL DEFAULT '',
  end_date            text NOT NULL DEFAULT '',
  total_payments      int NOT NULL DEFAULT 0,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  -- Sanity guards. Decimal scale means a rate >= 1 is almost certainly a
  -- legacy percent value that escaped the client-side normalizer.
  CONSTRAINT mortgage_tracks_rate_decimal CHECK (interest_rate >= 0 AND interest_rate < 1),
  CONSTRAINT mortgage_tracks_margin_decimal CHECK (margin IS NULL OR (margin >= -1 AND margin < 1))
);

CREATE INDEX IF NOT EXISTS mortgage_tracks_mortgage_idx ON public.mortgage_tracks(mortgage_id);

ALTER TABLE public.mortgage_tracks ENABLE ROW LEVEL SECURITY;

-- Tracks inherit tenant access via their parent mortgage.
DROP POLICY IF EXISTS tenant_rw_mortgage_tracks ON public.mortgage_tracks;
CREATE POLICY tenant_rw_mortgage_tracks ON public.mortgage_tracks
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.mortgages m
      WHERE m.id = mortgage_tracks.mortgage_id
        AND public.owns_household(m.household_id)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.mortgages m
      WHERE m.id = mortgage_tracks.mortgage_id
        AND public.owns_household(m.household_id)
    )
  );

DROP TRIGGER IF EXISTS tg_mortgage_tracks_touch ON public.mortgage_tracks;
CREATE TRIGGER tg_mortgage_tracks_touch
  BEFORE UPDATE ON public.mortgage_tracks
  FOR EACH ROW EXECUTE FUNCTION public.tg_touch_updated_at();

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Consumer loans — non-mortgage debts (car loan, personal loan, etc.)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.consumer_loans (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id    uuid NOT NULL REFERENCES public.households(id) ON DELETE CASCADE,
  lender          text NOT NULL DEFAULT '',
  start_date      text NOT NULL DEFAULT '',          -- YYYY-MM
  total_payments  int NOT NULL DEFAULT 0,
  monthly_payment numeric(12,2) NOT NULL DEFAULT 0,
  -- Optional. Decimal fraction. NULL when the user hasn't entered a rate.
  interest_rate   numeric(7,5),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT consumer_loans_rate_decimal CHECK (interest_rate IS NULL OR (interest_rate >= 0 AND interest_rate < 1))
);

CREATE INDEX IF NOT EXISTS consumer_loans_household_idx ON public.consumer_loans(household_id);

ALTER TABLE public.consumer_loans ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_rw_consumer_loans ON public.consumer_loans;
CREATE POLICY tenant_rw_consumer_loans ON public.consumer_loans
  FOR ALL
  USING (public.owns_household(household_id))
  WITH CHECK (public.owns_household(household_id));

DROP TRIGGER IF EXISTS tg_consumer_loans_touch ON public.consumer_loans;
CREATE TRIGGER tg_consumer_loans_touch
  BEFORE UPDATE ON public.consumer_loans
  FOR EACH ROW EXECUTE FUNCTION public.tg_touch_updated_at();

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Installment purchases — store-style payment plans
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.installment_purchases (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id    uuid NOT NULL REFERENCES public.households(id) ON DELETE CASCADE,
  merchant        text NOT NULL DEFAULT '',
  source          text NOT NULL DEFAULT '',         -- credit card / bank
  current_payment int NOT NULL DEFAULT 1,
  total_payments  int NOT NULL DEFAULT 1,
  monthly_amount  numeric(12,2) NOT NULL DEFAULT 0,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS installment_purchases_household_idx ON public.installment_purchases(household_id);

ALTER TABLE public.installment_purchases ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_rw_installment_purchases ON public.installment_purchases;
CREATE POLICY tenant_rw_installment_purchases ON public.installment_purchases
  FOR ALL
  USING (public.owns_household(household_id))
  WITH CHECK (public.owns_household(household_id));

DROP TRIGGER IF EXISTS tg_installment_purchases_touch ON public.installment_purchases;
CREATE TRIGGER tg_installment_purchases_touch
  BEFORE UPDATE ON public.installment_purchases
  FOR EACH ROW EXECUTE FUNCTION public.tg_touch_updated_at();

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. Update v_net_worth view to sum from new debt tables.
--    Net worth = assets - (mortgage balance + loan balance + installment cost)
--
--    Loan balance is approximated as `(total_payments - elapsed) * monthly`
--    in PG, matching the TS heuristic in `debt-store.ts:remainingBalance`.
--    `elapsed` = months between start_date and now (start_date is YYYY-MM text).
--    When start_date is empty, we count all payments as remaining.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE VIEW public.v_net_worth AS
SELECT
  h.id AS household_id,
  COALESCE((SELECT SUM(balance) FROM public.assets WHERE household_id = h.id), 0) AS total_assets,
  (
    COALESCE((SELECT SUM(remaining_balance) FROM public.mortgage_tracks mt
              JOIN public.mortgages m ON m.id = mt.mortgage_id
              WHERE m.household_id = h.id), 0)
    + COALESCE((
        SELECT SUM(
          GREATEST(
            0,
            (
              total_payments
              - CASE
                  WHEN start_date = '' OR start_date IS NULL THEN 0
                  ELSE GREATEST(0,
                    (EXTRACT(YEAR FROM CURRENT_DATE)::int - split_part(start_date,'-',1)::int) * 12
                    + (EXTRACT(MONTH FROM CURRENT_DATE)::int - split_part(start_date,'-',2)::int)
                  )
                END
            )
          ) * monthly_payment
        )
        FROM public.consumer_loans WHERE household_id = h.id
      ), 0)
    + COALESCE((
        SELECT SUM(GREATEST(0, total_payments - current_payment + 1) * monthly_amount)
        FROM public.installment_purchases WHERE household_id = h.id
      ), 0)
  ) AS total_liabilities,
  COALESCE((SELECT SUM(balance) FROM public.assets WHERE household_id = h.id), 0)
  - (
    COALESCE((SELECT SUM(remaining_balance) FROM public.mortgage_tracks mt
              JOIN public.mortgages m ON m.id = mt.mortgage_id
              WHERE m.household_id = h.id), 0)
    + COALESCE((
        SELECT SUM(
          GREATEST(
            0,
            (
              total_payments
              - CASE
                  WHEN start_date = '' OR start_date IS NULL THEN 0
                  ELSE GREATEST(0,
                    (EXTRACT(YEAR FROM CURRENT_DATE)::int - split_part(start_date,'-',1)::int) * 12
                    + (EXTRACT(MONTH FROM CURRENT_DATE)::int - split_part(start_date,'-',2)::int)
                  )
                END
            )
          ) * monthly_payment
        )
        FROM public.consumer_loans WHERE household_id = h.id
      ), 0)
    + COALESCE((
        SELECT SUM(GREATEST(0, total_payments - current_payment + 1) * monthly_amount)
        FROM public.installment_purchases WHERE household_id = h.id
      ), 0)
  ) AS net_worth
FROM public.households h;

COMMENT ON VIEW public.v_net_worth IS
  'Net worth per household. Liability total = mortgage tracks (remaining_balance) + remaining loan payments + remaining installment payments. Old `liabilities` table no longer contributes.';
