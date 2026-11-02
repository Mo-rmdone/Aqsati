-- Voice assistant: per-shop monthly usage + budget cap RPCs.
-- Writes happen only through the two security-definer functions below.
create table public.voice_usage (
  tenant_id     uuid not null references public.tenant(id) on delete cascade,
  month         date not null,  -- first day of the Cairo month
  calls         int not null default 0,
  input_tokens  bigint not null default 0,
  output_tokens bigint not null default 0,
  cost_usd      numeric(10,4) not null default 0,
  primary key (tenant_id, month)
);
alter table public.voice_usage enable row level security;
create policy voice_usage_read on public.voice_usage for select to authenticated
  using (tenant_id = (select public.current_tenant_id()));
revoke all on public.voice_usage from anon;
revoke insert, update, delete, truncate on public.voice_usage from authenticated;

-- Reserve one call against the monthly cap: true (and calls+1) while cost_usd < cap.
create or replace function public.voice_reserve(p_cap_usd numeric) returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  v_tenant uuid := public.current_tenant_id();
  v_month  date := date_trunc('month', (now() at time zone 'Africa/Cairo'))::date;
  v_cost   numeric;
begin
  if v_tenant is null then raise exception 'no tenant' using errcode = '42501'; end if;
  insert into public.voice_usage(tenant_id, month) values (v_tenant, v_month)
    on conflict (tenant_id, month) do nothing;
  select cost_usd into v_cost from public.voice_usage
    where tenant_id = v_tenant and month = v_month for update;
  if v_cost < p_cap_usd then
    update public.voice_usage set calls = calls + 1
      where tenant_id = v_tenant and month = v_month;
    return true;
  end if;
  return false;
end $$;

-- Add the real usage of a call to the caller's current month row.
create or replace function public.voice_record(p_input int, p_output int, p_cost numeric) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_tenant uuid := public.current_tenant_id();
  v_month  date := date_trunc('month', (now() at time zone 'Africa/Cairo'))::date;
begin
  if v_tenant is null then raise exception 'no tenant' using errcode = '42501'; end if;
  if p_input is null or p_output is null or p_cost is null
     or p_input < 0 or p_output < 0 or p_cost < 0 then
    raise exception 'usage values must be non-negative' using errcode = '22023';
  end if;
  insert into public.voice_usage(tenant_id, month, input_tokens, output_tokens, cost_usd)
    values (v_tenant, v_month, p_input, p_output, p_cost)
    on conflict (tenant_id, month) do update set
      input_tokens  = public.voice_usage.input_tokens + excluded.input_tokens,
      output_tokens = public.voice_usage.output_tokens + excluded.output_tokens,
      cost_usd      = public.voice_usage.cost_usd + excluded.cost_usd;
end $$;

revoke all on function public.voice_reserve(numeric) from public;
revoke execute on function public.voice_reserve(numeric) from anon;
grant execute on function public.voice_reserve(numeric) to authenticated;
revoke all on function public.voice_record(int, int, numeric) from public;
revoke execute on function public.voice_record(int, int, numeric) from anon;
grant execute on function public.voice_record(int, int, numeric) to authenticated;
