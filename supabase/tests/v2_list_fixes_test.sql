-- supabase/tests/v2_list_fixes_test.sql
-- 0022: v_customer_summary.status_rank (appended column), v_recent_activity excludes imported contracts.
begin;
create temp table tap(n serial, l text);
insert into tap(l) select plan(9);

do $$
declare v uuid;
begin
  v := tests.as_new_owner('Shop R');
  perform set_config('t.v', v::text, true);
  perform set_config('t.uid', (select id::text from public.profile where tenant_id = v), true);
  perform set_config('t.today', ((now() at time zone 'Africa/Cairo')::date)::text, true);
  insert into public.customer(tenant_id, name, phone) values
    (v, 'R-done',  '01000000011'), (v, 'R-late2', '01000000012'), (v, 'R-late1', '01000000013'),
    (v, 'R-reg',   '01000000014'), (v, 'R-imp',   '01000000015');
  perform set_config('t.k_done',  gen_random_uuid()::text, true);
  perform set_config('t.k_late2', gen_random_uuid()::text, true);
  perform set_config('t.k_late1', gen_random_uuid()::text, true);
  perform set_config('t.k_reg',   gen_random_uuid()::text, true);
  perform set_config('t.k_imp',   gen_random_uuid()::text, true);
end $$;

set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', current_setting('t.uid'), 'role', 'authenticated')::text, true);

do $$
declare r uuid; today date := current_setting('t.today')::date;
begin
  r := public.create_sale(jsonb_build_object('id', current_setting('t.k_done'),
    'customer_id', (select id from public.customer where name = 'R-done'),
    'product_desc', 'TV', 'sale_type', 'cash', 'total_price', 5000, 'sale_date', today::text));
  r := public.create_sale(jsonb_build_object('id', current_setting('t.k_late2'),
    'customer_id', (select id from public.customer where name = 'R-late2'),
    'product_desc', 'Fridge', 'sale_type', 'installment', 'total_price', 10000, 'sale_date', today::text,
    'down_payment', 2000, 'rate_percent', 12, 'years', 1));
  r := public.create_sale(jsonb_build_object('id', current_setting('t.k_late1'),
    'customer_id', (select id from public.customer where name = 'R-late1'),
    'product_desc', 'Oven', 'sale_type', 'installment', 'total_price', 10000, 'sale_date', today::text,
    'down_payment', 2000, 'rate_percent', 12, 'years', 1));
  r := public.create_sale(jsonb_build_object('id', current_setting('t.k_reg'),
    'customer_id', (select id from public.customer where name = 'R-reg'),
    'product_desc', 'Washer', 'sale_type', 'installment', 'total_price', 10000, 'sale_date', today::text,
    'down_payment', 2000, 'rate_percent', 12, 'years', 1));
  r := public.import_contract(jsonb_build_object('id', current_setting('t.k_imp'),
    'customer_id', (select id from public.customer where name = 'R-imp'),
    'product_desc', 'Sofa', 'total_price', 25000, 'down_payment', 10000, 'monthly', 1000,
    'first_due', ((date_trunc('month', today) + interval '1 month')::date)::text, 'paid_months', 0));
end $$;
reset role;

update public.installment set due_date = current_setting('t.today')::date - 75
  where seq_no = 1 and contract_id = current_setting('t.k_late2')::uuid;
update public.installment set due_date = current_setting('t.today')::date - 45
  where seq_no = 2 and contract_id = current_setting('t.k_late2')::uuid;
update public.installment set due_date = current_setting('t.today')::date - 60
  where seq_no = 1 and contract_id = current_setting('t.k_late1')::uuid;

set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', current_setting('t.uid'), 'role', 'authenticated')::text, true);

select set_config('t.r_late2', (select status_rank::text from public.v_customer_summary where name = 'R-late2'), true);
select set_config('t.r_late1', (select status_rank::text from public.v_customer_summary where name = 'R-late1'), true);
select set_config('t.r_reg',   (select status_rank::text from public.v_customer_summary where name = 'R-reg'), true);
select set_config('t.r_done',  (select status_rank::text from public.v_customer_summary where name = 'R-done'), true);
select set_config('t.r_imp',   (select status_rank::text from public.v_customer_summary where name = 'R-imp'), true);
select set_config('t.order', (select string_agg(name, ',' order by status_rank, name) from public.v_customer_summary), true);
select set_config('t.last_col', (select (array_agg(column_name::text order by ordinal_position))[array_length(array_agg(column_name), 1)]
  from information_schema.columns where table_schema = 'public' and table_name = 'v_customer_summary'), true);
select set_config('t.imp_sales', (select count(*) from public.v_recent_activity
  where kind = 'sale' and contract_id = current_setting('t.k_imp')::uuid)::text, true);
select set_config('t.norm_sales', (select count(*) from public.v_recent_activity
  where kind = 'sale' and contract_id in (current_setting('t.k_done')::uuid, current_setting('t.k_reg')::uuid))::text, true);
reset role;

insert into tap(l) select is(current_setting('t.r_late2'), '1', 'late_many: status_rank 1');
insert into tap(l) select is(current_setting('t.r_late1'), '2', 'late: status_rank 2');
insert into tap(l) select is(current_setting('t.r_reg'), '4', 'regular: status_rank 4');
insert into tap(l) select is(current_setting('t.r_done'), '5', 'done: status_rank 5');
insert into tap(l) select is(current_setting('t.r_imp'), '4', 'imported with balance: regular rank 4');
insert into tap(l) select is(current_setting('t.order'), 'R-late2,R-late1,R-imp,R-reg,R-done', 'ordering by status_rank then name puts severity first');
insert into tap(l) select is(current_setting('t.last_col'), 'status_rank', 'status_rank is the last column');
insert into tap(l) select is(current_setting('t.imp_sales'), '0', 'activity: no sale row for an imported contract');
insert into tap(l) select is(current_setting('t.norm_sales'), '2', 'activity: normal sales still listed');

insert into tap(l) select * from finish();
select string_agg(l, E'\n' order by n) as tap from tap;
rollback;
