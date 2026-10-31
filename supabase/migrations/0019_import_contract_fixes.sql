-- 0019: import_contract hardening.
--  * imported down payment is flagged is_opening (it is money from before Notah, never "collected this month")
--  * first_due may not be later than Cairo today + 1 month
--  * installment count capped at 600
--  * schedule independent of the session time zone
create or replace function public.import_contract(p jsonb) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_tenant   uuid := public.current_tenant_id();
  v_id       uuid;
  v_customer uuid;
  v_desc     text;
  v_total    numeric(14,2);
  v_down     numeric(14,2);
  v_monthly  numeric(14,2);
  v_rem      numeric(14,2);
  v_first    date;
  v_paid     int;
  v_count_n  numeric;
  v_count    int;
  v_sale     date;
  v_day      int;
  v_pay      uuid;
  v_amount   numeric(14,2);
  v_last_due date;
begin
  if v_tenant is null or public.current_role() not in ('owner','manager','accountant') then
    raise exception 'غير مصرح لك بتسجيل البيع';
  end if;

  v_id := nullif(p->>'id','')::uuid;
  if v_id is null then raise exception 'رقم العملية مطلوب'; end if;

  perform pg_advisory_xact_lock(hashtext(v_id::text));

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

  v_total := (p->>'total_price')::numeric;
  if v_total is null or v_total <= 0 then raise exception 'السعر لازم يكون أكبر من صفر'; end if;

  v_down := coalesce(nullif(p->>'down_payment','')::numeric, 0);
  if v_down < 0 or v_down >= v_total then raise exception 'المقدم لازم يكون أقل من المبلغ الكلي'; end if;

  v_rem := v_total - v_down;
  v_monthly := (p->>'monthly')::numeric;
  if v_monthly is null or v_monthly <= 0 or v_monthly > v_rem then
    raise exception 'القسط الشهري لازم يكون أكبر من صفر ومش أكبر من الباقي';
  end if;

  v_first := nullif(p->>'first_due','')::date;
  if v_first is null then raise exception 'تاريخ أول قسط مطلوب'; end if;
  if v_first > ((now() at time zone 'Africa/Cairo')::date + interval '1 month')::date then
    raise exception 'أول شهر اتدفع بعيد في المستقبل';
  end if;

  v_count_n := ceil(v_rem / v_monthly);
  if v_count_n > 600 then raise exception 'عدد الأقساط كبير جدًا، راجع القسط الشهري'; end if;
  v_count := v_count_n::int;

  v_paid := coalesce(nullif(p->>'paid_months','')::int, 0);
  if v_paid < 0 or v_paid > v_count then
    raise exception 'عدد الشهور المدفوعة أكبر من عدد الأقساط';
  end if;

  v_sale := (v_first::timestamp - interval '1 month')::date;
  v_day  := extract(day from v_first)::int;

  insert into public.contract(id, tenant_id, customer_id, product_desc, total_price, down_payment,
                              interest_rate, interest_method, num_installments, start_date,
                              sale_type, external_invoice_no)
  values (v_id, v_tenant, v_customer, v_desc, v_total, v_down,
          0, 'imported', v_count, v_sale,
          'installment', nullif(btrim(p->>'external_invoice_no'),''));

  insert into public.installment(contract_id, tenant_id, seq_no, due_date, amount_due)
  select v_id, v_tenant, g.i,
         (m.first_of_month + (least(v_day, extract(day from (m.first_of_month + interval '1 month - 1 day'))::int) - 1))::date,
         case when g.i < v_count then v_monthly else v_rem - v_monthly * (v_count - 1) end
  from generate_series(1, v_count) as g(i)
  cross join lateral (select (date_trunc('month', v_first::timestamp) + make_interval(months => g.i - 1))::date as first_of_month) m;

  if v_down > 0 then
    insert into public.payment(tenant_id, customer_id, contract_id, amount, method, received_at, is_opening)
    values (v_tenant, v_customer, v_id, v_down, 'cash', least(v_sale::timestamptz, now()), true)
    returning id into v_pay;
    insert into public.payment_line(payment_id, contract_id, tenant_id, amount, kind)
    values (v_pay, v_id, v_tenant, v_down, 'down_payment');
  end if;

  if v_paid > 0 then
    select sum(amount_due) into v_amount from public.installment
    where contract_id = v_id and seq_no <= v_paid;
    select due_date into v_last_due from public.installment
    where contract_id = v_id and seq_no = v_paid;

    insert into public.payment(tenant_id, customer_id, contract_id, amount, method, received_at, is_opening)
    values (v_tenant, v_customer, v_id, v_amount, 'cash', least(v_last_due::timestamptz, now()), true)
    returning id into v_pay;
    perform public.fn_apply_payment_lines(v_pay, v_tenant,
      jsonb_build_array(jsonb_build_object('contract_id', v_id, 'amount', v_amount)));
  end if;

  update public.installment
  set status = public.installment_status(amount_due, amount_paid, due_date)
  where contract_id = v_id;

  return v_id;
end $$;
revoke all on function public.import_contract(jsonb) from public;
revoke execute on function public.import_contract(jsonb) from anon;
grant execute on function public.import_contract(jsonb) to authenticated;
