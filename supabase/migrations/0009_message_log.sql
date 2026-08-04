-- message_log: records every wa.me reminder link a merchant opens, so the
-- dashboard can show "last reminded" per installment/customer and the
-- collections-uplift metric (PRODUCT.md's design-partner success metric —
-- "measurable lift in overdue amounts collected") can eventually be proven.
--
-- Required by Task 10's brief (Step 4, "log the touch") but this table was
-- never created by Tasks 1-7 (verified by reading every supabase/migrations/*.sql
-- file directly — no CREATE TABLE for message_log anywhere). Added here as
-- this task's own schema addition: RLS-enabled per the project's ironclad
-- "RLS on every table, no exceptions" rule (see PRODUCT.md Constraints).
--
-- This is a client-side write (the merchant's browser inserts the row right
-- after opening wa.me, not an RPC), so unlike audit_log (system-written via
-- trigger, no client insert policy at all) this table needs a real INSERT
-- policy for `authenticated`. That policy mirrors record_payment()'s own
-- role gate (owner/manager/accountant/collector — the roles PRODUCT.md
-- describes as able to act on collections; 'viewer' is read-only) rather
-- than relying on tenant_id equality alone, so a viewer-role user cannot
-- write here even if the UI ever forgets to hide the button.
create table public.message_log (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenant(id) on delete cascade,
  customer_id uuid not null references public.customer(id),
  contract_id uuid references public.contract(id),
  installment_id uuid references public.installment(id),
  channel text not null default 'whatsapp' check (channel in ('whatsapp')),
  sent_by uuid references public.profile(id),
  sent_at timestamptz not null default now()
);
alter table public.message_log enable row level security;

create policy message_log_read on public.message_log for select to authenticated
  using (tenant_id = (select public.current_tenant_id()));

create policy message_log_insert on public.message_log for insert to authenticated
  with check (
    tenant_id = (select public.current_tenant_id())
    and public.current_role() in ('owner','manager','accountant','collector')
  );

-- no update/delete policy: append-only, same discipline as audit_log — a
-- reminder that was sent stays a fact, it is never edited or retracted.

-- "last reminded per installment" (worklist row) and "last reminded per
-- customer" (customer-level fallback) are the two lookups the dashboard
-- needs, so both get their own covering index.
create index on public.message_log (tenant_id, installment_id, sent_at desc);
create index on public.message_log (tenant_id, customer_id, sent_at desc);
