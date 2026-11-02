-- supabase/tests/followup_hardening_test.sql
-- 0024: contact_log insert policy hardening, no update/delete privilege, v_followup edge cases.
begin;
create temp table tap(n serial, l text);
insert into tap(l) select plan(12);

do $$
declare w uuid; v uuid;
begin
  w := tests.as_new_owner('Shop HW');
  perform set_config('t.uid_w', (select id::text from public.profile where tenant_id = w), true);
  insert into public.customer(tenant_id, name, phone) values (w, 'H-foreign', '01100000000');
  perform set_config('t.fc', (select id::text from public.customer where name = 'H-foreign'), true);
  v := tests.as_new_owner('Shop HV');
  perform set_config('t.v', v::text, true);
  perform set_config('t.uid', (select id::text from public.profile where tenant_id = v), true);
  perform set_config('t.today', ((now() at time zone 'Africa/Cairo')::date)::text, true);
  insert into public.customer(tenant_id, name, phone) values
    (v, 'H-two', '01100000001'), (v, 'H-mid', '01100000002'), (v, 'H-prom', '01100000003'),
    (v, 'H-tie', '01100000004'), (v, 'H-def', '01100000005');
  perform set_config('t.k1', gen_random_uuid()::text, true);
  perform set_config('t.k2', gen_random_uuid()::text, true);
  perform set_config('t.k3', gen_random_uuid()::text, true);
  perform set_config('t.k4', gen_random_uuid()::text, true);
  perform set_config('t.k5', gen_random_uuid()::text, true);
  perform set_config('t.k6', gen_random_uuid()::text, true);
end $$;

set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', current_setting('t.uid'), 'role', 'authenticated')::text, true);
do $$
declare r uuid; today date := current_setting('t.today')::date; x record;
begin
  for x in select * from (values
    ('H-two','t.k1'), ('H-two','t.k2'), ('H-mid','t.k3'), ('H-prom','t.k4'), ('H-tie','t.k5'), ('H-def','t.k6')) as t(cname, kname)
  loop
    r := public.create_sale(jsonb_build_object('id', current_setting(x.kname),
      'customer_id', (select id from public.customer where name = x.cname),
      'product_desc', 'Item', 'sale_type', 'installment', 'total_price', 10000, 'sale_date', today::text,
      'down_payment', 2000, 'rate_percent', 12, 'years', 1));
  end loop;
end $$;
reset role;

update public.installment set due_date = current_setting('t.today')::date - 10
  where seq_no = 1 and contract_id in (
    current_setting('t.k1')::uuid, current_setting('t.k2')::uuid, current_setting('t.k3')::uuid,
    current_setting('t.k4')::uuid, current_setting('t.k5')::uuid, current_setting('t.k6')::uuid);

-- fixtures with controlled timestamps: written as the table owner
do $$
declare today date := current_setting('t.today')::date; v uuid := current_setting('t.v')::uuid;
begin
  insert into public.contact_log(tenant_id, customer_id, kind, note)
  values (v, (select id from public.customer where name = 'H-two'), 'call', 'a'),
         (v, (select id from public.customer where name = 'H-two'), 'whatsapp', 'b');
  -- call at Cairo-today 00:30 (previous UTC day in winter)
  insert into public.contact_log(tenant_id, customer_id, kind, created_at)
  values (v, (select id from public.customer where name = 'H-mid'), 'call',
          ((today::timestamp + interval '30 minutes') at time zone 'Africa/Cairo'));
  -- future promise older, past promise newer
  insert into public.contact_log(tenant_id, customer_id, kind, promise_date, created_at)
  values (v, (select id from public.customer where name = 'H-prom'), 'note', today + 4, now() - interval '2 hours'),
         (v, (select id from public.customer where name = 'H-prom'), 'note', today - 5, now() - interval '1 hour');
  -- identical created_at, tie broken by id desc
  insert into public.contact_log(id, tenant_id, customer_id, kind, note, created_at) values
    ('00000000-0000-0000-0000-00000000000a', v, (select id from public.customer where name = 'H-tie'), 'note', 'low', now() - interval '1 hour'),
    ('ffffffff-ffff-ffff-ffff-fffffffffffe', v, (select id from public.customer where name = 'H-tie'), 'note', 'high', now() - interval '1 hour');
end $$;

-- attempts as the shop-V owner
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', current_setting('t.uid'), 'role', 'authenticated')::text, true);
do $$
declare v uuid := current_setting('t.v')::uuid;
        c_def uuid := (select id from public.customer where name = 'H-def');
begin
  begin
    insert into public.contact_log(tenant_id, customer_id, kind, created_by)
    values (v, c_def, 'call', current_setting('t.uid_w')::uuid);
    perform set_config('t.spoof', 'inserted', true);
  exception when others then perform set_config('t.spoof', sqlstate, true); end;
  begin
    insert into public.contact_log(tenant_id, customer_id, kind, created_at)
    values (v, c_def, 'call', now() + interval '1 day');
    perform set_config('t.future', 'inserted', true);
  exception when others then perform set_config('t.future', sqlstate, true); end;
  begin
    insert into public.contact_log(tenant_id, customer_id, kind, created_at)
    values (v, c_def, 'call', now() - interval '1 day');
    perform set_config('t.past', 'inserted', true);
  exception when others then perform set_config('t.past', sqlstate, true); end;
  begin
    insert into public.contact_log(tenant_id, customer_id, kind)
    values (v, current_setting('t.fc')::uuid, 'call');
    perform set_config('t.foreign', 'inserted', true);
  exception when others then perform set_config('t.foreign', sqlstate, true); end;
  begin
    update public.contact_log set note = 'x';
    perform set_config('t.upd', 'ok', true);
  exception when others then perform set_config('t.upd', sqlstate, true); end;
  begin
    delete from public.contact_log;
    perform set_config('t.del', 'ok', true);
  exception when others then perform set_config('t.del', sqlstate, true); end;

  -- normal insert with defaults
  insert into public.contact_log(tenant_id, customer_id, kind, note) values (v, c_def, 'call', 'default-ins');
end $$;
reset role;

insert into tap(l) select is(current_setting('t.spoof'), '42501', 'spoofed created_by rejected');
insert into tap(l) select is(current_setting('t.future'), '42501', 'created_at one day ahead rejected');
insert into tap(l) select is(current_setting('t.past'), '42501', 'created_at one day back rejected');
insert into tap(l) select is(current_setting('t.foreign'), '42501', 'another shop customer_id rejected');
insert into tap(l) select is((select created_by from public.contact_log where note = 'default-ins'), current_setting('t.uid')::uuid, 'default insert works, created_by is the caller');
insert into tap(l) select is(current_setting('t.upd') || ':' || current_setting('t.del'), '42501:42501', 'update and delete privileges revoked from authenticated');
insert into tap(l) select is((select contacted_today from public.v_followup where name = 'H-mid'), true, 'call at Cairo-today 00:30: contacted_today');
insert into tap(l) select is((select bucket from public.v_followup where name = 'H-mid'), 2, 'call at Cairo-today 00:30: bucket 2');
insert into tap(l) select is((select promise_date from public.v_followup where name = 'H-prom'), null::date, 'newest promise is past: promise_date null (superseded in 0025)');
insert into tap(l) select is((select count(*)::int from public.v_followup where name = 'H-two'), 1, 'two contacts, two contracts: still one row');
insert into tap(l) select is((select overdue_count from public.v_followup where name = 'H-two'), 2, 'two contracts: overdue_count 2');
insert into tap(l) select is((select last_note from public.v_followup where name = 'H-tie'), 'high', 'identical created_at: higher id wins');

insert into tap(l) select * from finish();
select string_agg(l, E'\n' order by n) as tap from tap;
rollback;
