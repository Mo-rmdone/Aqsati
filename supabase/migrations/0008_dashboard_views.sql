-- security_invoker=true on both views below (not in the brief's original SQL, which
-- left the default unset) fixes a real cross-tenant data leak found during Task 7's
-- advisor scan (get_advisors flagged both ERROR: security_definer_view): without it,
-- a view runs with its *owner's* (privileged) permissions against the underlying
-- tables rather than the querying user's, so RLS on installment/contract/customer
-- would be bypassed entirely and any authenticated user of any tenant could see
-- every tenant's rows through these views. With security_invoker=true, the
-- underlying tables' existing tenant-scoped SELECT policies apply correctly. See
-- task-7-report.md.
create view public.v_collections_kpi with (security_invoker = true) as
select c.tenant_id,
  sum(i.amount_due - i.amount_paid) filter (
    where i.status <> 'paid' and i.due_date between current_date and current_date + 7
  ) as expected_this_week,
  sum(i.amount_paid) filter (where date_trunc('month', i.paid_at) = date_trunc('month', now())) as collected_this_month,
  sum(i.amount_due - i.amount_paid) filter (where i.status = 'overdue') as overdue_total
from public.installment i join public.contract c on c.id = i.contract_id
group by c.tenant_id;

create view public.v_worklist with (security_invoker = true) as
select c.tenant_id, c.id as contract_id, cu.id as customer_id, cu.name, cu.phone,
       i.id as installment_id, i.due_date, (i.amount_due - i.amount_paid) as amount,
       (current_date - i.due_date) as days_late, i.status
from public.installment i
join public.contract c  on c.id = i.contract_id
join public.customer cu on cu.id = c.customer_id
where i.status in ('pending','partial','overdue') and i.due_date <= current_date + 7;

-- called nightly by the Cloudflare Worker using the service_role key (which
-- bypasses grants entirely) — anon/authenticated have no legitimate reason
-- to trigger this directly. Closing this needs both the implicit PUBLIC
-- grant every new function gets AND Supabase's separate project-level
-- default grant to anon/authenticated (neither alone is sufficient — see
-- the identical fix on Task 2's tenancy functions).
--
-- search_path hardened to '' (brief's original SQL used 'public') per this project's
-- established pattern (Tasks 4-6) — the only reference (public.installment) is already
-- schema-qualified, so this is behaviorally a no-op, verified by the smoke test in the
-- task report.
create or replace function public.flip_overdue() returns int
language plpgsql security definer set search_path = '' as $$
declare n int;
begin
  update public.installment set status = 'overdue'
   where status in ('pending','partial') and due_date < current_date;
  get diagnostics n = row_count;
  return n;
end $$;
revoke all on function public.flip_overdue() from public;
revoke execute on function public.flip_overdue() from anon, authenticated;
