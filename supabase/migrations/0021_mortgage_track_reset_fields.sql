-- =============================================================================
-- 0019 — Mortgage track: variable-rate reset metadata
-- =============================================================================
-- Phase 7 of the debt-page work (2026-05-22). Variable-rate tracks (משתנה,
-- ל"מ, משק"ל) re-price against a reference rate every X years. The new
-- columns let the diagnostics engine raise a "reset window approaching"
-- alert 90 days before the next reset.
--
-- Both columns are nullable — fixed-rate tracks have no reset.
-- =============================================================================

ALTER TABLE public.mortgage_tracks
  ADD COLUMN IF NOT EXISTS next_reset_date    text,    -- YYYY-MM format, nullable
  ADD COLUMN IF NOT EXISTS reset_period_years int;     -- e.g. 5 for "משתנה כל 5", nullable

COMMENT ON COLUMN public.mortgage_tracks.next_reset_date IS
  'YYYY-MM. Date the bank re-prices a variable-rate track against its reference. NULL for fixed-rate tracks.';
COMMENT ON COLUMN public.mortgage_tracks.reset_period_years IS
  'Reset cadence in years (5 = משתנה כל 5). Metadata only — diagnostics rely on next_reset_date directly.';
