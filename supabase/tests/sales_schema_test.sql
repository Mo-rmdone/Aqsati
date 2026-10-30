-- supabase/tests/sales_schema_test.sql
begin;
create temp table tap(n serial, l text);
insert into tap(l) select plan(9);

do $$
declare a uuid; b uuid; ca uuid; cb uuid;
begin
  a := tests.as_new_owner('Shop A');
  b := tests.as_new_owner('Shop B');
  insert into public.customer(tenant_id, name, phone) values (a, 'CA', '01012345678') returning id into ca;
  insert into public.customer(tenant_id, name, phone) values (b, 'CB', '01012345678') returning id into cb;
  insert into public.contract(tenant_id, customer_id, total_price, num_installments, start_date)
    values (a, ca, 1000, 12, '2026-11-01'), (a, ca, 1000, 12, '2026-11-01'), (b, cb, 1000, 12, '2026-11-01');
  perform set_config('t.a', a::text, true);
  perform set_config('t.b', b::text, true);
  perform set_config('t.ca', ca::text, true);
end $$;

insert into tap(l) select is(
  (select array_agg(contract_no order by contract_no) from public.contract where tenant_id = current_setting('t.a')::uuid),
  array[1,2]::bigint[], 'contract_no starts at 1 and increments in shop A');
insert into tap(l) select is(
  (select array_agg(contract_no) from public.contract where tenant_id = current_setting('t.b')::uuid),
  array[1]::bigint[], 'contract_no restarts at 1 in shop B');

insert into tap(l) select throws_ok(
  format($q$insert into public.contract(tenant_id, customer_id, total_price, sale_type, num_installments, start_date)
            values (%L, %L, 1000, 'cash', 12, '2026-11-01')$q$, current_setting('t.a'), current_setting('t.ca')),
  '23514', null, 'cash contract must have 0 installments');

insert into tap(l) select throws_ok(
  format($q$insert into public.contract(tenant_id, customer_id, total_price, num_installments, start_date)
            values (%L, %L, 1000, 18, '2026-11-01')$q$, current_setting('t.a'), current_setting('t.ca')),
  '23514', null, 'installment months must be 12..60 step 12 (18 rejected)');
insert into tap(l) select lives_ok(
  format($q$insert into public.contract(tenant_id, customer_id, total_price, num_installments, start_date)
            values (%L, %L, 1000, 24, '2026-11-01')$q$, current_setting('t.a'), current_setting('t.ca')),
  '24 months accepted');

insert into tap(l) select throws_ok(
  format($q$insert into public.customer(tenant_id, name, phone) values (%L, 'X', '0123')$q$, current_setting('t.a')),
  '23514', null, 'phone must be Egyptian mobile (new insert with bad phone rejected)');
insert into tap(l) select throws_ok(
  format($q$insert into public.customer(tenant_id, name, phone, national_id) values (%L, 'X', '01012345678', '123')$q$, current_setting('t.a')),
  '23514', null, 'national id must be 14 digits starting 2/3');

-- authenticated path: RLS-bound inserts must still get sequential contract_no
do $$
declare o uuid;
begin
  o := tests.as_new_owner('Shop RLS');
  perform set_config('t.o', o::text, true);
  perform set_config('t.uid', (select id::text from public.profile where tenant_id = o), true);
end $$;
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', current_setting('t.uid'), 'role', 'authenticated')::text, true);
insert into public.customer(tenant_id, name, phone) values (current_setting('t.o')::uuid, 'RLS', '01012345678');
insert into public.contract(tenant_id, customer_id, total_price, num_installments, start_date)
  select tenant_id, id, 1000, 12, '2026-11-01' from public.customer where name = 'RLS';
insert into public.contract(tenant_id, customer_id, total_price, num_installments, start_date)
  select tenant_id, id, 1000, 12, '2026-11-01' from public.customer where name = 'RLS';
reset role;
insert into tap(l) select is(
  (select array_agg(contract_no order by contract_no) from public.contract where tenant_id = current_setting('t.o')::uuid),
  array[1,2]::bigint[], 'authenticated (RLS) inserts get contract_no 1,2');
insert into tap(l) select is(
  (select count(*)::int from public.contract where tenant_id = current_setting('t.o')::uuid),
  2, 'both RLS-bound contract inserts succeeded');

insert into tap(l) select * from finish();
select string_agg(l, E'\n' order by n) as tap from tap;
rollback;
