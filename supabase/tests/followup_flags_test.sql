-- supabase/tests/followup_flags_test.sql
-- 0025: called_today / whatsapp_today flags, newest-note promise semantics.
begin;
create temp table tap(n serial, l text);
insert into tap(l) select plan(8);

do $$
declare v uuid;
begin
  v := tests.as_new_owner('Shop FF');
  perform set_config('t.v', v::text, true);
  perform set_config('t.uid', (select id::text from public.profile where tenant_id = v), true);
  perform set_config('t.today', ((now() at time zone 'Africa/Cairo')::date)::text, true);
  insert into public.customer(tenant_id, name, phone) values
    (v, 'F-both', '01100000011'), (v, 'F-newer', '01100000012'), (v, 'F-past', '01100000013');
  perform set_config('t.k1', gen_random_uuid()::text, true);
  perform set_config('t.k2', gen_random_uuid()::text, true);
  perform set_config('t.k3', gen_random_uuid()::text, true);
end $$;

set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', current_setting('t.uid'), 'role', 'authenticated')::text, true);
do $$
declare r uuid; today date := current_setting('t.today')::date; x record;
begin
  for x in select * from (values ('F-both','t.k1'), ('F-newer','t.k2'), ('F-past','t.k3')) as t(cname, kname)
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
    current_setting('t.k1')::uuid, current_setting('t.k2')::uuid, current_setting('t.k3')::uuid);

do $$
declare today date := current_setting('t.today')::date; v uuid := current_setting('t.v')::uuid;
begin
  insert into public.contact_log(tenant_id, customer_id, kind, created_at) values
    (v, (select id from public.customer where name = 'F-both'), 'call', now() - interval '2 minutes'),
    (v, (select id from public.customer where name = 'F-both'), 'whatsapp', now() - interval '1 minute');
  insert into public.contact_log(tenant_id, customer_id, kind, promise_date, created_at) values
    (v, (select id from public.customer where name = 'F-newer'), 'note', today + 10, now() - interval '2 hours'),
    (v, (select id from public.customer where name = 'F-newer'), 'note', today + 3, now() - interval '1 hour');
  insert into public.contact_log(tenant_id, customer_id, kind, promise_date, created_at) values
    (v, (select id from public.customer where name = 'F-past'), 'note', today + 4, now() - interval '2 hours'),
    (v, (select id from public.customer where name = 'F-past'), 'note', today - 5, now() - interval '1 hour');
end $$;

insert into tap(l) select is((select called_today from public.v_followup where name = 'F-both'), true, 'call then whatsapp: called_today');
insert into tap(l) select is((select whatsapp_today from public.v_followup where name = 'F-both'), true, 'call then whatsapp: whatsapp_today');
insert into tap(l) select is((select bucket from public.v_followup where name = 'F-both'), 2, 'call then whatsapp: bucket 2');
insert into tap(l) select is((select called_today or whatsapp_today from public.v_followup where name = 'F-newer'), false, 'notes only: flags false');
insert into tap(l) select is((select promise_date from public.v_followup where name = 'F-newer'), current_setting('t.today')::date + 3, 'newer promise (earlier date) wins over older later one');
insert into tap(l) select is((select bucket from public.v_followup where name = 'F-newer'), 1, 'newer promise: bucket 1');
insert into tap(l) select is((select promise_date from public.v_followup where name = 'F-past'), null::date, 'newest promise in the past: promise_date null');
insert into tap(l) select is((select bucket from public.v_followup where name = 'F-past'), 0, 'newest promise in the past: bucket 0');

insert into tap(l) select * from finish();
select string_agg(l, E'\n' order by n) as tap from tap;
rollback;
