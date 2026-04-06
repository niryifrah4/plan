-- =============================================================================
-- Verdant Ledger · 0004 — Securities, Crypto, RSU/Options + Masleka ingestion
-- =============================================================================

-- ---------- Securities / Crypto / RSU / Options -----------------------------
CREATE TYPE security_kind AS ENUM ('stock','etf','crypto','rsu','option','bond','fund');
CREATE TYPE currency_code AS ENUM ('ILS','USD','EUR','GBP');

CREATE TABLE IF NOT EXISTS securities (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id    uuid NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  asset_id        uuid REFERENCES assets(id) ON DELETE SET NULL,
  kind            security_kind NOT NULL,
  symbol          text NOT NULL,
  broker          text,
  quantity        numeric(18,6) NOT NULL DEFAULT 0,
  avg_cost        numeric(18,4) NOT NULL DEFAULT 0,   -- per-unit cost
  current_price   numeric(18,4) NOT NULL DEFAULT 0,
  currency        currency_code NOT NULL DEFAULT 'ILS',
  fx_rate_to_ils  numeric(10,4) NOT NULL DEFAULT 1,   -- snapshot FX
  vest_date       date,                                -- RSU/option only
  strike_price    numeric(18,4),                       -- options only
  notes           text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS securities_household_idx ON securities(household_id);
CREATE INDEX IF NOT EXISTS securities_kind_idx ON securities(household_id, kind);

-- Touch trigger
CREATE TRIGGER tg_securities_touch
  BEFORE UPDATE ON securities
  FOR EACH ROW EXECUTE FUNCTION tg_touch_updated_at();

-- View: per-security valuation in ILS (for tax simulator + wealth page)
CREATE OR REPLACE VIEW v_securities_valued AS
SELECT
  s.id,
  s.household_id,
  s.kind,
  s.symbol,
  s.broker,
  s.currency,
  s.quantity,
  s.avg_cost,
  s.current_price,
  s.fx_rate_to_ils,
  (s.quantity * s.avg_cost)      AS cost_basis_local,
  (s.quantity * s.current_price) AS market_value_local,
  (s.quantity * s.avg_cost * s.fx_rate_to_ils)      AS cost_basis_ils,
  (s.quantity * s.current_price * s.fx_rate_to_ils) AS market_value_ils,
  (s.quantity * (s.current_price - s.avg_cost) * s.fx_rate_to_ils) AS unrealized_pnl_ils,
  CASE WHEN s.avg_cost > 0
    THEN (s.current_price - s.avg_cost) / s.avg_cost * 100
    ELSE 0 END AS unrealized_pnl_pct,
  s.vest_date,
  s.strike_price
FROM securities s;

-- ---------- Masleka (pension clearinghouse) XML ingestion -------------------
CREATE TYPE masleka_status AS ENUM ('uploaded','parsing','parsed','mapped','failed');

CREATE TABLE IF NOT EXISTS masleka_files (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id   uuid NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  file_name      text NOT NULL,
  storage_path   text,                   -- Supabase Storage reference
  file_size_kb   integer,
  status         masleka_status NOT NULL DEFAULT 'uploaded',
  uploaded_by    uuid REFERENCES advisors(id),
  uploaded_at    timestamptz NOT NULL DEFAULT now(),
  parsed_at      timestamptz,
  error_msg      text
);
CREATE INDEX IF NOT EXISTS masleka_files_household_idx ON masleka_files(household_id, uploaded_at DESC);

CREATE TABLE IF NOT EXISTS masleka_entries (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  file_id            uuid NOT NULL REFERENCES masleka_files(id) ON DELETE CASCADE,
  household_id       uuid NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  asset_id           uuid REFERENCES assets(id) ON DELETE SET NULL,
  product_type       text,              -- e.g. 'קרן פנסיה','גמל','השתלמות'
  company            text,              -- 'מנורה','מגדל','כלל'...
  policy_number      text,
  balance            numeric(14,2) NOT NULL DEFAULT 0,
  monthly_deposit    numeric(12,2) DEFAULT 0,
  management_fee_pct numeric(5,3),
  deposit_fee_pct    numeric(5,3),
  investment_track   text,
  as_of_date         date,
  created_at         timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS masleka_entries_file_idx ON masleka_entries(file_id);
CREATE INDEX IF NOT EXISTS masleka_entries_household_idx ON masleka_entries(household_id);

-- ---------- Extend scenario kinds (miluim, alternatives) --------------------
-- scenarios.kind is text — no constraint change needed, just document allowed values:
--   'realestate' | 'compound' | 'mortgage' | 'consolidation' | 'miluim' | 'alternatives' | 'tax'

-- ---------- RLS ---------------------------------------------------------------
ALTER TABLE securities       ENABLE ROW LEVEL SECURITY;
ALTER TABLE masleka_files    ENABLE ROW LEVEL SECURITY;
ALTER TABLE masleka_entries  ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_rw_securities ON securities
  FOR ALL USING (owns_household(household_id)) WITH CHECK (owns_household(household_id));
CREATE POLICY tenant_rw_masleka_files ON masleka_files
  FOR ALL USING (owns_household(household_id)) WITH CHECK (owns_household(household_id));
CREATE POLICY tenant_rw_masleka_entries ON masleka_entries
  FOR ALL USING (owns_household(household_id)) WITH CHECK (owns_household(household_id));
