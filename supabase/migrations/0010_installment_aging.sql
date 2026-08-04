-- Installment-side counterpart to v_aging (0007_credit_invoices.sql), needed by
-- Task 11's aging report. v_aging only covers آجل (credit_invoice) balances;
-- there was no equivalent per-installment aging view, and the aging report
-- (Task 11 brief step 4) needs to show which *contract installments* are
-- overdue/upcoming, bucketed the same way, alongside آجل.
--
-- This is added as a migration rather than computed client-side because the
-- "outstanding" figure is a money computation (amount_due - amount_paid) —
-- Task 11's global constraint says the frontend must never recompute money
-- beyond simple display-layer sums of already-fetched numbers, and v_aging
-- itself already established the precedent of doing this exact subtraction +
-- bucket classification in the DB, not JS. This view is a direct structural
-- mirror of v_aging: same bucket CASE expression, same security posture.
--
-- security_invoker=true (same reasoning as v_aging/v_collections_kpi/v_worklist,
-- see 0007_credit_invoices.sql and 0008_dashboard_views.sql): without it, this
-- view would run with its owner's privileged permissions against installment/
-- contract, bypassing their RLS policies entirely and leaking cross-tenant data.
-- With security_invoker=true, installment_read/contract_read's existing
-- tenant-scoped policies apply correctly to the querying user.
create view public.v_installment_aging with (security_invoker = true) as
select c.tenant_id, c.customer_id, c.id as contract_id, i.id, i.due_date,
  (i.amount_due - i.amount_paid) as outstanding,
  case
    when i.due_date >= current_date then 'current'
    when current_date - i.due_date between 1 and 30  then 'b1_30'
    when current_date - i.due_date between 31 and 60 then 'b31_60'
    when current_date - i.due_date between 61 and 90 then 'b61_90'
    else 'b90_plus'
  end as bucket
from public.installment i join public.contract c on c.id = i.contract_id
where i.status in ('pending', 'partial', 'overdue');

-- defense-in-depth, matching the identical revoke on v_aging/v_collections_kpi/
-- v_worklist (0008_dashboard_views.sql's anon-revoke fix): security_invoker=true
-- already means an anon caller gets zero rows via the underlying tables' RLS, but
-- every view in this project explicitly revokes anon select rather than relying
-- solely on RLS evaluating to "no rows".
revoke select on public.v_installment_aging from anon;
