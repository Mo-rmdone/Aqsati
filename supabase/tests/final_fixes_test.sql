-- supabase/tests/final_fixes_test.sql  (migration 0016)
begin;
create temp table tap(n serial, l text);
insert into tap(l) select plan(9);

do $$
declare a uuid; ca uuid; leg uuid := gen_random_uuid();
begin
  a := tests.as_new_owner('Shop Fix');
  insert into public.customer(tenant_id, name, phone) values (a, 'CA', '01012345678') returning id into ca;
  -- legacy-style contract: down payment recorded on the contract only, no payment/payment_line
  insert into public.contract(id, tenant_id, customer_id, product_desc, total_price, down_payment,
                              interest_rate, interest_method, num_installments, start_date)
  values (leg, a, ca, 'Legacy', 20000, 5000, 0, 'zero', 12, '2026-01-01');
  insert into public.installment(contract_id, tenant_id, seq_no, due_date, amount_due)
  select leg, a, g, ('2026-01-01'::date + make_interval(months => g))::date, 1250 from generate_series(1,12) g;
  perform set_config('t.a', a::text, true);
  perform set_config('t.ca', ca::text, true);
  perform set_config('t.leg', leg::text, true);
  perform set_config('t.uid', (select id::text from public.profile where tenant_id = a), true);
  perform set_config('t.inst', gen_random_uuid()::text, true);
  perform set_config('t.back', gen_random_uuid()::text, true);
  perform set_config('t.today', gen_random_uuid()::text, true);
  perform set_config('t.prevmonth', (date_trunc('month', current_date) - interval '25 days')::date::text, true);
end $$;

set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', current_setting('t.uid'), 'role', 'authenticated')::text, true);
do $$
begin
  perform public.create_sale(jsonb_build_object('id', current_setting('t.inst'), 'customer_id', current_setting('t.ca'),
    'product_desc', 'Fridge', 'sale_type', 'installment', 'total_price', 25000, 'sale_date', current_date::text,
    'down_payment', 10000, 'rate_percent', 30, 'years', 2));
  -- backdated cash sale in the previous month
  perform public.create_sale(jsonb_build_object('id', current_setting('t.back'), 'customer_id', current_setting('t.ca'),
    'product_desc', 'Old TV', 'sale_type', 'cash', 'total_price', 7000, 'sale_date', current_setting('t.prevmonth')));
  perform public.create_sale(jsonb_build_object('id', current_setting('t.today'), 'customer_id', current_setting('t.ca'),
    'product_desc', 'Fan', 'sale_type', 'cash', 'total_price', 1000, 'sale_date', current_date::text));
  begin
    perform public.create_sale(jsonb_build_object('id', gen_random_uuid(), 'customer_id', current_setting('t.ca'),
      'product_desc', 'Future', 'sale_type', 'cash', 'total_price', 1000,
      'sale_date', ((now() at time zone 'Africa/Cairo')::date + 1)::text));
  exception when others then perform set_config('t.e_future', sqlerrm, true); end;
end $$;
reset role;

insert into tap(l) select is(
  (select remaining from public.v_contract_balance where contract_id = current_setting('t.inst')::uuid), 19500.00,
  'create_sale contract: remaining unchanged (19500)');
insert into tap(l) select is(
  (select paid || '/' || total_payable from public.v_contract_balance where contract_id = current_setting('t.inst')::uuid),
  '10000.00/29500.00', 'create_sale contract: paid 10000 of 29500');
insert into tap(l) select is(
  (select remaining from public.v_contract_balance where contract_id = current_setting('t.leg')::uuid), 15000.00,
  'legacy contract (down payment, no lines): remaining = installment balance');
insert into tap(l) select is(
  (select paid || '/' || total_payable from public.v_contract_balance where contract_id = current_setting('t.leg')::uuid),
  '5000.00/20000.00', 'legacy contract: paid = total_payable - remaining');
insert into tap(l) select is(
  (select remaining from public.v_contract_balance where contract_id = current_setting('t.back')::uuid), 0.00,
  'cash contract remaining unchanged (0)');
insert into tap(l) select is(
  (select received_at::date from public.payment where contract_id = current_setting('t.back')::uuid),
  current_setting('t.prevmonth')::date, 'backdated sale payment received_at = sale date');
insert into tap(l) select is(
  (select received_at <= now() from public.payment where contract_id = current_setting('t.today')::uuid), true,
  'sale dated today: received_at not in the future');
insert into tap(l) select is(current_setting('t.e_future', true), 'تاريخ البيع لا يمكن أن يكون في المستقبل',
  'future sale date rejected');
insert into tap(l) select is(
  (select collected_this_month from public.v_collections_kpi where tenant_id = current_setting('t.a')::uuid), 11000.00,
  'KPI collected_this_month excludes the sale backdated to a previous month');

insert into tap(l) select * from finish();
select string_agg(l, E'\n' order by n) as tap from tap;
rollback;
