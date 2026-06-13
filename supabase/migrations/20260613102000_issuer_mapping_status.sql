-- =============================================================================
-- Issuer mapping status — shared parser verification state
-- Tracks manual verification notes per bank / credit-card issuer.
-- =============================================================================

create table public.issuer_mapping_status (
  issuer_id  text primary key,
  verified   boolean not null default false,
  notes      text,
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);

alter table public.issuer_mapping_status enable row level security;

create policy "issuer_mapping_status_select_auth" on public.issuer_mapping_status
  for select using (auth.uid() is not null);

create policy "issuer_mapping_status_insert_auth" on public.issuer_mapping_status
  for insert with check (auth.uid() = updated_by);

create policy "issuer_mapping_status_update_auth" on public.issuer_mapping_status
  for update using (auth.uid() is not null)
  with check (auth.uid() = updated_by);
