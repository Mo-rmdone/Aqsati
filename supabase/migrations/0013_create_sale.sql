-- Notah Phase 1, Task 2: create_sale RPC, per-contract payment lines, contract balances, KPI rewrite.

-- ---- payment_line: the merchant's per-contract split of a payment ----
-- (payment_allocation stays the per-installment detail)
create table public.payment_line (
  id uuid primary key default gen_random_uuid(),
  payment_id uuid not null references public.payment(id) on delete cascade,
  contract_id uuid not null references public.contract(id),
  tenant_id uuid not null references public.tenant(id) on delete cascade,
  amount numeric(14,2) not null check (amount > 0),
  kind text not null check (kind in ('down_payment','cash','installment'))
);
alter table public.payment_line enable row level security;
create policy payment_line_read on public.payment_line for select to authenticated
  using (tenant_id = (select public.current_tenant_id()));
-- no write policy: only create_sale() (SECURITY DEFINER) writes here
create index on public.payment_line (contract_id);
create index on public.payment_line (tenant_id);
create index on public.payment_line (payment_id);

-- ---- create_sale replaces create_contract ----
drop function public.create_contract(jsonb);

create or replace function public.create_sale(p jsonb) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_tenant   uuid := public.current_tenant_id();
  v_id       uuid;
  v_customer uuid;
  v_type     text;
  v_total    numeric(14,2);
  v_down     numeric(14,2);
  v_rate     numeric;
  v_years    int;
  v_date     date;
  v_method   text;
  v_desc     text;
  v_pay      uuid;
begin
  if v_tenant is null or public.current_role() not in ('owner','manager','accountant') then
    raise exception 'غير مصرح لك بتسجيل البيع';
  end if;

  v_id := nullif(p->>'id','')::uuid;
  if v_id is null then raise exception 'رقم العملية مطلوب'; end if;

  -- idempotent: a retried request for an existing sale of this shop writes nothing
  if exists (select 1 from public.contract where id = v_id and tenant_id = v_tenant) then
    return v_id;
  end if;

  v_customer := nullif(p->>'customer_id','')::uuid;
  if v_customer is null
     or not exists (select 1 from public.customer where id = v_customer and tenant_id = v_tenant) then
    raise exception 'العميل غير موجود';
  end if;

  v_desc := btrim(coalesce(p->>'product_desc',''));
  if v_desc = '' then raise exception 'اسم المنتج مطلوب'; end if;

  v_type := coalesce(p->>'sale_type','installment');
  if v_type not in ('installment','cash') then raise exception 'نوع البيع غير صحيح'; end if;

  v_total := (p->>'total_price')::numeric;
  if v_total is null or v_total <= 0 then raise exception 'السعر لازم يكون أكبر من صفر'; end if;

  v_date := coalesce(nullif(p->>'sale_date','')::date, current_date);

  v_method := coalesce(nullif(p->>'payment_method',''), 'cash');
  if v_method not in ('cash','instapay','fawry','wallet','card','bank') then
    raise exception 'طريقة الدفع غير صحيحة';
  end if;

  if v_type = 'cash' then
    insert into public.contract(id, tenant_id, customer_id, product_desc, total_price, down_payment,
                                interest_rate, interest_method, num_installments, start_date,
                                sale_type, external_invoice_no)
    values (v_id, v_tenant, v_customer, v_desc, v_total, v_total,
            0, 'zero', 0, v_date, 'cash', nullif(btrim(p->>'external_invoice_no'),''));

    insert into public.payment(tenant_id, customer_id, contract_id, amount, method, received_at)
    values (v_tenant, v_customer, v_id, v_total, v_method, now())
    returning id into v_pay;
    insert into public.payment_line(payment_id, contract_id, tenant_id, amount, kind)
    values (v_pay, v_id, v_tenant, v_total, 'cash');
  else
    v_down  := coalesce(nullif(p->>'down_payment','')::numeric, 0);
    v_rate  := (p->>'rate_percent')::numeric;
    v_years := (p->>'years')::int;

    if v_down < 0 or v_down >= v_total then raise exception 'المقدم لازم يكون أقل من السعر'; end if;
    if v_rate is null or v_rate < 0 or v_rate > 200 then raise exception 'نسبة الفائدة لازم تكون بين 0 و 200'; end if;
    if v_years is null or v_years < 1 or v_years > 5 then raise exception 'عدد السنين لازم يكون من 1 إلى 5'; end if;

    insert into public.contract(id, tenant_id, customer_id, product_desc, total_price, down_payment,
                                interest_rate, interest_method, num_installments, start_date,
                                sale_type, external_invoice_no)
    values (v_id, v_tenant, v_customer, v_desc, v_total, v_down,
            v_rate / 100, 'flat', v_years * 12, v_date,
            'installment', nullif(btrim(p->>'external_invoice_no'),''));

    insert into public.installment(contract_id, tenant_id, seq_no, due_date, amount_due)
    select v_id, v_tenant, s.seq_no, s.due_date, s.amount_due
    from public.build_schedule(v_total - v_down, v_rate / 100, v_years * 12, v_date, 'flat') s;

    if v_down > 0 then
      insert into public.payment(tenant_id, customer_id, contract_id, amount, method, received_at)
      values (v_tenant, v_customer, v_id, v_down, v_method, now())
      returning id into v_pay;
      insert into public.payment_line(payment_id, contract_id, tenant_id, amount, kind)
      values (v_pay, v_id, v_tenant, v_down, 'down_payment');
    end if;
  end if;

  return v_id;
end $$;
revoke all on function public.create_sale(jsonb) from public;
revoke execute on function public.create_sale(jsonb) from anon;
grant execute on function public.create_sale(jsonb) to authenticated;

-- ---- per-contract balance ----
create view public.v_contract_balance with (security_invoker = true) as
select c.id as contract_id, c.tenant_id, c.customer_id, c.contract_no, c.product_desc, c.sale_type,
       case when c.sale_type = 'cash' then c.total_price
            else c.down_payment + coalesce(i.due_sum, 0) end as total_payable,
       coalesce(pl.paid_sum, 0) as paid,
       (case when c.sale_type = 'cash' then c.total_price
             else c.down_payment + coalesce(i.due_sum, 0) end) - coalesce(pl.paid_sum, 0) as remaining,
       i.next_due as next_due_date
from public.contract c
left join (select contract_id, sum(amount_due) as due_sum,
                  min(due_date) filter (where status in ('pending','partial','overdue')) as next_due
           from public.installment group by contract_id) i on i.contract_id = c.id
left join (select contract_id, sum(amount) as paid_sum
           from public.payment_line group by contract_id) pl on pl.contract_id = c.id;
revoke select on public.v_contract_balance from anon;

-- ---- KPI: collected_this_month now counts every payment (down payments, cash sales) ----
create or replace view public.v_collections_kpi with (security_invoker = true) as
with inst as (
  select c.tenant_id,
    sum(i.amount_due - i.amount_paid) filter (
      where i.status <> 'paid' and i.due_date between current_date and current_date + 7
    ) as expected_this_week,
    sum(i.amount_due - i.amount_paid) filter (where i.status = 'overdue') as overdue_total
  from public.installment i join public.contract c on c.id = i.contract_id
  group by c.tenant_id
), pay as (
  select tenant_id, sum(amount) as collected_this_month
  from public.payment
  where date_trunc('month', received_at) = date_trunc('month', now())
  group by tenant_id
)
select coalesce(inst.tenant_id, pay.tenant_id) as tenant_id,
       inst.expected_this_week, pay.collected_this_month, inst.overdue_total
from inst full join pay on pay.tenant_id = inst.tenant_id;
revoke select on public.v_collections_kpi from anon;
