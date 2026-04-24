-- =============================================================================
-- Verdant Ledger · 0006 — Client auth, Pension products (Surance/Masleka-ready),
--                          Risk management, Properties, Sync logs
-- =============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. CLIENTS — end-users who can sign up and view their own household
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.clients (
  id              uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  household_id    uuid NOT NULL REFERENCES public.households(id) ON DELETE CASCADE,
  full_name       text NOT NULL,
  email           text NOT NULL UNIQUE,
  phone           text,
  id_number       text,          -- תעודת זהות (needed for Surance/Masleka POA)
  created_at      timestamptz NOT NULL DEFAULT now(),
  last_login      timestamptz
);
CREATE INDEX IF NOT EXISTS clients_household_idx ON public.clients(household_id);

ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;

-- Client sees own record
CREATE POLICY "client_self_rw" ON public.clients
  FOR ALL USING (id = auth.uid());

-- Advisor sees clients of their households
CREATE POLICY "advisor_sees_clients" ON public.clients
  FOR ALL USING (public.owns_household(household_id));

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Update owns_household() to support BOTH advisor and client access
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.owns_household(hh_id uuid)
RETURNS boolean LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT EXISTS (
    -- Advisor path
    SELECT 1 FROM public.households h
    WHERE h.id = hh_id AND h.advisor_id = auth.uid()
  ) OR EXISTS (
    -- Client path
    SELECT 1 FROM public.clients c
    WHERE c.household_id = hh_id AND c.id = auth.uid()
  )
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. PENSION PRODUCTS — matches Surance/Masleka clearing house data model
--    This replaces/extends masleka_entries for live API sync
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TYPE pension_product_type AS ENUM (
  'pension_new',        -- קרן פנסיה חדשה (DC)
  'pension_old',        -- קרן פנסיה ותיקה (סגורה)
  'bituach_managers',   -- ביטוח מנהלים
  'gemel',              -- קופת גמל
  'gemel_invest',       -- גמל להשקעה
  'gemel_190',          -- קופת גמל תיקון 190
  'hishtalmut',         -- קרן השתלמות
  'kranot_pensia'       -- קרנות פנסיה אחרות
);

CREATE TYPE pension_product_status AS ENUM (
  'active',       -- פעיל — הפקדות שוטפות
  'frozen',       -- מוקפא — אין הפקדות, יש צבירה
  'paid_up',      -- מסולק — פוליסה ששולמה
  'payout',       -- בתשלום קצבה
  'closed'        -- סגור
);

CREATE TYPE sync_source AS ENUM (
  'manual',           -- הוזן ידנית
  'document',         -- פורסר ממסמך PDF/Excel
  'clearing_house',   -- מסלקה פנסיונית (API)
  'surance'           -- שורנס (API)
);

CREATE TABLE IF NOT EXISTS public.pension_products (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id          uuid NOT NULL REFERENCES public.households(id) ON DELETE CASCADE,
  member_name           text,                          -- שם המבוטח (ראשי / בן זוג)

  -- ─── Product identification ───
  product_type          pension_product_type NOT NULL,
  company               text NOT NULL,                 -- מנורה, הראל, מיטב, מגדל...
  policy_number         text,                          -- מספר פוליסה / חשבון
  status                pension_product_status NOT NULL DEFAULT 'active',

  -- ─── Balances ───
  accumulated_balance   numeric(14,2) NOT NULL DEFAULT 0,  -- יתרה צבורה ₪
  employer_contribution numeric(12,2) DEFAULT 0,           -- הפקדת מעסיק חודשית
  employee_contribution numeric(12,2) DEFAULT 0,           -- הפקדת עובד חודשית
  severance_contribution numeric(12,2) DEFAULT 0,          -- הפרשת פיצויים חודשית
  total_monthly_deposit numeric(12,2) GENERATED ALWAYS AS (
    COALESCE(employer_contribution, 0) +
    COALESCE(employee_contribution, 0) +
    COALESCE(severance_contribution, 0)
  ) STORED,

  -- ─── Investment ───
  investment_track      text,                          -- מסלול השקעה (מניות/אגח/כללי/הלכה)
  annual_return_pct     numeric(6,3),                  -- תשואה שנתית %
  ytd_return_pct        numeric(6,3),                  -- תשואה מתחילת השנה %

  -- ─── Fees ───
  mgmt_fee_deposits_pct numeric(5,3),                  -- דמי ניהול מהפקדות %
  mgmt_fee_accumulated_pct numeric(5,3),               -- דמי ניהול מצבירה %

  -- ─── Insurance (embedded in pension) ───
  death_coverage_amount numeric(14,2),                 -- כיסוי מוות ₪
  disability_coverage_pct numeric(5,2),                -- כיסוי אובדן כושר % מהשכר
  disability_type       text,                          -- עיסוקי / רגיל

  -- ─── Dates ───
  start_date            date,                          -- תאריך פתיחה
  as_of_date            date,                          -- נכון לתאריך
  retirement_date       date,                          -- תאריך פרישה צפוי

  -- ─── Surance / Clearing house ───
  surance_product_id    text,                          -- ID מקורי בשורנס
  surance_raw_json      jsonb,                         -- JSON מלא מ-API שורנס

  -- ─── Sync metadata ───
  source                sync_source NOT NULL DEFAULT 'manual',
  last_synced_at        timestamptz,

  -- ─── Standard ───
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS pension_products_household_idx ON public.pension_products(household_id);
CREATE INDEX IF NOT EXISTS pension_products_type_idx ON public.pension_products(household_id, product_type);
CREATE INDEX IF NOT EXISTS pension_products_company_idx ON public.pension_products(company);

CREATE TRIGGER tg_pension_products_touch
  BEFORE UPDATE ON public.pension_products
  FOR EACH ROW EXECUTE FUNCTION tg_touch_updated_at();

-- RLS
ALTER TABLE public.pension_products ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_rw_pension_products ON public.pension_products
  FOR ALL USING (public.owns_household(household_id)) WITH CHECK (public.owns_household(household_id));

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. PENSION COVERAGES — insurance coverages tied to pension products
--    Auto-populates risk management page
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TYPE coverage_kind AS ENUM (
  'death',              -- ביטוח חיים / שאירים
  'disability',         -- אובדן כושר עבודה
  'nursing',            -- סיעוד
  'critical_illness',   -- מחלות קשות
  'accident',           -- תאונות אישיות
  'health',             -- בריאות
  'other'
);

CREATE TABLE IF NOT EXISTS public.pension_coverages (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pension_product_id uuid NOT NULL REFERENCES public.pension_products(id) ON DELETE CASCADE,
  household_id      uuid NOT NULL REFERENCES public.households(id) ON DELETE CASCADE,
  coverage_kind     coverage_kind NOT NULL,
  coverage_amount   numeric(14,2),           -- סכום כיסוי ₪
  monthly_cost      numeric(10,2),           -- עלות חודשית ₪
  is_active         boolean NOT NULL DEFAULT true,
  description       text,
  created_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS pension_coverages_product_idx ON public.pension_coverages(pension_product_id);
CREATE INDEX IF NOT EXISTS pension_coverages_household_idx ON public.pension_coverages(household_id);

ALTER TABLE public.pension_coverages ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_rw_pension_coverages ON public.pension_coverages
  FOR ALL USING (public.owns_household(household_id)) WITH CHECK (public.owns_household(household_id));

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. RISK ITEMS — checklist for risk management page
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TYPE risk_coverage_status AS ENUM ('covered', 'partial', 'missing', 'not_relevant');

CREATE TABLE IF NOT EXISTS public.risk_items (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id      uuid NOT NULL REFERENCES public.households(id) ON DELETE CASCADE,
  category          text NOT NULL,                     -- death, disability, nursing, health, critical, property
  label             text NOT NULL,
  description       text,
  status            risk_coverage_status NOT NULL DEFAULT 'missing',
  coverage_amount   numeric(14,2),
  monthly_cost      numeric(10,2),
  provider          text,
  policy_number     text,
  expiry_date       date,
  notes             text,
  sort_order        int NOT NULL DEFAULT 0,

  -- Link to auto-detected coverage (from pension_coverages)
  linked_coverage_id uuid REFERENCES public.pension_coverages(id) ON DELETE SET NULL,
  auto_detected     boolean NOT NULL DEFAULT false,

  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS risk_items_household_idx ON public.risk_items(household_id);

CREATE TRIGGER tg_risk_items_touch
  BEFORE UPDATE ON public.risk_items
  FOR EACH ROW EXECUTE FUNCTION tg_touch_updated_at();

ALTER TABLE public.risk_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_rw_risk_items ON public.risk_items
  FOR ALL USING (public.owns_household(household_id)) WITH CHECK (public.owns_household(household_id));

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. PROPERTIES — real estate portfolio
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TYPE property_purpose AS ENUM ('residential', 'investment', 'commercial', 'mixed');

CREATE TABLE IF NOT EXISTS public.properties (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id      uuid NOT NULL REFERENCES public.households(id) ON DELETE CASCADE,
  address           text NOT NULL,
  city              text,
  purpose           property_purpose NOT NULL DEFAULT 'residential',
  purchase_price    numeric(14,2),
  purchase_date     date,
  current_value     numeric(14,2) NOT NULL DEFAULT 0,
  monthly_rent      numeric(12,2) DEFAULT 0,
  monthly_expenses  numeric(12,2) DEFAULT 0,       -- ועד בית, ארנונה, ביטוח, תחזוקה
  mortgage_balance  numeric(14,2) DEFAULT 0,
  mortgage_payment  numeric(12,2) DEFAULT 0,
  mortgage_rate_pct numeric(5,3),
  mortgage_end_date date,
  appreciation_pct  numeric(5,2) DEFAULT 3.0,      -- הנחת עליית ערך שנתית
  notes             text,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS properties_household_idx ON public.properties(household_id);

CREATE TRIGGER tg_properties_touch
  BEFORE UPDATE ON public.properties
  FOR EACH ROW EXECUTE FUNCTION tg_touch_updated_at();

ALTER TABLE public.properties ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_rw_properties ON public.properties
  FOR ALL USING (public.owns_household(household_id)) WITH CHECK (public.owns_household(household_id));

-- ─────────────────────────────────────────────────────────────────────────────
-- 7. DOCUMENTS — uploaded files (bank statements, pension reports, etc.)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TYPE doc_type AS ENUM (
  'bank_statement',       -- דף חשבון בנק
  'pension_report',       -- דוח פנסיה
  'broker_report',        -- דוח ברוקר
  'insurance_policy',     -- פוליסת ביטוח
  'mortgage_schedule',    -- לוח סילוקין
  'tax_report',           -- דוח מס
  'poa_signed',           -- ייפוי כח חתום
  'other'
);

CREATE TABLE IF NOT EXISTS public.documents (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id    uuid NOT NULL REFERENCES public.households(id) ON DELETE CASCADE,
  doc_type        doc_type NOT NULL DEFAULT 'other',
  file_name       text NOT NULL,
  storage_path    text,                        -- Supabase Storage bucket path
  file_size_kb    integer,
  mime_type       text,
  uploaded_by     uuid REFERENCES auth.users(id),  -- could be client or advisor
  parsed          boolean NOT NULL DEFAULT false,
  parsed_at       timestamptz,
  parse_result    jsonb,                       -- structured data extracted
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS documents_household_idx ON public.documents(household_id);

ALTER TABLE public.documents ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_rw_documents ON public.documents
  FOR ALL USING (public.owns_household(household_id)) WITH CHECK (public.owns_household(household_id));

-- ─────────────────────────────────────────────────────────────────────────────
-- 8. SYNC LOGS — tracking all data synchronizations
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TYPE sync_status AS ENUM ('started', 'success', 'partial', 'failed');

CREATE TABLE IF NOT EXISTS public.sync_logs (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id    uuid NOT NULL REFERENCES public.households(id) ON DELETE CASCADE,
  source          sync_source NOT NULL,
  status          sync_status NOT NULL DEFAULT 'started',
  products_found  int DEFAULT 0,
  products_updated int DEFAULT 0,
  error_message   text,
  raw_response    jsonb,
  started_at      timestamptz NOT NULL DEFAULT now(),
  completed_at    timestamptz
);

CREATE INDEX IF NOT EXISTS sync_logs_household_idx ON public.sync_logs(household_id, started_at DESC);

ALTER TABLE public.sync_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_rw_sync_logs ON public.sync_logs
  FOR ALL USING (public.owns_household(household_id));

-- ─────────────────────────────────────────────────────────────────────────────
-- 9. VIEWS — aggregated pension data for dashboard
-- ─────────────────────────────────────────────────────────────────────────────

-- Total pension balances by type
CREATE OR REPLACE VIEW public.v_pension_summary AS
SELECT
  pp.household_id,
  pp.product_type,
  pp.company,
  pp.status,
  COUNT(*)                               AS product_count,
  SUM(pp.accumulated_balance)            AS total_balance,
  SUM(pp.total_monthly_deposit)          AS total_monthly_deposit,
  AVG(pp.mgmt_fee_accumulated_pct)       AS avg_mgmt_fee_pct,
  MAX(pp.last_synced_at)                 AS last_synced
FROM public.pension_products pp
WHERE pp.status IN ('active', 'frozen')
GROUP BY pp.household_id, pp.product_type, pp.company, pp.status;

-- Risk coverage summary per household
CREATE OR REPLACE VIEW public.v_risk_summary AS
SELECT
  ri.household_id,
  ri.category,
  COUNT(*) FILTER (WHERE ri.status = 'covered')      AS covered_count,
  COUNT(*) FILTER (WHERE ri.status = 'partial')       AS partial_count,
  COUNT(*) FILTER (WHERE ri.status = 'missing')       AS missing_count,
  COUNT(*) FILTER (WHERE ri.status = 'not_relevant')  AS not_relevant_count,
  SUM(COALESCE(ri.monthly_cost, 0))                   AS total_monthly_cost
FROM public.risk_items ri
GROUP BY ri.household_id, ri.category;

-- Full net worth with pension + properties
CREATE OR REPLACE VIEW public.v_full_net_worth AS
SELECT
  h.id AS household_id,
  COALESCE((SELECT SUM(balance) FROM public.assets WHERE household_id = h.id), 0) AS liquid_assets,
  COALESCE((SELECT SUM(accumulated_balance) FROM public.pension_products WHERE household_id = h.id AND status IN ('active','frozen')), 0) AS pension_total,
  COALESCE((SELECT SUM(market_value_ils) FROM public.v_securities_valued WHERE household_id = h.id), 0) AS securities_total,
  COALESCE((SELECT SUM(current_value) FROM public.properties WHERE household_id = h.id), 0) AS property_total,
  COALESCE((SELECT SUM(balance) FROM public.liabilities WHERE household_id = h.id), 0) AS liabilities_total,
  COALESCE((SELECT SUM(mortgage_balance) FROM public.properties WHERE household_id = h.id), 0) AS mortgage_total
FROM public.households h;
