-- Hardening: keep the canonical state-write RPC safe and explicitly scoped.
-- The function is SECURITY INVOKER, so RLS remains the authorization boundary.
CREATE OR REPLACE FUNCTION public.upsert_client_state(
  p_household uuid,
  p_key       text,
  p_value     jsonb,
  p_expected  bigint DEFAULT NULL
)
RETURNS TABLE(out_version bigint, out_value jsonb, out_conflict boolean)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_catalog
AS $$
DECLARE
  cur_version bigint;
  cur_value jsonb;
BEGIN
  IF p_household IS NULL OR p_key IS NULL OR length(btrim(p_key)) = 0 OR length(p_key) > 200 THEN
    RAISE EXCEPTION 'invalid_client_state_key';
  END IF;
  IF p_value IS NULL THEN
    p_value := '{}'::jsonb;
  END IF;

  SELECT version, state_value INTO cur_version, cur_value
  FROM public.client_state
  WHERE household_id = p_household AND state_key = p_key
  FOR UPDATE;

  IF NOT FOUND THEN
    INSERT INTO public.client_state (household_id, state_key, state_value, version)
    VALUES (p_household, p_key, p_value, 1);
    RETURN QUERY SELECT 1::bigint, p_value, false;
    RETURN;
  END IF;

  IF p_expected IS NOT NULL AND cur_version <> p_expected THEN
    RETURN QUERY SELECT cur_version, cur_value, true;
    RETURN;
  END IF;

  UPDATE public.client_state
  SET state_value = p_value, version = cur_version + 1
  WHERE household_id = p_household AND state_key = p_key;
  RETURN QUERY SELECT cur_version + 1, p_value, false;
END;
$$;

REVOKE ALL ON FUNCTION public.upsert_client_state(uuid, text, jsonb, bigint) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.upsert_client_state(uuid, text, jsonb, bigint) TO authenticated;
