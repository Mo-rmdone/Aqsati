-- supabase/tests/update_payment_test.sql
begin;
create temp table tap(n serial, l text);
insert into tap(l) select plan(26);

-- one contract's schedule as text: seq:status:amount_paid:has_paid_at
create function pg_temp.sched(c uuid) returns text language sql stable as $$
  select string_agg(seq_no || ':' || status || ':' || amount_paid || ':' || (paid_at is not null), ',' order by seq_no)
  from public.installment where contract_id = c $$;
-- one payment's full state as text: amount/method/contract/edited_at | lines | allocations
create function pg_temp.pay(p uuid) returns text language sql stable as $$
  select (select amount || '/' || method || '/' || coalesce(contract_id::text, '-') || '/' || coalesce(edited_at::text, '-')
          from public.payment where id = p)
      || '|' || coalesce((select string_agg(contract_id || ':' || amount || ':' || kind, ',' order by contract_id)
                          from public.payment_line where payment_id = p), '-')
      || '|' || coalesce((select string_agg(installment_id || ':' || amount, ',' order by installment_id)
                          from public.payment_allocation where payment_id = p), '-') $$;

-- shop B first (foreign payment), shop A last so the JWT is A's
do $$
declare b uuid; a uuid; cb uuid; ca uuid; ca2 uuid; r uuid; bc uuid := gen_random_uuid();
begin
  b := tests.as_new_owner('Shop B');
  insert into public.customer(tenant_id, name, phone) values (b, 'CB', '01012345678') returning id into cb;
  r := public.create_sale(jsonb_build_object('id', bc, 'customer_id', cb,
    'product_desc', 'B item', 'sale_type', 'installment', 'total_price', 25000, 'sale_date', current_date::text,
    'down_payment', 10000, 'rate_percent', 30, 'years', 2));
  perform set_config('t.bpay', (select payment_id::text from public.payment_line where contract_id = bc), true);
  a := tests.as_new_owner('Shop A');
  insert into public.customer(tenant_id, name, phone) values (a, 'CA', '01012345678') returning id into ca;
  insert into public.customer(tenant_id, name, phone) values (a, 'CA2', '01012345679') returning id into ca2;
  perform set_config('t.a', a::text, true);
  perform set_config('t.ca', ca::text, true);
  perform set_config('t.ca2', ca2::text, true);
  perform set_config('t.uid', (select id::text from public.profile where tenant_id = a), true);
  -- contracts: f/w (5000 -> 500), g (two payments), h/i (move), cash (cash sale), x (other customer)
  perform set_config('t.f', gen_random_uuid()::text, true);
  perform set_config('t.w', gen_random_uuid()::text, true);
  perform set_config('t.g', gen_random_uuid()::text, true);
  perform set_config('t.h', gen_random_uuid()::text, true);
  perform set_config('t.i', gen_random_uuid()::text, true);
  perform set_config('t.cash', gen_random_uuid()::text, true);
  perform set_config('t.x', gen_random_uuid()::text, true);
  -- payments
  perform set_config('t.p1', gen_random_uuid()::text, true);  -- 5000 on f, edited to 500
  perform set_config('t.p2', gen_random_uuid()::text, true);  -- fresh 500 on w
  perform set_config('t.pa', gen_random_uuid()::text, true);  -- 1000 on g, edited to 200
  perform set_config('t.pb', gen_random_uuid()::text, true);  -- 1000 on g, untouched
  perform set_config('t.p3', gen_random_uuid()::text, true);  -- 1000 on h, moved to i
end $$;

set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', current_setting('t.uid'), 'role', 'authenticated')::text, true);
do $$
declare r uuid; c text;
  sale jsonb := jsonb_build_object('customer_id', current_setting('t.ca'), 'product_desc', 'Item',
    'sale_type', 'installment', 'total_price', 25000, 'sale_date', current_date::text,
    'down_payment', 10000, 'rate_percent', 30, 'years', 2);
begin
  foreach c in array array['t.f','t.w','t.g','t.h','t.i'] loop
    r := public.create_sale(sale || jsonb_build_object('id', current_setting(c)));
  end loop;
  r := public.create_sale(jsonb_build_object('id', current_setting('t.cash'), 'customer_id', current_setting('t.ca'),
    'product_desc', 'TV', 'sale_type', 'cash', 'total_price', 7000, 'sale_date', current_date::text));
  r := public.create_sale(sale || jsonb_build_object('id', current_setting('t.x'), 'customer_id', current_setting('t.ca2')));

  -- 1. 5000 on f edited to 500; fresh 500 on w is the reference
  r := public.record_payment(current_setting('t.p1')::uuid, current_setting('t.ca')::uuid, 'cash',
    jsonb_build_array(jsonb_build_object('contract_id', current_setting('t.f'), 'amount', 5000)));
  r := public.update_payment(current_setting('t.p1')::uuid, 'cash',
    jsonb_build_array(jsonb_build_object('contract_id', current_setting('t.f'), 'amount', 500)));
  perform set_config('t.r1', r::text, true);
  r := public.record_payment(current_setting('t.p2')::uuid, current_setting('t.ca')::uuid, 'cash',
    jsonb_build_array(jsonb_build_object('contract_id', current_setting('t.w'), 'amount', 500)));
  perform set_config('t.sched_f', pg_temp.sched(current_setting('t.f')::uuid), true);
  perform set_config('t.sched_w', pg_temp.sched(current_setting('t.w')::uuid), true);

  -- 2. two payments on g; edit A, B must not move
  r := public.record_payment(current_setting('t.pa')::uuid, current_setting('t.ca')::uuid, 'cash',
    jsonb_build_array(jsonb_build_object('contract_id', current_setting('t.g'), 'amount', 1000)));
  r := public.record_payment(current_setting('t.pb')::uuid, current_setting('t.ca')::uuid, 'cash',
    jsonb_build_array(jsonb_build_object('contract_id', current_setting('t.g'), 'amount', 1000)));
  perform set_config('t.pb_before', pg_temp.pay(current_setting('t.pb')::uuid), true);
  r := public.update_payment(current_setting('t.pa')::uuid, 'cash',
    jsonb_build_array(jsonb_build_object('contract_id', current_setting('t.g'), 'amount', 200)));

  -- 3. 1000 on h moved to i (and method changed)
  r := public.record_payment(current_setting('t.p3')::uuid, current_setting('t.ca')::uuid, 'cash',
    jsonb_build_array(jsonb_build_object('contract_id', current_setting('t.h'), 'amount', 1000)));
  r := public.update_payment(current_setting('t.p3')::uuid, 'instapay',
    jsonb_build_array(jsonb_build_object('contract_id', current_setting('t.i'), 'amount', 1000)));
  perform set_config('t.p3_after', pg_temp.pay(current_setting('t.p3')::uuid), true);
  perform set_config('t.sched_i', pg_temp.sched(current_setting('t.i')::uuid), true);

  -- 4. the full restored balance is allowed: w has 19000 left + this payment's own 500 = 19500
  r := public.update_payment(current_setting('t.p2')::uuid, 'cash',
    jsonb_build_array(jsonb_build_object('contract_id', current_setting('t.w'), 'amount', 19500)));

  -- rejections: each must leave the payment exactly as it was
  begin perform public.update_payment(current_setting('t.p3')::uuid, 'cash',
    jsonb_build_array(jsonb_build_object('contract_id', current_setting('t.i'), 'amount', 19500.01)));
  exception when others then perform set_config('t.e_over', sqlerrm, true); end;
  begin perform public.update_payment(current_setting('t.p3')::uuid, 'cash',
    jsonb_build_array(jsonb_build_object('contract_id', current_setting('t.x'), 'amount', 100)));
  exception when others then perform set_config('t.e_cust', sqlerrm, true); end;
  begin perform public.update_payment(current_setting('t.p3')::uuid, 'cash', '[]'::jsonb);
  exception when others then perform set_config('t.e_empty', sqlerrm, true); end;
  begin perform public.update_payment(current_setting('t.p3')::uuid, 'cheque',
    jsonb_build_array(jsonb_build_object('contract_id', current_setting('t.i'), 'amount', 100)));
  exception when others then perform set_config('t.e_method', sqlerrm, true); end;
  begin perform public.update_payment(current_setting('t.bpay')::uuid, 'cash',
    jsonb_build_array(jsonb_build_object('contract_id', current_setting('t.i'), 'amount', 100)));
  exception when others then perform set_config('t.e_shop', sqlerrm, true); end;
  begin perform public.update_payment(gen_random_uuid(), 'cash',
    jsonb_build_array(jsonb_build_object('contract_id', current_setting('t.i'), 'amount', 100)));
  exception when others then perform set_config('t.e_missing', sqlerrm, true); end;

  -- 6. down payment and cash-sale payment are part of the invoice
  perform set_config('t.down', (select payment_id::text from public.payment_line
                                 where contract_id = current_setting('t.f')::uuid and kind = 'down_payment'), true);
  perform set_config('t.cashpay', (select payment_id::text from public.payment_line
                                    where contract_id = current_setting('t.cash')::uuid and kind = 'cash'), true);
  perform set_config('t.down_before', pg_temp.pay(current_setting('t.down')::uuid), true);
  begin perform public.update_payment(current_setting('t.down')::uuid, 'cash',
    jsonb_build_array(jsonb_build_object('contract_id', current_setting('t.f'), 'amount', 100)));
  exception when others then perform set_config('t.e_down', sqlerrm, true); end;
  begin perform public.update_payment(current_setting('t.cashpay')::uuid, 'cash',
    jsonb_build_array(jsonb_build_object('contract_id', current_setting('t.f'), 'amount', 100)));
  exception when others then perform set_config('t.e_cashpay', sqlerrm, true); end;
end $$;
reset role;

-- 1. edit 5000 -> 500 restores installments and re-allocates
insert into tap(l) select is(current_setting('t.sched_f'), current_setting('t.sched_w'),
  'edit 5000 -> 500: schedule identical to a fresh 500 payment');
insert into tap(l) select is(
  (select paid from public.v_contract_balance where contract_id = current_setting('t.f')::uuid), 10500.00,
  'edit 5000 -> 500: contract paid = down 10000 + 500');
insert into tap(l) select is(
  (select amount from public.payment where id = current_setting('t.p1')::uuid)
  || '/' || (select sum(amount) from public.payment_allocation where payment_id = current_setting('t.p1')::uuid),
  '500.00/500.00', 'edit 5000 -> 500: payment amount and allocations are 500');
insert into tap(l) select is(current_setting('t.r1'), current_setting('t.p1'), 'update_payment returns the payment id');

-- 2. edit leaves other payments' allocations intact
insert into tap(l) select is(pg_temp.pay(current_setting('t.pb')::uuid), current_setting('t.pb_before'),
  'payment B unchanged after editing A');
insert into tap(l) select is(
  (select count(*)::int from public.installment where contract_id = current_setting('t.g')::uuid and amount_paid < 0), 0,
  'no installment amount_paid < 0');
insert into tap(l) select is(
  (select sum(pa.amount) from public.payment_allocation pa join public.installment i on i.id = pa.installment_id
   where i.contract_id = current_setting('t.g')::uuid)
  || '/' || (select sum(amount_paid) from public.installment where contract_id = current_setting('t.g')::uuid),
  '1200.00/1200.00', 'allocations and installments on g sum to 1200');
insert into tap(l) select is(
  (select status || ':' || amount_paid from public.installment where contract_id = current_setting('t.g')::uuid and seq_no = 1),
  'partial:200.00', 'A''s new 200 goes to the oldest installment #1 of g');

-- 3. edit can move money to another contract
insert into tap(l) select is(
  (select sum(amount_paid) || '/' || count(*) filter (where status <> 'pending' or paid_at is not null)
   from public.installment where contract_id = current_setting('t.h')::uuid),
  '0.00/0', 'h fully restored: nothing paid, all pending, no paid_at');
insert into tap(l) select is(
  (select paid from public.v_contract_balance where contract_id = current_setting('t.h')::uuid)
  || '/' || (select paid from public.v_contract_balance where contract_id = current_setting('t.i')::uuid),
  '10000.00/11000.00', 'balances: h back to down payment, i got the 1000');
insert into tap(l) select is(
  (select contract_id::text || '/' || method from public.payment where id = current_setting('t.p3')::uuid),
  current_setting('t.i') || '/instapay', 'payment now points at i with the new method');
insert into tap(l) select is(
  (select string_agg(contract_id || ':' || amount || ':' || kind, ',') from public.payment_line
   where payment_id = current_setting('t.p3')::uuid),
  current_setting('t.i') || ':1000.00:installment', 'one installment line on i');

-- 4. full restored balance
insert into tap(l) select is(
  (select count(*)::int from public.installment where contract_id = current_setting('t.w')::uuid and status <> 'paid'), 0,
  'edit may use the payment''s own restored amount: w fully paid with 19500');

-- rejections
insert into tap(l) select is(current_setting('t.e_over', true), 'المبلغ أكبر من المتبقي على العقد', 'edit rejects overpayment');
insert into tap(l) select is(pg_temp.pay(current_setting('t.p3')::uuid) || '#' || pg_temp.sched(current_setting('t.i')::uuid),
  current_setting('t.p3_after') || '#' || current_setting('t.sched_i'), 'rejected edits leave the payment and its installments unchanged');
insert into tap(l) select is(current_setting('t.e_cust', true), 'العقد غير موجود أو لا يخص هذا العميل', 'edit rejects other customer''s contract');
insert into tap(l) select is(current_setting('t.e_empty', true), 'لازم تحدد عقد واحد على الأقل', 'edit rejects empty lines');
insert into tap(l) select is(current_setting('t.e_method', true), 'طريقة الدفع غير صحيحة', 'edit rejects bad method');
insert into tap(l) select is(current_setting('t.e_shop', true), 'الدفعة غير موجودة', 'edit rejects other shop''s payment');
insert into tap(l) select is(current_setting('t.e_missing', true), 'الدفعة غير موجودة', 'edit rejects unknown payment');

-- 5. audit row and edited_at
insert into tap(l) select is(
  (select count(*)::int from public.audit_log where action = 'payment_edit' and entity_id = current_setting('t.p3')::uuid), 1,
  'exactly one payment_edit audit row (rejected edits wrote none)');
insert into tap(l) select is(
  (select jsonb_build_array(tenant_id, user_id, entity_type, before_json, after_json) from public.audit_log
   where action = 'payment_edit' and entity_id = current_setting('t.p3')::uuid),
  jsonb_build_array(current_setting('t.a'), current_setting('t.uid'), 'payment',
    jsonb_build_object('amount', 1000, 'method', 'cash',
      'lines', jsonb_build_array(jsonb_build_object('contract_id', current_setting('t.h'), 'amount', 1000))),
    jsonb_build_object('amount', 1000, 'method', 'instapay',
      'lines', jsonb_build_array(jsonb_build_object('contract_id', current_setting('t.i'), 'amount', 1000)))),
  'audit row has tenant, user, before and after with lines');
insert into tap(l) select is(
  (select (edited_at is not null)::text from public.payment where id = current_setting('t.p3')::uuid)
  || '/' || (select (edited_at is null)::text from public.payment where id = current_setting('t.pb')::uuid),
  'true/true', 'edited_at set on the edited payment, null on an untouched one');

-- 6. down payment cannot be edited
insert into tap(l) select is(current_setting('t.e_down', true), 'المقدم والبيع الكاش جزء من الفاتورة ومش بيتعدلوا من هنا',
  'down payment cannot be edited');
insert into tap(l) select is(current_setting('t.e_cashpay', true), 'المقدم والبيع الكاش جزء من الفاتورة ومش بيتعدلوا من هنا',
  'cash-sale payment cannot be edited');
insert into tap(l) select is(pg_temp.pay(current_setting('t.down')::uuid), current_setting('t.down_before'),
  'down payment unchanged');

insert into tap(l) select * from finish();
select string_agg(l, E'\n' order by n) as tap from tap;
rollback;
