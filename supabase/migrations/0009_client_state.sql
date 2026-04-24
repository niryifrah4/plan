-- =============================================================================
-- 0009 — Client State: generic JSON blob store per household
-- =============================================================================
-- Acts as "remote localStorage" for any store whose shape doesn't map cleanly
-- to a typed table yet (debt, budget, realestate detail, scenarios, etc).
-- Each row is one key (e.g. "debt_data") with full JSON payload.
-- Enables fast sync without premature schema modeling.

CREATE TABLE IF NOT EXISTS public.client_state (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id    uuid NOT NULL REFERENCES public.households(id) ON DELETE CASCADE,
  state_key       text NOT NULL,
  state_value     jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (household_id, state_key)
);

CREATE INDEX IF NOT EXISTS client_state_household_idx ON public.client_state(household_id);

ALTER TABLE public.client_state ENABLE ROW LEVEL SECURITY;

-- Advisor can CRUD their households' state
CREATE POLICY "advisor_owns_state" ON public.client_state
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.households h
      WHERE h.id = client_state.household_id
        AND h.advisor_id = auth.uid()
    )
  );

-- Auto-touch updated_at
CREATE OR REPLACE FUNCTION public.tg_client_state_touch()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tg_client_state_touch ON public.client_state;
CREATE TRIGGER tg_client_state_touch
  BEFORE UPDATE ON public.client_state
  FOR EACH ROW EXECUTE FUNCTION public.tg_client_state_touch();
