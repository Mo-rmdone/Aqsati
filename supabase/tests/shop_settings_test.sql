-- supabase/tests/shop_settings_test.sql
-- 0028: tenant settings columns, update_shop_settings, set_shop_logo, private shop-logos bucket.
begin;
create temp table tap(n serial, l text);
insert into tap(l) select plan(15);

do $$
declare a uuid; b uuid;
begin
  a := tests.as_new_owner('Shop SA');
  perform set_config('t.a', a::text, true);
  perform set_config('t.uid_a', (select id::text from public.profile where tenant_id = a), true);
  b := tests.as_new_owner('Shop SB');
  perform set_config('t.b', b::text, true);
  perform set_config('t.uid_b', (select id::text from public.profile where tenant_id = b), true);
end $$;

-- shop A owner
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', current_setting('t.uid_a'), 'role', 'authenticated')::text, true);
do $$
begin
  perform public.update_shop_settings('  متجر النور  ', ' 12 شارع التحرير ', ' 01012345678 ', 12.5, 3, ' أهلا {الاسم} ');
  begin perform public.update_shop_settings('x', null, null, 250, 3, null); perform set_config('t.rate', 'ok', true);
  exception when others then perform set_config('t.rate', sqlstate, true); end;
  begin perform public.update_shop_settings('x', null, null, 10, 0, null); perform set_config('t.years', 'ok', true);
  exception when others then perform set_config('t.years', sqlstate, true); end;
  begin perform public.update_shop_settings('   ', null, null, 10, 2, null); perform set_config('t.name', 'ok', true);
  exception when others then perform set_config('t.name', sqlstate, true); end;
  begin perform public.set_shop_logo('00000000-0000-0000-0000-000000000000/logo.png'); perform set_config('t.logo', 'ok', true);
  exception when others then perform set_config('t.logo', sqlstate, true); end;
  -- storage: own folder ok, other tenant's folder denied
  begin
    insert into storage.objects(bucket_id, name, owner) values ('shop-logos', current_setting('t.a') || '/logo.png', auth.uid());
    perform set_config('t.st_own', 'ok', true);
  exception when others then perform set_config('t.st_own', sqlstate, true); end;
  begin
    insert into storage.objects(bucket_id, name, owner) values ('shop-logos', current_setting('t.b') || '/logo.png', auth.uid());
    perform set_config('t.st_other', 'ok', true);
  exception when others then perform set_config('t.st_other', sqlstate, true); end;
  perform public.set_shop_logo(current_setting('t.a') || '/logo.png');
end $$;
reset role;

insert into tap(l) select is((select name || '|' || address || '|' || phone || '|' || default_rate::text || '|' || default_years::text || '|' || whatsapp_template from public.tenant where id = current_setting('t.a')::uuid), 'متجر النور|12 شارع التحرير|01012345678|12.50|3|أهلا {الاسم}', 'owner updates all fields, trimmed');
insert into tap(l) select is(current_setting('t.rate'), '23514', 'rate 250 violates check');
insert into tap(l) select is(current_setting('t.years'), '23514', 'years 0 violates check');
insert into tap(l) select is(current_setting('t.name'), '22023', 'blank name raises 22023');
insert into tap(l) select is(current_setting('t.logo'), '22023', 'logo path in another folder raises 22023');
insert into tap(l) select is(current_setting('t.st_own'), 'ok', 'owner can insert into own logo folder');
insert into tap(l) select is(current_setting('t.st_other'), '42501', 'storage insert into another tenant folder denied');
insert into tap(l) select is((select logo_path from public.tenant where id = current_setting('t.a')::uuid), current_setting('t.a') || '/logo.png', 'set_shop_logo stores own path');
insert into tap(l) select is((select count(*)::int from public.audit_log where tenant_id = current_setting('t.a')::uuid and entity_type = 'tenant' and action = 'settings'), 1, 'audit row written for the successful update only');
insert into tap(l) select is((select (before_json->>'name') || '>' || (after_json->>'name') from public.audit_log where tenant_id = current_setting('t.a')::uuid and action = 'settings'), 'Shop SA>متجر النور', 'audit has before/after');

-- blank template -> null
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', current_setting('t.uid_a'), 'role', 'authenticated')::text, true);
do $$ begin perform public.update_shop_settings('متجر النور', '  ', ' ', null, null, '   '); end $$;
reset role;
insert into tap(l) select is((select (whatsapp_template is null and address is null and phone is null and default_rate is null)::text from public.tenant where id = current_setting('t.a')::uuid), 'true', 'blank template/address/phone stored as null');

-- shop B cannot change shop A
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', current_setting('t.uid_b'), 'role', 'authenticated')::text, true);
do $$ begin perform public.update_shop_settings('Hacked', 'x', null, 5, 1, null); end $$;
reset role;
insert into tap(l) select is((select name from public.tenant where id = current_setting('t.a')::uuid), 'متجر النور', 'other shop update leaves shop A unchanged');
insert into tap(l) select is((select name from public.tenant where id = current_setting('t.b')::uuid), 'Hacked', 'other shop update applies to its own tenant');

-- viewer rejected
update public.profile set role = 'viewer' where id = current_setting('t.uid_a')::uuid;
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', current_setting('t.uid_a'), 'role', 'authenticated')::text, true);
do $$
begin
  begin perform public.update_shop_settings('V', null, null, null, null, null); perform set_config('t.v1', 'ok', true);
  exception when others then perform set_config('t.v1', sqlstate, true); end;
  begin perform public.set_shop_logo(null); perform set_config('t.v2', 'ok', true);
  exception when others then perform set_config('t.v2', sqlstate, true); end;
end $$;
reset role;
update public.profile set role = 'owner' where id = current_setting('t.uid_a')::uuid;
insert into tap(l) select is(current_setting('t.v1') || ':' || current_setting('t.v2'), '42501:42501', 'viewer cannot execute either RPC');

-- anon
set local role anon;
do $$
begin
  begin perform public.update_shop_settings('A', null, null, null, null, null); perform set_config('t.an1', 'ok', true);
  exception when others then perform set_config('t.an1', sqlstate, true); end;
  begin perform public.set_shop_logo(null); perform set_config('t.an2', 'ok', true);
  exception when others then perform set_config('t.an2', sqlstate, true); end;
end $$;
reset role;
insert into tap(l) select is(current_setting('t.an1') || ':' || current_setting('t.an2'), '42501:42501', 'anon cannot execute either RPC');

insert into tap(l) select * from finish();
select string_agg(l, E'\n' order by n) as tap from tap;
rollback;
