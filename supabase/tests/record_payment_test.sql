-- supabase/tests/record_payment_test.sql
begin;
create temp table tap(n serial, l text);
insert into tap(l) select plan(22);

-- shop B first (foreign contract), shop A last so the JWT is A's
do $$
declare b uuid; a uuid; cb uuid; ca uuid; ca2 uuid; r uuid;
begin
  b := tests.as_new_owner('Shop B');
  insert into public.customer(tenant_id, name, phone) values (b, 'CB', '01012345678') returning id into cb;
  perform set_config('t.bc', gen_random_uuid()::text, true);
  r := public.create_sale(jsonb_build_object('id', current_setting('t.bc'), 'customer_id', cb,
    'product_desc', 'B item', 'sale_type', 'installment', 'total_price', 25000, 'sale_date', current_date::text,
    'down_payment', 10000, 'rate_percent', 30, 'years', 2));
  a := tests.as_new_owner('Shop A');
  insert into public.customer(tenant_id, name, phone) values (a, 'CA', '01012345678') returning id into ca;
  insert into public.customer(tenant_id, name, phone) values (a, 'CA2', '01012345679') returning id into ca2;
  perform set_config('t.a', a::text, true);
  perform set_config('t.ca', ca::text, true);
  perform set_config('t.ca2', ca2::text, true);
  perform set_config('t.uid', (select id::text from public.profile where tenant_id = a), true);
  perform set_config('t.f', gen_random_uuid()::text, true);
  perform set_config('t.w', gen_random_uuid()::text, true);
  perform set_config('t.cash', gen_random_uuid()::text, true);
  perform set_config('t.x', gen_random_uuid()::text, true);
  perform set_config('t.p1', gen_random_uuid()::text, true);
end $$;

set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', current_setting('t.uid'), 'role', 'authenticated')::text, true);
do $$
declare r uuid; r2 uuid;
  ids text[] := array['10000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000002',
    '10000000-0000-0000-0000-000000000003','10000000-0000-0000-0000-000000000004',
    '10000000-0000-0000-0000-000000000005','10000000-0000-0000-0000-000000000006',
    '10000000-0000-0000-0000-000000000007','10000000-0000-0000-0000-000000000008'];
begin
  r := public.create_sale(jsonb_build_object('id', current_setting('t.f'), 'customer_id', current_setting('t.ca'),
    'product_desc', 'Fridge', 'sale_type', 'installment', 'total_price', 25000, 'sale_date', current_date::text,
    'down_payment', 10000, 'rate_percent', 30, 'years', 2));
  r := public.create_sale(jsonb_build_object('id', current_setting('t.w'), 'customer_id', current_setting('t.ca'),
    'product_desc', 'Washer', 'sale_type', 'installment', 'total_price', 25000, 'sale_date', current_date::text,
    'down_payment', 10000, 'rate_percent', 30, 'years', 2));
  r := public.create_sale(jsonb_build_object('id', current_setting('t.cash'), 'customer_id', current_setting('t.ca'),
    'product_desc', 'TV', 'sale_type', 'cash', 'total_price', 7000, 'sale_date', current_date::text));
  r := public.create_sale(jsonb_build_object('id', current_setting('t.x'), 'customer_id', current_setting('t.ca2'),
    'product_desc', 'Oven', 'sale_type', 'installment', 'total_price', 25000, 'sale_date', current_date::text,
    'down_payment', 10000, 'rate_percent', 30, 'years', 2));

  -- happy path: one receipt split 1000/1000, then retried with the same id
  r := public.record_payment(current_setting('t.p1')::uuid, current_setting('t.ca')::uuid, 'cash',
    jsonb_build_array(jsonb_build_object('contract_id', current_setting('t.f'), 'amount', 1000),
                      jsonb_build_object('contract_id', current_setting('t.w'), 'amount', 1000)));
  r2 := public.record_payment(current_setting('t.p1')::uuid, current_setting('t.ca')::uuid, 'cash',
    jsonb_build_array(jsonb_build_object('contract_id', current_setting('t.f'), 'amount', 1000),
                      jsonb_build_object('contract_id', current_setting('t.w'), 'amount', 1000)));
  perform set_config('t.r1', r::text, true);
  perform set_config('t.r2', r2::text, true);

  -- rejections, each with a distinct payment id
  begin perform public.record_payment(ids[1]::uuid, current_setting('t.ca')::uuid, 'cash', '[]'::jsonb);
  exception when others then perform set_config('t.e_empty', sqlerrm, true); end;
  begin perform public.record_payment(ids[2]::uuid, current_setting('t.ca')::uuid, 'cash',
    jsonb_build_array(jsonb_build_object('contract_id', current_setting('t.f'), 'amount', 0)));
  exception when others then perform set_config('t.e_zero', sqlerrm, true); end;
  begin perform public.record_payment(ids[3]::uuid, current_setting('t.ca')::uuid, 'cash',
    jsonb_build_array(jsonb_build_object('contract_id', current_setting('t.f'), 'amount', 18500.01)));
  exception when others then perform set_config('t.e_over', sqlerrm, true); end;
  begin perform public.record_payment(ids[4]::uuid, current_setting('t.ca')::uuid, 'cash',
    jsonb_build_array(jsonb_build_object('contract_id', current_setting('t.x'), 'amount', 100)));
  exception when others then perform set_config('t.e_cust', sqlerrm, true); end;
  begin perform public.record_payment(ids[5]::uuid, current_setting('t.ca')::uuid, 'cash',
    jsonb_build_array(jsonb_build_object('contract_id', current_setting('t.bc'), 'amount', 100)));
  exception when others then perform set_config('t.e_shop', sqlerrm, true); end;
  begin perform public.record_payment(ids[6]::uuid, current_setting('t.ca')::uuid, 'cash',
    jsonb_build_array(jsonb_build_object('contract_id', current_setting('t.f'), 'amount', 100),
                      jsonb_build_object('contract_id', current_setting('t.f'), 'amount', 100)));
  exception when others then perform set_config('t.e_dup', sqlerrm, true); end;
  begin perform public.record_payment(ids[7]::uuid, current_setting('t.ca')::uuid, 'cash',
    jsonb_build_array(jsonb_build_object('contract_id', current_setting('t.cash'), 'amount', 100)));
  exception when others then perform set_config('t.e_cashc', sqlerrm, true); end;
  -- a valid line first, an invalid second: the whole call must write nothing
  begin perform public.record_payment(ids[8]::uuid, current_setting('t.ca')::uuid, 'cash',
    jsonb_build_array(jsonb_build_object('contract_id', current_setting('t.f'), 'amount', 100),
                      jsonb_build_object('contract_id', current_setting('t.w'), 'amount', 99999)));
  exception when others then perform set_config('t.e_mixed', sqlerrm, true); end;
end $$;
reset role;

insert into tap(l) select is(
  (select array_agg(paid order by contract_id = current_setting('t.f')::uuid) from public.v_contract_balance
   where contract_id in (current_setting('t.f')::uuid, current_setting('t.w')::uuid)),
  array[11000.00, 11000.00]::numeric[], 'split 1000/1000: each contract paid rose 10000 -> 11000');
insert into tap(l) select is(
  (select count(*)::int from public.payment where id = current_setting('t.p1')::uuid and contract_id is null and amount = 2000), 1,
  'multi-line payment has amount 2000 and null contract_id');
insert into tap(l) select is(
  (select count(*)::int from public.payment_line where payment_id = current_setting('t.p1')::uuid and kind = 'installment'), 2,
  'two installment payment_lines');
insert into tap(l) select is(
  (select count(distinct receipt_no)::int from public.payment where id = current_setting('t.p1')::uuid), 1,
  'one receipt number for the split payment');
insert into tap(l) select is(
  (select status || ':' || amount_paid from public.installment where contract_id = current_setting('t.f')::uuid and seq_no = 1),
  'paid:812.50', 'oldest installment #1 paid in full');
insert into tap(l) select is(
  (select status || ':' || amount_paid from public.installment where contract_id = current_setting('t.f')::uuid and seq_no = 2),
  'partial:187.50', 'installment #2 partial with 187.50');
insert into tap(l) select is(
  (select count(*)::int from public.installment where contract_id = current_setting('t.f')::uuid and seq_no > 2 and amount_paid <> 0), 0,
  'later installments untouched');
insert into tap(l) select is(current_setting('t.r1') || '/' || current_setting('t.r2'),
  current_setting('t.p1') || '/' || current_setting('t.p1'), 'retry returns the same payment id');
insert into tap(l) select is(
  (select count(*)::int from public.payment where id = current_setting('t.p1')::uuid)
  || '/' || (select count(*)::int from public.payment_line where payment_id = current_setting('t.p1')::uuid)
  || '/' || (select sum(amount_paid) from public.installment where contract_id = current_setting('t.f')::uuid),
  '1/2/1000.00', 'idempotent: 1 payment, 2 lines, balance moved once');
insert into tap(l) select is(current_setting('t.e_empty', true), 'لازم تحدد عقد واحد على الأقل', 'rejects empty lines');
insert into tap(l) select is(current_setting('t.e_zero', true), 'المبلغ لازم يكون أكبر من صفر', 'rejects zero amount');
insert into tap(l) select is(current_setting('t.e_over', true), 'المبلغ أكبر من المتبقي على العقد', 'rejects paying more than remaining');
insert into tap(l) select is(current_setting('t.e_cust', true), 'العقد غير موجود أو لا يخص هذا العميل', 'rejects other customer''s contract');
insert into tap(l) select is(current_setting('t.e_shop', true), 'العقد غير موجود أو لا يخص هذا العميل', 'rejects other shop''s contract');
insert into tap(l) select is(current_setting('t.e_dup', true), 'العقد مكرر في نفس الدفعة', 'rejects duplicate contract');
insert into tap(l) select is(current_setting('t.e_cashc', true), 'لا يمكن تحصيل أقساط على عقد نقدي', 'rejects cash contract');
insert into tap(l) select is(current_setting('t.e_mixed', true), 'المبلغ أكبر من المتبقي على العقد', 'rejects mixed valid+overpay call');
insert into tap(l) select is(
  (select count(*)::int from public.payment where id::text like '10000000-%')
  + (select count(*)::int from public.payment_line where payment_id::text like '10000000-%'), 0,
  'no payment or line written by any rejected call');
insert into tap(l) select is(
  (select sum(amount_paid) from public.installment where contract_id in (current_setting('t.f')::uuid, current_setting('t.w')::uuid)),
  2000.00, 'installment paid totals unchanged by rejected calls');
insert into tap(l) select is(
  (select paid from public.v_contract_balance where contract_id = current_setting('t.cash')::uuid), 7000.00,
  'cash contract paid unchanged');
insert into tap(l) select is(
  (select count(*)::int from public.payment where tenant_id = current_setting('t.a')::uuid), 5,
  'shop A has exactly 5 payments (4 down/cash + 1 split)');
insert into tap(l) select is(
  (select count(*)::int from public.payment where tenant_id <> current_setting('t.a')::uuid and id = current_setting('t.p1')::uuid), 0,
  'split payment belongs only to shop A');

insert into tap(l) select * from finish();
select string_agg(l, E'\n' order by n) as tap from tap;
rollback;
