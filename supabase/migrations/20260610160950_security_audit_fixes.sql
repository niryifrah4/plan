-- ==========================================
-- Security Audit Fixes (2026-06-10)
-- ==========================================

-- 1. Revoke EXECUTE from public and anon on sensitive PII and management RPCs
-- These functions are SECURITY DEFINER and shouldn't be publicly accessible.
REVOKE EXECUTE ON FUNCTION public.get_pii_key() FROM public, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.encrypt_pii(text) FROM public, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.decrypt_pii(text) FROM public, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.close_month(uuid) FROM public, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.check_account_lockout(text) FROM public, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_auth_user() FROM public, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.tg_audit_row_change() FROM public, anon, authenticated;

-- 2. Revoke EXECUTE from anon for RLS Helper Functions
-- They must remain executable by authenticated users for RLS to work properly.
REVOKE EXECUTE ON FUNCTION public.is_advisor_of(uuid) FROM public, anon;
REVOKE EXECUTE ON FUNCTION public.is_client_of(uuid) FROM public, anon;
REVOKE EXECUTE ON FUNCTION public.owns_household(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.is_advisor_of(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_client_of(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.owns_household(uuid) TO authenticated;

-- 3. Update view to SECURITY INVOKER
ALTER VIEW public.v_merchant_category_rules SET (security_invoker = on);

-- 4. Harden function search_path
ALTER FUNCTION public.project_goal_fv(uuid) SET search_path = public, pg_catalog;
ALTER FUNCTION public.tg_touch_updated_at() SET search_path = public, pg_catalog;

-- 5. Fix PII encryption functions (remove insecure fallback, fix pgp_sym_encrypt schema)
create or replace function public.get_pii_key()
returns text
language plpgsql
security definer
set search_path = public, pg_catalog, vault
as $$
declare
  val text;
begin
  select decrypted_secret
    into val
    from vault.decrypted_secrets
   where name = 'pii_encryption_key'
   order by created_at desc
   limit 1;
  if val is null or val = '' then
    raise exception 'Missing pii_encryption_key in Vault. Encryption aborted for security reasons.';
  end if;
  return val;
end;
$$;

create or replace function public.encrypt_pii(plain text)
returns text
language plpgsql
security definer
set search_path = public, pg_catalog, extensions
as $$
begin
  if plain is null or plain = '' then return null; end if;
  return encode(
    extensions.pgp_sym_encrypt(plain, public.get_pii_key()),
    'base64'
  );
end;
$$;

create or replace function public.decrypt_pii(cipher text)
returns text
language plpgsql
security definer
set search_path = public, pg_catalog, extensions
as $$
begin
  if cipher is null or cipher = '' then return null; end if;
  return extensions.pgp_sym_decrypt(
    decode(cipher, 'base64'),
    public.get_pii_key()
  );
exception when others then
  return null;
end;
$$;
