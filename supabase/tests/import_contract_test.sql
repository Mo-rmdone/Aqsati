-- supabase/tests/import_contract_test.sql
-- 0018: import_contract (explicit schedule + opening balance), KPI excludes opening payments.
begin;
create temp table tap(n serial, l text);
insert into tap(l) select plan(20);

do $$
declare a uuid; b uuid; ca uuid; cb uuid;
begin
  a := tests.as_new_owner('Shop I');
  insert into public.customer(tenant_id, name, phone) values (a, 'CI', '01012345678') returning id into ca;
  perform set_config('t.ca', ca::text, true);
  perform set_config('t.uid', (select id::text from public.profile where tenant_id = a), true);
  perform set_config('t.tenant', a::text, true);
  b := tests.as_new_owner('Shop J');
  insert into public.customer(tenant_id, name, phone) values (b, 'CJ', '01112345678') returning id into cb;
  perform set_config('t.cb', cb::text, true);
  perform set_config('t.c1', gen_random_uuid()::text, true);
  perform set_config('t.c2', gen_random_uuid()::text, true);
  perform set_config('t.c3', gen_random_uuid()::text, true);
  perform set_config('t.c4', gen_random_uuid()::text, true);
  perform set_config('t.c5', gen_random_uuid()::text, true);
  perform set_config('t.c6', gen_random_uuid()::text, true);
  perform set_config('t.fd', (date_trunc('month', current_date) - interval '6 months')::date::text, true);
  perform set_config('t.fd0', date_trunc('month', current_date)::date::text, true);
end $$;

set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', current_setting('t.uid'), 'role', 'authenticated')::text, true);

do $$
declare r uuid; e text; pid uuid;
begin
  -- main case
  r := public.import_contract(jsonb_build_object('id', current_setting('t.c1'), 'customer_id', current_setting('t.ca'),
    'product_desc', 'Fridge', 'total_price', 25000, 'down_payment', 10000, 'monthly', 1000,
    'first_due', current_setting('t.fd'), 'paid_months', 6, 'external_invoice_no', '1043'));
  -- snapshot before any edit
  perform set_config('t.n_inst', (select count(*) from public.installment where contract_id = current_setting('t.c1')::uuid)::text, true);
  perform set_config('t.n_paid', (select count(*) from public.installment where contract_id = current_setting('t.c1')::uuid and status = 'paid' and seq_no <= 6)::text, true);
  perform set_config('t.remaining', (select remaining from public.v_contract_balance where contract_id = current_setting('t.c1')::uuid)::text, true);
  perform set_config('t.open_amt', (select amount from public.payment where contract_id = current_setting('t.c1')::uuid and is_opening)::text, true);
  perform set_config('t.n_over', (select count(*) from public.installment where contract_id = current_setting('t.c1')::uuid and seq_no > 6 and due_date < current_date and status = 'overdue')::text, true);
  perform set_config('t.n_past', (select count(*) from public.installment where contract_id = current_setting('t.c1')::uuid and seq_no > 6 and due_date < current_date)::text, true);
  -- uneven
  r := public.import_contract(jsonb_build_object('id', current_setting('t.c2'), 'customer_id', current_setting('t.ca'),
    'product_desc', 'TV', 'total_price', 25500, 'down_payment', 10000, 'monthly', 1000,
    'first_due', current_setting('t.fd'), 'paid_months', 0));
  -- idempotent
  r := public.import_contract(jsonb_build_object('id', current_setting('t.c1'), 'customer_id', current_setting('t.ca'),
    'product_desc', 'Fridge', 'total_price', 25000, 'down_payment', 10000, 'monthly', 1000,
    'first_due', current_setting('t.fd'), 'paid_months', 6));
  perform set_config('t.r1b', r::text, true);
  -- paid_months > count
  begin
    perform public.import_contract(jsonb_build_object('id', current_setting('t.c3'), 'customer_id', current_setting('t.ca'),
      'product_desc', 'X', 'total_price', 25000, 'down_payment', 10000, 'monthly', 1000,
      'first_due', current_setting('t.fd'), 'paid_months', 16));
    e := 'no error';
  exception when others then e := sqlerrm; end;
  perform set_config('t.e_paid', e, true);
  -- other shop's customer
  begin
    perform public.import_contract(jsonb_build_object('id', current_setting('t.c4'), 'customer_id', current_setting('t.cb'),
      'product_desc', 'X', 'total_price', 25000, 'down_payment', 10000, 'monthly', 1000,
      'first_due', current_setting('t.fd'), 'paid_months', 1));
    e := 'no error';
  exception when others then e := sqlerrm; end;
  perform set_config('t.e_cust', e, true);
  -- down >= total
  begin
    perform public.import_contract(jsonb_build_object('id', current_setting('t.c5'), 'customer_id', current_setting('t.ca'),
      'product_desc', 'X', 'total_price', 1000, 'down_payment', 1000, 'monthly', 100,
      'first_due', current_setting('t.fd'), 'paid_months', 0));
    e := 'no error';
  exception when others then e := sqlerrm; end;
  perform set_config('t.e_down', e, true);
  -- monthly > remaining
  begin
    perform public.import_contract(jsonb_build_object('id', current_setting('t.c5'), 'customer_id', current_setting('t.ca'),
      'product_desc', 'X', 'total_price', 2000, 'down_payment', 1000, 'monthly', 1500,
      'first_due', current_setting('t.fd'), 'paid_months', 0));
    e := 'no error';
  exception when others then e := sqlerrm; end;
  perform set_config('t.e_monthly', e, true);
  -- create_sale flat still rejects 6 years
  begin
    perform public.create_sale(jsonb_build_object('id', gen_random_uuid(), 'customer_id', current_setting('t.ca'),
      'product_desc', 'Y', 'sale_type', 'installment', 'total_price', 25000, 'sale_date', current_date::text,
      'down_payment', 10000, 'rate_percent', 30, 'years', 6));
    e := 'no error';
  exception when others then e := sqlerrm; end;
  perform set_config('t.e_years', e, true);
  -- KPI case: first installment this month, 1 paid
  r := public.import_contract(jsonb_build_object('id', current_setting('t.c6'), 'customer_id', current_setting('t.ca'),
    'product_desc', 'Z', 'total_price', 5000, 'down_payment', 2000, 'monthly', 1000,
    'first_due', current_setting('t.fd0'), 'paid_months', 1));
  perform set_config('t.kpi', (select coalesce(collected_this_month, 0) from public.v_collections_kpi)::text, true);
  -- edit opening payment on c1: 6000 -> 4000
  select id into pid from public.payment where contract_id = current_setting('t.c1')::uuid and is_opening;
  perform set_config('t.open_id', pid::text, true);
  r := public.update_payment(pid, 'cash',
    jsonb_build_array(jsonb_build_object('contract_id', current_setting('t.c1'), 'amount', 4000)));
end $$;

reset role;
insert into tap(l) select is(current_setting('t.n_inst'), '15', '15 installments');
insert into tap(l) select is((select count(distinct amount_due) from public.installment where contract_id = current_setting('t.c1')::uuid)::text, '1', 'all installments equal');
insert into tap(l) select is(current_setting('t.n_paid'), '6', 'first 6 paid');
insert into tap(l) select is(current_setting('t.remaining'), '9000.00', 'remaining 9000');
insert into tap(l) select is(current_setting('t.open_amt'), '6000.00', 'one opening payment of 6000');
insert into tap(l) select is(current_setting('t.n_over'), current_setting('t.n_past'), 'past-due unpaid are overdue');
insert into tap(l) select ok(current_setting('t.n_past')::int >= 1, 'at least one past-due installment exists');
insert into tap(l) select is((select count(*) from public.payment where contract_id = current_setting('t.c1')::uuid and is_opening)::text, '1', 'still one opening payment after edit');
insert into tap(l) select is((select count(*) from public.installment where contract_id = current_setting('t.c1')::uuid and status = 'paid')::text, '4', 'edit: paid installments become 4');
insert into tap(l) select is((select count(*) from public.installment where contract_id = current_setting('t.c2')::uuid)::text, '16', 'uneven: 16 installments');
insert into tap(l) select is((select amount_due from public.installment where contract_id = current_setting('t.c2')::uuid and seq_no = 16)::text, '500.00', 'uneven: last is 500.00');
insert into tap(l) select is((select sum(amount_due) from public.installment where contract_id = current_setting('t.c2')::uuid)::text, '15500.00', 'uneven: sum 15500');
insert into tap(l) select is(current_setting('t.r1b'), current_setting('t.c1'), 'same id twice returns id');
insert into tap(l) select is((select count(*) from public.contract where id = current_setting('t.c1')::uuid)::text, '1', 'same id twice: 1 contract');
insert into tap(l) select is(current_setting('t.e_paid'), 'عدد الشهور المدفوعة أكبر من عدد الأقساط', 'paid_months > count rejected');
insert into tap(l) select is((select count(*) from public.contract where id = current_setting('t.c3')::uuid)::text, '0', 'rejected: nothing written');
insert into tap(l) select is(current_setting('t.e_cust'), 'العميل غير موجود', 'other shop customer rejected');
insert into tap(l) select is(current_setting('t.e_down') || '|' || current_setting('t.e_monthly'),
  'المقدم لازم يكون أقل من المبلغ الكلي|القسط الشهري لازم يكون أكبر من صفر ومش أكبر من الباقي', 'down/monthly errors');
insert into tap(l) select ok(current_setting('t.e_years') <> 'no error', 'create_sale still rejects 6 years');
insert into tap(l) select is(current_setting('t.kpi'), '0', 'KPI excludes opening and past down payments');

insert into tap(l) select * from finish();
select string_agg(l, E'\n' order by n) from tap;
rollback;
