-- =============================================================================
-- subscription_overrides — "apply to past transactions too?" flag
-- =============================================================================
-- When a client marks a merchant as a subscription, the confirm dialog asks
-- whether the decision should also cover historical transactions. When false,
-- the decision only applies from the decision date forward; classification of
-- transactions dated before `decided_at` falls back to the auto-detection.
-- =============================================================================

alter table public.subscription_overrides
  add column if not exists applies_to_past boolean not null default true;
