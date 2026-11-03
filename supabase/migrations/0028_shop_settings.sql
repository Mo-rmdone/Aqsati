-- Shop settings: profile fields + invoice defaults + WhatsApp template on tenant,
-- written only through owner-only security-definer RPCs; private logo bucket.
alter table public.tenant
  add column address text check (address is null or char_length(address) <= 200),
  add column phone text check (phone is null or char_length(phone) <= 20),
  add column logo_path text,
  add column default_rate numeric(6,2) check (default_rate is null or (default_rate >= 0 and default_rate <= 200)),
  add column default_years int check (default_years is null or (default_years >= 1 and default_years <= 5)),
  add column whatsapp_template text check (whatsapp_template is null or char_length(whatsapp_template) <= 500);

create or replace function public.update_shop_settings(
  p_name text, p_address text, p_phone text,
  p_default_rate numeric, p_default_years int, p_whatsapp_template text
) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_tenant uuid := public.current_tenant_id();
  v_name   text := btrim(coalesce(p_name, ''));
  v_before jsonb;
  v_after  jsonb;
begin
  if v_tenant is null or public.current_role() is distinct from 'owner' then
    raise exception 'owner only' using errcode = '42501';
  end if;
  if char_length(v_name) < 1 or char_length(v_name) > 80 then
    raise exception 'shop name must be 1-80 characters' using errcode = '22023';
  end if;

  select jsonb_build_object('name', name, 'address', address, 'phone', phone,
           'default_rate', default_rate, 'default_years', default_years,
           'whatsapp_template', whatsapp_template)
    into v_before from public.tenant where id = v_tenant;

  update public.tenant set
    name = v_name,
    address = nullif(btrim(p_address), ''),
    phone = nullif(btrim(p_phone), ''),
    default_rate = p_default_rate,
    default_years = p_default_years,
    whatsapp_template = nullif(btrim(p_whatsapp_template), '')
  where id = v_tenant;

  select jsonb_build_object('name', name, 'address', address, 'phone', phone,
           'default_rate', default_rate, 'default_years', default_years,
           'whatsapp_template', whatsapp_template)
    into v_after from public.tenant where id = v_tenant;

  insert into public.audit_log(tenant_id, user_id, action, entity_type, entity_id, before_json, after_json)
  values (v_tenant, auth.uid(), 'settings', 'tenant', v_tenant, v_before, v_after);
end $$;

create or replace function public.set_shop_logo(p_path text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_tenant uuid := public.current_tenant_id();
begin
  if v_tenant is null or public.current_role() is distinct from 'owner' then
    raise exception 'owner only' using errcode = '42501';
  end if;
  if p_path is not null and left(p_path, char_length(v_tenant::text) + 1) <> v_tenant::text || '/' then
    raise exception 'logo path must be inside the shop folder' using errcode = '22023';
  end if;
  update public.tenant set logo_path = p_path where id = v_tenant;
end $$;

revoke all on function public.update_shop_settings(text, text, text, numeric, int, text) from public;
revoke execute on function public.update_shop_settings(text, text, text, numeric, int, text) from anon;
grant execute on function public.update_shop_settings(text, text, text, numeric, int, text) to authenticated;
revoke all on function public.set_shop_logo(text) from public;
revoke execute on function public.set_shop_logo(text) from anon;
grant execute on function public.set_shop_logo(text) to authenticated;

-- Private logo bucket; each shop owns the folder named after its tenant id.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('shop-logos', 'shop-logos', false, 1048576, array['image/png','image/jpeg','image/webp'])
on conflict (id) do nothing;

create policy shop_logos_select on storage.objects for select to authenticated
  using (bucket_id = 'shop-logos' and (storage.foldername(name))[1] = (select public.current_tenant_id())::text);
create policy shop_logos_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'shop-logos' and (storage.foldername(name))[1] = (select public.current_tenant_id())::text
              and (select public.current_role()) = 'owner');
create policy shop_logos_update on storage.objects for update to authenticated
  using (bucket_id = 'shop-logos' and (storage.foldername(name))[1] = (select public.current_tenant_id())::text
         and (select public.current_role()) = 'owner')
  with check (bucket_id = 'shop-logos' and (storage.foldername(name))[1] = (select public.current_tenant_id())::text
              and (select public.current_role()) = 'owner');
create policy shop_logos_delete on storage.objects for delete to authenticated
  using (bucket_id = 'shop-logos' and (storage.foldername(name))[1] = (select public.current_tenant_id())::text
         and (select public.current_role()) = 'owner');
