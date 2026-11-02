-- Notah v2 follow-up flags: called_today / whatsapp_today appended to v_followup, promise_date is the
-- promise of the newest note that carries one, plus extra revokes.

create or replace view public.v_followup with (security_invoker = true) as
with cairo as (
  select (now() at time zone 'Africa/Cairo')::date as today
), open_inst as (
  select c.customer_id, i.due_date, i.seq_no, i.amount_due - i.amount_paid as remaining
  from public.installment i
  join public.contract c on c.id = i.contract_id
  where c.status <> 'void' and i.amount_due > i.amount_paid
), agg as (
  select customer_id,
         count(*) filter (where due_date < (select today from cairo))::int as overdue_count,
         coalesce(sum(remaining) filter (where due_date < (select today from cairo)), 0) as overdue_amount,
         min(due_date) filter (where due_date < (select today from cairo)) as oldest_past_due,
         count(*) filter (where due_date <= (select today from cairo) + 7) as in_window
  from open_inst group by customer_id
), nxt as (
  select distinct on (customer_id) customer_id, due_date as next_due_date, remaining as next_due_amount
  from open_inst order by customer_id, due_date, seq_no
), last_c as (
  select distinct on (customer_id) customer_id, kind as last_contact_kind,
         created_at as last_contact_at, note as last_note
  from public.contact_log order by customer_id, created_at desc, id desc
), prom as (
  select distinct on (customer_id) customer_id, promise_date
  from public.contact_log where kind = 'note' and promise_date is not null
  order by customer_id, created_at desc, id desc
), ct as (
  select customer_id,
         bool_or(kind = 'call') as called_today,
         bool_or(kind = 'whatsapp') as whatsapp_today
  from public.contact_log
  where kind in ('call','whatsapp')
    and (created_at at time zone 'Africa/Cairo')::date = (select today from cairo)
  group by customer_id
), s as (
  select cu.tenant_id, cu.id as customer_id, cu.name, cu.phone,
         a.overdue_amount, a.overdue_count,
         coalesce((select today from cairo) - a.oldest_past_due, 0)::int as days_late,
         n.next_due_date, n.next_due_amount,
         case when a.overdue_count > 0 then 'late' else 'due' end as status,
         (ct.customer_id is not null) as contacted_today,
         l.last_contact_kind, l.last_contact_at, l.last_note,
         case when p.promise_date > (select today from cairo) then p.promise_date end as promise_date,
         coalesce(ct.called_today, false) as called_today,
         coalesce(ct.whatsapp_today, false) as whatsapp_today
  from public.customer cu
  join agg a on a.customer_id = cu.id and a.in_window > 0
  left join nxt n on n.customer_id = cu.id
  left join last_c l on l.customer_id = cu.id
  left join prom p on p.customer_id = cu.id
  left join ct on ct.customer_id = cu.id
)
select tenant_id, customer_id, name, phone, overdue_amount, overdue_count, days_late,
       next_due_date, next_due_amount, status, contacted_today,
       last_contact_kind, last_contact_at, last_note, promise_date,
       case when contacted_today then 2 when promise_date is not null then 1 else 0 end::int as bucket,
       called_today, whatsapp_today
from s;
revoke select on public.v_followup from anon;
revoke insert, update, delete on public.v_followup from anon, authenticated;
revoke truncate on public.contact_log from authenticated;
