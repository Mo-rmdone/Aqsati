-- supabase/tests/voice_usage_test.sql
-- 0026: voice_usage table + voice_reserve / voice_record RPCs.
begin;
create temp table tap(n serial, l text);
insert into tap(l) select plan(14);

do $$
declare a uuid; b uuid;
begin
  a := tests.as_new_owner('Shop VA');
  perform set_config('t.a', a::text, true);
  perform set_config('t.uid_a', (select id::text from public.profile where tenant_id = a), true);
  b := tests.as_new_owner('Shop VB');
  perform set_config('t.b', b::text, true);
  perform set_config('t.uid_b', (select id::text from public.profile where tenant_id = b), true);
  perform set_config('t.month', date_trunc('month', (now() at time zone 'Africa/Cairo'))::date::text, true);
end $$;

-- shop A
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', current_setting('t.uid_a'), 'role', 'authenticated')::text, true);
do $$
begin
  perform set_config('t.r1', public.voice_reserve(3.00)::text, true);
  perform set_config('t.calls1', (select calls::text from public.voice_usage), true);
  perform public.voice_record(100, 50, 0.0012);
  perform set_config('t.rows_a', (select count(*)::text from public.voice_usage), true);
  begin perform public.voice_record(-1, 0, 0); perform set_config('t.neg', 'ok', true);
  exception when others then perform set_config('t.neg', 'raised', true); end;
  begin
    insert into public.voice_usage(tenant_id, month, calls) values (current_setting('t.a')::uuid, '2000-01-01', 5);
    perform set_config('t.ins', 'inserted', true);
  exception when others then perform set_config('t.ins', sqlstate, true); end;
  begin
    update public.voice_usage set calls = 999;
    perform set_config('t.upd', 'ok', true);
  exception when others then perform set_config('t.upd', sqlstate, true); end;
end $$;
reset role;

insert into tap(l) select is(current_setting('t.r1'), 'true', 'reserve on an empty month returns true');
insert into tap(l) select is(current_setting('t.calls1'), '1', 'reservation increments calls to 1');
insert into tap(l) select is((select input_tokens::text || ':' || output_tokens::text from public.voice_usage where tenant_id = current_setting('t.a')::uuid), '100:50', 'voice_record adds tokens');
insert into tap(l) select is((select cost_usd from public.voice_usage where tenant_id = current_setting('t.a')::uuid), 0.0012::numeric, 'voice_record adds cost');
insert into tap(l) select is((select month::text from public.voice_usage where tenant_id = current_setting('t.a')::uuid), current_setting('t.month'), 'row is keyed to the Cairo month');
insert into tap(l) select is(current_setting('t.rows_a'), '1', 'user sees exactly their own row');
insert into tap(l) select is(current_setting('t.neg'), 'raised', 'negative tokens raise');
insert into tap(l) select is(current_setting('t.ins'), '42501', 'direct insert denied');
insert into tap(l) select is(current_setting('t.upd'), '42501', 'direct update denied');

-- cost at cap (table owner fixture)
update public.voice_usage set cost_usd = 3.00 where tenant_id = current_setting('t.a')::uuid;

set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', current_setting('t.uid_a'), 'role', 'authenticated')::text, true);
do $$ begin perform set_config('t.r2', public.voice_reserve(3.00)::text, true); end $$;
reset role;
insert into tap(l) select is(current_setting('t.r2'), 'false', 'reserve at the cap returns false');
insert into tap(l) select is((select calls from public.voice_usage where tenant_id = current_setting('t.a')::uuid), 1, 'calls unchanged when refused');

-- shop B
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', current_setting('t.uid_b'), 'role', 'authenticated')::text, true);
do $$
begin
  perform set_config('t.rb', public.voice_reserve(3.00)::text, true);
  perform set_config('t.rows_b', (select count(*)::text from public.voice_usage), true);
end $$;
reset role;
insert into tap(l) select is(current_setting('t.rb'), 'true', 'other shop reserve is independent of shop A cost');
insert into tap(l) select is(current_setting('t.rows_b') || ':' || (select cost_usd::text from public.voice_usage where tenant_id = current_setting('t.a')::uuid), '1:3.0000', 'shop B sees only its own row and A is untouched');

-- anon
set local role anon;
do $$
begin
  begin perform public.voice_reserve(3.00); perform set_config('t.an1', 'ok', true);
  exception when others then perform set_config('t.an1', sqlstate, true); end;
  begin perform public.voice_record(1, 1, 0); perform set_config('t.an2', 'ok', true);
  exception when others then perform set_config('t.an2', sqlstate, true); end;
end $$;
reset role;
insert into tap(l) select is(current_setting('t.an1') || ':' || current_setting('t.an2'), '42501:42501', 'anon cannot execute either RPC');

insert into tap(l) select * from finish();
select string_agg(l, E'\n' order by n) as tap from tap;
rollback;
