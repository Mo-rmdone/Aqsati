-- supabase/tests/payment_hardening_test.sql
-- 0017: an identical re-sent edit is a no-op; a real edit still applies.
begin;
create temp table tap(n serial, l text);
insert into tap(l) select plan(5);

do $$
declare a uuid; ca uuid;
begin
  a := tests.as_new_owner('Shop H');
  insert into public.customer(tenant_id, name, phone) values (a, 'CH', '01012345678') returning id into ca;
  perform set_config('t.ca', ca::text, true);
  perform set_config('t.uid', (select id::text from public.profile where tenant_id = a), true);
  perform set_config('t.c', gen_random_uuid()::text, true);
  perform set_config('t.p', gen_random_uuid()::text, true);
end $$;

set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', current_setting('t.uid'), 'role', 'authenticated')::text, true);

do $$
declare r uuid;
  line500 jsonb := jsonb_build_array(jsonb_build_object('contract_id', current_setting('t.c'), 'amount', 500));
begin
  r := public.create_sale(jsonb_build_object('id', current_setting('t.c'), 'customer_id', current_setting('t.ca'),
    'product_desc', 'Fridge', 'sale_type', 'installment', 'total_price', 25000, 'sale_date', current_date::text,
    'down_payment', 10000, 'rate_percent', 30, 'years', 2));
  r := public.record_payment(current_setting('t.p')::uuid, current_setting('t.ca')::uuid, 'cash',
    jsonb_build_array(jsonb_build_object('contract_id', current_setting('t.c'), 'amount', 1000)));
  -- first edit: 1000 -> 500
  r := public.update_payment(current_setting('t.p')::uuid, 'cash', line500);
  perform set_config('t.alloc1', (select string_agg(id::text, ',' order by id) from public.payment_allocation
                                  where payment_id = current_setting('t.p')::uuid), true);
  -- same edit re-sent (e.g. a retry)
  r := public.update_payment(current_setting('t.p')::uuid, 'cash',
    jsonb_build_array(jsonb_build_object('contract_id', current_setting('t.c'), 'amount', 500.00)));
  perform set_config('t.r2', r::text, true);
  perform set_config('t.alloc2', (select string_agg(id::text, ',' order by id) from public.payment_allocation
                                  where payment_id = current_setting('t.p')::uuid), true);
  perform set_config('t.audits_after_retry', (select count(*)::text from public.audit_log
                                  where action = 'payment_edit' and entity_id = current_setting('t.p')::uuid), true);
  -- a real change still applies
  r := public.update_payment(current_setting('t.p')::uuid, 'instapay', line500);
  perform set_config('t.audits_after_change', (select count(*)::text from public.audit_log
                                  where action = 'payment_edit' and entity_id = current_setting('t.p')::uuid), true);
  perform set_config('t.method', (select method from public.payment where id = current_setting('t.p')::uuid), true);
end $$;

reset role;
insert into tap(l) select is(current_setting('t.r2'), current_setting('t.p'), 'identical edit returns the payment id');
insert into tap(l) select is(current_setting('t.alloc2'), current_setting('t.alloc1'), 'identical edit does not reverse and re-allocate');
insert into tap(l) select is(current_setting('t.audits_after_retry'), '1', 'identical edit writes no second audit row');
insert into tap(l) select is(current_setting('t.audits_after_change'), '2', 'a real edit is still applied and audited');
insert into tap(l) select is(current_setting('t.method'), 'instapay', 'the changed method is saved');

insert into tap(l) select * from finish();
select string_agg(l, E'\n' order by n) from tap;
rollback;
