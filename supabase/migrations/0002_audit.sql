create table public.audit_log (
  id bigserial primary key,
  tenant_id uuid not null,
  user_id uuid,
  action text not null,
  entity_type text not null,
  entity_id uuid,
  before_json jsonb,
  after_json jsonb,
  created_at timestamptz not null default now()
);

-- NOTE: redefined in 0004_contracts.sql (search_path hardened to ''); that later definition is
-- canonical. Kept here unchanged so migration history / diffs stay accurate to what each
-- migration actually applied at the time.
create or replace function public.fn_audit() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.audit_log(tenant_id, user_id, action, entity_type, entity_id, before_json, after_json)
  values (
    coalesce(new.tenant_id, old.tenant_id),
    auth.uid(),
    lower(tg_op),
    tg_table_name,
    coalesce(new.id, old.id),
    case when tg_op in ('UPDATE','DELETE') then to_jsonb(old) end,
    case when tg_op in ('INSERT','UPDATE') then to_jsonb(new) end
  );
  return coalesce(new, old);
end $$;

alter table public.audit_log enable row level security;
create policy audit_read on public.audit_log for select to authenticated
  using (tenant_id = (select public.current_tenant_id()));
-- no insert/update/delete policy: only the SECURITY DEFINER trigger writes here
create index on public.audit_log (tenant_id, created_at desc);
