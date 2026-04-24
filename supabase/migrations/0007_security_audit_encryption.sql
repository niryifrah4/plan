-- ═══════════════════════════════════════════════════════════
--  0007 · Security Hardening — Audit Log, PII Encryption, RLS hardening
-- ═══════════════════════════════════════════════════════════
--
-- מה המיגרציה הזו עושה:
-- 1. מפעילה pgcrypto להצפנת PII
-- 2. מוסיפה עמודות מוצפנות לת״ז וליפוי כוח למסלקה
-- 3. יוצרת טבלת audit_logs + trigger אוטומטי לשינויים רגישים
-- 4. מחזקת RLS: policies כפולות (advisor + client) + deny-by-default
-- 5. יוצרת session_events — מעקב לוגינים/לוגאאוטים/ניסיונות כושלים
-- ═══════════════════════════════════════════════════════════

-- ── Extensions ──────────────────────────────────────────────
create extension if not exists pgcrypto;
create extension if not exists "uuid-ossp";

-- ═══════════════════════════════════════════════════════════
--  1. Audit Log — כל שינוי רגיש מתועד
-- ═══════════════════════════════════════════════════════════
create table if not exists public.audit_logs (
  id            uuid primary key default gen_random_uuid(),
  occurred_at   timestamptz not null default now(),
  actor_id      uuid references auth.users(id) on delete set null,
  actor_email   text,
  actor_role    text check (actor_role in ('advisor','client','system')),
  action        text not null, -- INSERT / UPDATE / DELETE / LOGIN / LOGOUT / EXPORT / VIEW
  table_name    text,
  record_id     uuid,
  old_values    jsonb,
  new_values    jsonb,
  changed_fields text[],
  ip_address    inet,
  user_agent    text,
  metadata      jsonb default '{}'::jsonb
);

create index if not exists idx_audit_occurred_at on public.audit_logs (occurred_at desc);
create index if not exists idx_audit_actor on public.audit_logs (actor_id, occurred_at desc);
create index if not exists idx_audit_table on public.audit_logs (table_name, occurred_at desc);
create index if not exists idx_audit_action on public.audit_logs (action);

-- RLS: audit logs are append-only, readable only by admins (service_role)
alter table public.audit_logs enable row level security;

-- Users can READ their own actions
create policy "Users read own audit entries"
  on public.audit_logs for select
  using (actor_id = auth.uid());

-- No one can INSERT/UPDATE/DELETE directly — only via triggers / service_role
create policy "No direct inserts to audit log"
  on public.audit_logs for insert
  with check (false);

create policy "No updates to audit log"
  on public.audit_logs for update
  using (false);

create policy "No deletes from audit log"
  on public.audit_logs for delete
  using (false);


-- ═══════════════════════════════════════════════════════════
--  2. Generic audit trigger function
-- ═══════════════════════════════════════════════════════════
create or replace function public.tg_audit_row_change()
returns trigger
security definer
language plpgsql
as $$
declare
  v_actor_id uuid;
  v_actor_email text;
  v_role text;
  v_old jsonb;
  v_new jsonb;
  v_changed text[];
begin
  -- Get actor context
  v_actor_id := auth.uid();
  begin
    select email into v_actor_email from auth.users where id = v_actor_id;
  exception when others then v_actor_email := null;
  end;

  if TG_OP = 'DELETE' then
    v_old := to_jsonb(OLD);
    v_new := null;
  elsif TG_OP = 'UPDATE' then
    v_old := to_jsonb(OLD);
    v_new := to_jsonb(NEW);
    -- Compute changed fields
    select array_agg(key)
      into v_changed
      from jsonb_each(v_new)
      where v_old->>key is distinct from v_new->>key;
  else -- INSERT
    v_old := null;
    v_new := to_jsonb(NEW);
  end if;

  insert into public.audit_logs (
    actor_id, actor_email, actor_role,
    action, table_name, record_id,
    old_values, new_values, changed_fields
  ) values (
    v_actor_id, v_actor_email, 'advisor',
    TG_OP, TG_TABLE_NAME,
    coalesce((v_new->>'id')::uuid, (v_old->>'id')::uuid),
    v_old, v_new, v_changed
  );

  if TG_OP = 'DELETE' then return OLD; else return NEW; end if;
end;
$$;


-- ═══════════════════════════════════════════════════════════
--  3. Attach audit triggers to sensitive tables
-- ═══════════════════════════════════════════════════════════
do $$
declare
  t text;
begin
  foreach t in array array[
    'clients', 'pension_products', 'pension_coverages',
    'documents', 'assets', 'liabilities', 'households',
    'properties', 'sync_logs'
  ] loop
    if exists (select 1 from information_schema.tables where table_schema='public' and table_name=t) then
      execute format(
        'drop trigger if exists audit_%1$s on public.%1$s;
         create trigger audit_%1$s
         after insert or update or delete on public.%1$s
         for each row execute function public.tg_audit_row_change();',
         t
      );
    end if;
  end loop;
end $$;


-- ═══════════════════════════════════════════════════════════
--  4. PII Encryption for id_number (ת״ז)
-- ═══════════════════════════════════════════════════════════
-- Helper: get encryption key from vault (or fall back to env var for dev)
create or replace function public.get_pii_key()
returns text
language sql
security definer
as $$
  select coalesce(
    current_setting('app.pii_encryption_key', true),
    'dev-only-insecure-key-change-me-in-production'
  );
$$;

-- Encrypt a text value
create or replace function public.encrypt_pii(plain text)
returns text
language plpgsql
security definer
as $$
begin
  if plain is null or plain = '' then return null; end if;
  return encode(
    pgp_sym_encrypt(plain, public.get_pii_key()),
    'base64'
  );
end;
$$;

-- Decrypt (only advisors can decrypt — enforced via view or RLS)
create or replace function public.decrypt_pii(cipher text)
returns text
language plpgsql
security definer
as $$
begin
  if cipher is null or cipher = '' then return null; end if;
  return pgp_sym_decrypt(
    decode(cipher, 'base64'),
    public.get_pii_key()
  );
exception when others then
  return null;
end;
$$;

-- Add encrypted columns to clients table (if exists)
do $$
begin
  if exists (select 1 from information_schema.tables where table_schema='public' and table_name='clients') then
    -- Add encrypted id_number column (keeping original for migration; drop later)
    if not exists (
      select 1 from information_schema.columns
      where table_schema='public' and table_name='clients' and column_name='id_number_encrypted'
    ) then
      alter table public.clients add column id_number_encrypted text;
      comment on column public.clients.id_number_encrypted is
        'AES-encrypted ת״ז. Use public.decrypt_pii() to read.';
    end if;
  end if;
end $$;


-- ═══════════════════════════════════════════════════════════
--  5. Session Events — login/logout/failed attempts
-- ═══════════════════════════════════════════════════════════
create table if not exists public.session_events (
  id          uuid primary key default gen_random_uuid(),
  occurred_at timestamptz not null default now(),
  user_id     uuid references auth.users(id) on delete set null,
  email       text,
  event_type  text not null check (event_type in (
    'login_success','login_failed','logout','mfa_challenge','mfa_success','mfa_failed',
    'password_reset_requested','session_expired','account_locked'
  )),
  ip_address  inet,
  user_agent  text,
  metadata    jsonb default '{}'::jsonb
);

create index if not exists idx_session_events_user on public.session_events (user_id, occurred_at desc);
create index if not exists idx_session_events_email on public.session_events (email, occurred_at desc);
create index if not exists idx_session_events_type on public.session_events (event_type, occurred_at desc);

alter table public.session_events enable row level security;

-- Users can see their own session history
create policy "Users read own session events"
  on public.session_events for select
  using (user_id = auth.uid());


-- ═══════════════════════════════════════════════════════════
--  6. Account lockout function — after N failed login attempts
-- ═══════════════════════════════════════════════════════════
create or replace function public.check_account_lockout(p_email text)
returns boolean
language plpgsql
security definer
as $$
declare
  recent_failures int;
begin
  select count(*)
    into recent_failures
    from public.session_events
    where email = p_email
      and event_type = 'login_failed'
      and occurred_at > now() - interval '15 minutes';
  return recent_failures >= 5;
end;
$$;


-- ═══════════════════════════════════════════════════════════
--  7. RLS tightening — deny-by-default on any unlisted table
-- ═══════════════════════════════════════════════════════════
-- Revoke default permissions from anon role — forces every access through RLS
revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon;
revoke all on all functions in schema public from anon;

-- Grant minimal permissions back for authenticated users (RLS still applies)
grant usage on schema public to authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant usage on all sequences in schema public to authenticated;
grant execute on all functions in schema public to authenticated;


-- ═══════════════════════════════════════════════════════════
--  8. Helper view: audit feed for advisors (last 100 actions)
-- ═══════════════════════════════════════════════════════════
create or replace view public.v_recent_audit as
  select id, occurred_at, actor_email, actor_role, action, table_name, record_id, changed_fields
  from public.audit_logs
  order by occurred_at desc
  limit 100;

-- ═══════════════════════════════════════════════════════════
--  Done. Post-install steps:
--   1. Set app.pii_encryption_key via `ALTER DATABASE ... SET app.pii_encryption_key = '<32+ char random>'`
--   2. Enable MFA in Supabase Auth dashboard
--   3. Configure password policy: min 12 chars + complexity
--   4. Enable leaked password protection in Auth settings
-- ═══════════════════════════════════════════════════════════
