-- supabase/tests/schedule_test.sql
begin;
create temp table tap(n serial, l text);
insert into tap(l) select plan(7);

-- Case A: clean division. 15,000 financed @ 18% flat over 12 months
-- interest = 15000 * 0.18 = 2700 ; total = 17700 ; each = 1475.00
insert into tap(l) select is( (select sum(amount_due) from public.build_schedule(15000,0.18,12,'2026-09-01','flat')),
           17700.00::numeric, 'A: installments sum to total payable' );
insert into tap(l) select is( (select amount_due from public.build_schedule(15000,0.18,12,'2026-09-01','flat') where seq_no=1),
           1475.00::numeric, 'A: first installment correct' );

-- Case B: residual. 10,000 financed @ 10% flat over 3 months
-- interest = 1000 ; total = 11000 ; 11000/3 = 3666.6667 -> 3666.67 x2, last absorbs residual
insert into tap(l) select is( (select sum(amount_due) from public.build_schedule(10000,0.10,3,'2026-09-01','flat')),
           11000.00::numeric, 'B: rounding residual does not break the total' );
insert into tap(l) select is( (select amount_due from public.build_schedule(10000,0.10,3,'2026-09-01','flat') where seq_no=3),
           3666.66::numeric, 'B: last installment absorbs the residual' );

-- Due dates: first installment is one month after the sale date
insert into tap(l) select is((select due_date from public.build_schedule(15000,0.30,24,'2026-11-01','flat') where seq_no=1),
          '2026-12-01'::date, 'first installment one month after sale');
insert into tap(l) select is((select due_date from public.build_schedule(15000,0.30,24,'2026-01-31','flat') where seq_no=1),
          '2026-02-28'::date, 'first due clamps to month end');
insert into tap(l) select is((select amount_due from public.build_schedule(15000,0.30,24,'2026-11-01','flat') where seq_no=1),
          812.50::numeric, 'spec example: 25k price, 10k down, 30%, 2y -> 812.50');

insert into tap(l) select * from finish();
select string_agg(l, E'\n' order by n) as tap from tap;
rollback;
