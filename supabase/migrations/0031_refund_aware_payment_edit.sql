-- Refund-aware payment edits. A correction refund (0030) is money that left the invoice but is still
-- written in its payments' installment lines. Everything that rebuilds allocations must count an
-- invoice's money as "installment lines − refunds", never the raw lines:
--   * fn_reallocate_contract: rebuilds one invoice's allocations from scratch, oldest payment first,
--     on that net budget. Used by correct_contract and by update_payment_apply.
--   * fn_check_payment_lines: on an invoice with refunds, the room left is due − (lines − refunds).
--   * update_payment_apply: on an invoice with refunds, re-allocates the whole invoice with
--     fn_reallocate_contract instead of re-applying the one payment. Invoices without refunds keep
--     the old per-payment path, so other payments' allocations still don't move there.
--   * correct_contract: uses fn_reallocate_contract; a reused op id with another invoice → 22023;
--     the incoming rate is normalised to the column precision before comparing.

-- 1. fn_reallocate_contract -----------------------------------------------------------------
-- Caller holds the contract and installment locks. Returns the money that does not fit (≥ 0).
create or replace function public.fn_reallocate_contract(p_contract uuid)
returns numeric
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_budget    numeric(14,2);
  v_remaining numeric(14,2);
  v_take      numeric(14,2);
  v_line      record;
begin
  delete from public.payment_allocation pa
   using public.installment i
   where pa.installment_id = i.id and i.contract_id = p_contract;
  update public.installment
     set amount_paid = 0, paid_at = null,
         status = case when status = 'waived' then status else 'pending' end
   where contract_id = p_contract
     and (amount_paid <> 0 or paid_at is not null or status not in ('pending', 'waived'));

  -- money already refunded is not this invoice's any more
  select coalesce(sum(pl.amount), 0) into v_budget
    from public.payment_line pl where pl.contract_id = p_contract and pl.kind = 'installment';
  v_budget := v_budget - (select coalesce(sum(amount), 0) from public.refund where contract_id = p_contract);

  for v_line in
    select pl.payment_id, pl.amount
      from public.payment_line pl join public.payment pay on pay.id = pl.payment_id
     where pl.contract_id = p_contract and pl.kind = 'installment'
     order by pay.received_at, pay.id
  loop
    select coalesce(sum(amount_due - amount_paid), 0) into v_remaining
      from public.installment where contract_id = p_contract;
    v_take := least(v_line.amount, v_budget, v_remaining);
    exit when v_take <= 0;
    perform public.allocate_payment(v_line.payment_id, p_contract, v_take);
    v_budget := v_budget - v_take;
  end loop;

  update public.installment
     set status = public.installment_status(amount_due, amount_paid, due_date)
   where contract_id = p_contract and status <> 'waived';

  return greatest(v_budget, 0);
end $$;

revoke all on function public.fn_reallocate_contract(uuid) from public;
revoke execute on function public.fn_reallocate_contract(uuid) from anon, authenticated;

-- 2. fn_check_payment_lines: room left is net of refunds -------------------------------------
create or replace function public.fn_check_payment_lines(p_tenant uuid, p_customer uuid, p_lines jsonb)
returns numeric
language plpgsql
security definer
set search_path = ''
as $$
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
    if exists (select 1 from public.refund where contract_id = r.contract_id) then
      -- after a correction refund some line money is not the invoice's: count lines − refunds
      select coalesce(sum(amount_due), 0)
             - ((select coalesce(sum(amount), 0) from public.payment_line
                  where contract_id = r.contract_id and kind = 'installment')
                - (select coalesce(sum(amount), 0) from public.refund where contract_id = r.contract_id))
        into v_remaining
        from public.installment where contract_id = r.contract_id;
    else
      select coalesce(sum(amount_due - amount_paid), 0) into v_remaining
      from public.installment where contract_id = r.contract_id;
    end if;
    if round(r.amount, 2) > v_remaining then
      raise exception 'المبلغ أكبر من المتبقي على العقد';
    end if;

    v_total := v_total + round(r.amount, 2);
  end loop;

  return v_total;
end $$;

-- 3. update_payment_apply: invoices with refunds are re-allocated whole, net of refunds ------
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

-- 4. correct_contract: shared re-allocation, op id bound to one invoice, rate precision -------
create or replace function public.correct_contract(p_id uuid, p_contract uuid, p jsonb, p_refund_method text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tenant    uuid := public.current_tenant_id();
  v_today     date := (now() at time zone 'Africa/Cairo')::date;
  v_c         public.contract%rowtype;
  v_kind      text;     -- 'installment' | 'cash' | 'imported'
  v_allowed   text[];
  v_bad       text;
  v_old_rate  numeric;
  v_old_years int;
  v_desc      text;
  v_ext       text;
  v_price     numeric(14,2);
  v_down      numeric(14,2);
  v_rate      numeric;
  v_years     int;
  v_date      date;
  v_money     boolean;
  v_result    jsonb;
  v_line_id   uuid;
  v_pay       uuid;
  v_prev      uuid;
  v_refund    numeric(14,2) := 0;
  v_total     numeric(14,2);
  v_msg_ids   uuid[];
  v_msg_seqs  int[];
begin
  if v_tenant is null or public.current_role() is distinct from 'owner' then
    raise exception 'owner only' using errcode = '42501';
  end if;
  if p_id is null then
    raise exception 'رقم العملية مطلوب' using errcode = '22023';
  end if;

  -- same idempotency pattern as record_payment / cancel_contract
  perform pg_advisory_xact_lock(hashtext(p_id::text));
  select a.after_json->'result', a.entity_id into v_result, v_prev
    from public.audit_log a
   where a.action = 'contract_correct' and a.tenant_id = v_tenant
     and a.after_json->>'op_id' = p_id::text
   limit 1;
  if v_result is not null then
    -- an op id belongs to one invoice: reusing it for another is a client bug, not a retry
    if v_prev is distinct from p_contract then
      raise exception 'رقم العملية مستخدم لفاتورة تانية' using errcode = '22023';
    end if;
    return v_result;
  end if;

  -- locks the contract: record_payment / update_payment share-lock it before touching installments
  select * into v_c from public.contract where id = p_contract and tenant_id = v_tenant for update;
  if not found then
    raise exception 'الفاتورة مش موجودة' using errcode = '42501';
  end if;
  if v_c.status = 'void' then
    raise exception 'الفاتورة دي ملغية ومش بتتعدل' using errcode = '22023';
  end if;

  if p is null or jsonb_typeof(p) <> 'object' then
    raise exception 'بيانات التعديل غير صحيحة' using errcode = '22023';
  end if;

  -- which keys each kind of invoice takes (decision 1)
  v_kind := case when v_c.sale_type = 'cash' then 'cash'
                 when v_c.interest_method = 'imported' then 'imported'
                 else 'installment' end;
  v_allowed := case v_kind
    when 'installment' then array['product_desc','external_invoice_no','price','down_payment','rate','years','sale_date']
    when 'cash'        then array['product_desc','external_invoice_no','price','sale_date']
    else                    array['product_desc','external_invoice_no'] end;
  select k into v_bad from jsonb_object_keys(p) k where not (k = any(v_allowed)) limit 1;
  if v_bad is not null then
    raise exception 'الحقل ده مش بيتعدل في الفاتورة دي: %', v_bad using errcode = '22023';
  end if;

  v_old_rate  := trim_scale(v_c.interest_rate * 100);
  v_old_years := v_c.num_installments / 12;

  -- a missing key means unchanged
  begin
    v_desc  := case when p ? 'product_desc' then btrim(p->>'product_desc') else v_c.product_desc end;
    v_ext   := case when p ? 'external_invoice_no' then nullif(btrim(coalesce(p->>'external_invoice_no', '')), '')
                    else v_c.external_invoice_no end;
    v_price := case when p ? 'price' then round((p->>'price')::numeric, 2) else v_c.total_price end;
    v_down  := case when p ? 'down_payment' then round((p->>'down_payment')::numeric, 2) else v_c.down_payment end;
    -- stored as a fraction in numeric(6,4): normalise first so resending the same rate is unchanged
    v_rate  := case when p ? 'rate' then trim_scale(round((p->>'rate')::numeric / 100, 4) * 100) else v_old_rate end;
    v_years := case when p ? 'years' then (p->>'years')::int else v_old_years end;
    v_date  := case when p ? 'sale_date' then (p->>'sale_date')::date else v_c.start_date end;
  exception when invalid_text_representation or numeric_value_out_of_range
                 or invalid_datetime_format or datetime_field_overflow then
    raise exception 'بيانات التعديل غير صحيحة' using errcode = '22023';
  end;

  -- the same checks create_sale makes
  if p ? 'product_desc' and coalesce(v_desc, '') = '' then
    raise exception 'اسم المنتج مطلوب' using errcode = '22023';
  end if;
  if v_price is null or v_price <= 0 then
    raise exception 'السعر لازم يكون أكبر من صفر' using errcode = '22023';
  end if;
  if v_date is null or v_date > v_today then
    raise exception 'تاريخ البيع لا يمكن أن يكون في المستقبل' using errcode = '22023';
  end if;
  if v_kind = 'installment' then
    if v_down is null or v_down < 0 or v_down >= v_price then
      raise exception 'المقدم لازم يكون أقل من السعر' using errcode = '22023';
    end if;
    if v_rate is null or v_rate < 0 or v_rate > 200 then
      raise exception 'نسبة الفائدة لازم تكون بين 0 و 200' using errcode = '22023';
    end if;
    if v_years is null or v_years < 1 or v_years > 5 then
      raise exception 'عدد السنين لازم يكون من 1 إلى 5' using errcode = '22023';
    end if;
  elsif v_kind = 'cash' then
    v_down := v_price;
  end if;

  v_money := v_kind <> 'imported'
    and (v_price <> v_c.total_price or v_date <> v_c.start_date
         or (v_kind = 'installment'
             and (v_down <> v_c.down_payment or v_rate <> v_old_rate or v_years <> v_old_years)));

  -- nothing changes: write nothing
  if not v_money
     and v_desc is not distinct from v_c.product_desc
     and v_ext is not distinct from v_c.external_invoice_no then
    return jsonb_build_object('refund', 0, 'total',
      case when v_kind = 'cash' then v_c.total_price
           else v_c.down_payment + (select coalesce(sum(amount_due), 0) from public.installment
                                     where contract_id = p_contract) end);
  end if;

  if v_kind = 'cash' and v_price <> v_c.total_price then
    -- the cash payment follows the price (decision 2)
    select pl.id, pl.payment_id into v_line_id, v_pay
      from public.payment_line pl
     where pl.contract_id = p_contract and pl.kind = 'cash'
     order by pl.id limit 1;
    if v_line_id is not null then
      if (select count(*) from public.payment_line where payment_id = v_pay) > 1
         or exists (select 1 from public.payment_allocation where payment_id = v_pay) then
        raise exception 'الفاتورة دي مرتبطة بدفعة فيها فواتير تانية، عدّل الدفعة الأول' using errcode = '22023';
      end if;
      update public.payment_line set amount = v_price where id = v_line_id;
      update public.payment set amount = v_price, edited_at = now() where id = v_pay;
    end if;
  end if;

  if v_kind = 'installment' and v_money then
    perform 1 from public.installment where contract_id = p_contract order by seq_no for update;

    -- reminders point at installments: detach them now, re-point them by seq_no after the rebuild
    select array_agg(m.id), array_agg(i.seq_no) into v_msg_ids, v_msg_seqs
      from public.message_log m join public.installment i on i.id = m.installment_id
     where i.contract_id = p_contract;
    if v_msg_ids is not null then
      update public.message_log set installment_id = null where id = any(v_msg_ids);
    end if;

    delete from public.payment_allocation pa
     using public.installment i
     where pa.installment_id = i.id and i.contract_id = p_contract;
    delete from public.installment where contract_id = p_contract;

    -- the down payment follows (decision 2)
    if v_down <> v_c.down_payment then
      select pl.id, pl.payment_id into v_line_id, v_pay
        from public.payment_line pl
       where pl.contract_id = p_contract and pl.kind = 'down_payment'
       order by pl.id limit 1;
      if v_line_id is not null then
        if (select count(*) from public.payment_line where payment_id = v_pay) > 1
           or exists (select 1 from public.payment_allocation where payment_id = v_pay) then
          raise exception 'الفاتورة دي مرتبطة بدفعة فيها فواتير تانية، عدّل الدفعة الأول' using errcode = '22023';
        end if;
        if v_down > 0 then
          update public.payment_line set amount = v_down where id = v_line_id;
          update public.payment set amount = v_down, edited_at = now() where id = v_pay;
        else
          delete from public.payment_line where id = v_line_id;
          delete from public.payment where id = v_pay;
        end if;
      elsif v_down > 0 then
        insert into public.payment(tenant_id, customer_id, contract_id, amount, method, received_at)
        values (v_tenant, v_c.customer_id, p_contract, v_down, 'cash', least(v_date::timestamptz, now()))
        returning id into v_pay;
        insert into public.payment_line(payment_id, contract_id, tenant_id, amount, kind)
        values (v_pay, p_contract, v_tenant, v_down, 'down_payment');
      end if;
    end if;

    update public.contract
       set product_desc = v_desc, external_invoice_no = v_ext,
           total_price = v_price, down_payment = v_down,
           interest_rate = v_rate / 100, interest_method = 'flat',
           num_installments = v_years * 12, start_date = v_date
     where id = p_contract;

    -- the same schedule call create_sale makes
    insert into public.installment(contract_id, tenant_id, seq_no, due_date, amount_due)
    select p_contract, v_tenant, s.seq_no, s.due_date, s.amount_due
      from public.build_schedule(v_price - v_down, v_rate / 100, v_years * 12, v_date, 'flat') s;

    if v_msg_ids is not null then
      update public.message_log m
         set installment_id = n.id
        from unnest(v_msg_ids, v_msg_seqs) as u(mid, seq)
        join public.installment n on n.contract_id = p_contract and n.seq_no = u.seq
       where m.id = u.mid;
    end if;

    -- re-allocate the installment payments net of earlier refunds (shared with update_payment_apply)
    v_refund := public.fn_reallocate_contract(p_contract);

    -- what no longer fits is refunded (decision 2)
    if v_refund > 0 then
      if p_refund_method is null or p_refund_method not in ('cash','instapay','fawry','wallet','card','bank') then
        raise exception 'طريقة رد الفلوس مطلوبة' using errcode = '22023';
      end if;
      insert into public.refund(tenant_id, contract_id, customer_id, amount, method, reason, op_id, created_by)
      values (v_tenant, p_contract, v_c.customer_id, v_refund, p_refund_method, 'correction', p_id, auth.uid());
    end if;
  else
    update public.contract
       set product_desc = v_desc, external_invoice_no = v_ext,
           total_price = v_price, down_payment = v_down, start_date = v_date
     where id = p_contract;
  end if;

  v_total := case when v_kind = 'cash' then v_price
                  else v_down + (select coalesce(sum(amount_due), 0) from public.installment
                                  where contract_id = p_contract) end;
  v_result := jsonb_build_object('refund', v_refund, 'total', v_total);

  insert into public.audit_log(tenant_id, user_id, action, entity_type, entity_id, before_json, after_json)
  values (v_tenant, auth.uid(), 'contract_correct', 'contract', p_contract,
    jsonb_build_object('product_desc', v_c.product_desc, 'external_invoice_no', v_c.external_invoice_no,
      'price', v_c.total_price,
      'down_payment', case when v_kind <> 'cash' then v_c.down_payment end,
      'rate', case when v_kind = 'installment' then v_old_rate end,
      'years', case when v_kind = 'installment' then v_old_years end,
      'sale_date', v_c.start_date),
    jsonb_build_object('product_desc', v_desc, 'external_invoice_no', v_ext,
      'price', v_price,
      'down_payment', case when v_kind <> 'cash' then v_down end,
      'rate', case when v_kind = 'installment' then v_rate end,
      'years', case when v_kind = 'installment' then v_years end,
      'sale_date', v_date,
      'op_id', p_id, 'result', v_result));

  return v_result;
end $$;
