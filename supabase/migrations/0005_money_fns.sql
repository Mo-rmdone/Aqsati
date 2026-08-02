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
    due_date  := (p_start + make_interval(months => i - 1))::date;
    -- last installment absorbs any rounding residual so the sum is exact
    amount_due := case when i < p_num then v_base
                       else v_total - (v_base * (p_num - 1)) end;
    return next;
  end loop;
end $$;

create or replace function public.allocate_payment(p_contract uuid, p_amount numeric)
returns numeric language plpgsql as $$
declare
  r record;
  v_left numeric(14,2) := p_amount;
  v_take numeric(14,2);
begin
  -- oldest-due first
  for r in
    select id, amount_due, amount_paid
    from public.installment
    where contract_id = p_contract and status <> 'paid'
    order by due_date, seq_no
    for update
  loop
    exit when v_left <= 0;
    v_take := least(v_left, r.amount_due - r.amount_paid);

    update public.installment
       set amount_paid = amount_paid + v_take,
           status = case when amount_paid + v_take >= amount_due then 'paid' else 'partial' end,
           paid_at = case when amount_paid + v_take >= amount_due then now() else paid_at end
     where id = r.id;

    v_left := v_left - v_take;
  end loop;

  return v_left;  -- overpayment remainder -> caller stores as credit
end $$;
