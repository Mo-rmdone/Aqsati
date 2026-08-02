create extension if not exists "pgcrypto";

create table public.tenant (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  plan text not null default 'trial',
  created_at timestamptz not null default now()
);

create table public.branch (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenant(id) on delete cascade,
  name text not null,
  phone text
);

-- links a Supabase auth user to one tenant + role
create table public.profile (
  id uuid primary key references auth.users(id) on delete cascade,
  tenant_id uuid not null references public.tenant(id) on delete cascade,
  branch_id uuid references public.branch(id),
  full_name text not null,
  role text not null default 'accountant'
    check (role in ('owner','manager','accountant','collector','viewer'))
);

-- SECURITY DEFINER so the lookup itself is not blocked by RLS
create or replace function public.current_tenant_id()
returns uuid language sql stable security definer set search_path = public as $$
  select tenant_id from public.profile where id = auth.uid()
$$;

create or replace function public.current_role()
returns text language sql stable security definer set search_path = public as $$
  select role from public.profile where id = auth.uid()
$$;

alter table public.tenant  enable row level security;
alter table public.branch  enable row level security;
alter table public.profile enable row level security;

create policy tenant_self on public.tenant for select to authenticated
  using (id = (select public.current_tenant_id()));

create policy branch_isolation on public.branch for all to authenticated
  using      (tenant_id = (select public.current_tenant_id()))
  with check (tenant_id = (select public.current_tenant_id()));

create policy profile_isolation on public.profile for select to authenticated
  using (tenant_id = (select public.current_tenant_id()));

create index on public.branch  (tenant_id);
create index on public.profile (tenant_id);

-- self-serve signup: creates tenant + owner profile atomically, bypassing RLS.
-- Called once, right after supabase.auth.signUp() succeeds (see Task 8). This is the
-- ONLY path that creates a tenant/profile row — there is no direct insert policy on
-- either table, so a brand-new user (no profile yet, current_tenant_id() = null) can
-- still get provisioned.
create or replace function public.signup_tenant(p_tenant_name text, p_full_name text)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_tenant_id uuid;
begin
  if exists (select 1 from public.profile where id = auth.uid()) then
    raise exception 'profile already exists for this user';
  end if;

  insert into public.tenant(name) values (p_tenant_name) returning id into v_tenant_id;

  insert into public.profile(id, tenant_id, full_name, role)
  values (auth.uid(), v_tenant_id, p_full_name, 'owner');

  return v_tenant_id;
end $$;

revoke all on function public.signup_tenant(text, text) from public;
grant execute on function public.signup_tenant(text, text) to authenticated;
