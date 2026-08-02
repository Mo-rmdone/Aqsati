create table public.credit_invoice (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenant(id) on delete cascade,
  customer_id uuid not null references public.customer(id),
  invoice_no text,
  issue_date date not null default current_date,
  due_date date not null,
  amount numeric(14,2) not null,
  amount_paid numeric(14,2) not null default 0,
  status text not null default 'open' check (status in ('open','partial','paid'))
);
alter table public.credit_invoice enable row level security;

create policy ci_read on public.credit_invoice for select to authenticated
  using (tenant_id = (select public.current_tenant_id()));
create policy ci_write on public.credit_invoice for insert to authenticated
  with check (tenant_id = (select public.current_tenant_id())
              and public.current_role() in ('owner','manager','accountant'));
create policy ci_update on public.credit_invoice for update to authenticated
  using (tenant_id = (select public.current_tenant_id()))
  with check (tenant_id = (select public.current_tenant_id())
              and public.current_role() in ('owner','manager','accountant'));

create trigger credit_invoice_audit after insert or update or delete
  on public.credit_invoice for each row execute function public.fn_audit();

alter table public.payment
  add constraint payment_credit_invoice_fk foreign key (credit_invoice_id) references public.credit_invoice(id);

-- security_invoker=true (not in the brief's original SQL, which left the default
-- unset) fixes a real cross-tenant data leak found during Task 7's advisor scan:
-- without it, a view runs with its *owner's* (privileged) permissions against the
-- underlying tables rather than the querying user's, so RLS on credit_invoice would
-- be bypassed entirely and any authenticated user of any tenant could see every
-- tenant's rows through this view. With security_invoker=true, credit_invoice's
-- existing tenant-scoped ci_read policy applies correctly. See task-7-report.md.
create view public.v_aging with (security_invoker = true) as
select tenant_id, customer_id, id, due_date, (amount - amount_paid) as outstanding,
  case
    when due_date >= current_date then 'current'
    when current_date - due_date between 1 and 30  then 'b1_30'
    when current_date - due_date between 31 and 60 then 'b31_60'
    when current_date - due_date between 61 and 90 then 'b61_90'
    else 'b90_plus'
  end as bucket
from public.credit_invoice where status <> 'paid';

-- traces exactly which installment(s)/invoice a payment funded — needed so a payment
-- can later be voided/reversed correctly, and for itemized receipt detail
create table public.payment_allocation (
  id uuid primary key default gen_random_uuid(),
  payment_id uuid not null references public.payment(id) on delete cascade,
  installment_id uuid references public.installment(id),
  credit_invoice_id uuid references public.credit_invoice(id),
  amount numeric(14,2) not null check (amount > 0),
  check (num_nonnulls(installment_id, credit_invoice_id) = 1)
);
alter table public.payment_allocation enable row level security;
create policy payment_allocation_read on public.payment_allocation for select to authenticated
  using (exists (select 1 from public.payment p
                 where p.id = payment_id and p.tenant_id = (select public.current_tenant_id())));
-- no write policy: only allocate_payment()/allocate_credit_payment() (SECURITY DEFINER) write here
create index on public.payment_allocation (payment_id);

-- Task 5 defined allocate_payment(contract, amount) for the Phase-1 pgTAP test; this
-- overload adds payment-id tracing now that payment/payment_allocation exist.
--
-- search_path hardened to '' (brief's original SQL used 'public') per this project's
-- established pattern (Tasks 4-6) — every reference below is already schema-qualified
-- (public.installment, public.payment_allocation), so this is behaviorally a no-op,
-- verified by the smoke test in the task report.
create or replace function public.allocate_payment(p_payment uuid, p_contract uuid, p_amount numeric)
returns numeric language plpgsql security definer set search_path = '' as $$
declare
  r record;
  v_left numeric(14,2) := p_amount;
  v_take numeric(14,2);
begin
  for r in
    select id, amount_due, amount_paid
    from public.installment
    where contract_id = p_contract and status <> 'paid'
    order by due_date, seq_no
    for update
  loop
    exit when v_left <= 0;
    v_take := least(v_left, r.amount_due - r.amount_paid);

    update public.installment
       set amount_paid = amount_paid + v_take,
           status = case when amount_paid + v_take >= amount_due then 'paid' else 'partial' end,
           paid_at = case when amount_paid + v_take >= amount_due then now() else paid_at end
     where id = r.id;

    insert into public.payment_allocation(payment_id, installment_id, amount)
    values (p_payment, r.id, v_take);

    v_left := v_left - v_take;
  end loop;

  return v_left;
end $$;
-- internal helper only, called from record_payment() below via its SECURITY
-- DEFINER context (which works regardless of the caller's own grants) — not
-- a public entry point. Closing this needs all three: revoke the implicit
-- PUBLIC grant every new function gets, AND revoke Supabase's separate
-- project-level default grant to anon/authenticated (neither alone is
-- sufficient — see the identical fix on Task 2's tenancy functions).
revoke all on function public.allocate_payment(uuid, uuid, numeric) from public;
revoke execute on function public.allocate_payment(uuid, uuid, numeric) from anon, authenticated;

-- آجل counterpart to allocate_payment — a credit_invoice has no per-installment
-- schedule, so it's a single running balance rather than a waterfall loop
--
-- search_path hardened to '' (brief's original SQL used 'public'), same reasoning as
-- allocate_payment above — every reference is already schema-qualified.
create or replace function public.allocate_credit_payment(p_payment uuid, p_invoice uuid, p_amount numeric)
returns numeric language plpgsql security definer set search_path = '' as $$
declare
  v_due numeric(14,2);
  v_paid numeric(14,2);
  v_take numeric(14,2);
begin
  select amount, amount_paid into v_due, v_paid
  from public.credit_invoice where id = p_invoice for update;

  v_take := least(p_amount, v_due - v_paid);

  update public.credit_invoice
     set amount_paid = amount_paid + v_take,
         status = case when amount_paid + v_take >= amount then 'paid' else 'partial' end
   where id = p_invoice;

  insert into public.payment_allocation(payment_id, credit_invoice_id, amount)
  values (p_payment, p_invoice, v_take);

  return p_amount - v_take;  -- overpayment remainder, if any
end $$;
-- internal helper only, same reasoning as allocate_payment above
revoke all on function public.allocate_credit_payment(uuid, uuid, numeric) from public;
revoke execute on function public.allocate_credit_payment(uuid, uuid, numeric) from anon, authenticated;

-- record a payment against either a contract (installments) or a credit_invoice
-- (آجل), and allocate it atomically. SECURITY DEFINER + explicit role check so a
-- collector can call it without needing a direct write policy on payment/installment.
--
-- search_path hardened to '' (brief's original SQL used 'public'), same reasoning as
-- allocate_payment above — every reference is already schema-qualified.
create or replace function public.record_payment(
  p_contract uuid, p_credit_invoice uuid, p_customer uuid, p_amount numeric, p_method text
) returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid; v_tenant uuid := public.current_tenant_id();
begin
  if public.current_role() not in ('owner','manager','accountant','collector') then
    raise exception 'not authorized to record payments';
  end if;

  insert into public.payment(tenant_id, customer_id, contract_id, credit_invoice_id, amount, method)
  values (v_tenant, p_customer, p_contract, p_credit_invoice, p_amount, p_method)
  returning id into v_id;

  if p_contract is not null then
    perform public.allocate_payment(v_id, p_contract, p_amount);
  elsif p_credit_invoice is not null then
    perform public.allocate_credit_payment(v_id, p_credit_invoice, p_amount);
  else
    raise exception 'must specify either p_contract or p_credit_invoice';
  end if;

  return v_id;
end $$;
-- record_payment IS a legitimate client entry point (called by authenticated
-- users), gated by its own internal current_role() check above — anon must
-- still be blocked explicitly (auth.uid() being null would fail harmlessly,
-- but don't rely on that — see Task 2's identical finding).
revoke all on function public.record_payment(uuid, uuid, uuid, numeric, text) from public;
revoke execute on function public.record_payment(uuid, uuid, uuid, numeric, text) from anon;
grant execute on function public.record_payment(uuid, uuid, uuid, numeric, text) to authenticated;
