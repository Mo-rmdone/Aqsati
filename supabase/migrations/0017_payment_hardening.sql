-- Two hardening fixes from the Phase 1 review backlog.
--
-- 1. fn_apply_payment_lines ignored allocate_payment's leftover. Validation already
--    rejects overpayment, so a leftover is unreachable today — but if the remaining
--    check and the allocator ever disagree, money would vanish silently. Raise instead.
--
-- 2. update_payment with exactly the same method and lines (e.g. a network retry of
--    the same edit) reversed and re-applied the payment, bumped edited_at and wrote a
--    second audit row. It is now a no-op that returns the id.

create or replace function public.fn_apply_payment_lines(p_payment uuid, p_tenant uuid, p_lines jsonb)
returns void language plpgsql security definer set search_path = '' as $$
declare r record; v_left numeric(14,2);
begin
  for r in
    select (e->>'contract_id')::uuid as contract_id, round((e->>'amount')::numeric, 2) as amount
    from jsonb_array_elements(p_lines) e
  loop
    insert into public.payment_line(payment_id, contract_id, tenant_id, amount, kind)
    values (p_payment, r.contract_id, p_tenant, r.amount, 'installment');
    v_left := public.allocate_payment(p_payment, r.contract_id, r.amount);
    if v_left > 0 then
      raise exception 'المبلغ أكبر من المتبقي على العقد';
    end if;
  end loop;
end $$;
revoke all on function public.fn_apply_payment_lines(uuid, uuid, jsonb) from public;
revoke execute on function public.fn_apply_payment_lines(uuid, uuid, jsonb) from anon, authenticated;

-- Normalized form of a lines array: [{contract_id, amount}] sorted by contract, amounts rounded.
create or replace function public.fn_normalize_lines(p_lines jsonb)
returns jsonb language sql immutable set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object('contract_id', x.contract_id, 'amount', x.amount)
                            order by x.contract_id), '[]'::jsonb)
  from (select (e->>'contract_id')::uuid as contract_id, round((e->>'amount')::numeric, 2) as amount
        from jsonb_array_elements(case when jsonb_typeof(p_lines) = 'array' then p_lines else '[]'::jsonb end) e) x
$$;
revoke all on function public.fn_normalize_lines(jsonb) from public;
revoke execute on function public.fn_normalize_lines(jsonb) from anon, authenticated;

-- Wrapper keeps update_payment's body (0015) unchanged: renamed, and the public entry
-- point short-circuits an identical edit before doing any work.
alter function public.update_payment(uuid, text, jsonb) rename to update_payment_apply;
revoke all on function public.update_payment_apply(uuid, text, jsonb) from public;
revoke execute on function public.update_payment_apply(uuid, text, jsonb) from anon, authenticated;

create or replace function public.update_payment(p_id uuid, p_method text, p_lines jsonb)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_tenant uuid := public.current_tenant_id(); v_method text;
begin
  if v_tenant is not null and p_id is not null then
    perform pg_advisory_xact_lock(hashtext(p_id::text));
    select method into v_method from public.payment where id = p_id and tenant_id = v_tenant;
    if found and v_method = p_method
       and public.fn_normalize_lines(p_lines) = public.fn_normalize_lines(
             (select coalesce(jsonb_agg(jsonb_build_object('contract_id', contract_id, 'amount', amount)), '[]'::jsonb)
                from public.payment_line where payment_id = p_id and kind = 'installment'))
       and not exists (select 1 from public.payment_line where payment_id = p_id and kind <> 'installment') then
      return p_id;   -- identical edit: nothing to do
    end if;
  end if;
  return public.update_payment_apply(p_id, p_method, p_lines);
end $$;
revoke all on function public.update_payment(uuid, text, jsonb) from public;
revoke execute on function public.update_payment(uuid, text, jsonb) from anon;
grant execute on function public.update_payment(uuid, text, jsonb) to authenticated;
