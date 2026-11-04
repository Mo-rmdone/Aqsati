-- supabase/tests/correct_contract_fixes_test.sql
-- 0031: payment edits after a correction refund, op id bound to one invoice, rate precision,
-- down payment from 0, the shared-payment guard (decision 3), sale-date-only corrections.
begin;
create temp table tap(n serial, l text);
insert into tap(l) select plan(22);

-- runs a correction, returns the result as text or the sqlstate
create function pg_temp.try(p_id uuid, k text, p jsonb, m text) returns text language plpgsql as $$
begin
  return public.correct_contract(p_id, current_setting(k)::uuid, p, m)::text;
exception when others then return sqlstate;
end $$;
-- runs a payment edit, returns 'ok' or the error message
create function pg_temp.edit(k text, m text, c text, amt numeric) returns text language plpgsql as $$
begin
  perform public.update_payment(current_setting(k)::uuid, m,
    jsonb_build_array(jsonb_build_object('contract_id', current_setting(c), 'amount', amt)));
  return 'ok';
exception when others then return sqlerrm;
end $$;
-- allocations per payment of a contract, oldest first ('-' = none)
create function pg_temp.allocs(c uuid) returns text language sql stable as $$
  select string_agg(coalesce((select sum(pa.amount) from public.payment_allocation pa where pa.payment_id = p.id)::text, '-'),
                    ',' order by p.received_at, p.id)
  from public.payment p join public.payment_line pl on pl.payment_id = p.id
  where pl.contract_id = c and pl.kind = 'installment' $$;
-- installment money of a contract: amount_paid | allocations | lines - refunds
create function pg_temp.money(c uuid) returns text language sql stable as $$
  select (select sum(amount_paid) from public.installment where contract_id = c)
      || '|' || (select coalesce(sum(pa.amount), 0) from public.payment_allocation pa
                  join public.installment i on i.id = pa.installment_id where i.contract_id = c)
      || '|' || ((select coalesce(sum(amount), 0) from public.payment_line where contract_id = c and kind = 'installment')
                 - (select coalesce(sum(amount), 0) from public.refund where contract_id = c)) $$;

do $$
declare a uuid; ca uuid; c text;
begin
  a := tests.as_new_owner('Shop FX');
  perform set_config('t.uid', (select id::text from public.profile where tenant_id = a), true);
  insert into public.customer(tenant_id, name, phone) values (a, 'FX-cust', '01000000031') returning id into ca;
  perform set_config('t.ca', ca::text, true);
  perform set_config('t.today', ((now() at time zone 'Africa/Cairo')::date)::text, true);
  foreach c in array array['t.ke','t.k2','t.kp','t.k0','t.kg','t.kcg','t.kt','t.kcd',
                           't.pe1','t.pe2','t.pe3','t.pt','t.ope'] loop
    perform set_config(c, gen_random_uuid()::text, true);
  end loop;
end $$;

set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', current_setting('t.uid'), 'role', 'authenticated')::text, true);
do $$
declare r uuid; c text;
  sale jsonb := jsonb_build_object('customer_id', current_setting('t.ca'), 'product_desc', 'Item',
    'sale_type', 'installment', 'sale_date', current_setting('t.today'),
    'down_payment', 10000, 'rate_percent', 30, 'years', 2, 'total_price', 25000);
begin
  foreach c in array array['t.ke','t.k2','t.kg','t.kt'] loop
    r := public.create_sale(sale || jsonb_build_object('id', current_setting(c)));
  end loop;
  foreach c in array array['t.pe1','t.pe2','t.pe3'] loop
    r := public.record_payment(current_setting(c)::uuid, current_setting('t.ca')::uuid, 'cash',
      jsonb_build_array(jsonb_build_object('contract_id', current_setting('t.ke'), 'amount', 5000)));
  end loop;
  r := public.record_payment(current_setting('t.pt')::uuid, current_setting('t.ca')::uuid, 'cash',
    jsonb_build_array(jsonb_build_object('contract_id', current_setting('t.kt'), 'amount', 1000)));
  r := public.create_sale(sale || jsonb_build_object('id', current_setting('t.kp'), 'rate_percent', 12.345));
  r := public.create_sale(sale || jsonb_build_object('id', current_setting('t.k0'), 'down_payment', 0));
  foreach c in array array['t.kcg','t.kcd'] loop
    r := public.create_sale(jsonb_build_object('id', current_setting(c), 'customer_id', current_setting('t.ca'),
      'product_desc', 'TV', 'sale_type', 'cash', 'total_price', 7000, 'sale_date', current_setting('t.today')));
  end loop;
end $$;
reset role;

-- fixture only: spread ke's three payments in time so "oldest first" is pe1, pe2, pe3
update public.payment set received_at = now() - interval '3 minutes' where id = current_setting('t.pe1')::uuid;
update public.payment set received_at = now() - interval '2 minutes' where id = current_setting('t.pe2')::uuid;
update public.payment set received_at = now() - interval '1 minute'  where id = current_setting('t.pe3')::uuid;
-- decision 3: a down payment and a cash payment that also carry a line for another invoice
insert into public.payment_line(payment_id, contract_id, tenant_id, amount, kind)
select pl.payment_id, current_setting('t.k2')::uuid, pl.tenant_id, 1, 'installment'
  from public.payment_line pl where pl.contract_id in (current_setting('t.kg')::uuid, current_setting('t.kcg')::uuid);
select set_config('t.kt_pay', (select received_at::text from public.payment where id = current_setting('t.pt')::uuid), true);
select set_config('t.kcd_pay', (select p.received_at || '|' || p.amount from public.payment p join public.payment_line pl on pl.payment_id = p.id
  where pl.contract_id = current_setting('t.kcd')::uuid), true);

set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', current_setting('t.uid'), 'role', 'authenticated')::text, true);
do $$
begin
  -- cut ke 25000 -> 15000: 15000 paid, 6500 due, 8500 refunded; allocations 5000 / 1500 / -
  perform set_config('t.cut', pg_temp.try(current_setting('t.ope')::uuid, 't.ke', jsonb_build_object('price', 15000), 'cash'), true);
  perform set_config('t.after_cut', pg_temp.money(current_setting('t.ke')::uuid) || '#' || pg_temp.allocs(current_setting('t.ke')::uuid), true);
  -- (a) method only, on the unallocated payment and on the partly allocated one
  perform set_config('t.m3', pg_temp.edit('t.pe3', 'instapay', 't.ke', 5000), true);
  perform set_config('t.m2', pg_temp.edit('t.pe2', 'instapay', 't.ke', 5000), true);
  perform set_config('t.after_m', pg_temp.money(current_setting('t.ke')::uuid) || '#' || pg_temp.allocs(current_setting('t.ke')::uuid), true);
  perform set_config('t.methods', (select string_agg(method, ',' order by received_at) from public.payment
    where id in (current_setting('t.pe1')::uuid, current_setting('t.pe2')::uuid, current_setting('t.pe3')::uuid)), true);
  -- (b) edits down: lines 4000 + 1000 + 5000 = 10000, minus 8500 refunded = 1500
  perform set_config('t.d1', pg_temp.edit('t.pe1', 'cash', 't.ke', 4000), true);
  perform set_config('t.d2', pg_temp.edit('t.pe2', 'cash', 't.ke', 1000), true);
  perform set_config('t.after_d', pg_temp.money(current_setting('t.ke')::uuid) || '#' || pg_temp.allocs(current_setting('t.ke')::uuid), true);
  -- (c) edit up past the invoice: 4000 + 1000 + 13001 - 8500 = 9501 > 6500
  perform set_config('t.up', pg_temp.edit('t.pe3', 'cash', 't.ke', 13001), true);
  perform set_config('t.after_up', pg_temp.money(current_setting('t.ke')::uuid), true);
  -- (d) a new payment fills the 5000 still open
  perform public.record_payment(gen_random_uuid(), current_setting('t.ca')::uuid, 'cash',
    jsonb_build_array(jsonb_build_object('contract_id', current_setting('t.ke'), 'amount', 5000)));
  perform set_config('t.after_rec', pg_temp.money(current_setting('t.ke')::uuid), true);

  -- op id reused for another invoice
  perform set_config('t.reuse', pg_temp.try(current_setting('t.ope')::uuid, 't.k2', jsonb_build_object('price', 15000), 'cash'), true);
  -- rate precision: 12.345 is stored as 0.1235; resending either form is unchanged
  perform set_config('t.rate1', pg_temp.try(gen_random_uuid(), 't.kp', jsonb_build_object('rate', 12.345), null), true);
  perform set_config('t.rate2', pg_temp.try(gen_random_uuid(), 't.kp', jsonb_build_object('rate', 12.35), null), true);
  -- down payment from 0
  perform set_config('t.down0', pg_temp.try(gen_random_uuid(), 't.k0', jsonb_build_object('down_payment', 5000), null), true);
  -- decision 3 guard
  perform set_config('t.g_down', pg_temp.try(gen_random_uuid(), 't.kg', jsonb_build_object('down_payment', 9000), null), true);
  perform set_config('t.g_cash', pg_temp.try(gen_random_uuid(), 't.kcg', jsonb_build_object('price', 6000), null), true);
  -- sale date only
  perform set_config('t.sd_inst', pg_temp.try(gen_random_uuid(), 't.kt',
    jsonb_build_object('sale_date', (current_setting('t.today')::date - 10)::text), null), true);
  perform set_config('t.sd_cash', pg_temp.try(gen_random_uuid(), 't.kcd',
    jsonb_build_object('sale_date', (current_setting('t.today')::date - 10)::text), null), true);
end $$;
reset role;

-- 1. payment edits after a correction refund
insert into tap(l) select is(current_setting('t.after_cut'), '6500.00|6500.00|6500.00#5000.00,1500.00,-',
  'cut: 6500 paid, allocations 5000 / 1500 / none');
insert into tap(l) select is(current_setting('t.m3') || '|' || current_setting('t.m2'), 'ok|ok',
  'method-only edit works on a payment with an unallocated part');
insert into tap(l) select is(current_setting('t.after_m'), '6500.00|6500.00|6500.00#5000.00,1500.00,-',
  'method-only edits move no money');
insert into tap(l) select is(current_setting('t.methods'), 'cash,instapay,instapay', 'the new methods are saved');
insert into tap(l) select is(current_setting('t.d1') || '|' || current_setting('t.d2'), 'ok|ok', 'edits down succeed');
insert into tap(l) select is(current_setting('t.after_d'), '1500.00|1500.00|1500.00#1500.00,-,-',
  'after edits down: amount_paid = installment lines - refunds, oldest payment first');
insert into tap(l) select is(current_setting('t.up'), 'المبلغ أكبر من المتبقي على العقد', 'edit past the invoice total is rejected');
insert into tap(l) select is(current_setting('t.after_up'), '1500.00|1500.00|1500.00', 'the rejected edit changed nothing');
insert into tap(l) select is(current_setting('t.after_rec'), '6500.00|6500.00|6500.00', 'a new payment fills only what is open');
insert into tap(l) select is((select count(*)::int from public.refund where contract_id = current_setting('t.ke')::uuid), 1,
  'edits never add refunds');

-- 2. op id bound to one invoice
insert into tap(l) select is(current_setting('t.reuse'), '22023', 'reusing an op id for another invoice raises 22023');
insert into tap(l) select is((select total_price from public.contract where id = current_setting('t.k2')::uuid), 25000.00,
  'the other invoice is unchanged');

-- 3. rate precision
insert into tap(l) select is((current_setting('t.rate1')::jsonb = current_setting('t.rate2')::jsonb)::text || '|' ||
    (select count(*) from public.audit_log where action = 'contract_correct' and entity_id = current_setting('t.kp')::uuid),
  'true|0', 'resending the stored rate (12.345 or 12.35) is unchanged and writes nothing');

-- 4. down payment from 0
insert into tap(l) select is((select p.amount || '|' || p.method || '|' || pl.kind || '|' || (p.received_at <= now()) || '|' || c.down_payment
    from public.payment_line pl join public.payment p on p.id = pl.payment_id join public.contract c on c.id = pl.contract_id
    where pl.contract_id = current_setting('t.k0')::uuid and pl.kind = 'down_payment'),
  '5000.00|cash|down_payment|true|5000.00', 'down 0 -> 5000 adds a cash down payment');
insert into tap(l) select is(current_setting('t.down0')::jsonb, '{"refund": 0, "total": 31000}'::jsonb, 'down 0 -> 5000: total = 5000 + 20000 x 1.3');

-- 5. decision 3 guard
insert into tap(l) select is(current_setting('t.g_down') || '|' || current_setting('t.g_cash'), '22023|22023',
  'a down or cash payment shared with another invoice raises 22023');
insert into tap(l) select is((select down_payment || '|' || (select total_price from public.contract where id = current_setting('t.kcg')::uuid)
    from public.contract where id = current_setting('t.kg')::uuid), '10000.00|7000.00', 'the guarded invoices are unchanged');

-- 6. sale date only
insert into tap(l) select is((select start_date::text from public.contract where id = current_setting('t.kt')::uuid)
    || '|' || (select min(due_date)::text from public.installment where contract_id = current_setting('t.kt')::uuid),
  (current_setting('t.today')::date - 10)::text || '|' || ((current_setting('t.today')::date - 10) + interval '1 month')::date::text,
  'installment sale date: contract and schedule move');
insert into tap(l) select is((select received_at::text from public.payment where id = current_setting('t.pt')::uuid)
    || '|' || pg_temp.money(current_setting('t.kt')::uuid), current_setting('t.kt_pay') || '|1000.00|1000.00|1000.00',
  'installment sale date: payment keeps its received_at and stays allocated');
insert into tap(l) select is(current_setting('t.sd_inst')::jsonb, '{"refund": 0, "total": 29500}'::jsonb, 'installment sale date: total unchanged');
insert into tap(l) select is((select start_date::text from public.contract where id = current_setting('t.kcd')::uuid), (current_setting('t.today')::date - 10)::text,
  'cash sale date: contract date moves');
insert into tap(l) select is((select p.received_at || '|' || p.amount from public.payment p join public.payment_line pl on pl.payment_id = p.id
    where pl.contract_id = current_setting('t.kcd')::uuid), current_setting('t.kcd_pay'), 'cash sale date: the cash payment is untouched');

insert into tap(l) select * from finish();
select string_agg(l, E'\n' order by n) as tap from tap;
rollback;
