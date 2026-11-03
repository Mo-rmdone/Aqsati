-- supabase/tests/refund_cancel_test.sql
-- 0029: refund table, cancel_contract, void guards on record_payment / update_payment,
-- void-aware views, KPI collected minus refunds.
begin;
create temp table tap(n serial, l text);
insert into tap(l) select plan(30);

-- shop B first (cross-shop check), shop A last
do $$
declare a uuid; b uuid; ca uuid;
begin
  b := tests.as_new_owner('Shop RB');
  perform set_config('t.b', b::text, true);
  perform set_config('t.uid_b', (select id::text from public.profile where tenant_id = b), true);
  a := tests.as_new_owner('Shop RA');
  perform set_config('t.a', a::text, true);
  perform set_config('t.uid_a', (select id::text from public.profile where tenant_id = a), true);
  insert into public.customer(tenant_id, name, phone) values (a, 'R-cust', '01000000011') returning id into ca;
  perform set_config('t.ca', ca::text, true);
  perform set_config('t.k',    gen_random_uuid()::text, true);  -- contract to cancel (down 1000)
  perform set_config('t.k2',   gen_random_uuid()::text, true);  -- second contract (down 500)
  perform set_config('t.p2',   gen_random_uuid()::text, true);  -- 200 on k2, later moved onto k
  perform set_config('t.op',   gen_random_uuid()::text, true);  -- the cancel op id
  perform set_config('t.mstart', (date_trunc('month', now() at time zone 'Africa/Cairo')::date)::text, true);
end $$;

-- shop A owner: two sales, one payment, failed cancels, then the cancel
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', current_setting('t.uid_a'), 'role', 'authenticated')::text, true);
do $$
declare r uuid;
begin
  r := public.create_sale(jsonb_build_object('id', current_setting('t.k'), 'customer_id', current_setting('t.ca'),
    'product_desc', 'Fridge', 'sale_type', 'installment', 'total_price', 10000,
    'sale_date', ((now() at time zone 'Africa/Cairo')::date)::text,
    'down_payment', 1000, 'rate_percent', 12, 'years', 1));
  r := public.create_sale(jsonb_build_object('id', current_setting('t.k2'), 'customer_id', current_setting('t.ca'),
    'product_desc', 'Fan', 'sale_type', 'installment', 'total_price', 5000,
    'sale_date', ((now() at time zone 'Africa/Cairo')::date)::text,
    'down_payment', 500, 'rate_percent', 12, 'years', 1));
  r := public.record_payment(current_setting('t.p2')::uuid, current_setting('t.ca')::uuid, 'cash',
    jsonb_build_array(jsonb_build_object('contract_id', current_setting('t.k2'), 'amount', 200)));
end $$;
reset role;

-- k's first installment is past due, so k would show in every follow-up list if it were live
update public.installment set due_date = (now() at time zone 'Africa/Cairo')::date - 5
  where contract_id = current_setting('t.k')::uuid and seq_no = 1;

set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', current_setting('t.uid_a'), 'role', 'authenticated')::text, true);
do $$
declare r uuid;
begin
  begin perform public.cancel_contract(gen_random_uuid(), current_setting('t.k')::uuid, 1001, 'cash', null);
    perform set_config('t.over', 'ok', true);
  exception when others then perform set_config('t.over', sqlstate, true); end;
  begin perform public.cancel_contract(gen_random_uuid(), current_setting('t.k')::uuid, -1, 'cash', null);
    perform set_config('t.neg', 'ok', true);
  exception when others then perform set_config('t.neg', sqlstate, true); end;
  begin perform public.cancel_contract(gen_random_uuid(), current_setting('t.k')::uuid, 300, 'gold', null);
    perform set_config('t.badm', 'ok', true);
  exception when others then perform set_config('t.badm', sqlstate, true); end;

  r := public.cancel_contract(current_setting('t.op')::uuid, current_setting('t.k')::uuid, 300, 'cash', '  رجّع التلاجة  ');
  perform set_config('t.ret', r::text, true);
  -- retry with the same op id: no second refund, no error
  r := public.cancel_contract(current_setting('t.op')::uuid, current_setting('t.k')::uuid, 300, 'cash', '  رجّع التلاجة  ');
  perform set_config('t.ret2', r::text, true);

  begin perform public.cancel_contract(gen_random_uuid(), current_setting('t.k')::uuid, 0, null, null);
    perform set_config('t.again', 'ok', true);
  exception when others then perform set_config('t.again', sqlstate, true); end;

  begin perform public.record_payment(gen_random_uuid(), current_setting('t.ca')::uuid, 'cash',
      jsonb_build_array(jsonb_build_object('contract_id', current_setting('t.k'), 'amount', 100)));
    perform set_config('t.rp', 'ok', true);
  exception when others then perform set_config('t.rp', sqlstate, true); end;
  begin perform public.update_payment(current_setting('t.p2')::uuid, 'cash',
      jsonb_build_array(jsonb_build_object('contract_id', current_setting('t.k'), 'amount', 200)));
    perform set_config('t.up', 'ok', true);
  exception when others then perform set_config('t.up', sqlstate, true); end;
end $$;
reset role;

insert into tap(l) select is(current_setting('t.over'), '22023', 'refund above the paid total raises 22023');
insert into tap(l) select is(current_setting('t.neg'), '22023', 'negative refund raises 22023');
insert into tap(l) select is(current_setting('t.badm'), '22023', 'refund with an invalid method raises 22023');
insert into tap(l) select is(current_setting('t.ret'), current_setting('t.k'), 'cancel_contract returns the contract id');
insert into tap(l) select is(current_setting('t.ret2'), current_setting('t.k'), 'retry with the same op id returns the contract id');
insert into tap(l) select is((select status || '|' || (cancelled_at is not null) || '|' || cancel_reason from public.contract where id = current_setting('t.k')::uuid),
  'void|true|رجّع التلاجة', 'contract is void with cancelled_at and the trimmed reason');
insert into tap(l) select is((select count(*)::int from public.refund where contract_id = current_setting('t.k')::uuid), 1, 'one refund row after the retry');
insert into tap(l) select is((select amount || '|' || method || '|' || reason || '|' || (op_id = current_setting('t.op')::uuid) || '|' || (customer_id = current_setting('t.ca')::uuid)
    from public.refund where contract_id = current_setting('t.k')::uuid), '300.00|cash|cancel|true|true', 'refund row: 300 cash, reason cancel, op id and customer');
insert into tap(l) select is((select count(*)::int from public.audit_log where tenant_id = current_setting('t.a')::uuid
    and action = 'contract_cancel' and entity_type = 'contract' and entity_id = current_setting('t.k')::uuid), 1, 'one contract_cancel audit row');
insert into tap(l) select is((select (after_json->>'refund')::numeric || '|' || (after_json->>'method') || '|' || (after_json->>'reason')
    from public.audit_log where action = 'contract_cancel' and entity_id = current_setting('t.k')::uuid), '300|cash|رجّع التلاجة', 'audit after_json has refund, method, reason');
insert into tap(l) select is(current_setting('t.again'), '22023', 'cancelling a void contract again raises 22023');
insert into tap(l) select is(current_setting('t.rp'), '22023', 'record_payment onto a void contract raises 22023');
insert into tap(l) select is(current_setting('t.up'), '22023', 'update_payment moving a line onto a void contract raises 22023');
insert into tap(l) select is((select string_agg(contract_id || ':' || amount, ',') from public.payment_line where payment_id = current_setting('t.p2')::uuid),
  current_setting('t.k2') || ':200.00', 'the rejected update left the payment on its contract');

-- views
insert into tap(l) select is((select status from public.v_contract_balance where contract_id = current_setting('t.k')::uuid), 'void', 'v_contract_balance keeps the void row with its status');
insert into tap(l) select is((select status || '|' || remaining || '|' || overdue_count || '|' || coalesce(next_due_date::text, '-') || '|' || (cancelled_at is not null)
    from public.v_invoice_list where contract_id = current_setting('t.k')::uuid), 'cancelled|0|0|-|true', 'v_invoice_list: cancelled, nothing remaining or due');
insert into tap(l) select is((select invoice_count from public.v_customer_summary where customer_id = current_setting('t.ca')::uuid), 1, 'v_customer_summary counts only the live invoice');
insert into tap(l) select is((select count(*)::int from public.v_worklist where contract_id = current_setting('t.k')::uuid), 0, 'v_worklist excludes the void contract');
insert into tap(l) select is((select count(*)::int from public.v_installment_aging where contract_id = current_setting('t.k')::uuid), 0, 'v_installment_aging excludes the void contract');
insert into tap(l) select is((select count(*)::int from public.v_followup where customer_id = current_setting('t.ca')::uuid), 0,
  'v_followup drops the customer once the past-due contract is void');
insert into tap(l) select is((select kind || ':' || amount from public.v_recent_activity
    where tenant_id = current_setting('t.a')::uuid and kind = 'refund'), 'refund:300.00', 'v_recent_activity has the refund as a positive amount');

-- KPI: payments today (1000 + 500 + 200) minus the 300 refund
insert into tap(l) select is((select collected_this_month from public.v_collections_kpi where tenant_id = current_setting('t.a')::uuid),
  1400.00, 'collected_this_month = payments - refunds');
insert into tap(l) select is((select overdue_total from public.v_collections_kpi where tenant_id = current_setting('t.a')::uuid),
  null, 'overdue_total ignores the past-due void contract');
insert into tap(l) select is((select expected_this_week from public.v_collections_kpi where tenant_id = current_setting('t.a')::uuid),
  (select sum(amount_due - amount_paid) from public.installment i join public.contract c on c.id = i.contract_id
    where c.tenant_id = current_setting('t.a')::uuid and c.status <> 'void'
      and i.due_date between (now() at time zone 'Africa/Cairo')::date and (now() at time zone 'Africa/Cairo')::date + 7),
  'expected_this_week counts only non-void contracts');
-- a refund dated last month does not change this month
insert into public.refund(tenant_id, contract_id, customer_id, amount, method, refunded_at, reason, op_id, created_by)
values (current_setting('t.a')::uuid, current_setting('t.k')::uuid, current_setting('t.ca')::uuid, 50, 'cash',
        (current_setting('t.mstart')::date - 1)::timestamp at time zone 'Africa/Cairo' + interval '12 hours', 'correction',
        gen_random_uuid(), current_setting('t.uid_a')::uuid);
insert into tap(l) select is((select collected_this_month from public.v_collections_kpi where tenant_id = current_setting('t.a')::uuid),
  1400.00, 'a refund dated last month leaves this month unchanged');

-- shop B cannot cancel shop A's contract; row unchanged
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', current_setting('t.uid_b'), 'role', 'authenticated')::text, true);
do $$
begin
  begin perform public.cancel_contract(gen_random_uuid(), current_setting('t.k2')::uuid, 0, null, 'hack');
    perform set_config('t.xshop', 'ok', true);
  exception when others then perform set_config('t.xshop', sqlstate, true); end;
  perform set_config('t.b_refunds', (select count(*)::text from public.refund), true);
end $$;
reset role;
insert into tap(l) select is(current_setting('t.xshop'), '42501', 'another shop cancelling raises 42501');
insert into tap(l) select is((select status || '|' || (cancelled_at is null) || '|' || (cancel_reason is null) from public.contract where id = current_setting('t.k2')::uuid),
  'active|true|true', 'the other shop left the contract unchanged');
insert into tap(l) select is(current_setting('t.b_refunds'), '0', 'another shop sees no refund rows (RLS)');

-- viewer rejected
update public.profile set role = 'viewer' where id = current_setting('t.uid_a')::uuid;
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', current_setting('t.uid_a'), 'role', 'authenticated')::text, true);
do $$
begin
  begin perform public.cancel_contract(gen_random_uuid(), current_setting('t.k2')::uuid, 0, null, null);
    perform set_config('t.viewer', 'ok', true);
  exception when others then perform set_config('t.viewer', sqlstate, true); end;
end $$;
reset role;
update public.profile set role = 'owner' where id = current_setting('t.uid_a')::uuid;
insert into tap(l) select is(current_setting('t.viewer'), '42501', 'a viewer cannot cancel');

insert into tap(l) select is(has_function_privilege('anon', 'public.cancel_contract(uuid,uuid,numeric,text,text)', 'execute'), false, 'anon has no execute on cancel_contract');

insert into tap(l) select * from finish();
select string_agg(l, E'\n' order by n) as tap from tap;
rollback;
