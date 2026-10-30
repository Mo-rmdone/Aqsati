-- Notah Phase 1, Task 4: update_payment — edit a payment (never delete), re-allocate, audit.

alter table public.payment add column edited_at timestamptz;

-- status of one installment from its numbers; stable because it reads current_date
create or replace function public.installment_status(p_due numeric, p_paid numeric, p_due_date date)
returns text language sql stable set search_path = '' as $$
  select case
    when p_paid >= p_due then 'paid'
    when p_due_date < current_date then 'overdue'
    when p_paid > 0 then 'partial'
    else 'pending'
  end
$$;
revoke all on function public.installment_status(numeric, numeric, date) from public;
revoke execute on function public.installment_status(numeric, numeric, date) from anon, authenticated;

-- ---- shared by record_payment and update_payment ----

-- Validates p_lines = [{"contract_id": uuid, "amount": number}, ...] for p_customer in p_tenant and
-- returns the total (sum of rounded amounts). Contracts are visited in id order and their
-- installments locked before the balance is read, so concurrent payments cannot both pass the
-- remaining check and always lock in the same order (no deadlock).
create or replace function public.fn_check_payment_lines(p_tenant uuid, p_customer uuid, p_lines jsonb)
returns numeric language plpgsql security definer set search_path = '' as $$
declare
  v_total     numeric(14,2) := 0;
  v_contract  uuid;
  v_remaining numeric(14,2);
  r           record;
begin
  if p_lines is null or jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) = 0 then
    raise exception 'لازم تحدد عقد واحد على الأقل';
  end if;

  for r in
    select (e->>'contract_id')::uuid as contract_id, (e->>'amount')::numeric as amount
    from jsonb_array_elements(p_lines) e
    order by (e->>'contract_id')::uuid
  loop
    if r.amount is null or r.amount <= 0 then
      raise exception 'المبلغ لازم يكون أكبر من صفر';
    end if;
    if r.contract_id is null
       or not exists (select 1 from public.contract
                      where id = r.contract_id and tenant_id = p_tenant and customer_id = p_customer) then
      raise exception 'العقد غير موجود أو لا يخص هذا العميل';
    end if;
    if r.contract_id is not distinct from v_contract then
      raise exception 'العقد مكرر في نفس الدفعة';
    end if;
    v_contract := r.contract_id;
    if (select sale_type from public.contract where id = r.contract_id) = 'cash' then
      raise exception 'لا يمكن تحصيل أقساط على عقد نقدي';
    end if;

    perform 1 from public.installment where contract_id = r.contract_id for update;
    select coalesce(sum(amount_due - amount_paid), 0) into v_remaining
    from public.installment where contract_id = r.contract_id;
    if round(r.amount, 2) > v_remaining then
      raise exception 'المبلغ أكبر من المتبقي على العقد';
    end if;

    v_total := v_total + round(r.amount, 2);
  end loop;

  return v_total;
end $$;
revoke all on function public.fn_check_payment_lines(uuid, uuid, jsonb) from public;
revoke execute on function public.fn_check_payment_lines(uuid, uuid, jsonb) from anon, authenticated;

-- Writes one installment payment_line per (already validated) line and allocates it.
create or replace function public.fn_apply_payment_lines(p_payment uuid, p_tenant uuid, p_lines jsonb)
returns void language plpgsql security definer set search_path = '' as $$
declare r record;
begin
  for r in
    select (e->>'contract_id')::uuid as contract_id, round((e->>'amount')::numeric, 2) as amount
    from jsonb_array_elements(p_lines) e
  loop
    insert into public.payment_line(payment_id, contract_id, tenant_id, amount, kind)
    values (p_payment, r.contract_id, p_tenant, r.amount, 'installment');
    perform public.allocate_payment(p_payment, r.contract_id, r.amount);
  end loop;
end $$;
revoke all on function public.fn_apply_payment_lines(uuid, uuid, jsonb) from public;
revoke execute on function public.fn_apply_payment_lines(uuid, uuid, jsonb) from anon, authenticated;

-- ---- record_payment: same behavior as 0014, validation moved to the shared helpers ----
create or replace function public.record_payment(
  p_id uuid, p_customer uuid, p_method text, p_lines jsonb
) returns uuid language plpgsql security definer set search_path = '' as $$
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

  v_total := public.fn_check_payment_lines(v_tenant, p_customer, p_lines);

  insert into public.payment(id, tenant_id, customer_id, contract_id, amount, method, received_at)
  values (p_id, v_tenant, p_customer,
          case when jsonb_array_length(p_lines) = 1 then (p_lines->0->>'contract_id')::uuid end,
          v_total, p_method, now());

  perform public.fn_apply_payment_lines(p_id, v_tenant, p_lines);

  return p_id;
end $$;
revoke all on function public.record_payment(uuid, uuid, text, jsonb) from public;
revoke execute on function public.record_payment(uuid, uuid, text, jsonb) from anon;
grant execute on function public.record_payment(uuid, uuid, text, jsonb) to authenticated;

-- ---- update_payment ----
-- Reverses the payment's allocations, replaces its lines, re-validates against the restored
-- balances and re-allocates — all in the caller's transaction, so any rejection leaves the
-- payment exactly as it was. Down payments and cash-sale payments are part of the sale and
-- are not editable here.
create or replace function public.update_payment(p_id uuid, p_method text, p_lines jsonb)
returns uuid language plpgsql security definer set search_path = '' as $$
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
end $$;
revoke all on function public.update_payment(uuid, text, jsonb) from public;
revoke execute on function public.update_payment(uuid, text, jsonb) from anon;
grant execute on function public.update_payment(uuid, text, jsonb) to authenticated;
