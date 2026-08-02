create table public.payment (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenant(id) on delete cascade,
  customer_id uuid not null references public.customer(id),
  contract_id uuid references public.contract(id),
  credit_invoice_id uuid,
  amount numeric(14,2) not null check (amount > 0),
  method text not null default 'cash'
    check (method in ('cash','instapay','fawry','wallet','card','bank')),
  reference text,
  receipt_no bigint,
  source text not null default 'manual' check (source in ('manual','auto','field')),
  received_at timestamptz not null default now()
);
alter table public.payment enable row level security;
create policy payment_read on public.payment for select to authenticated
  using (tenant_id = (select public.current_tenant_id()));
-- no insert/update/delete policy: all writes go through record_payment() (SECURITY
-- DEFINER, defined in Step 2 below once credit_invoice/payment_allocation exist)
create index on public.payment (tenant_id, received_at desc);
create trigger payment_audit after insert or update or delete
  on public.payment for each row execute function public.fn_audit();

-- gapless, collision-proof per-tenant receipt numbers
alter table public.payment add constraint payment_receipt_no_unique unique (tenant_id, receipt_no);

-- search_path hardened to '' (not in the brief's original SQL, which left it
-- unset/default) per this project's established pattern (Tasks 4-6): every
-- reference below is already schema-qualified (public.tenant, public.payment), so
-- this is behaviorally a no-op, verified by the smoke test in the task report.
create or replace function public.fn_receipt_no() returns trigger
language plpgsql set search_path = '' as $$
begin
  -- lock the tenant row to serialize concurrent inserts for the same tenant;
  -- without this, two simultaneous payments can both read the same max() and collide
  perform 1 from public.tenant where id = new.tenant_id for update;
  select coalesce(max(receipt_no),0)+1 into new.receipt_no
  from public.payment where tenant_id = new.tenant_id;
  return new;
end $$;
create trigger payment_receipt before insert on public.payment
  for each row execute function public.fn_receipt_no();
