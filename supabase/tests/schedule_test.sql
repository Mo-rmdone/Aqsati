-- supabase/tests/schedule_test.sql
begin;
select plan(4);

-- Case A: clean division. 15,000 financed @ 18% flat over 12 months
-- interest = 15000 * 0.18 = 2700 ; total = 17700 ; each = 1475.00
select is( (select sum(amount_due) from public.build_schedule(15000,0.18,12,'2026-09-01','flat')),
           17700.00::numeric, 'A: installments sum to total payable' );
select is( (select amount_due from public.build_schedule(15000,0.18,12,'2026-09-01','flat') where seq_no=1),
           1475.00::numeric, 'A: first installment correct' );

-- Case B: residual. 10,000 financed @ 10% flat over 3 months
-- interest = 1000 ; total = 11000 ; 11000/3 = 3666.6667 -> 3666.67 x2, last absorbs residual
select is( (select sum(amount_due) from public.build_schedule(10000,0.10,3,'2026-09-01','flat')),
           11000.00::numeric, 'B: rounding residual does not break the total' );
select is( (select amount_due from public.build_schedule(10000,0.10,3,'2026-09-01','flat') where seq_no=3),
           3666.66::numeric, 'B: last installment absorbs the residual' );

select * from finish();
rollback;
