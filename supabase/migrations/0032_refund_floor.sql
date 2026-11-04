-- Refund floor: a refund can never exceed the money received. A payment edit that would leave an
-- invoice's installment payment lines totalling less than that invoice's refunds is refused (22023).
-- update_payment_apply is recreated from 0031 with one added guard, after the new lines are written
-- and before the refund-aware re-allocation; it covers both the edited-down and the moved-off case.

create or replace function public.update_payment_apply(p_id uuid, p_method text, p_lines jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tenant    uuid := public.current_tenant_id();
  v_pay       public.payment%rowtype;
  v_before    jsonb;
  v_total     numeric(14,2);
  v_contract  uuid;
  v_contracts uuid[] := array[]::uuid[];
  r           record;
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

  -- lock every affected contract's installments (old lines, old allocations + new lines of this
  -- customer/shop) in contract-id order — the same order record_payment uses. Old lines count too:
  -- after a correction refund a payment can have a line with nothing allocated.
  for v_contract in
    select pl.contract_id from public.payment_line pl where pl.payment_id = p_id
    union
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
    v_contracts := v_contracts || v_contract;
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

  -- new lines: allocate directly on invoices without refunds (as fn_apply_payment_lines does)
  for r in
    select (e->>'contract_id')::uuid as contract_id, round((e->>'amount')::numeric, 2) as amount
    from jsonb_array_elements(p_lines) e
  loop
    insert into public.payment_line(payment_id, contract_id, tenant_id, amount, kind)
    values (p_id, r.contract_id, v_tenant, r.amount, 'installment');
    if not exists (select 1 from public.refund where contract_id = r.contract_id) then
      if public.allocate_payment(p_id, r.contract_id, r.amount) > 0 then
        raise exception 'المبلغ أكبر من المتبقي على العقد';
      end if;
    end if;
  end loop;

  -- a refund can never exceed the money received on the invoice (old lines and new lines)
  if exists (select 1 from unnest(v_contracts) x
              where (select coalesce(sum(amount), 0) from public.refund where contract_id = x)
                  > (select coalesce(sum(amount), 0) from public.payment_line
                      where contract_id = x and kind = 'installment')) then
    raise exception 'الدفعات على الفاتورة كده هتبقى أقل من اللي اترد للعميل' using errcode = '22023';
  end if;

  -- invoices with refunds (old or new lines): rebuild the whole invoice net of its refunds
  for v_contract in
    select x from unnest(v_contracts) x
     where exists (select 1 from public.refund where contract_id = x)
     order by 1
  loop
    if public.fn_reallocate_contract(v_contract) > 0 then
      raise exception 'المبلغ أكبر من المتبقي على العقد';
    end if;
  end loop;

  insert into public.audit_log(tenant_id, user_id, action, entity_type, entity_id, before_json, after_json)
  values (v_tenant, auth.uid(), 'payment_edit', 'payment', p_id, v_before,
    jsonb_build_object('amount', v_total, 'method', p_method,
      'lines', (select jsonb_agg(jsonb_build_object('contract_id', contract_id, 'amount', amount)
                                 order by contract_id)
                from public.payment_line where payment_id = p_id)));

  return p_id;
end $$;
