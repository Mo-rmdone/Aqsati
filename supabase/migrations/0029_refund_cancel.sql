-- Refunds and invoice cancel: a refund table (never a negative payment), cancel_contract
-- (owner only, idempotent on the client op id), void guards on record_payment / update_payment,
-- void-aware views, and the KPI "collected" = non-opening payments - refunds on Cairo dates.

-- 1. refund ---------------------------------------------------------------------------------
create table public.refund (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references public.tenant(id) on delete cascade,
  contract_id uuid not null references public.contract(id),
  customer_id uuid not null references public.customer(id),
  amount      numeric(12,2) not null check (amount > 0),
  method      text not null check (method in ('cash','instapay','fawry','wallet','card','bank')),
  refunded_at timestamptz not null default now(),
  reason      text not null check (reason in ('cancel','correction')),
  note        text check (note is null or char_length(note) <= 200),
  op_id       uuid not null unique,
  created_by  uuid not null default auth.uid()
);
create index refund_tenant_refunded_at_idx on public.refund(tenant_id, refunded_at);
create index refund_contract_idx on public.refund(contract_id);

alter table public.refund enable row level security;
create policy refund_read on public.refund for select to authenticated
  using (tenant_id = (select public.current_tenant_id()));
-- no insert/update/delete policy: written only by security-definer RPCs.
revoke all on public.refund from anon;
revoke insert, update, delete, truncate, references, trigger on public.refund from authenticated;

create trigger refund_audit after insert or update or delete on public.refund
  for each row execute function public.fn_audit();

-- 2. contract cancel columns ----------------------------------------------------------------
alter table public.contract
  add column cancelled_at timestamptz,
  add column cancel_reason text check (cancel_reason is null or char_length(cancel_reason) <= 200);

-- finds a cancel already done for an op id that carried no refund
create index audit_log_cancel_op_idx on public.audit_log ((after_json->>'op_id'))
  where action = 'contract_cancel';

-- 3. cancel_contract ------------------------------------------------------------------------
create or replace function public.cancel_contract(
  p_id uuid, p_contract uuid, p_refund numeric, p_method text, p_reason text
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_tenant  uuid := public.current_tenant_id();
  v_c       public.contract%rowtype;
  v_paid    numeric(14,2);
  v_refunds numeric(14,2);
  v_reason  text := nullif(btrim(coalesce(p_reason, '')), '');
  v_method  text;
begin
  if v_tenant is null or public.current_role() is distinct from 'owner' then
    raise exception 'owner only' using errcode = '42501';
  end if;
  if p_id is null then
    raise exception 'رقم العملية مطلوب' using errcode = '22023';
  end if;

  -- same idempotency pattern as record_payment: serialize on the op id, then look for it
  perform pg_advisory_xact_lock(hashtext(p_id::text));
  if exists (select 1 from public.refund where op_id = p_id and tenant_id = v_tenant)
     or exists (select 1 from public.audit_log
                 where action = 'contract_cancel' and tenant_id = v_tenant
                   and after_json->>'op_id' = p_id::text) then
    return p_contract;
  end if;

  -- locks the contract: record_payment / update_payment share-lock it before their void check
  select * into v_c from public.contract where id = p_contract and tenant_id = v_tenant for update;
  if not found then
    raise exception 'الفاتورة مش موجودة' using errcode = '42501';
  end if;
  if v_c.status = 'void' then
    raise exception 'الفاتورة دي ملغية بالفعل' using errcode = '22023';
  end if;

  select coalesce(sum(amount), 0) into v_paid
    from public.payment_line where contract_id = p_contract and tenant_id = v_tenant;
  select coalesce(sum(amount), 0) into v_refunds
    from public.refund where contract_id = p_contract and tenant_id = v_tenant;

  if p_refund is null or p_refund < 0 or p_refund > v_paid - v_refunds then
    raise exception 'مبلغ المرتجع لازم يكون من صفر لحد المدفوع' using errcode = '22023';
  end if;
  if p_refund > 0 then
    if p_method is null or p_method not in ('cash','instapay','fawry','wallet','card','bank') then
      raise exception 'طريقة الدفع غير صحيحة' using errcode = '22023';
    end if;
    v_method := p_method;
  end if;
  if char_length(v_reason) > 200 then
    raise exception 'سبب الإلغاء طويل' using errcode = '22023';
  end if;

  update public.contract
     set status = 'void', cancelled_at = now(), cancel_reason = v_reason
   where id = p_contract;

  if p_refund > 0 then
    insert into public.refund(tenant_id, contract_id, customer_id, amount, method, reason, op_id, created_by)
    values (v_tenant, p_contract, v_c.customer_id, p_refund, v_method, 'cancel', p_id, auth.uid());
  end if;

  insert into public.audit_log(tenant_id, user_id, action, entity_type, entity_id, before_json, after_json)
  values (v_tenant, auth.uid(), 'contract_cancel', 'contract', p_contract,
          jsonb_build_object('status', v_c.status),
          jsonb_build_object('refund', p_refund, 'method', v_method, 'reason', v_reason, 'op_id', p_id));

  return p_contract;
end $$;

revoke all on function public.cancel_contract(uuid, uuid, numeric, text, text) from public;
revoke execute on function public.cancel_contract(uuid, uuid, numeric, text, text) from anon;
grant execute on function public.cancel_contract(uuid, uuid, numeric, text, text) to authenticated;

-- 4. void guards: live bodies (pg_get_functiondef) + share-lock and reject void contracts ----
create or replace function public.record_payment(p_id uuid, p_customer uuid, p_method text, p_lines jsonb)
 returns uuid
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  v_tenant uuid := public.current_tenant_id();
  v_total  numeric(14,2);
begin
  if v_tenant is null or public.current_role() not in ('owner','manager','accountant','collector') then
    raise exception 'غير مصرح لك بتسجيل الدفعات';
  end if;

  if p_id is null then raise exception 'رقم العملية مطلوب'; end if;

  -- serialize concurrent submits of the same payment id: the second caller waits, then sees
  -- the payment and returns it instead of failing with a unique_violation
  perform pg_advisory_xact_lock(hashtext(p_id::text));

  -- idempotent: a retried request for an existing payment of this shop writes nothing
  if exists (select 1 from public.payment where id = p_id and tenant_id = v_tenant) then
    return p_id;
  end if;

  if p_customer is null
     or not exists (select 1 from public.customer where id = p_customer and tenant_id = v_tenant) then
    raise exception 'العميل غير موجود';
  end if;

  if p_method is null or p_method not in ('cash','instapay','fawry','wallet','card','bank') then
    raise exception 'طريقة الدفع غير صحيحة';
  end if;

  -- a cancelled invoice takes no payments; the share lock waits out a concurrent cancel
  perform 1 from public.contract c
   where c.tenant_id = v_tenant
     and c.id::text in (select lower(e->>'contract_id') from jsonb_array_elements(
           case when jsonb_typeof(p_lines) = 'array' then p_lines else '[]'::jsonb end) e)
   order by c.id
   for share;
  if exists (select 1 from public.contract c
              where c.tenant_id = v_tenant and c.status = 'void'
                and c.id::text in (select lower(e->>'contract_id') from jsonb_array_elements(
                      case when jsonb_typeof(p_lines) = 'array' then p_lines else '[]'::jsonb end) e)) then
    raise exception 'الفاتورة دي ملغية ومش بتقبل دفعات' using errcode = '22023';
  end if;

  v_total := public.fn_check_payment_lines(v_tenant, p_customer, p_lines);

  insert into public.payment(id, tenant_id, customer_id, contract_id, amount, method, received_at)
  values (p_id, v_tenant, p_customer,
          case when jsonb_array_length(p_lines) = 1 then (p_lines->0->>'contract_id')::uuid end,
          v_total, p_method, now());

  perform public.fn_apply_payment_lines(p_id, v_tenant, p_lines);

  return p_id;
end $function$;

create or replace function public.update_payment_apply(p_id uuid, p_method text, p_lines jsonb)
 returns uuid
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  v_tenant   uuid := public.current_tenant_id();
  v_pay      public.payment%rowtype;
  v_before   jsonb;
  v_total    numeric(14,2);
  v_contract uuid;
  r          record;
begin
  if v_tenant is null or public.current_role() not in ('owner','manager','accountant','collector') then
    raise exception 'غير مصرح لك بتعديل الدفعات';
  end if;

  if p_id is null then raise exception 'رقم العملية مطلوب'; end if;

  -- same lock key as record_payment, then the payment row itself
  perform pg_advisory_xact_lock(hashtext(p_id::text));
  select * into v_pay from public.payment where id = p_id and tenant_id = v_tenant for update;
  if not found then
    raise exception 'الدفعة غير موجودة';
  end if;

  if exists (select 1 from public.payment_line
             where payment_id = p_id and kind in ('down_payment','cash')) then
    raise exception 'المقدم والبيع الكاش جزء من الفاتورة ومش بيتعدلوا من هنا';
  end if;
  -- legacy credit-invoice payments (0007) have no installment lines to re-allocate
  if v_pay.credit_invoice_id is not null
     or exists (select 1 from public.payment_allocation where payment_id = p_id and installment_id is null) then
    raise exception 'الدفعة دي مش على أقساط ومش بتتعدل من هنا';
  end if;

  if p_method is null or p_method not in ('cash','instapay','fawry','wallet','card','bank') then
    raise exception 'طريقة الدفع غير صحيحة';
  end if;

  -- a cancelled invoice's payments are history: nothing moves onto it or off it.
  -- the share lock (old lines + new lines) waits out a concurrent cancel
  perform 1 from public.contract c
   where c.tenant_id = v_tenant
     and (c.id in (select pl.contract_id from public.payment_line pl where pl.payment_id = p_id)
          or c.id::text in (select lower(e->>'contract_id') from jsonb_array_elements(
               case when jsonb_typeof(p_lines) = 'array' then p_lines else '[]'::jsonb end) e))
   order by c.id
   for share;
  if exists (select 1 from public.contract c
              where c.tenant_id = v_tenant and c.status = 'void'
                and (c.id in (select pl.contract_id from public.payment_line pl where pl.payment_id = p_id)
                     or c.id::text in (select lower(e->>'contract_id') from jsonb_array_elements(
                          case when jsonb_typeof(p_lines) = 'array' then p_lines else '[]'::jsonb end) e))) then
    raise exception 'الفاتورة دي ملغية ودفعاتها مش بتتعدل' using errcode = '22023';
  end if;

  v_before := jsonb_build_object('amount', v_pay.amount, 'method', v_pay.method,
    'lines', coalesce((select jsonb_agg(jsonb_build_object('contract_id', contract_id, 'amount', amount)
                                        order by contract_id)
                       from public.payment_line where payment_id = p_id), '[]'::jsonb));

  -- lock every affected contract's installments (old allocations + new lines of this
  -- customer/shop) in contract-id order — the same order record_payment uses
  for v_contract in
    select i.contract_id from public.payment_allocation pa
      join public.installment i on i.id = pa.installment_id
     where pa.payment_id = p_id
    union
    select c.id from public.contract c
     where c.tenant_id = v_tenant and c.customer_id = v_pay.customer_id
       and c.id::text in (select lower(e->>'contract_id') from jsonb_array_elements(
             case when jsonb_typeof(p_lines) = 'array' then p_lines else '[]'::jsonb end) e)
    order by 1
  loop
    perform 1 from public.installment where contract_id = v_contract for update;
  end loop;

  -- reverse this payment's allocations only; other payments' allocations stay untouched
  for r in
    select pa.installment_id, sum(pa.amount) as amount
    from public.payment_allocation pa where pa.payment_id = p_id
    group by pa.installment_id order by pa.installment_id
  loop
    if (select amount_paid from public.installment where id = r.installment_id) < r.amount then
      raise exception 'بيانات الدفعة غير متسقة مع الأقساط';
    end if;
    update public.installment
       set amount_paid = amount_paid - r.amount,
           status = case when status = 'waived' then status
                         else public.installment_status(amount_due, amount_paid - r.amount, due_date) end,
           paid_at = case when amount_paid - r.amount >= amount_due then paid_at end
     where id = r.installment_id;
  end loop;

  delete from public.payment_allocation where payment_id = p_id;
  delete from public.payment_line where payment_id = p_id;

  v_total := public.fn_check_payment_lines(v_tenant, v_pay.customer_id, p_lines);

  update public.payment
     set amount = v_total,
         method = p_method,
         contract_id = case when jsonb_array_length(p_lines) = 1 then (p_lines->0->>'contract_id')::uuid end,
         edited_at = now()
   where id = p_id;

  perform public.fn_apply_payment_lines(p_id, v_tenant, p_lines);

  insert into public.audit_log(tenant_id, user_id, action, entity_type, entity_id, before_json, after_json)
  values (v_tenant, auth.uid(), 'payment_edit', 'payment', p_id, v_before,
    jsonb_build_object('amount', v_total, 'method', p_method,
      'lines', (select jsonb_agg(jsonb_build_object('contract_id', contract_id, 'amount', amount)
                                 order by contract_id)
                from public.payment_line where payment_id = p_id)));

  return p_id;
end $function$;

-- 5. views ----------------------------------------------------------------------------------
-- v_contract_balance keeps void rows and exposes status (consumers filter)
create or replace view public.v_contract_balance with (security_invoker = true) as
 SELECT c.id AS contract_id,
    c.tenant_id,
    c.customer_id,
    c.contract_no,
    c.product_desc,
    c.sale_type,
        CASE
            WHEN c.sale_type = 'cash'::text THEN c.total_price
            ELSE c.down_payment + COALESCE(i.due_sum, 0::numeric)
        END AS total_payable,
        CASE
            WHEN c.sale_type = 'cash'::text THEN COALESCE(pl.paid_sum, 0::numeric)
            ELSE c.down_payment + COALESCE(i.due_sum, 0::numeric) - COALESCE(i.open_sum, 0::numeric)
        END AS paid,
        CASE
            WHEN c.sale_type = 'cash'::text THEN c.total_price - COALESCE(pl.paid_sum, 0::numeric)
            ELSE COALESCE(i.open_sum, 0::numeric)
        END AS remaining,
    i.next_due AS next_due_date,
    c.status
   FROM public.contract c
     LEFT JOIN ( SELECT installment.contract_id,
            sum(installment.amount_due) AS due_sum,
            sum(installment.amount_due - installment.amount_paid) AS open_sum,
            min(installment.due_date) FILTER (WHERE installment.status = ANY (ARRAY['pending'::text, 'partial'::text, 'overdue'::text])) AS next_due
           FROM public.installment
          GROUP BY installment.contract_id) i ON i.contract_id = c.id
     LEFT JOIN ( SELECT payment_line.contract_id,
            sum(payment_line.amount) AS paid_sum
           FROM public.payment_line
          GROUP BY payment_line.contract_id) pl ON pl.contract_id = c.id;
revoke select on public.v_contract_balance from anon;

create or replace view public.v_worklist with (security_invoker = true) as
 SELECT c.tenant_id,
    c.id AS contract_id,
    cu.id AS customer_id,
    cu.name,
    cu.phone,
    i.id AS installment_id,
    i.due_date,
    i.amount_due - i.amount_paid AS amount,
    CURRENT_DATE - i.due_date AS days_late,
    i.status
   FROM public.installment i
     JOIN public.contract c ON c.id = i.contract_id
     JOIN public.customer cu ON cu.id = c.customer_id
  WHERE (i.status = ANY (ARRAY['pending'::text, 'partial'::text, 'overdue'::text])) AND i.due_date <= (CURRENT_DATE + 7)
    AND c.status <> 'void'::text;
revoke select on public.v_worklist from anon;

create or replace view public.v_installment_aging with (security_invoker = true) as
 SELECT c.tenant_id,
    c.customer_id,
    c.id AS contract_id,
    i.id,
    i.due_date,
    i.amount_due - i.amount_paid AS outstanding,
        CASE
            WHEN i.due_date >= CURRENT_DATE THEN 'current'::text
            WHEN (CURRENT_DATE - i.due_date) >= 1 AND (CURRENT_DATE - i.due_date) <= 30 THEN 'b1_30'::text
            WHEN (CURRENT_DATE - i.due_date) >= 31 AND (CURRENT_DATE - i.due_date) <= 60 THEN 'b31_60'::text
            WHEN (CURRENT_DATE - i.due_date) >= 61 AND (CURRENT_DATE - i.due_date) <= 90 THEN 'b61_90'::text
            ELSE 'b90_plus'::text
        END AS bucket
   FROM public.installment i
     JOIN public.contract c ON c.id = i.contract_id
  WHERE i.status = ANY (ARRAY['pending'::text, 'partial'::text, 'overdue'::text])
    AND c.status <> 'void'::text;
revoke select on public.v_installment_aging from anon;

-- v_aging reads credit_invoice (no contract), v_followup already excludes void: unchanged.

-- v_invoice_list: void rows stay, shown as cancelled with nothing left to collect
create or replace view public.v_invoice_list with (security_invoker = true) as
 SELECT c.id AS contract_id,
    c.tenant_id,
    c.contract_no,
    c.external_invoice_no,
    c.customer_id,
    cu.name AS customer_name,
    cu.phone AS customer_phone,
    c.product_desc,
    c.sale_type,
    c.start_date AS sale_date,
    b.total_payable,
    b.paid,
        CASE
            WHEN c.status = 'void'::text THEN 0::numeric
            ELSE b.remaining
        END AS remaining,
        CASE
            WHEN c.status = 'void'::text THEN 0
            ELSE COALESCE(o.overdue_count, 0::bigint)::integer
        END AS overdue_count,
        CASE
            WHEN c.status = 'void'::text THEN NULL::date
            ELSE b.next_due_date
        END AS next_due_date,
        CASE
            WHEN c.status = 'void'::text THEN 'cancelled'::text
            WHEN b.remaining IS NULL THEN 'unknown'::text
            WHEN b.remaining = 0::numeric THEN 'settled'::text
            WHEN COALESCE(o.overdue_count, 0::bigint) > 0 THEN 'late'::text
            ELSE 'open'::text
        END AS status,
    c.cancelled_at
   FROM public.contract c
     JOIN public.customer cu ON cu.id = c.customer_id
     LEFT JOIN public.v_contract_balance b ON b.contract_id = c.id
     LEFT JOIN ( SELECT installment.contract_id,
            count(*) AS overdue_count
           FROM public.installment
          WHERE installment.due_date < (now() AT TIME ZONE 'Africa/Cairo'::text)::date AND installment.amount_due > installment.amount_paid
          GROUP BY installment.contract_id) o ON o.contract_id = c.id;
revoke select on public.v_invoice_list from anon;

-- v_collections_kpi: Cairo calendar, non-void contracts, collected = payments - refunds
create or replace view public.v_collections_kpi with (security_invoker = true) as
 WITH cairo AS (
         SELECT (now() AT TIME ZONE 'Africa/Cairo'::text)::date AS today,
            date_trunc('month'::text, (now() AT TIME ZONE 'Africa/Cairo'::text)) AS month_start
        ), bounds AS (
         SELECT cairo.today,
            (cairo.month_start AT TIME ZONE 'Africa/Cairo'::text) AS m_from,
            ((cairo.month_start + '1 mon'::interval) AT TIME ZONE 'Africa/Cairo'::text) AS m_to
           FROM cairo
        ), inst AS (
         SELECT c.tenant_id,
            sum(i.amount_due - i.amount_paid) FILTER (WHERE i.due_date >= bounds.today AND i.due_date <= (bounds.today + 7)) AS expected_this_week,
            sum(i.amount_due - i.amount_paid) FILTER (WHERE i.due_date < bounds.today) AS overdue_total
           FROM public.installment i
             JOIN public.contract c ON c.id = i.contract_id
             CROSS JOIN bounds
          WHERE c.status <> 'void'::text AND i.status <> 'waived'::text AND i.amount_due > i.amount_paid
          GROUP BY c.tenant_id
        ), pay AS (
         SELECT p.tenant_id,
            sum(p.amount) AS paid_sum
           FROM public.payment p
             CROSS JOIN bounds
          WHERE NOT p.is_opening AND p.received_at >= bounds.m_from AND p.received_at < bounds.m_to
          GROUP BY p.tenant_id
        ), ref AS (
         SELECT r.tenant_id,
            sum(r.amount) AS refund_sum
           FROM public.refund r
             CROSS JOIN bounds
          WHERE r.refunded_at >= bounds.m_from AND r.refunded_at < bounds.m_to
          GROUP BY r.tenant_id
        ), money AS (
         SELECT COALESCE(pay.tenant_id, ref.tenant_id) AS tenant_id,
            COALESCE(pay.paid_sum, 0::numeric) - COALESCE(ref.refund_sum, 0::numeric) AS collected_this_month
           FROM pay
             FULL JOIN ref ON ref.tenant_id = pay.tenant_id
        )
 SELECT COALESCE(inst.tenant_id, money.tenant_id) AS tenant_id,
    inst.expected_this_week,
    money.collected_this_month,
    inst.overdue_total
   FROM inst
     FULL JOIN money ON money.tenant_id = inst.tenant_id;
revoke select on public.v_collections_kpi from anon;

-- v_recent_activity: + refund rows (positive amount; the client shows a minus sign)
create or replace view public.v_recent_activity with (security_invoker = true) as
 SELECT tenant_id,
    at,
    kind,
    customer_id,
    customer_name,
    contract_id,
    contract_no,
    amount
   FROM ( SELECT c.tenant_id,
            c.created_at AS at,
            'sale'::text AS kind,
            c.customer_id,
            cu.name AS customer_name,
            c.id AS contract_id,
            c.contract_no,
            c.total_price AS amount
           FROM public.contract c
             JOIN public.customer cu ON cu.id = c.customer_id
          WHERE c.status <> 'void'::text AND c.interest_method <> 'imported'::text
        UNION ALL
         SELECT p.tenant_id,
            p.received_at,
            'payment'::text AS text,
            p.customer_id,
            cu.name,
            p.contract_id,
            c.contract_no,
            p.amount
           FROM public.payment p
             JOIN public.customer cu ON cu.id = p.customer_id
             LEFT JOIN public.contract c ON c.id = p.contract_id
          WHERE NOT p.is_opening AND (c.id IS NULL OR c.status <> 'void'::text)
        UNION ALL
         SELECT r.tenant_id,
            r.refunded_at,
            'refund'::text AS text,
            r.customer_id,
            cu.name,
            r.contract_id,
            c.contract_no,
            r.amount::numeric(14,2) AS amount
           FROM public.refund r
             JOIN public.customer cu ON cu.id = r.customer_id
             JOIN public.contract c ON c.id = r.contract_id) a
  ORDER BY at DESC;
revoke select on public.v_recent_activity from anon;
