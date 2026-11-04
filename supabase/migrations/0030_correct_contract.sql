-- Invoice correction: correct_contract (owner only, idempotent on the client op id) fixes typos on an
-- invoice. On an installment invoice a money/date change rebuilds the schedule with build_schedule,
-- moves the down payment with it, and re-allocates the invoice's installment payments oldest-first;
-- money that no longer fits becomes one refund (reason 'correction'). Payments are never moved in
-- time: received_at and payment_line amounts of installment payments stay as they were.
-- v_contract_history: corrections, cancels and payment edits per invoice.

-- 1. correct_contract -----------------------------------------------------------------------
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
  v_line      record;
  v_budget    numeric(14,2);
  v_remaining numeric(14,2);
  v_take      numeric(14,2);
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
  select a.after_json->'result' into v_result
    from public.audit_log a
   where a.action = 'contract_correct' and a.tenant_id = v_tenant
     and a.after_json->>'op_id' = p_id::text
   limit 1;
  if v_result is not null then
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
    v_rate  := case when p ? 'rate' then (p->>'rate')::numeric else v_old_rate end;
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

    -- re-allocate the installment payments, oldest first, capped at the balance. Money already
    -- refunded by an earlier correction is not this invoice's any more, so it is left out.
    select coalesce(sum(pl.amount), 0) into v_budget
      from public.payment_line pl where pl.contract_id = p_contract and pl.kind = 'installment';
    v_budget := v_budget - (select coalesce(sum(amount), 0) from public.refund
                             where contract_id = p_contract and tenant_id = v_tenant);
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
     where contract_id = p_contract;

    -- what no longer fits is refunded (decision 2)
    v_refund := greatest(v_budget, 0);
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

revoke all on function public.correct_contract(uuid, uuid, jsonb, text) from public;
revoke execute on function public.correct_contract(uuid, uuid, jsonb, text) from anon;
grant execute on function public.correct_contract(uuid, uuid, jsonb, text) to authenticated;

-- idempotency lookup
create index audit_log_correct_op_idx on public.audit_log ((after_json->>'op_id'))
  where action = 'contract_correct';
-- history lookups
create index audit_log_contract_history_idx on public.audit_log (entity_id, created_at desc)
  where entity_type = 'contract' and action in ('contract_correct', 'contract_cancel');
create index audit_log_payment_edit_idx on public.audit_log (tenant_id, created_at desc)
  where action = 'payment_edit';

-- 2. v_contract_history ---------------------------------------------------------------------
-- One row per correction or cancel of an invoice, plus one row per edit of a payment that has
-- (after the edit) or had (before it) a line on that invoice. RLS on audit_log scopes it to the shop.
create or replace view public.v_contract_history with (security_invoker = true) as
select a.entity_id as contract_id, a.created_at as at, a.action, a.before_json, a.after_json
  from public.audit_log a
 where a.entity_type = 'contract' and a.action in ('contract_correct', 'contract_cancel')
union all
select x.contract_id, a.created_at as at, a.action, a.before_json, a.after_json
  from public.audit_log a
  cross join lateral (
    select distinct (e->>'contract_id')::uuid as contract_id
      from jsonb_array_elements(
             case when jsonb_typeof(a.before_json->'lines') = 'array' then a.before_json->'lines' else '[]'::jsonb end
          || case when jsonb_typeof(a.after_json->'lines') = 'array' then a.after_json->'lines' else '[]'::jsonb end) e
  ) x
 where a.action = 'payment_edit' and a.entity_type = 'payment';

revoke select on public.v_contract_history from anon;
