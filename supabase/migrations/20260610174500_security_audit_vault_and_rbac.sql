-- ==========================================
-- Security Audit Fixes v2 (2026-06-10)
-- Vault-backed PII key + corrected helper grants
-- ==========================================

-- 1. Revoke EXECUTE from public and anon/authenticated on sensitive PII and management RPCs
REVOKE EXECUTE ON FUNCTION public.get_pii_key() FROM public, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.encrypt_pii(text) FROM public, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.decrypt_pii(text) FROM public, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.close_month(uuid) FROM public, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.check_account_lockout(text) FROM public, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_auth_user() FROM public, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.tg_audit_row_change() FROM public, anon, authenticated;

-- 2. Helper functions must remain available to authenticated users for RLS policies.
REVOKE EXECUTE ON FUNCTION public.is_advisor_of(uuid) FROM public, anon;
REVOKE EXECUTE ON FUNCTION public.is_client_of(uuid) FROM public, anon;
REVOKE EXECUTE ON FUNCTION public.owns_household(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.is_advisor_of(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_client_of(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.owns_household(uuid) TO authenticated;

-- 3. Update merchant-category view to respect the caller's RLS
ALTER VIEW public.v_merchant_category_rules SET (security_invoker = on);

-- 4. Harden function search_path
ALTER FUNCTION public.project_goal_fv(uuid) SET search_path = public, pg_catalog;
ALTER FUNCTION public.tg_touch_updated_at() SET search_path = public, pg_catalog;

-- 5. Vault-backed PII key, no insecure fallback
CREATE OR REPLACE FUNCTION public.get_pii_key()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog, vault
AS $$
DECLARE
  val text;
BEGIN
  SELECT decrypted_secret
    INTO val
    FROM vault.decrypted_secrets
   WHERE name = 'pii_encryption_key'
   ORDER BY created_at DESC
   LIMIT 1;

  IF val IS NULL OR val = '' THEN
    RAISE EXCEPTION 'Missing pii_encryption_key in Vault. Encryption aborted for security reasons.';
  END IF;

  RETURN val;
END;
$$;

CREATE OR REPLACE FUNCTION public.encrypt_pii(plain text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog, extensions
AS $$
BEGIN
  IF plain IS NULL OR plain = '' THEN
    RETURN NULL;
  END IF;

  RETURN encode(
    extensions.pgp_sym_encrypt(plain, public.get_pii_key()),
    'base64'
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.decrypt_pii(cipher text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog, extensions
AS $$
BEGIN
  IF cipher IS NULL OR cipher = '' THEN
    RETURN NULL;
  END IF;

  RETURN extensions.pgp_sym_decrypt(
    decode(cipher, 'base64'),
    public.get_pii_key()
  );
EXCEPTION WHEN OTHERS THEN
  RETURN NULL;
END;
$$;
