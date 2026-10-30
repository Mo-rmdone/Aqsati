-- Notah Phase 1: sale type, per-shop contract numbers, first installment one month
-- after the sale, Egyptian phone / national-id rules, and the pgTAP test helper.

create extension if not exists pgtap with schema extensions;

-- ---- contract: sale type, contract number, external invoice number ----
alter table public.contract
  add column sale_type text not null default 'installment'
    check (sale_type in ('installment','cash')),
  add column contract_no bigint,
  add column external_invoice_no text;

-- backfill per-shop numbers in creation order (audit trigger off: this is not a user edit)
alter table public.contract disable trigger contract_audit;
update public.contract c
   set contract_no = n.rn
  from (select id, row_number() over (partition by tenant_id order by created_at, id) as rn
          from public.contract) n
 where n.id = c.id;
alter table public.contract enable trigger contract_audit;

alter table public.contract alter column contract_no set not null;
alter table public.contract
  add constraint contract_contract_no_unique unique (tenant_id, contract_no);

create or replace function public.fn_contract_no() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  -- serialize concurrent inserts for the same shop (same pattern as fn_receipt_no)
  perform 1 from public.tenant where id = new.tenant_id for update;
  select coalesce(max(contract_no),0)+1 into new.contract_no
  from public.contract where tenant_id = new.tenant_id;
  return new;
end $$;
create trigger contract_no_assign before insert on public.contract
  for each row execute function public.fn_contract_no();
revoke all on function public.fn_contract_no() from public;
revoke execute on function public.fn_contract_no() from anon, authenticated;

-- cash sales have no installments; installment sales run 12/24/36/48/60 months.
-- NOT VALID: rows that predate this rule are left alone, new writes are enforced.
alter table public.contract drop constraint contract_num_installments_check;
alter table public.contract add constraint contract_sale_type_installments_check check (
  (sale_type = 'cash' and num_installments = 0)
  or (sale_type = 'installment' and num_installments in (12,24,36,48,60))
) not valid;

-- ---- first installment falls one month after the sale ----
create or replace function public.build_schedule(
  p_financed numeric, p_annual_rate numeric, p_num int,
  p_start date, p_method text default 'flat'
) returns table(seq_no int, due_date date, amount_due numeric)
language plpgsql immutable set search_path = '' as $$
declare
  v_interest numeric(14,2);
  v_total    numeric(14,2);
  v_base     numeric(14,2);
  i int;
begin
  if p_num < 1 then raise exception 'num_installments must be >= 1'; end if;

  v_interest := case
    when p_method = 'zero' then 0
    -- flat/add-on: the rate is a flat rate on the full financed amount for the whole
    -- term (NOT annualized/prorated by month count — do not divide by 12 here)
    else round(p_financed * p_annual_rate, 2)
  end;

  v_total := p_financed + v_interest;
  v_base  := round(v_total / p_num, 2);

  for i in 1..p_num loop
    seq_no    := i;
    due_date  := (p_start + make_interval(months => i))::date;
    -- last installment absorbs any rounding residual so the sum is exact
    amount_due := case when i < p_num then v_base
                       else v_total - (v_base * (p_num - 1)) end;
    return next;
  end loop;
end $$;

-- ---- customer rules (NOT VALID: existing rows are kept, new writes are enforced) ----
alter table public.customer
  add constraint customer_phone_egypt check (phone ~ '^01[0125][0-9]{8}$') not valid,
  add constraint customer_national_id_egypt
    check (national_id is null or national_id ~ '^[23][0-9]{13}$') not valid;

-- ---- test helper: a fresh signed-in owner with their own shop ----
create schema if not exists tests;
revoke all on schema tests from public;

create or replace function tests.as_new_owner(p_shop text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := gen_random_uuid();
begin
  insert into auth.users(id, aud, role, email)
  values (v_uid, 'authenticated', 'authenticated', v_uid || '@test.local');
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_uid, 'role', 'authenticated')::text, true);
  return public.signup_tenant(p_shop, 'Owner');
end $$;
revoke all on function tests.as_new_owner(text) from public;
revoke execute on function tests.as_new_owner(text) from anon, authenticated;
