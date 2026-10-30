-- Notah Phase 1, Task 3: record_payment splits one receipt across several contracts.

drop function public.record_payment(uuid, uuid, uuid, numeric, text);

-- p_lines = [{"contract_id": uuid, "amount": number}, ...]
create or replace function public.record_payment(
  p_id uuid, p_customer uuid, p_method text, p_lines jsonb
) returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_tenant  uuid := public.current_tenant_id();
  v_total   numeric(14,2) := 0;
  v_contract uuid;
  v_amount  numeric(14,2);
  v_remaining numeric(14,2);
  r         record;
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

  if p_lines is null or jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) = 0 then
    raise exception 'لازم تحدد عقد واحد على الأقل';
  end if;

  -- validate every line; contracts are visited in id order so concurrent payments lock
  -- installment rows in the same order (no deadlock)
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
                      where id = r.contract_id and tenant_id = v_tenant and customer_id = p_customer) then
      raise exception 'العقد غير موجود أو لا يخص هذا العميل';
    end if;
    if r.contract_id is not distinct from v_contract then
      raise exception 'العقد مكرر في نفس الدفعة';
    end if;
    v_contract := r.contract_id;
    if (select sale_type from public.contract where id = r.contract_id) = 'cash' then
      raise exception 'لا يمكن تحصيل أقساط على عقد نقدي';
    end if;

    -- lock the installments first, THEN read the balance: two concurrent payments
    -- cannot both pass the remaining check
    perform 1 from public.installment where contract_id = r.contract_id for update;
    select coalesce(sum(amount_due - amount_paid), 0) into v_remaining
    from public.installment where contract_id = r.contract_id;
    if round(r.amount, 2) > v_remaining then
      raise exception 'المبلغ أكبر من المتبقي على العقد';
    end if;

    v_total := v_total + round(r.amount, 2);
  end loop;

  insert into public.payment(id, tenant_id, customer_id, contract_id, amount, method, received_at)
  values (p_id, v_tenant, p_customer,
          case when jsonb_array_length(p_lines) = 1 then (p_lines->0->>'contract_id')::uuid end,
          v_total, p_method, now());

  for r in
    select (e->>'contract_id')::uuid as contract_id, round((e->>'amount')::numeric, 2) as amount
    from jsonb_array_elements(p_lines) e
  loop
    insert into public.payment_line(payment_id, contract_id, tenant_id, amount, kind)
    values (p_id, r.contract_id, v_tenant, r.amount, 'installment');
    perform public.allocate_payment(p_id, r.contract_id, r.amount);
  end loop;

  return p_id;
end $$;
revoke all on function public.record_payment(uuid, uuid, text, jsonb) from public;
revoke execute on function public.record_payment(uuid, uuid, text, jsonb) from anon;
grant execute on function public.record_payment(uuid, uuid, text, jsonb) to authenticated;
