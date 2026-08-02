create or replace function public.build_schedule(
  p_financed numeric, p_annual_rate numeric, p_num int,
  p_start date, p_method text default 'flat'
) returns table(seq_no int, due_date date, amount_due numeric)
language plpgsql immutable as $$
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
