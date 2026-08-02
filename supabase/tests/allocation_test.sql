-- supabase/tests/allocation_test.sql
begin;
select plan(3);

-- Inline minimal fixture tables. Task 6 (Phase 2 domain tables) has not run yet at this point in
-- the plan's intentional sequencing (Phase 1 money-engine/TDD before Phase 2 domain tables), so
-- public.contract / public.installment don't exist in the real schema. These minimal versions
-- carry only the columns allocate_payment operates on and the test asserts against. Because
-- Postgres DDL is transactional, the `rollback` at the end of this file undoes the `create table`
-- statements along with the inserts -- zero permanent trace, no conflict with Task 6 creating the
-- real, fully-specified tables (RLS, indexes, triggers) later.
create table public.contract (
  id uuid primary key,
  tenant_id uuid,
  customer_id uuid,
  total_price numeric,
  num_installments int,
  status text
);

create table public.installment (
  id uuid primary key default gen_random_uuid(),
  contract_id uuid,
  seq_no int,
  due_date date,
  amount_due numeric,
  amount_paid numeric default 0,
  status text,
  paid_at timestamptz
);

-- fixture: two installments of 3000, the first overdue
insert into public.contract(id, tenant_id, customer_id, total_price, num_installments, status)
  values ('11111111-1111-1111-1111-111111111111',
          '22222222-2222-2222-2222-222222222222',
          '33333333-3333-3333-3333-333333333333',
          6000, 2, 'active');
insert into public.installment(contract_id, seq_no, due_date, amount_due, amount_paid, status) values
  ('11111111-1111-1111-1111-111111111111',1,'2026-07-01',3000,0,'overdue'),
  ('11111111-1111-1111-1111-111111111111',2,'2026-08-01',3000,0,'pending');

-- pay 5000: oldest first -> 3000 clears #1, 2000 partially pays #2
select is( public.allocate_payment('11111111-1111-1111-1111-111111111111', 5000),
           0.00::numeric, 'nothing left unallocated' );
select is( (select status from public.installment where seq_no=1), 'paid',    'oldest installment cleared' );
select is( (select amount_paid from public.installment where seq_no=2), 2000.00::numeric, 'remainder partially pays next' );

select * from finish();
rollback;
