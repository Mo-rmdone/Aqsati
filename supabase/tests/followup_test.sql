-- supabase/tests/followup_test.sql
-- 0023: contact_log + v_followup.
begin;
create temp table tap(n serial, l text);
insert into tap(l) select plan(25);

do $$
declare w uuid; v uuid;
begin
  w := tests.as_new_owner('Shop FW');
  perform set_config('t.uid_w', (select id::text from public.profile where tenant_id = w), true);
  v := tests.as_new_owner('Shop FV');
  perform set_config('t.v', v::text, true);
  perform set_config('t.uid', (select id::text from public.profile where tenant_id = v), true);
  perform set_config('t.today', ((now() at time zone 'Africa/Cairo')::date)::text, true);
  insert into public.customer(tenant_id, name, phone) values
    (v, 'F-two', '01000000001'), (v, 'F-none', '01000000002'), (v, 'F-today', '01000000003'),
    (v, 'F-yest', '01000000004'), (v, 'F-prom3', '01000000005'), (v, 'F-promtoday', '01000000006'),
    (v, 'F-last', '01000000007'), (v, 'F-far', '01000000008'), (v, 'F-near', '01000000009');
  perform set_config('t.k_two_a', gen_random_uuid()::text, true);
  perform set_config('t.k_two_b', gen_random_uuid()::text, true);
  perform set_config('t.k_none', gen_random_uuid()::text, true);
  perform set_config('t.k_today', gen_random_uuid()::text, true);
  perform set_config('t.k_yest', gen_random_uuid()::text, true);
  perform set_config('t.k_prom3', gen_random_uuid()::text, true);
  perform set_config('t.k_promtoday', gen_random_uuid()::text, true);
  perform set_config('t.k_last', gen_random_uuid()::text, true);
  perform set_config('t.k_far', gen_random_uuid()::text, true);
  perform set_config('t.k_near', gen_random_uuid()::text, true);
end $$;

set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', current_setting('t.uid'), 'role', 'authenticated')::text, true);

do $$
declare r uuid; today date := current_setting('t.today')::date; x record;
begin
  for x in select * from (values
    ('F-two','t.k_two_a'), ('F-two','t.k_two_b'), ('F-none','t.k_none'), ('F-today','t.k_today'),
    ('F-yest','t.k_yest'), ('F-prom3','t.k_prom3'), ('F-promtoday','t.k_promtoday'), ('F-last','t.k_last'),
    ('F-far','t.k_far'), ('F-near','t.k_near')) as t(cname, kname)
  loop
    r := public.create_sale(jsonb_build_object('id', current_setting(x.kname),
      'customer_id', (select id from public.customer where name = x.cname),
      'product_desc', 'Item', 'sale_type', 'installment', 'total_price', 10000, 'sale_date', today::text,
      'down_payment', 2000, 'rate_percent', 12, 'years', 1));
  end loop;
end $$;
reset role;

-- age installments: everyone late except F-far (+10 days) and F-near (+5 days)
update public.installment set due_date = current_setting('t.today')::date - 60
  where seq_no = 1 and contract_id in (
    current_setting('t.k_two_a')::uuid, current_setting('t.k_two_b')::uuid, current_setting('t.k_none')::uuid,
    current_setting('t.k_today')::uuid, current_setting('t.k_yest')::uuid, current_setting('t.k_prom3')::uuid,
    current_setting('t.k_promtoday')::uuid, current_setting('t.k_last')::uuid);
update public.installment set due_date = current_setting('t.today')::date + 10
  where seq_no = 1 and contract_id = current_setting('t.k_far')::uuid;
update public.installment set due_date = current_setting('t.today')::date + 5
  where seq_no = 1 and contract_id = current_setting('t.k_near')::uuid;

-- contact rows, written as the owner through RLS
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', current_setting('t.uid'), 'role', 'authenticated')::text, true);
do $$
declare today date := current_setting('t.today')::date; id1 uuid;
begin
  insert into public.contact_log(tenant_id, customer_id, kind, note, created_at)
  values (current_setting('t.v')::uuid, (select id from public.customer where name = 'F-today'), 'call', 'spoke',
          ((today::timestamp + interval '9 hours') at time zone 'Africa/Cairo'))
  returning id into id1;
  perform set_config('t.row1', id1::text, true);
  insert into public.contact_log(tenant_id, customer_id, kind, created_at)
  values (current_setting('t.v')::uuid, (select id from public.customer where name = 'F-yest'), 'call',
          (((today - 1)::timestamp + interval '23 hours 30 minutes') at time zone 'Africa/Cairo'));
  insert into public.contact_log(tenant_id, customer_id, kind, note, promise_date)
  values (current_setting('t.v')::uuid, (select id from public.customer where name = 'F-prom3'), 'note', 'will pay', today + 3);
  insert into public.contact_log(tenant_id, customer_id, kind, note, promise_date)
  values (current_setting('t.v')::uuid, (select id from public.customer where name = 'F-promtoday'), 'note', 'today', today);
  insert into public.contact_log(tenant_id, customer_id, kind, note, created_at)
  values (current_setting('t.v')::uuid, (select id from public.customer where name = 'F-last'), 'note', 'old', now() - interval '2 hours'),
         (current_setting('t.v')::uuid, (select id from public.customer where name = 'F-last'), 'whatsapp', 'new', now() - interval '1 hour');
end $$;

-- update / delete: no policy, so zero rows are affected
do $$
declare n_up int; n_del int;
begin
  update public.contact_log set note = 'tampered' where id = current_setting('t.row1')::uuid;
  get diagnostics n_up = row_count;
  delete from public.contact_log where id = current_setting('t.row1')::uuid;
  get diagnostics n_del = row_count;
  perform set_config('t.n_up', n_up::text, true);
  perform set_config('t.n_del', n_del::text, true);
end $$;

-- constraint violations (as owner)
do $$
begin
  begin
    insert into public.contact_log(tenant_id, customer_id, kind, promise_date)
    values (current_setting('t.v')::uuid, (select id from public.customer where name = 'F-none'), 'call', current_date + 1);
    perform set_config('t.chk_call', 'inserted', true);
  exception when others then perform set_config('t.chk_call', sqlstate, true); end;
  begin
    insert into public.contact_log(tenant_id, customer_id, kind, note)
    values (current_setting('t.v')::uuid, (select id from public.customer where name = 'F-none'), 'note', repeat('x', 501));
    perform set_config('t.chk_len', 'inserted', true);
  exception when others then perform set_config('t.chk_len', sqlstate, true); end;
end $$;
reset role;

-- viewer-role insert is rejected (role is read from profile)
update public.profile set role = 'viewer' where id = current_setting('t.uid')::uuid;
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', current_setting('t.uid'), 'role', 'authenticated')::text, true);
do $$
begin
  begin
    insert into public.contact_log(tenant_id, customer_id, kind)
    values (current_setting('t.v')::uuid, (select id from public.customer where name = 'F-none'), 'call');
    perform set_config('t.viewer', 'inserted', true);
  exception when others then perform set_config('t.viewer', sqlstate, true); end;
end $$;
reset role;
update public.profile set role = 'owner' where id = current_setting('t.uid')::uuid;

-- crud
insert into tap(l) select is((select count(*)::int from public.contact_log where id = current_setting('t.row1')::uuid), 1, 'owner insert works');
insert into tap(l) select is(current_setting('t.viewer'), '42501', 'viewer insert rejected by RLS');
insert into tap(l) select is(current_setting('t.n_up') || ':' || (select note from public.contact_log where id = current_setting('t.row1')::uuid), '0:spoke', 'update affects 0 rows, note unchanged');
insert into tap(l) select is(current_setting('t.n_del') || ':' || (select count(*) from public.contact_log where id = current_setting('t.row1')::uuid), '0:1', 'delete affects 0 rows, row still present');
insert into tap(l) select is(current_setting('t.chk_call'), '23514', 'promise_date with kind call violates check');
insert into tap(l) select is(current_setting('t.chk_len'), '23514', 'note over 500 chars violates check');

-- view: aggregation
insert into tap(l) select is((select count(*)::int from public.v_followup where name = 'F-two'), 1, 'two late contracts: one row');
insert into tap(l) select is((select overdue_amount from public.v_followup where name = 'F-two'),
  (select sum(amount_due - amount_paid) from public.installment where seq_no = 1
     and contract_id in (current_setting('t.k_two_a')::uuid, current_setting('t.k_two_b')::uuid)),
  'overdue_amount is the sum across contracts');
insert into tap(l) select is((select overdue_count from public.v_followup where name = 'F-two'), 2, 'overdue_count 2');
insert into tap(l) select is((select days_late from public.v_followup where name = 'F-two'), 60, 'days_late from oldest past-due date');
insert into tap(l) select is((select status from public.v_followup where name = 'F-two'), 'late', 'status late');

-- view: buckets
insert into tap(l) select is((select bucket from public.v_followup where name = 'F-none'), 0, 'no contact: bucket 0');
insert into tap(l) select is((select bucket from public.v_followup where name = 'F-today'), 2, 'call at Cairo today 09:00: bucket 2');
insert into tap(l) select is((select contacted_today from public.v_followup where name = 'F-today'), true, 'call today: contacted_today');
insert into tap(l) select is((select bucket from public.v_followup where name = 'F-yest'), 0, 'call at Cairo yesterday 23:30: bucket 0');
insert into tap(l) select is((select contacted_today from public.v_followup where name = 'F-yest'), false, 'call yesterday: not contacted_today');
insert into tap(l) select is((select bucket from public.v_followup where name = 'F-prom3'), 1, 'future promise: bucket 1');
insert into tap(l) select is((select promise_date from public.v_followup where name = 'F-prom3'), current_setting('t.today')::date + 3, 'future promise_date exposed');
insert into tap(l) select is((select bucket from public.v_followup where name = 'F-promtoday'), 0, 'promise today: bucket 0');
insert into tap(l) select is((select promise_date from public.v_followup where name = 'F-promtoday'), null::date, 'promise today: promise_date null');

-- view: last contact
insert into tap(l) select is((select last_note || ':' || last_contact_kind from public.v_followup where name = 'F-last'), 'new:whatsapp', 'last_note and last_contact_kind are the newest row');

-- view: window
insert into tap(l) select is((select count(*)::int from public.v_followup where name = 'F-far'), 0, 'due in 10 days: not in view');
insert into tap(l) select is((select status || ':' || days_late from public.v_followup where name = 'F-near'), 'due:0', 'due in 5 days: status due, days_late 0');

-- isolation
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', current_setting('t.uid_w'), 'role', 'authenticated')::text, true);
select set_config('t.w_cl', (select count(*) from public.contact_log)::text, true);
select set_config('t.w_fu', (select count(*) from public.v_followup)::text, true);
reset role;
insert into tap(l) select is(current_setting('t.w_cl'), '0', 'other shop sees 0 contact_log rows');
insert into tap(l) select is(current_setting('t.w_fu'), '0', 'other shop sees 0 v_followup rows');

insert into tap(l) select * from finish();
select string_agg(l, E'\n' order by n) as tap from tap;
rollback;
