-- supabase/tests/v2_lists_test.sql
-- 0021: v_customer_summary, v_invoice_list, v_recent_activity (+ customer.notes).
begin;
create temp table tap(n serial, l text);
insert into tap(l) select plan(29);

-- shop W first (isolation check), shop V last so the JWT left behind is V's
do $$
declare w uuid; v uuid;
begin
  w := tests.as_new_owner('Shop W');
  perform set_config('t.uid_w', (select id::text from public.profile where tenant_id = w), true);
  v := tests.as_new_owner('Shop V');
  perform set_config('t.v', v::text, true);
  perform set_config('t.uid', (select id::text from public.profile where tenant_id = v), true);
  perform set_config('t.today', ((now() at time zone 'Africa/Cairo')::date)::text, true);
  perform set_config('t.mstart', (date_trunc('month', now() at time zone 'Africa/Cairo')::date)::text, true);
  insert into public.customer(tenant_id, name, phone) values
    (v, 'C-cash',   '01000000001'), (v, 'C-late2',  '01000000002'), (v, 'C-late1x', '01000000003'),
    (v, 'C-reg',    '01000000004'), (v, 'C-open',   '01000000005'), (v, 'C-month',  '01000000006'),
    (v, 'C-void',   '01000000007');
  perform set_config('t.k_cash',  gen_random_uuid()::text, true);
  perform set_config('t.k_late2', gen_random_uuid()::text, true);
  perform set_config('t.k_l1a',   gen_random_uuid()::text, true);
  perform set_config('t.k_l1b',   gen_random_uuid()::text, true);
  perform set_config('t.k_reg',   gen_random_uuid()::text, true);
  perform set_config('t.k_open',  gen_random_uuid()::text, true);
  perform set_config('t.k_month', gen_random_uuid()::text, true);
  perform set_config('t.k_void',  gen_random_uuid()::text, true);
  perform set_config('t.k_pay',   gen_random_uuid()::text, true);
end $$;

set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', current_setting('t.uid'), 'role', 'authenticated')::text, true);

do $$
declare r uuid; today date := current_setting('t.today')::date;
begin
  -- cash sale: settled
  r := public.create_sale(jsonb_build_object('id', current_setting('t.k_cash'),
    'customer_id', (select id from public.customer where name = 'C-cash'),
    'product_desc', 'TV', 'sale_type', 'cash', 'total_price', 5000, 'sale_date', today::text));
  -- installment, two past-due installments on one contract
  r := public.create_sale(jsonb_build_object('id', current_setting('t.k_late2'),
    'customer_id', (select id from public.customer where name = 'C-late2'),
    'product_desc', 'Fridge', 'sale_type', 'installment', 'total_price', 10000, 'sale_date', today::text,
    'down_payment', 2000, 'rate_percent', 12, 'years', 1));
  -- two contracts, one past-due installment each; backdated sale
  r := public.create_sale(jsonb_build_object('id', current_setting('t.k_l1a'),
    'customer_id', (select id from public.customer where name = 'C-late1x'),
    'product_desc', 'Oven', 'sale_type', 'installment', 'total_price', 10000, 'sale_date', (today - 20)::text,
    'down_payment', 2000, 'rate_percent', 12, 'years', 1));
  r := public.create_sale(jsonb_build_object('id', current_setting('t.k_l1b'),
    'customer_id', (select id from public.customer where name = 'C-late1x'),
    'product_desc', 'Fan', 'sale_type', 'installment', 'total_price', 10000, 'sale_date', today::text,
    'down_payment', 2000, 'rate_percent', 12, 'years', 1));
  -- regular: nothing past due, partial payment on first installment
  r := public.create_sale(jsonb_build_object('id', current_setting('t.k_reg'),
    'customer_id', (select id from public.customer where name = 'C-reg'),
    'product_desc', 'Washer', 'sale_type', 'installment', 'total_price', 10000, 'sale_date', today::text,
    'down_payment', 2000, 'rate_percent', 12, 'years', 1));
  r := public.record_payment(current_setting('t.k_pay')::uuid,
    (select id from public.customer where name = 'C-reg'), 'cash',
    jsonb_build_array(jsonb_build_object('contract_id', current_setting('t.k_reg'), 'amount', 100)));
  -- imported contract: only opening payments, nothing past due
  r := public.import_contract(jsonb_build_object('id', current_setting('t.k_open'),
    'customer_id', (select id from public.customer where name = 'C-open'),
    'product_desc', 'Sofa', 'total_price', 25000, 'down_payment', 10000, 'monthly', 1000,
    'first_due', ((date_trunc('month', today) + interval '1 month')::date)::text, 'paid_months', 0));
  -- past-due installment dated at the start of the current Cairo month
  r := public.create_sale(jsonb_build_object('id', current_setting('t.k_month'),
    'customer_id', (select id from public.customer where name = 'C-month'),
    'product_desc', 'Heater', 'sale_type', 'installment', 'total_price', 10000, 'sale_date', today::text,
    'down_payment', 2000, 'rate_percent', 12, 'years', 1));
  -- a sale that is then voided
  r := public.create_sale(jsonb_build_object('id', current_setting('t.k_void'),
    'customer_id', (select id from public.customer where name = 'C-void'),
    'product_desc', 'Mistake', 'sale_type', 'cash', 'total_price', 900, 'sale_date', today::text));
end $$;
reset role;

-- age installments (the nightly flag is deliberately not used by the views)
update public.installment set due_date = current_setting('t.today')::date - 75
  where seq_no = 1 and contract_id = current_setting('t.k_late2')::uuid;
update public.installment set due_date = current_setting('t.today')::date - 45
  where seq_no = 2 and contract_id = current_setting('t.k_late2')::uuid;
update public.installment set due_date = current_setting('t.today')::date - 60
  where seq_no = 1 and contract_id in (current_setting('t.k_l1a')::uuid, current_setting('t.k_l1b')::uuid);
update public.installment set due_date = current_setting('t.mstart')::date
  where seq_no = 1 and contract_id = current_setting('t.k_month')::uuid;
update public.contract set status = 'void' where id = current_setting('t.k_void')::uuid;
-- make the manual payment the newest activity
update public.payment set received_at = now() + interval '1 hour' where id = current_setting('t.k_pay')::uuid;

-- customer summary
insert into tap(l) select is((select status from public.v_customer_summary where name = 'C-cash'), 'done', 'cash sale only: done');
insert into tap(l) select is((select remaining_total from public.v_customer_summary where name = 'C-cash'), 0.00, 'cash sale only: remaining 0');
insert into tap(l) select is((select status from public.v_customer_summary where name = 'C-late2'), 'late_many', 'two past-due on one contract: late_many');
insert into tap(l) select is((select overdue_count from public.v_customer_summary where name = 'C-late2'), 2, 'late_many: overdue_count 2');
insert into tap(l) select is((select max_overdue_per_contract from public.v_customer_summary where name = 'C-late2'), 2, 'late_many: max_overdue_per_contract 2');
insert into tap(l) select is((select status from public.v_customer_summary where name = 'C-late1x'), 'late', 'one past-due on each of two contracts: late');
insert into tap(l) select is((select max_overdue_per_contract from public.v_customer_summary where name = 'C-late1x'), 1, 'late: max_overdue_per_contract 1');
insert into tap(l) select is((select overdue_count from public.v_customer_summary where name = 'C-late1x'), 2, 'late: overdue_count 2 across contracts');
insert into tap(l) select is((select status from public.v_customer_summary where name = 'C-reg'), 'regular', 'nothing past due, remaining > 0: regular');
insert into tap(l) select is((select next_due_date from public.v_customer_summary where name = 'C-reg'),
  (select min(due_date) from public.installment where contract_id = current_setting('t.k_reg')::uuid and amount_due > amount_paid),
  'next_due_date is the earliest open installment');
insert into tap(l) select is((select next_due_amount from public.v_customer_summary where name = 'C-reg'),
  (select amount_due - amount_paid from public.installment where contract_id = current_setting('t.k_reg')::uuid and seq_no = 1),
  'next_due_amount is amount_due - amount_paid of that installment');
insert into tap(l) select is((select paid_this_month from public.v_customer_summary where name = 'C-reg'), true, 'non-opening payment this month: paid_this_month');
insert into tap(l) select is((select paid_this_month from public.v_customer_summary where name = 'C-open'), false, 'opening payment only: not paid_this_month');
insert into tap(l) select is((select late_this_month from public.v_customer_summary where name = 'C-month'),
  current_setting('t.today')::date > current_setting('t.mstart')::date,
  'past-due installment dated in the current month: late_this_month (false only on the 1st)');
insert into tap(l) select is((select late_this_month from public.v_customer_summary where name = 'C-late2'), false, 'past-due in earlier months only: not late_this_month');

-- invoice list
insert into tap(l) select is((select status from public.v_invoice_list where contract_id = current_setting('t.k_cash')::uuid), 'settled', 'invoice: cash sale settled');
insert into tap(l) select is((select status from public.v_invoice_list where contract_id = current_setting('t.k_late2')::uuid), 'late', 'invoice: late contract');
insert into tap(l) select is((select overdue_count from public.v_invoice_list where contract_id = current_setting('t.k_late2')::uuid), 2, 'invoice: overdue_count matches');
insert into tap(l) select is((select sale_date from public.v_invoice_list where contract_id = current_setting('t.k_l1a')::uuid),
  current_setting('t.today')::date - 20, 'invoice: sale_date is the sale_date passed to create_sale');

-- recent activity
insert into tap(l) select is((select count(*)::int from public.v_recent_activity where tenant_id = current_setting('t.v')::uuid and kind = 'sale'),
  (select count(*)::int from public.contract where tenant_id = current_setting('t.v')::uuid and status <> 'void'),
  'activity: one sale row per (non-void) contract');
insert into tap(l) select is((select count(*)::int from public.v_recent_activity where tenant_id = current_setting('t.v')::uuid and kind = 'payment'),
  (select count(*)::int from public.payment p join public.contract c on c.id = p.contract_id
     where p.tenant_id = current_setting('t.v')::uuid and not p.is_opening and c.status <> 'void'),
  'activity: one payment row per non-opening payment');
insert into tap(l) select is((select kind || ':' || amount from public.v_recent_activity where tenant_id = current_setting('t.v')::uuid limit 1),
  'payment:100.00', 'activity: newest first');
insert into tap(l) select is((select count(*)::int from (
    select at, lag(at) over () as prev from public.v_recent_activity where tenant_id = current_setting('t.v')::uuid) t
    where prev < at), 0, 'activity: ordered by at descending');

-- void contracts are excluded
insert into tap(l) select is((select count(*)::int from public.v_invoice_list where contract_id = current_setting('t.k_void')::uuid), 0, 'void contract not in invoice list');
insert into tap(l) select is((select count(*)::int from public.v_customer_summary where name = 'C-void'), 0, 'customer with only void contracts not in summary');

-- tenant isolation (RLS through security_invoker)
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', current_setting('t.uid_w'), 'role', 'authenticated')::text, true);
select set_config('t.w_cs', (select count(*) from public.v_customer_summary)::text, true);
select set_config('t.w_il', (select count(*) from public.v_invoice_list)::text, true);
select set_config('t.w_ra', (select count(*) from public.v_recent_activity)::text, true);
select set_config('request.jwt.claims', json_build_object('sub', current_setting('t.uid'), 'role', 'authenticated')::text, true);
select set_config('t.v_cs', (select count(*) from public.v_customer_summary)::text, true);
reset role;
insert into tap(l) select is(current_setting('t.w_cs'), '0', 'other shop sees 0 customer summary rows');
insert into tap(l) select is(current_setting('t.w_il'), '0', 'other shop sees 0 invoice rows');
insert into tap(l) select is(current_setting('t.w_ra'), '0', 'other shop sees 0 activity rows');
insert into tap(l) select is(current_setting('t.v_cs'), '6', 'owner sees own 6 summarized customers through RLS');

insert into tap(l) select * from finish();
select string_agg(l, E'\n' order by n) as tap from tap;
rollback;
