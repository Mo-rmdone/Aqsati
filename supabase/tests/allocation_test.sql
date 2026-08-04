-- supabase/tests/allocation_test.sql
begin;
select plan(3);

-- Fixture note: this file originally created its own shadow `public.contract`/
-- `public.installment` tables, written when Task 6 (Phase 2 domain tables) had not
-- run yet in the plan's intentional sequencing (Phase 1 money-engine/TDD before
-- Phase 2 domain tables). That approach broke once Task 6 landed the real,
-- fully-specified tables (with NOT NULL FKs to tenant/customer, RLS, a
-- `contract.start_date` NOT NULL column, etc.) into the same migration history
-- `supabase test db` replays before running this file: `create table public.contract`
-- now collides with the already-migrated table (42P07 relation already exists),
-- confirmed 2026-08-04 by replaying this file's DDL against the fully-migrated
-- remote schema. Fixed by inserting real, FK-satisfying rows into the actual
-- tables instead of shadowing them -- `allocate_payment` (0005_money_fns.sql)
-- operates on `public.installment` directly, so the rows just need to be real.
-- The transaction's `rollback` at the end still leaves zero permanent trace.
insert into public.tenant (id, name) values
  ('99999999-9999-9999-9999-999999999999', 'Allocation Test Tenant');
insert into public.customer (id, tenant_id, name, phone) values
  ('88888888-8888-8888-8888-888888888888', '99999999-9999-9999-9999-999999999999',
   'Allocation Test Customer', '01000000000');

-- fixture: two installments of 3000, the first overdue
insert into public.contract(id, tenant_id, customer_id, total_price, num_installments,
                             start_date, status)
  values ('11111111-1111-1111-1111-111111111111',
          '99999999-9999-9999-9999-999999999999',
          '88888888-8888-8888-8888-888888888888',
          6000, 2, '2026-07-01', 'active');
insert into public.installment(contract_id, tenant_id, seq_no, due_date, amount_due,
                                amount_paid, status) values
  ('11111111-1111-1111-1111-111111111111','99999999-9999-9999-9999-999999999999',
   1,'2026-07-01',3000,0,'overdue'),
  ('11111111-1111-1111-1111-111111111111','99999999-9999-9999-9999-999999999999',
   2,'2026-08-01',3000,0,'pending');

-- pay 5000: oldest first -> 3000 clears #1, 2000 partially pays #2
select is( public.allocate_payment('11111111-1111-1111-1111-111111111111', 5000),
           0.00::numeric, 'nothing left unallocated' );
select is( (select status from public.installment
              where contract_id = '11111111-1111-1111-1111-111111111111' and seq_no=1),
           'paid', 'oldest installment cleared' );
select is( (select amount_paid from public.installment
              where contract_id = '11111111-1111-1111-1111-111111111111' and seq_no=2),
           2000.00::numeric, 'remainder partially pays next' );

select * from finish();
rollback;
