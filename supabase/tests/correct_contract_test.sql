-- supabase/tests/correct_contract_test.sql
-- 0030: correct_contract (re-schedule, re-allocate, refund the excess) and v_contract_history.
begin;
create temp table tap(n serial, l text);
insert into tap(l) select plan(45);

-- one contract's schedule as text: seq:status:amount_paid
create function pg_temp.sched(c uuid, upto int) returns text language sql stable as $$
  select string_agg(seq_no || ':' || status || ':' || amount_paid, ',' order by seq_no)
  from public.installment where contract_id = c and seq_no <= upto $$;
-- every payment with a line on a contract: id@received_at, oldest first
create function pg_temp.pays(c uuid) returns text language sql stable as $$
  select string_agg(p.id || '@' || p.received_at, ',' order by p.received_at, p.id)
  from public.payment p where p.id in (select payment_id from public.payment_line where contract_id = c) $$;
-- runs a correction, returns the result as text or the sqlstate
create function pg_temp.try(p_id uuid, k text, p jsonb, m text) returns text language plpgsql as $$
begin
  return public.correct_contract(p_id, current_setting(k)::uuid, p, m)::text;
exception when others then return sqlstate;
end $$;

-- shop B first (cross-shop check), shop A last
do $$
declare a uuid; b uuid; ca uuid; c text;
begin
  b := tests.as_new_owner('Shop CB');
  perform set_config('t.uid_b', (select id::text from public.profile where tenant_id = b), true);
  a := tests.as_new_owner('Shop CA');
  perform set_config('t.a', a::text, true);
  perform set_config('t.uid_a', (select id::text from public.profile where tenant_id = a), true);
  insert into public.customer(tenant_id, name, phone) values (a, 'C-cust', '01000000021') returning id into ca;
  perform set_config('t.ca', ca::text, true);
  perform set_config('t.today', ((now() at time zone 'Africa/Cairo')::date)::text, true);
  foreach c in array array['t.kr','t.kc','t.kd','t.kz','t.kcash','t.kimp','t.kh','t.ko','t.kv','t.kq',
                           't.opr','t.opc','t.opd','t.opz','t.opcash','t.oph','t.ph','t.po'] loop
    perform set_config(c, gen_random_uuid()::text, true);
  end loop;
end $$;

set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', current_setting('t.uid_a'), 'role', 'authenticated')::text, true);
do $$
declare r uuid; i int;
  sale jsonb := jsonb_build_object('customer_id', current_setting('t.ca'), 'product_desc', 'Item',
    'sale_type', 'installment', 'sale_date', current_setting('t.today'),
    'down_payment', 10000, 'rate_percent', 30, 'years', 2);
begin
  -- kr: 22000 -> 650 x 24, three installments paid by three payments
  r := public.create_sale(sale || jsonb_build_object('id', current_setting('t.kr'), 'total_price', 22000));
  for i in 1..3 loop
    r := public.record_payment(gen_random_uuid(), current_setting('t.ca')::uuid, 'cash',
      jsonb_build_array(jsonb_build_object('contract_id', current_setting('t.kr'), 'amount', 650)));
  end loop;
  -- kc: 25000 -> 812.50 x 24, 15000 paid in three payments
  r := public.create_sale(sale || jsonb_build_object('id', current_setting('t.kc'), 'total_price', 25000));
  for i in 1..3 loop
    r := public.record_payment(gen_random_uuid(), current_setting('t.ca')::uuid, 'cash',
      jsonb_build_array(jsonb_build_object('contract_id', current_setting('t.kc'), 'amount', 5000)));
  end loop;
  r := public.create_sale(sale || jsonb_build_object('id', current_setting('t.kd'), 'total_price', 25000));
  r := public.create_sale(sale || jsonb_build_object('id', current_setting('t.kz'), 'total_price', 25000));
  r := public.create_sale(jsonb_build_object('id', current_setting('t.kcash'), 'customer_id', current_setting('t.ca'),
    'product_desc', 'TV', 'sale_type', 'cash', 'total_price', 7000, 'sale_date', current_setting('t.today')));
  r := public.import_contract(jsonb_build_object('id', current_setting('t.kimp'), 'customer_id', current_setting('t.ca'),
    'product_desc', 'Old fridge', 'total_price', 25000, 'down_payment', 10000, 'monthly', 1000,
    'first_due', (date_trunc('month', current_date) - interval '6 months')::date::text, 'paid_months', 2));
  -- kh / ko: one edited payment each
  r := public.create_sale(sale || jsonb_build_object('id', current_setting('t.kh'), 'total_price', 25000));
  r := public.create_sale(sale || jsonb_build_object('id', current_setting('t.ko'), 'total_price', 25000));
  r := public.record_payment(current_setting('t.ph')::uuid, current_setting('t.ca')::uuid, 'cash',
    jsonb_build_array(jsonb_build_object('contract_id', current_setting('t.kh'), 'amount', 1000)));
  r := public.update_payment(current_setting('t.ph')::uuid, 'cash',
    jsonb_build_array(jsonb_build_object('contract_id', current_setting('t.kh'), 'amount', 800)));
  r := public.record_payment(current_setting('t.po')::uuid, current_setting('t.ca')::uuid, 'cash',
    jsonb_build_array(jsonb_build_object('contract_id', current_setting('t.ko'), 'amount', 1000)));
  r := public.update_payment(current_setting('t.po')::uuid, 'cash',
    jsonb_build_array(jsonb_build_object('contract_id', current_setting('t.ko'), 'amount', 700)));
  -- kv: cancelled
  r := public.create_sale(sale || jsonb_build_object('id', current_setting('t.kv'), 'total_price', 25000));
  r := public.cancel_contract(gen_random_uuid(), current_setting('t.kv')::uuid, 0, null, null);
  -- kq: 15000 paid, cut to 15000 (8500 refunded), then raised back to 25000
  r := public.create_sale(sale || jsonb_build_object('id', current_setting('t.kq'), 'total_price', 25000));
  r := public.record_payment(gen_random_uuid(), current_setting('t.ca')::uuid, 'cash',
    jsonb_build_array(jsonb_build_object('contract_id', current_setting('t.kq'), 'amount', 15000)));
end $$;
reset role;

-- a reminder sent for kr's 2nd installment (message_log references installment)
insert into public.message_log(tenant_id, customer_id, contract_id, installment_id, channel)
select current_setting('t.a')::uuid, current_setting('t.ca')::uuid, current_setting('t.kr')::uuid, id, 'whatsapp'
  from public.installment where contract_id = current_setting('t.kr')::uuid and seq_no = 2;

set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', current_setting('t.uid_a'), 'role', 'authenticated')::text, true);
do $$
begin
  -- snapshots before the corrections
  perform set_config('t.kr_pays', pg_temp.pays(current_setting('t.kr')::uuid), true);
  perform set_config('t.kc_pays', pg_temp.pays(current_setting('t.kc')::uuid), true);

  -- 1. price raised on kr
  perform set_config('t.res_r', pg_temp.try(current_setting('t.opr')::uuid, 't.kr',
    jsonb_build_object('price', 25000), null), true);
  -- 2. price cut below paid on kc: no method first, then cash, then the same op again
  perform set_config('t.res_c_nomethod', pg_temp.try(gen_random_uuid(), 't.kc', jsonb_build_object('price', 15000), null), true);
  perform set_config('t.res_c_badmethod', pg_temp.try(gen_random_uuid(), 't.kc', jsonb_build_object('price', 15000), 'gold'), true);
  perform set_config('t.res_c', pg_temp.try(current_setting('t.opc')::uuid, 't.kc', jsonb_build_object('price', 15000), 'cash'), true);
  perform set_config('t.res_c2', pg_temp.try(current_setting('t.opc')::uuid, 't.kc', jsonb_build_object('price', 15000), 'cash'), true);
  -- 3. down payment changed; down payment removed
  perform set_config('t.res_d', pg_temp.try(current_setting('t.opd')::uuid, 't.kd', jsonb_build_object('down_payment', 8000), null), true);
  perform set_config('t.kz_down', (select payment_id::text from public.payment_line
                                    where contract_id = current_setting('t.kz')::uuid and kind = 'down_payment'), true);
  perform set_config('t.res_z', pg_temp.try(current_setting('t.opz')::uuid, 't.kz', jsonb_build_object('down_payment', 0), null), true);
  -- 4. cash price changed; then the same values again (nothing to do); then a key cash does not take
  perform set_config('t.res_cash', pg_temp.try(current_setting('t.opcash')::uuid, 't.kcash', jsonb_build_object('price', 6500), null), true);
  perform set_config('t.res_same', pg_temp.try(gen_random_uuid(), 't.kcash', jsonb_build_object('price', 6500, 'product_desc', 'TV'), null), true);
  perform set_config('t.res_cash_rate', pg_temp.try(gen_random_uuid(), 't.kcash', jsonb_build_object('rate', 10), null), true);
  -- 5. imported: money key rejected, product accepted
  perform set_config('t.res_imp_price', pg_temp.try(gen_random_uuid(), 't.kimp', jsonb_build_object('price', 20000), null), true);
  perform set_config('t.res_imp_desc', pg_temp.try(gen_random_uuid(), 't.kimp', jsonb_build_object('product_desc', ' New fridge '), null), true);
  -- 6. validation
  perform set_config('t.res_down_ge', pg_temp.try(gen_random_uuid(), 't.kd', jsonb_build_object('down_payment', 25000), null), true);
  perform set_config('t.res_future', pg_temp.try(gen_random_uuid(), 't.kd',
    jsonb_build_object('sale_date', ((now() at time zone 'Africa/Cairo')::date + 1)::text), null), true);
  perform set_config('t.res_years', pg_temp.try(gen_random_uuid(), 't.kd', jsonb_build_object('years', 6), null), true);
  -- 7. history: product rename on kh
  perform set_config('t.res_h', pg_temp.try(current_setting('t.oph')::uuid, 't.kh', jsonb_build_object('product_desc', 'Renamed'), null), true);
  -- 8. void
  perform set_config('t.res_void', pg_temp.try(gen_random_uuid(), 't.kv', jsonb_build_object('product_desc', 'x'), null), true);
  -- 9. cut then raise: the refunded money is not allocated again
  perform set_config('t.res_q1', pg_temp.try(gen_random_uuid(), 't.kq', jsonb_build_object('price', 15000), 'cash'), true);
  perform set_config('t.res_q2', pg_temp.try(gen_random_uuid(), 't.kq', jsonb_build_object('price', 25000), null), true);
end $$;
reset role;

-- 1. price raised on a contract with 3 paid installments
insert into tap(l) select is((select sum(amount_paid) from public.installment where contract_id = current_setting('t.kr')::uuid),
  1950.00, 'raise: total amount_paid unchanged');
insert into tap(l) select is(pg_temp.pays(current_setting('t.kr')::uuid), current_setting('t.kr_pays'),
  'raise: same payments, every received_at unchanged');
insert into tap(l) select is((select count(*)::int from public.payment where id in
    (select payment_id from public.payment_line where contract_id = current_setting('t.kr')::uuid)), 4,
  'raise: payments count unchanged (down + 3)');
insert into tap(l) select is(pg_temp.sched(current_setting('t.kr')::uuid, 4),
  '1:paid:812.50,2:paid:812.50,3:partial:325.00,4:pending:0.00', 'raise: installments re-filled oldest-first');
insert into tap(l) select is((select count(*) filter (where amount_due = 812.50) || '/' || count(*) || '/' || sum(amount_due)
    from public.installment where contract_id = current_setting('t.kr')::uuid), '24/24/19500.00',
  'raise: new schedule is 812.50 x 24 (NOTAH 3.2)');
insert into tap(l) select is((select min(due_date)::text from public.installment where contract_id = current_setting('t.kr')::uuid),
  ((current_setting('t.today')::date + interval '1 month')::date)::text, 'raise: first due one month after the sale');
insert into tap(l) select is((select sum(pa.amount) from public.payment_allocation pa join public.installment i on i.id = pa.installment_id
    where i.contract_id = current_setting('t.kr')::uuid), 1950.00, 'raise: allocations sum to amount_paid');
insert into tap(l) select is(current_setting('t.res_r')::jsonb, '{"refund": 0, "total": 29500.00}'::jsonb, 'raise: returns refund 0 and the new total');
insert into tap(l) select is((select total_price || '|' || down_payment || '|' || trim_scale(interest_rate * 100) || '|' || num_installments
    from public.contract where id = current_setting('t.kr')::uuid), '25000.00|10000.00|30|24', 'raise: contract fields updated');

-- 2. price cut below paid
insert into tap(l) select is(current_setting('t.res_c_nomethod'), '22023', 'cut: excess with no refund method raises 22023');
insert into tap(l) select is(current_setting('t.res_c_badmethod'), '22023', 'cut: excess with an invalid method raises 22023');
insert into tap(l) select is((select count(*)::int from public.installment where contract_id = current_setting('t.kc')::uuid and status <> 'paid'), 0,
  'cut: every installment is paid');
insert into tap(l) select is((select sum(amount_due) || '/' || sum(amount_paid) from public.installment where contract_id = current_setting('t.kc')::uuid),
  '6500.00/6500.00', 'cut: new total 6500 fully paid');
insert into tap(l) select is((select amount || '|' || method || '|' || reason || '|' || (customer_id = current_setting('t.ca')::uuid)
    from public.refund where op_id = current_setting('t.opc')::uuid), '8500.00|cash|correction|true', 'cut: refund is the exact excess 8500');
insert into tap(l) select is(current_setting('t.res_c')::jsonb, '{"refund": 8500.00, "total": 16500.00}'::jsonb, 'cut: returned refund matches');
insert into tap(l) select is(pg_temp.pays(current_setting('t.kc')::uuid), current_setting('t.kc_pays'), 'cut: payments untouched');
insert into tap(l) select is((select string_agg(coalesce((select sum(pa.amount) from public.payment_allocation pa where pa.payment_id = p.id)::text, '-'), ',' order by p.received_at, p.id)
    from public.payment p join public.payment_line pl on pl.payment_id = p.id
    where pl.contract_id = current_setting('t.kc')::uuid and pl.kind = 'installment'), '5000.00,1500.00,-',
  'cut: oldest payments allocated first, capped at the balance');

-- idempotent
insert into tap(l) select is(current_setting('t.res_c2'), current_setting('t.res_c'), 'same p_id twice returns the stored result');
insert into tap(l) select is((select count(*)::int from public.refund where contract_id = current_setting('t.kc')::uuid), 1, 'same p_id twice: one refund');
insert into tap(l) select is((select count(*)::int from public.audit_log where action = 'contract_correct' and entity_id = current_setting('t.kc')::uuid), 1,
  'same p_id twice: one audit row');
insert into tap(l) select is((select jsonb_build_array(entity_type, before_json->'price', after_json->'price', after_json->>'op_id', before_json->'years', after_json->'rate')
    from public.audit_log where action = 'contract_correct' and entity_id = current_setting('t.kc')::uuid),
  jsonb_build_array('contract', 25000.00, 15000.00, current_setting('t.opc'), 2, 30), 'audit row: before/after user fields and op_id');

-- 3. down payment
insert into tap(l) select is((select p.amount || '|' || pl.amount || '|' || (p.edited_at is not null) from public.payment_line pl join public.payment p on p.id = pl.payment_id
    where pl.contract_id = current_setting('t.kd')::uuid and pl.kind = 'down_payment'), '8000.00|8000.00|true', 'down: the down payment follows');
insert into tap(l) select is(current_setting('t.res_d')::jsonb, '{"refund": 0, "total": 30100.00}'::jsonb, 'down: new total = 8000 + 17000 x 1.3');
insert into tap(l) select is((select count(*)::int from public.payment where id = current_setting('t.kz_down')::uuid)
    || '/' || (select count(*) from public.payment_line where contract_id = current_setting('t.kz')::uuid), '0/0', 'down to 0: the down payment is removed');
insert into tap(l) select is((select sum(amount_due) from public.installment where contract_id = current_setting('t.kz')::uuid), 32500.00,
  'down to 0: schedule rebuilt on 25000 financed');

-- 4. cash
insert into tap(l) select is((select p.amount || '|' || pl.amount || '|' || c.total_price || '|' || c.down_payment
    from public.payment_line pl join public.payment p on p.id = pl.payment_id join public.contract c on c.id = pl.contract_id
    where pl.contract_id = current_setting('t.kcash')::uuid), '6500.00|6500.00|6500.00|6500.00', 'cash: the cash payment follows the price');
insert into tap(l) select is(current_setting('t.res_cash')::jsonb, '{"refund": 0, "total": 6500.00}'::jsonb, 'cash: returns the new total');
insert into tap(l) select is((current_setting('t.res_same')::jsonb = '{"total": 6500, "refund": 0}'::jsonb) || '|' ||
    (select count(*) from public.audit_log where action = 'contract_correct' and entity_id = current_setting('t.kcash')::uuid),
  'true|1', 'unchanged input writes nothing');
insert into tap(l) select is(current_setting('t.res_cash_rate'), '22023', 'cash: a rate key raises 22023');

-- 5. imported
insert into tap(l) select is(current_setting('t.res_imp_price'), '22023', 'imported: price key raises 22023');
insert into tap(l) select is((select product_desc from public.contract where id = current_setting('t.kimp')::uuid), 'New fridge', 'imported: product only is ok');

-- 6. validation
insert into tap(l) select is(current_setting('t.res_down_ge'), '22023', 'down >= price raises 22023');
insert into tap(l) select is(current_setting('t.res_future'), '22023', 'future sale date raises 22023');
insert into tap(l) select is(current_setting('t.res_years'), '22023', 'years above 5 raises 22023');

-- 8. void
insert into tap(l) select is(current_setting('t.res_void'), '22023', 'void contract raises 22023');

-- 9. cut then raise
insert into tap(l) select is((current_setting('t.res_q1')::jsonb = '{"refund": 8500, "total": 16500}'::jsonb) || '|' ||
    (current_setting('t.res_q2')::jsonb = '{"refund": 0, "total": 29500}'::jsonb) || '|' ||
    (select sum(amount_paid) from public.installment where contract_id = current_setting('t.kq')::uuid) || '|' ||
    (select count(*) from public.refund where contract_id = current_setting('t.kq')::uuid),
  'true|true|6500.00|1', 'cut then raise: refunded money is not re-allocated');

-- reminders follow the rebuilt schedule
insert into tap(l) select is((select i.seq_no || '|' || i.contract_id::text from public.message_log m join public.installment i on i.id = m.installment_id
    where m.contract_id = current_setting('t.kr')::uuid), '2|' || current_setting('t.kr'), 'raise: a reminder points at the new installment 2');

-- other shop / viewer
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', current_setting('t.uid_b'), 'role', 'authenticated')::text, true);
do $$ begin
  perform set_config('t.res_xshop', pg_temp.try(gen_random_uuid(), 't.kh', jsonb_build_object('product_desc', 'hack'), null), true);
  perform set_config('t.b_hist', (select count(*)::text from public.v_contract_history), true);
end $$;
reset role;
update public.profile set role = 'viewer' where id = current_setting('t.uid_a')::uuid;
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', current_setting('t.uid_a'), 'role', 'authenticated')::text, true);
do $$ begin
  perform set_config('t.res_viewer', pg_temp.try(gen_random_uuid(), 't.kh', jsonb_build_object('product_desc', 'viewer'), null), true);
end $$;
reset role;
update public.profile set role = 'owner' where id = current_setting('t.uid_a')::uuid;
insert into tap(l) select is(current_setting('t.res_xshop'), '42501', 'another shop raises 42501');
insert into tap(l) select is(current_setting('t.res_viewer'), '42501', 'a viewer raises 42501');
insert into tap(l) select is((select product_desc from public.contract where id = current_setting('t.kh')::uuid), 'Renamed', 'rejected calls left the contract unchanged');

-- v_contract_history (as shop A)
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', current_setting('t.uid_a'), 'role', 'authenticated')::text, true);
do $$ begin
  perform set_config('t.hist_h', (select string_agg(action, ',' order by action) from public.v_contract_history
                                   where contract_id = current_setting('t.kh')::uuid), true);
  perform set_config('t.hist_o', (select string_agg(action, ',' order by action) from public.v_contract_history
                                   where contract_id = current_setting('t.ko')::uuid), true);
  perform set_config('t.hist_v', (select string_agg(action, ',' order by action) from public.v_contract_history
                                   where contract_id = current_setting('t.kv')::uuid), true);
  perform set_config('t.hist_h_after', (select after_json->>'product_desc' from public.v_contract_history
                                   where contract_id = current_setting('t.kh')::uuid and action = 'contract_correct'), true);
end $$;
reset role;
insert into tap(l) select is(current_setting('t.hist_h'), 'contract_correct,payment_edit', 'history: the correction and the payment edit of that contract only');
insert into tap(l) select is(current_setting('t.hist_o') || '|' || current_setting('t.hist_v'), 'payment_edit|contract_cancel', 'history: other contracts show only their own rows');
insert into tap(l) select is(current_setting('t.hist_h_after'), 'Renamed', 'history: after_json carries the new fields');
insert into tap(l) select is(current_setting('t.b_hist'), '0', 'history: another shop sees nothing');

-- anon
insert into tap(l) select is(has_function_privilege('anon', 'public.correct_contract(uuid,uuid,jsonb,text)', 'execute')
  || '|' || has_table_privilege('anon', 'public.v_contract_history', 'select'), 'false|false', 'anon: no execute, no select on the history');

insert into tap(l) select * from finish();
select string_agg(l, E'\n' order by n) as tap from tap;
rollback;
