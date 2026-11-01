-- Notah v2 list fixes: server-side severity ordering (status_rank) for the customer list,
-- and recent activity no longer announces imported contracts as new sales.
-- status_rank is appended at the end; every existing column keeps its name, type and order.

create or replace view public.v_customer_summary with (security_invoker = true) as
with cairo as (
  select (now() at time zone 'Africa/Cairo')::date as today,
         date_trunc('month', now() at time zone 'Africa/Cairo')::date as month_start
), per_contract as (
  select c.customer_id, c.id as contract_id, b.paid, b.remaining,
         coalesce(o.overdue_count, 0)::int as overdue_count,
         coalesce(o.overdue_amount, 0) as overdue_amount,
         coalesce(o.late_month, false) as late_month
  from public.contract c
  left join public.v_contract_balance b on b.contract_id = c.id
  left join (select i.contract_id, count(*) as overdue_count,
                    sum(i.amount_due - i.amount_paid) as overdue_amount,
                    bool_or(i.due_date >= (select month_start from cairo)) as late_month
             from public.installment i
             where i.due_date < (select today from cairo) and i.amount_due > i.amount_paid
             group by i.contract_id) o on o.contract_id = c.id
  where c.status <> 'void'
), agg as (
  select customer_id,
         count(*)::int as invoice_count,
         coalesce(sum(paid), 0) as paid_total,
         coalesce(sum(remaining), 0) as remaining_total,
         sum(overdue_amount) as overdue_amount,
         sum(overdue_count)::int as overdue_count,
         max(overdue_count)::int as max_overdue_per_contract,
         bool_or(late_month) as late_this_month,
         bool_or(remaining is null) as has_unknown
  from per_contract group by customer_id
), nxt as (
  select distinct on (c.customer_id) c.customer_id, i.due_date as next_due_date,
         i.amount_due - i.amount_paid as next_due_amount
  from public.installment i
  join public.contract c on c.id = i.contract_id
  where c.status <> 'void' and i.amount_due > i.amount_paid
  order by c.customer_id, i.due_date, i.seq_no
), pm as (
  select distinct p.customer_id
  from public.payment p
  left join public.contract c on c.id = p.contract_id
  where not p.is_opening and (c.id is null or c.status <> 'void')
    and (p.received_at at time zone 'Africa/Cairo')::date >= (select month_start from cairo)
), s as (
  select cu.id as customer_id, cu.tenant_id, cu.name, cu.phone,
         a.invoice_count, a.paid_total, a.remaining_total,
         a.overdue_amount, a.overdue_count, a.max_overdue_per_contract,
         n.next_due_date, n.next_due_amount,
         (pm.customer_id is not null) as paid_this_month,
         a.late_this_month, a.has_unknown
  from public.customer cu
  join agg a on a.customer_id = cu.id
  left join nxt n on n.customer_id = cu.id
  left join pm on pm.customer_id = cu.id
)
select customer_id, tenant_id, name, phone, invoice_count, paid_total, remaining_total,
       coalesce(overdue_amount, 0) as overdue_amount,
       coalesce(overdue_count, 0) as overdue_count,
       coalesce(max_overdue_per_contract, 0) as max_overdue_per_contract,
       next_due_date, next_due_amount, paid_this_month,
       coalesce(late_this_month, false) as late_this_month,
       coalesce(has_unknown, false) as has_unknown,
       case when coalesce(max_overdue_per_contract, 0) >= 2 then 'late_many'
            when coalesce(overdue_count, 0) >= 1 then 'late'
            when coalesce(has_unknown, false) then 'unknown'
            when remaining_total > 0 then 'regular'
            else 'done' end as status,
       case when coalesce(max_overdue_per_contract, 0) >= 2 then 1
            when coalesce(overdue_count, 0) >= 1 then 2
            when coalesce(has_unknown, false) then 3
            when remaining_total > 0 then 4
            else 5 end::int as status_rank
from s;
revoke select on public.v_customer_summary from anon;

create or replace view public.v_recent_activity with (security_invoker = true) as
select * from (
  select c.tenant_id, c.created_at as at, 'sale'::text as kind,
         c.customer_id, cu.name as customer_name, c.id as contract_id, c.contract_no,
         c.total_price as amount
  from public.contract c
  join public.customer cu on cu.id = c.customer_id
  where c.status <> 'void' and c.interest_method <> 'imported'
  union all
  select p.tenant_id, p.received_at, 'payment'::text,
         p.customer_id, cu.name, p.contract_id, c.contract_no, p.amount
  from public.payment p
  join public.customer cu on cu.id = p.customer_id
  left join public.contract c on c.id = p.contract_id
  where not p.is_opening and (c.id is null or c.status <> 'void')
) a
order by at desc;
revoke select on public.v_recent_activity from anon;
