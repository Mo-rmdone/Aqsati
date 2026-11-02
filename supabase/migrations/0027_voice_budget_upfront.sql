-- Voice budget is charged UP FRONT (worst case per call) so concurrent calls cannot
-- overshoot the cap, and a caller using the RPCs directly cannot lower their cost.
-- voice_record only reports tokens now; it has no cost parameter.
drop function if exists public.voice_reserve(numeric);
drop function if exists public.voice_record(int, int, numeric);

revoke references, trigger on public.voice_usage from authenticated;

create or replace function public.voice_reserve(p_cap_usd numeric, p_charge_usd numeric) returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  v_tenant uuid := public.current_tenant_id();
  v_month  date := date_trunc('month', (now() at time zone 'Africa/Cairo'))::date;
  v_cost   numeric;
begin
  if v_tenant is null then raise exception 'no tenant' using errcode = '42501'; end if;
  if public.current_role() is null
     or public.current_role() not in ('owner','manager','accountant','collector') then
    raise exception 'role not allowed' using errcode = '42501';
  end if;
  if p_charge_usd is null or p_cap_usd is null
     or p_charge_usd = 'NaN'::numeric or p_cap_usd = 'NaN'::numeric
     or p_charge_usd <= 0 or p_charge_usd > 0.05 then
    raise exception 'invalid charge' using errcode = '22023';
  end if;
  insert into public.voice_usage(tenant_id, month) values (v_tenant, v_month)
    on conflict (tenant_id, month) do nothing;
  select cost_usd into v_cost from public.voice_usage
    where tenant_id = v_tenant and month = v_month for update;
  if v_cost + p_charge_usd <= p_cap_usd then
    update public.voice_usage set cost_usd = cost_usd + p_charge_usd, calls = calls + 1
      where tenant_id = v_tenant and month = v_month;
    return true;
  end if;
  return false;
end $$;

create or replace function public.voice_record(p_input int, p_output int) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_tenant uuid := public.current_tenant_id();
  v_month  date := date_trunc('month', (now() at time zone 'Africa/Cairo'))::date;
begin
  if v_tenant is null then raise exception 'no tenant' using errcode = '42501'; end if;
  if public.current_role() is null
     or public.current_role() not in ('owner','manager','accountant','collector') then
    raise exception 'role not allowed' using errcode = '42501';
  end if;
  if p_input is null or p_output is null or p_input < 0 or p_output < 0 then
    raise exception 'usage values must be non-negative' using errcode = '22023';
  end if;
  insert into public.voice_usage(tenant_id, month, input_tokens, output_tokens)
    values (v_tenant, v_month, p_input, p_output)
    on conflict (tenant_id, month) do update set
      input_tokens  = public.voice_usage.input_tokens + excluded.input_tokens,
      output_tokens = public.voice_usage.output_tokens + excluded.output_tokens;
end $$;

revoke all on function public.voice_reserve(numeric, numeric) from public;
revoke execute on function public.voice_reserve(numeric, numeric) from anon;
grant execute on function public.voice_reserve(numeric, numeric) to authenticated;
revoke all on function public.voice_record(int, int) from public;
revoke execute on function public.voice_record(int, int) from anon;
grant execute on function public.voice_record(int, int) to authenticated;
