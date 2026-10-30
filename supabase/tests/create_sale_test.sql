-- supabase/tests/create_sale_test.sql
begin;
create temp table tap(n serial, l text);
insert into tap(l) select plan(15);

-- shop B first (its customer is the "other shop" customer), shop A last so the JWT is A's
do $$
declare b uuid; a uuid; cb uuid; ca uuid;
begin
  b := tests.as_new_owner('Shop B');
  insert into public.customer(tenant_id, name, phone) values (b, 'CB', '01012345678') returning id into cb;
  a := tests.as_new_owner('Shop A');
  insert into public.customer(tenant_id, name, phone) values (a, 'CA', '01012345678') returning id into ca;
  perform set_config('t.a', a::text, true);
  perform set_config('t.ca', ca::text, true);
  perform set_config('t.cb', cb::text, true);
  perform set_config('t.uid', (select id::text from public.profile where tenant_id = a), true);
  perform set_config('t.inst', gen_random_uuid()::text, true);
  perform set_config('t.cash', gen_random_uuid()::text, true);
end $$;

-- real call path: RLS-bound authenticated user; errors are captured, asserted after reset role
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', current_setting('t.uid'), 'role', 'authenticated')::text, true);
do $$
declare r uuid;
begin
  r := public.create_sale(jsonb_build_object('id', current_setting('t.inst'), 'customer_id', current_setting('t.ca'),
    'product_desc', 'Fridge', 'sale_type', 'installment', 'total_price', 25000, 'sale_date', '2026-11-01',
    'down_payment', 10000, 'rate_percent', 30, 'years', 2));
  r := public.create_sale(jsonb_build_object('id', current_setting('t.cash'), 'customer_id', current_setting('t.ca'),
    'product_desc', 'TV', 'sale_type', 'cash', 'total_price', 7000, 'sale_date', '2026-11-01'));
  -- idempotent repeat
  r := public.create_sale(jsonb_build_object('id', current_setting('t.inst'), 'customer_id', current_setting('t.ca'),
    'product_desc', 'Fridge', 'sale_type', 'installment', 'total_price', 25000, 'sale_date', '2026-11-01',
    'down_payment', 10000, 'rate_percent', 30, 'years', 2));
  perform set_config('t.r3', r::text, true);
  begin
    perform public.create_sale(jsonb_build_object('id', gen_random_uuid(), 'customer_id', current_setting('t.ca'),
      'product_desc', 'X', 'sale_type', 'installment', 'total_price', 1000, 'sale_date', '2026-11-01',
      'down_payment', 1000, 'rate_percent', 10, 'years', 1));
  exception when others then perform set_config('t.e_down', sqlerrm, true); end;
  begin
    perform public.create_sale(jsonb_build_object('id', gen_random_uuid(), 'customer_id', current_setting('t.ca'),
      'product_desc', 'X', 'sale_type', 'installment', 'total_price', 1000, 'sale_date', '2026-11-01',
      'down_payment', 0, 'rate_percent', 10, 'years', 6));
  exception when others then perform set_config('t.e_years', sqlerrm, true); end;
  begin
    perform public.create_sale(jsonb_build_object('id', gen_random_uuid(), 'customer_id', current_setting('t.cb'),
      'product_desc', 'X', 'sale_type', 'cash', 'total_price', 1000, 'sale_date', '2026-11-01'));
  exception when others then perform set_config('t.e_cust', sqlerrm, true); end;
end $$;
reset role;

insert into tap(l) select is(
  (select count(*)::int from public.installment where contract_id = current_setting('t.inst')::uuid), 24,
  'installment sale writes 24 installments');
insert into tap(l) select is(
  (select sum(amount_due) from public.installment where contract_id = current_setting('t.inst')::uuid), 19500.00,
  'installments total 19500.00');
insert into tap(l) select is(
  (select min(amount_due) from public.installment where contract_id = current_setting('t.inst')::uuid), 812.50,
  'each installment is 812.50');
insert into tap(l) select is(
  (select array_agg(amount order by amount) from public.payment where contract_id = current_setting('t.inst')::uuid),
  array[10000.00]::numeric[], 'one 10000 down payment');
insert into tap(l) select is(
  (select kind from public.payment_line where contract_id = current_setting('t.inst')::uuid), 'down_payment',
  'down payment line kind');
insert into tap(l) select is(
  (select count(*)::int from public.installment where contract_id = current_setting('t.cash')::uuid), 0,
  'cash sale writes no installments');
insert into tap(l) select is(
  (select amount from public.payment where contract_id = current_setting('t.cash')::uuid), 7000.00,
  'cash sale writes one full payment');
insert into tap(l) select is(
  (select kind from public.payment_line where contract_id = current_setting('t.cash')::uuid), 'cash',
  'cash line kind');
insert into tap(l) select is(
  (select remaining from public.v_contract_balance where contract_id = current_setting('t.cash')::uuid), 0.00,
  'cash sale remaining = 0');
insert into tap(l) select is(
  (select count(*)::int from public.contract where tenant_id = current_setting('t.a')::uuid)
  || '/' || (select count(*)::int from public.payment where tenant_id = current_setting('t.a')::uuid)
  || '/' || current_setting('t.r3'),
  '2/2/' || current_setting('t.inst'), 'create_sale is idempotent (no extra contract/payment, returns id)');
insert into tap(l) select is(current_setting('t.e_down', true), 'المقدم لازم يكون أقل من السعر', 'rejects down payment >= price');
insert into tap(l) select isnt(current_setting('t.e_years', true), null, 'rejects years outside 1..5');
insert into tap(l) select isnt(current_setting('t.e_cust', true), null, 'rejects a customer from another shop');
insert into tap(l) select is(
  (select remaining from public.v_contract_balance where contract_id = current_setting('t.inst')::uuid), 19500.00,
  'balance view: remaining = 19500 after installment sale');
insert into tap(l) select is(
  (select collected_this_month from public.v_collections_kpi where tenant_id = current_setting('t.a')::uuid), 17000.00,
  'collected_this_month includes down payments and cash sales');

insert into tap(l) select * from finish();
select string_agg(l, E'\n' order by n) as tap from tap;
rollback;
