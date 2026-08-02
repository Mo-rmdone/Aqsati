create table public.customer (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenant(id) on delete cascade,
  name text not null,
  phone text not null,
  national_id text,
  address text,
  blacklist_flag boolean not null default false,
  created_at timestamptz not null default now()
);
alter table public.customer enable row level security;
create policy customer_read on public.customer for select to authenticated
  using (tenant_id = (select public.current_tenant_id()));
create policy customer_write on public.customer for insert to authenticated
  with check (tenant_id = (select public.current_tenant_id())
              and public.current_role() in ('owner','manager','accountant'));
create policy customer_update on public.customer for update to authenticated
  using (tenant_id = (select public.current_tenant_id()))
  with check (tenant_id = (select public.current_tenant_id())
              and public.current_role() in ('owner','manager','accountant'));
create policy customer_delete on public.customer for delete to authenticated
  using (tenant_id = (select public.current_tenant_id())
         and public.current_role() in ('owner','manager'));
create index on public.customer (tenant_id, phone);
create trigger customer_audit after insert or update or delete
  on public.customer for each row execute function public.fn_audit();
