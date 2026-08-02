create table public.contract (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenant(id) on delete cascade,
  branch_id uuid references public.branch(id),
  customer_id uuid not null references public.customer(id),
  product_desc text,
  total_price numeric(14,2) not null,
  down_payment numeric(14,2) not null default 0,
  interest_rate numeric(6,4) not null default 0,
  interest_method text not null default 'flat' check (interest_method in ('flat','reducing','zero')),
  num_installments int not null check (num_installments >= 1),
  start_date date not null,
  status text not null default 'active'
    check (status in ('draft','active','completed','defaulted','void')),
  created_at timestamptz not null default now()
);

create table public.installment (
  id uuid primary key default gen_random_uuid(),
  contract_id uuid not null references public.contract(id) on delete cascade,
  seq_no int not null,
  due_date date not null,
  amount_due numeric(14,2) not null,
  amount_paid numeric(14,2) not null default 0,
  status text not null default 'pending'
    check (status in ('pending','partial','paid','overdue','waived')),
  paid_at timestamptz,
  unique (contract_id, seq_no)
);

alter table public.contract    enable row level security;
alter table public.installment enable row level security;

create policy contract_read on public.contract for select to authenticated
  using (tenant_id = (select public.current_tenant_id()));
create policy contract_write on public.contract for insert to authenticated
  with check (tenant_id = (select public.current_tenant_id())
              and public.current_role() in ('owner','manager','accountant'));
create policy contract_update on public.contract for update to authenticated
  using (tenant_id = (select public.current_tenant_id()))
  with check (tenant_id = (select public.current_tenant_id())
              and public.current_role() in ('owner','manager','accountant'));
create policy contract_delete on public.contract for delete to authenticated
  using (tenant_id = (select public.current_tenant_id())
         and public.current_role() in ('owner','manager'));

-- installments inherit isolation through their parent contract; direct client writes
-- are role-gated the same as contracts. Collectors record payments through the
-- record_payment() RPC (Task 7), which is SECURITY DEFINER and does its own role
-- check, so they never need a direct installment-write policy.
create policy installment_read on public.installment for select to authenticated
  using (exists (select 1 from public.contract c
                 where c.id = contract_id and c.tenant_id = (select public.current_tenant_id())));
create policy installment_write on public.installment for insert to authenticated
  with check (exists (select 1 from public.contract c
                       where c.id = contract_id and c.tenant_id = (select public.current_tenant_id())
                       and public.current_role() in ('owner','manager','accountant')));
create policy installment_update on public.installment for update to authenticated
  using (exists (select 1 from public.contract c
                 where c.id = contract_id and c.tenant_id = (select public.current_tenant_id())))
  with check (exists (select 1 from public.contract c
                       where c.id = contract_id and c.tenant_id = (select public.current_tenant_id())
                       and public.current_role() in ('owner','manager','accountant')));
-- no delete policy on installment: installments are never deleted, only transitioned via status

-- fn_audit (0002_audit.sql) does coalesce(new.tenant_id, old.tenant_id), which assumes every
-- audited table has a tenant_id column. installment does not (it inherits tenant scoping
-- through contract_id), so the original fn_audit body raises "record has no field tenant_id"
-- the moment installment_audit fires below. Patch fn_audit to derive tenant_id via the parent
-- contract for the installment case, leaving its behavior for every other (tenant_id-bearing)
-- table unchanged.
create or replace function public.fn_audit() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_tenant_id uuid;
begin
  if tg_table_name = 'installment' then
    select c.tenant_id into v_tenant_id
    from public.contract c
    where c.id = coalesce(new.contract_id, old.contract_id);
  else
    v_tenant_id := coalesce(new.tenant_id, old.tenant_id);
  end if;

  insert into public.audit_log(tenant_id, user_id, action, entity_type, entity_id, before_json, after_json)
  values (
    v_tenant_id,
    auth.uid(),
    lower(tg_op),
    tg_table_name,
    coalesce(new.id, old.id),
    case when tg_op in ('UPDATE','DELETE') then to_jsonb(old) end,
    case when tg_op in ('INSERT','UPDATE') then to_jsonb(new) end
  );
  return coalesce(new, old);
end $$;

create index on public.contract (tenant_id, status);
create index on public.installment (contract_id, due_date);
create index on public.installment (due_date, status);
create trigger contract_audit after insert or update or delete
  on public.contract for each row execute function public.fn_audit();
create trigger installment_audit after insert or update or delete
  on public.installment for each row execute function public.fn_audit();

create or replace function public.create_contract(p jsonb)
returns uuid language plpgsql security invoker set search_path = '' as $$
declare v_id uuid; v_financed numeric(14,2);
begin
  insert into public.contract(tenant_id, branch_id, customer_id, product_desc,
                              total_price, down_payment, interest_rate,
                              interest_method, num_installments, start_date)
  values (public.current_tenant_id(), (p->>'branch_id')::uuid, (p->>'customer_id')::uuid,
          p->>'product_desc', (p->>'total_price')::numeric, (p->>'down_payment')::numeric,
          (p->>'interest_rate')::numeric, p->>'interest_method',
          (p->>'num_installments')::int, (p->>'start_date')::date)
  returning id into v_id;

  v_financed := (p->>'total_price')::numeric - (p->>'down_payment')::numeric;

  insert into public.installment(contract_id, seq_no, due_date, amount_due)
  select v_id, s.seq_no, s.due_date, s.amount_due
  from public.build_schedule(v_financed, (p->>'interest_rate')::numeric,
                             (p->>'num_installments')::int, (p->>'start_date')::date,
                             p->>'interest_method') s;
  return v_id;
end $$;
