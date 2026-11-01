# نوتة | Notah — Build From Scratch Specification

> **Audience:** an AI model or developer starting from an empty repository, without access to the existing code.
> **Goal:** rebuild Notah — an Arabic, right-to-left installment-sales ledger for Egyptian shop owners — with the same behavior, money rules and look.
> **Companion file:** `NOTAH.md` describes the current project; this file tells you how to build it. If they disagree, this file's money rules win.
> Follow §11 (build order) milestone by milestone. Do not skip the tests in §9 — money correctness is the product.

---

## 0. Ground rules (read before writing any code)

1. **Money is computed and written only on the server** (Postgres functions). The client may *preview* the schedule, but its math must match the server to the piaster (§4).
2. **Every write from the client carries a client-generated UUID.** Sending the same id twice must create nothing new and return the same id.
3. **Tenant isolation:** every table has row-level security; a shop never sees or writes another shop's rows. Every server function verifies every id it receives belongs to the caller's shop.
4. **Arabic only, RTL, Egyptian dialect.** Currency `1,234.50 ج.م`, Latin digits, two decimals.
5. **Never lose or double money.** Overpayment is rejected; payments are edited, never deleted; every edit is audited.
6. **No secrets in the client.** Only the public (anon) Supabase key.

---

## 1. Product in brief

The shop owner (single user per shop) records every sale as an **invoice**, either **كاش** (cash) or **تقسيط** (installment). The app computes the monthly installment, creates the schedule, records payments (one receipt can be split across several invoices of the same customer), shows who must pay this week and who is late, and opens a pre-written WhatsApp reminder.

The customer is created **inside** the new-invoice form. The customers list shows only customers who have at least one invoice.

Target user: Egyptian appliance/electronics shop owner, 30–60, phone-first, not tech-savvy. The critical moment: a customer is standing in the shop paying; the owner must find them, record the payment and be sure it saved in under 20 seconds.

---

## 2. Stack

| Layer | Choice |
|---|---|
| App | **Expo** (React Native) + **Expo Router** + TypeScript. Web build first (deployed as a single-page app); same code later builds Android/iOS. |
| Data fetching | `@tanstack/react-query` |
| Backend | **Supabase**: Postgres + Auth (email/password) + PostgREST + `pg_cron` |
| Hosting | Cloudflare Workers Static Assets (SPA fallback) |
| Keepalive | A Cloudflare Worker with a daily cron that pings Supabase (free tier pauses after ~7 idle days) |
| Icons / font | `lucide-react-native` (+ `react-native-svg`), IBM Plex Sans Arabic (`@expo-google-fonts/ibm-plex-sans-arabic`) |
| Tests | `jest-expo` + `@testing-library/react-native`; SQL tests with **pgTAP** |

Repository layout:
```
mobile/       Expo app (src/app routes, src/api data hooks, src/lib pure logic, src/ui kit)
supabase/     migrations/*.sql, tests/*.sql
worker/       keepalive worker (wrangler.toml + src/index.ts)
docs/brand/   tokens, logo, icons
```

---

## 3. Database schema

Use `numeric(14,2)` for money everywhere. All tables have `tenant_id` and RLS enabled.

### 3.1 Tenancy
```sql
create extension if not exists pgcrypto;

create table public.tenant (id uuid primary key default gen_random_uuid(), name text not null,
  plan text not null default 'trial', created_at timestamptz not null default now());

create table public.profile (
  id uuid primary key references auth.users(id) on delete cascade,
  tenant_id uuid not null references public.tenant(id) on delete cascade,
  full_name text not null,
  role text not null default 'owner'
    check (role in ('owner','manager','accountant','collector','viewer')));

create function public.current_tenant_id() returns uuid language sql stable security definer
  set search_path = public as $$ select tenant_id from public.profile where id = auth.uid() $$;
create function public.current_role() returns text language sql stable security definer
  set search_path = public as $$ select role from public.profile where id = auth.uid() $$;
-- grant both to authenticated; revoke from public and anon.

-- signup: creates tenant + owner profile atomically; the only way a tenant/profile is created
create function public.signup_tenant(p_tenant_name text, p_full_name text) returns uuid
language plpgsql security definer set search_path = public as $$
declare v uuid;
begin
  if exists (select 1 from public.profile where id = auth.uid()) then
    raise exception 'profile already exists for this user'; end if;
  insert into public.tenant(name) values (p_tenant_name) returning id into v;
  insert into public.profile(id, tenant_id, full_name, role) values (auth.uid(), v, p_full_name, 'owner');
  return v;
end $$;
```
RLS: `tenant` select where `id = current_tenant_id()`; `profile` select where `tenant_id = current_tenant_id()`. No insert policies on tenant/profile (only `signup_tenant`).

### 3.2 Customers
```sql
create table public.customer (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenant(id) on delete cascade,
  name text not null,
  phone text not null check (phone ~ '^01[0125][0-9]{8}$'),
  national_id text check (national_id is null or national_id ~ '^[23][0-9]{13}$'),
  address text,
  blacklist_flag boolean not null default false,
  created_at timestamptz not null default now());
```
RLS: select/insert/update scoped to `current_tenant_id()`; insert requires the client to send `tenant_id` = its own tenant (policy `with check`). The client inserts with `upsert(..., { onConflict: 'id', ignoreDuplicates: true })` for idempotency.

### 3.3 Contracts (invoices) and installments
```sql
create table public.contract (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenant(id) on delete cascade,
  customer_id uuid not null references public.customer(id),
  contract_no bigint not null,                       -- per-shop 1,2,3… (trigger)
  sale_type text not null default 'installment' check (sale_type in ('installment','cash')),
  product_desc text not null,
  external_invoice_no text,                          -- optional, paper/cashier invoice number
  total_price numeric(14,2) not null,
  down_payment numeric(14,2) not null default 0,
  interest_rate numeric(6,4) not null default 0,     -- 30% stored as 0.3000
  interest_method text not null default 'flat' check (interest_method in ('flat','zero')),
  num_installments int not null,
  start_date date not null,                          -- the sale date
  status text not null default 'active',
  created_at timestamptz not null default now(),
  unique (tenant_id, contract_no),
  constraint contract_sale_type_installments_check check (
    (sale_type = 'cash' and num_installments = 0) or
    (sale_type = 'installment' and num_installments in (12,24,36,48,60))));

create table public.installment (
  id uuid primary key default gen_random_uuid(),
  contract_id uuid not null references public.contract(id) on delete cascade,
  tenant_id uuid not null references public.tenant(id) on delete cascade,
  seq_no int not null,
  due_date date not null,
  amount_due numeric(14,2) not null,
  amount_paid numeric(14,2) not null default 0,
  status text not null default 'pending' check (status in ('pending','partial','paid','overdue','waived')),
  paid_at timestamptz,
  unique (contract_id, seq_no));
```
`contract_no` trigger (`before insert`, **security definer** so the lock works under RLS):
```sql
perform 1 from public.tenant where id = new.tenant_id for update;   -- serialize per shop
select coalesce(max(contract_no),0)+1 into new.contract_no from public.contract where tenant_id = new.tenant_id;
```
RLS: select scoped to tenant. **No client insert/update of money rows is needed** — `create_sale` writes them.

### 3.4 Payments
```sql
create table public.payment (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenant(id) on delete cascade,
  customer_id uuid not null references public.customer(id),
  contract_id uuid references public.contract(id),     -- set when the payment has one line
  receipt_no bigint,                                    -- per-shop sequence (same trigger pattern)
  amount numeric(14,2) not null check (amount > 0),
  method text not null default 'cash' check (method in ('cash','instapay','fawry','wallet','card','bank')),
  received_at timestamptz not null default now(),
  edited_at timestamptz,
  unique (tenant_id, receipt_no));

-- the owner's split of one receipt across contracts
create table public.payment_line (
  id uuid primary key default gen_random_uuid(),
  payment_id uuid not null references public.payment(id) on delete cascade,
  contract_id uuid not null references public.contract(id),
  tenant_id uuid not null references public.tenant(id) on delete cascade,
  amount numeric(14,2) not null check (amount > 0),
  kind text not null check (kind in ('down_payment','cash','installment')));

-- where each line's money landed, per installment
create table public.payment_allocation (
  id uuid primary key default gen_random_uuid(),
  payment_id uuid not null references public.payment(id) on delete cascade,
  installment_id uuid references public.installment(id),
  amount numeric(14,2) not null check (amount > 0));
```
RLS: select-only, tenant-scoped (allocation via join to payment). No write policies — only the functions below write.

### 3.5 Audit
`audit_log(id bigserial, tenant_id, user_id, action, entity_type, entity_id, before_json jsonb, after_json jsonb, created_at)` with an `after insert or update or delete` trigger on customer, contract, installment, payment (security definer, `search_path = ''`). `update_payment` also writes an explicit `payment_edit` row.

### 3.6 Views (all `with (security_invoker = true)`, `revoke select … from anon`)
```sql
-- per-contract balance
create view public.v_contract_balance with (security_invoker = true) as
select c.id as contract_id, c.tenant_id, c.customer_id, c.contract_no, c.product_desc, c.sale_type,
  case when c.sale_type = 'cash' then c.total_price else c.down_payment + coalesce(i.due_sum,0) end as total_payable,
  case when c.sale_type = 'cash' then coalesce(pl.paid_sum,0)
       else c.down_payment + coalesce(i.due_sum,0) - coalesce(i.open_sum,0) end as paid,
  case when c.sale_type = 'cash' then c.total_price - coalesce(pl.paid_sum,0) else coalesce(i.open_sum,0) end as remaining,
  i.next_due as next_due_date
from public.contract c
left join (select contract_id, sum(amount_due) due_sum, sum(amount_due-amount_paid) open_sum,
                  min(due_date) filter (where status in ('pending','partial','overdue')) next_due
           from public.installment group by contract_id) i on i.contract_id = c.id
left join (select contract_id, sum(amount) paid_sum from public.payment_line group by contract_id) pl
  on pl.contract_id = c.id;

-- home tiles (one row per tenant; a new shop has no row → show zeros)
--   expected_this_week   = sum(amount_due - amount_paid) of unpaid installments due today..today+7
--   collected_this_month = sum(payment.amount) with received_at in the current month (ALL money in:
--                          installments + down payments + cash sales)
--   overdue_total        = sum(amount_due - amount_paid) of installments with status 'overdue'

-- "who to call today": unpaid installments due within 7 days or late
create view public.v_worklist with (security_invoker = true) as
select c.tenant_id, c.id contract_id, cu.id customer_id, cu.name, cu.phone, i.id installment_id,
       i.due_date, (i.amount_due - i.amount_paid) amount, (current_date - i.due_date) days_late, i.status
from public.installment i join public.contract c on c.id = i.contract_id
join public.customer cu on cu.id = c.customer_id
where i.status in ('pending','partial','overdue') and i.due_date <= current_date + 7;
```

---

## 4. Money algorithms (the heart — implement exactly)

### 4.1 Schedule
```sql
create function public.build_schedule(p_financed numeric, p_rate numeric, p_num int, p_start date,
  p_method text default 'flat') returns table(seq_no int, due_date date, amount_due numeric)
language plpgsql immutable set search_path = '' as $$
declare v_interest numeric(14,2); v_total numeric(14,2); v_base numeric(14,2); i int;
begin
  if p_num < 1 then raise exception 'num_installments must be >= 1'; end if;
  v_interest := case when p_method = 'zero' then 0 else round(p_financed * p_rate, 2) end; -- once, whole term
  v_total := p_financed + v_interest;
  v_base  := round(v_total / p_num, 2);
  for i in 1..p_num loop
    seq_no := i;
    due_date := (p_start + make_interval(months => i))::date;   -- first = one month after sale; clamps month-end
    amount_due := case when i < p_num then v_base else v_total - v_base * (p_num - 1) end;
    return next;
  end loop;
end $$;
```
**Rounding:** Postgres `round` = half away from zero. **Month add** is always from the start date (`start + i months`), never from the previous due date.

**Client mirror** (`previewInstallments` in TypeScript): work in integer piasters; `divRound(a, b)` = half away from zero; `addMonths(isoDate, i)` clamps to the last day of the target month. Inputs: price, down, ratePercent (≤ 2 decimals; rate = ratePercent/100 → interest = divRound(financedP × ratePercent×100, 10000)), years (1–5). Output: financed, total, monthly, last, count, firstDue, schedule[].

### 4.2 Allocation (oldest due first)
```sql
create function public.allocate_payment(p_payment uuid, p_contract uuid, p_amount numeric)
returns numeric language plpgsql security definer set search_path = '' as $$
declare r record; v_left numeric(14,2) := p_amount; v_take numeric(14,2);
begin
  for r in select id, amount_due, amount_paid from public.installment
           where contract_id = p_contract and status <> 'paid'
           order by due_date, seq_no for update loop
    exit when v_left <= 0;
    v_take := least(v_left, r.amount_due - r.amount_paid);
    update public.installment set amount_paid = amount_paid + v_take,
      status = case when amount_paid + v_take >= amount_due then 'paid' else 'partial' end,
      paid_at = case when amount_paid + v_take >= amount_due then now() else paid_at end
    where id = r.id;
    insert into public.payment_allocation(payment_id, installment_id, amount) values (p_payment, r.id, v_take);
    v_left := v_left - v_take;
  end loop;
  return v_left;
end $$;   -- internal: revoke from public, anon, authenticated
```

### 4.3 `installment_status(due, paid, due_date)`
`paid` if paid ≥ due; else `overdue` if due_date < today; else `partial` if paid > 0; else `pending`.

### 4.4 `create_sale(p jsonb) returns uuid` — security definer, granted to `authenticated`
Input keys: `id` (client uuid, required), `customer_id`, `product_desc`, `sale_type` ('installment'|'cash'), `total_price`, `sale_date` (YYYY-MM-DD), `external_invoice_no` (nullable), `payment_method`; installment only: `down_payment`, `rate_percent`, `years`.

Steps, in order:
1. Caller's tenant must exist and role ∈ owner/manager/accountant, else `'غير مصرح لك بتسجيل البيع'`.
2. `id` required (`'رقم العملية مطلوب'`). `pg_advisory_xact_lock(hashtext(id))`. If a contract with this id exists for the tenant → **return id** (idempotent).
3. Customer must belong to the tenant (`'العميل غير موجود'`). Product required (`'اسم المنتج مطلوب'`). Price > 0 (`'السعر لازم يكون أكبر من صفر'`).
4. Sale date defaults to today **in Africa/Cairo**; a future date → `'تاريخ البيع لا يمكن أن يكون في المستقبل'`. Method in the allowed list (`'طريقة الدفع غير صحيحة'`).
5. **Cash:** contract (`num_installments = 0`, `down_payment = total_price`, rate 0, method 'zero'), one payment of the full price with `received_at = least(sale_date, now())`, and a `payment_line(kind='cash')`.
6. **Installment:** validate `0 ≤ down < price` (`'المقدم لازم يكون أقل من السعر'`), `0 ≤ rate ≤ 200` (`'نسبة الفائدة لازم تكون بين 0 و 200'`), `1 ≤ years ≤ 5` (`'عدد السنين لازم يكون من 1 إلى 5'`). Insert contract (`interest_rate = rate/100`, `num_installments = years×12`, `start_date = sale_date`), installments from `build_schedule(price − down, rate/100, years×12, sale_date)`, and if down > 0 a payment + `payment_line(kind='down_payment')` with `received_at = least(sale_date, now())`.

### 4.4b `import_contract(p jsonb) returns uuid` — security definer, granted to `authenticated`
Imports one running installment contract from the paper ledger. Input keys: `id`, `customer_id`, `product_desc`, `total_price` (incl. interest), `down_payment`, `monthly`, `first_due` (date), `paid_months`, `external_invoice_no`. Same auth/lock/idempotency opening as `create_sale`.
1. Customer in tenant; product required; price > 0; `0 ≤ down < total` (`'المقدم لازم يكون أقل من المبلغ الكلي'`); `0 < monthly ≤ total − down`.
2. `first_due` ≤ Cairo today + 1 month (`'أول شهر اتدفع بعيد في المستقبل'`); count = `ceil(remaining / monthly)` ≤ 600; `paid_months ≤ count`.
3. Contract: `interest_method = 'imported'`, rate 0, `num_installments = count`, `start_date = first_due − 1 month`. Installments: `monthly × (count−1)`, last = remainder, due day clamped to month end.
4. Down payment (if > 0): payment + `payment_line(kind='down_payment')`, `is_opening = true`. Paid months (if > 0): one cash payment of the first N installments' sum, `is_opening = true`, applied via `fn_apply_payment_lines`. Statuses refreshed.
5. `v_collections_kpi` excludes `is_opening` payments.

### 4.5 Payments: shared validation `fn_check_payment_lines(tenant, customer, lines jsonb) returns numeric`
`lines` = `[{ "contract_id": uuid, "amount": number }, …]`. Iterate lines **sorted by contract_id** (deadlock-safe lock order):
- empty/not an array → `'لازم تحدد عقد واحد على الأقل'`
- amount null or ≤ 0 → `'المبلغ لازم يكون أكبر من صفر'`
- contract not in tenant or not this customer's → `'العقد غير موجود أو لا يخص هذا العميل'`
- duplicate contract → `'العقد مكرر في نفس الدفعة'`
- cash contract → `'لا يمكن تحصيل أقساط على عقد نقدي'`
- lock that contract's installments `for update`, compute `remaining = sum(amount_due − amount_paid)`; `round(amount,2) > remaining` → `'المبلغ أكبر من المتبقي على العقد'`
- return the sum of rounded amounts.

`fn_apply_payment_lines(payment, tenant, lines)`: for each line insert `payment_line(kind='installment')` and call `allocate_payment`.

### 4.6 `record_payment(p_id, p_customer, p_method, p_lines) returns uuid`
Role ∈ owner/manager/accountant/collector. `p_id` required; advisory lock; if exists for tenant → return it. Customer must belong to tenant. Validate method. `total = fn_check_payment_lines(...)`. Insert payment (`id = p_id`, `amount = total`, `contract_id` = the contract when exactly one line, else null). Apply lines. Return id.

### 4.7 `update_payment(p_id, p_method, p_lines) returns uuid` — edit, never delete
1. Role check; advisory lock on `p_id`; select the payment `for update` (must be this tenant's, else `'الدفعة غير موجودة'`).
2. Reject if any of its lines is `down_payment`/`cash` (`'المقدم والبيع الكاش جزء من الفاتورة ومش بيتعدلوا من هنا'`).
3. Snapshot `before = {amount, method, lines}`.
4. Lock installments of (contracts in its current allocations ∪ contracts in the new lines of the same customer), **in contract-id order**.
5. Reverse: for each of its allocations grouped by installment, subtract from `amount_paid` (raise if it would go negative), recompute `status` with `installment_status` (keep 'waived'), clear `paid_at` if no longer fully paid.
6. Delete its allocations and lines. Validate new lines with `fn_check_payment_lines` against the restored balances.
7. Update payment: amount, method, `contract_id` rule, `edited_at = now()`. Apply new lines.
8. Insert `audit_log(action='payment_edit', before_json, after_json)`.

Other payments' allocations are never touched.

### 4.8 Nightly job
```sql
create function public.flip_overdue() returns int language plpgsql security definer set search_path = '' as $$
declare n int; begin
  update public.installment set status = 'overdue'
   where status in ('pending','partial') and due_date < current_date;
  get diagnostics n = row_count; return n; end $$;   -- revoke from anon/authenticated
create extension if not exists pg_cron;
select cron.schedule('flip-overdue', '0 1 * * *', 'select public.flip_overdue()');  -- 03:00 Cairo
```

---

## 5. Client architecture (`mobile/src`)

### 5.1 `lib/` (pure, unit-tested)
| Module | Exports / behavior |
|---|---|
| `supabase.ts` | `supabase` client (anon key from `EXPO_PUBLIC_SUPABASE_URL` / `EXPO_PUBLIC_SUPABASE_ANON_KEY`); session in localStorage on web, AsyncStorage on native (SecureStore in Phase 2). `isSupabaseConfigured`; if false the root shows "التطبيق غير مهيّأ". Never fall back to an `http://` URL. |
| `money.ts` | `previewInstallments`, `splitTotal(total, n)`, `formatEGP(n)` → `"1,234.50 ج.م"` |
| `validation.ts` | `validateCustomer({name, phone, nationalId})`, `validateSale(...)` — same rules and **same Arabic messages** as the server |
| `ids.ts` | `newId()` (`expo-crypto` randomUUID) |
| `attempt.ts` | `useAttempt()`: `idFor(signature)` returns the same id for a pure retry, a new id if the form changed after a failed attempt; `reset()` after success |
| `split.ts` | `validateSplit(total, lines)`: non-zero lines sum exactly to total (in piasters), each 0 < amount ≤ remaining, at least one; `autoSplit` (single open contract gets the total) |
| `date.ts` | `formatDateAr('2026-12-01')` → `"1 ديسمبر 2026"` (parse with regex, never `new Date(iso)` — avoids timezone shift); `localDateISO` |
| `whatsapp.ts` | `whatsappLink(phone, msg)` → `https://wa.me/20…?text=…` or `null` if phone is not `^01[0125]\d{8}$`; `reminderMessage({customer, amount, dueDate, merchant})` |
| `authErrors.ts` | map Supabase auth errors to Arabic (registered / invalid credentials / email not confirmed / weak password / generic) |
| `auth.tsx` | `AuthProvider` + `useAuth()` → `{session, profile, shopName, loading, refreshProfile, signOut}` (see 5.3) |

Input helpers (in `api/sales.ts`): `normalizeDigits` (٠–٩ → 0–9), `sanitizeAmount`/`sanitizeRate` (max 2 decimals), `todayISO()`, `saleDateError()`.

### 5.2 `api/` (react-query hooks; query keys matter)
- `customers.ts`: `useCustomers(search, {withInvoices})` — name `ilike %term%` and phone `ilike term%` as **two typed calls merged client-side** (never build an `.or()` string — filter injection); escape `\ % _ , ( )` and strip `*`. `withInvoices: true` selects `id, name, phone, contract!inner(id)`. `useCreateCustomer()` (idempotent upsert), `findCustomerByPhone`, `useCustomer(id)`, `prefillFromSearch(search)`.
- `contracts.ts`: `useCustomerContracts(customerId)` from `v_contract_balance`; `contractStatus(remaining)` → settled/open/unknown (null remaining = unknown, never "paid").
- `sales.ts`: `useCreateSale()` → `rpc('create_sale', { p })`; `derivePreview(form)` returns null for cash/invalid input (never throws).
- `payments.ts`: `useRecordPayment`, `useUpdatePayment`, `useContract(id)` (contract + installments + payments with `editable` = all lines are 'installment'), `editableContracts(paymentLines, balances)` (own contracts get `remaining + own line`; other open installment contracts at their remaining).
- `dashboard.ts`: `useCollectionsKpi`, `useWorklist`, `sortWorklist` (largest days_late first, then due_date, nulls last). Keys start with `['dashboard', …]`.
- After any sale/payment: invalidate `['customers']`, `['customer', id]`, `['contracts', customerId]`, `['contract', id]` for every affected contract (old and new on edit), `['dashboard']`.
- `QueryCacheGuard`: `queryClient.clear()` whenever the signed-in user id changes (incl. sign-out).

### 5.3 Auth flow
- Signup: shop name, owner name, email, password → `auth.signUp` → if a session is returned: `rpc('signup_tenant')` → `refreshProfile()` → home. If no session (email confirmation on): stash `{tenantName, fullName}` locally and provision on the first sign-in.
- **`refreshProfile` must read the live session from `supabase.auth.getSession()`**, never a session captured in a React closure (otherwise new owners get stuck on loading forever).
- Gate: loading → spinner (always ends, try/finally); no session → `/login`; session + profile → app; session without profile → a retry screen (never an infinite spinner). A transient profile-fetch error must keep the existing profile (don't eject the user).

### 5.4 Navigation (Expo Router)
```
app/_layout.tsx            providers, fonts, RTL, gate (Stack)
app/(auth)/login, signup
app/(app)/_layout.tsx      Stack: (tabs) first, then form screens above it
app/(app)/(tabs)/_layout   Tabs: الرئيسية, العملاء, + فاتورة (pushes /sale/new), الإعدادات
app/(app)/(tabs)/index     Home
app/(app)/(tabs)/customers/index, [id]
app/(app)/(tabs)/settings
app/(app)/sale/new
app/(app)/contract/[id]
app/(app)/payment/new, payment/[id]/edit
```
**Forms must live in the Stack above the tabs** (not as tab screens). Tab screens don't remount, so a form's attempt id would survive and a second identical payment would be silently treated as a retry. Also reset the attempt id and form after every success.

Web: `app.json` → `web.output: "single"`, `web.lang: "ar"`; set `document.documentElement.dir = 'rtl'` at startup. Native: `I18nManager.forceRTL(true)`.

---

## 6. Screens (content and behavior)

**Login** — logo lockup, tagline "نوتة الأقساط بتاعتك، بتحسب وبتفتكر عنك", email, password, "دخول", link "ليس لديك حساب؟ أنشئ متجرك".

**Signup** — "إنشاء متجر جديد": shop name, owner name, email, password, "إنشاء الحساب". Errors in Arabic.

**Home** — title = shop name. Three tiles with a status dot: مستحق الأسبوع ده (due), المحصّل الشهر ده (paid), إجمالي المتأخرات (overdue, terracotta). Section "مين لازم أكلمه النهارده": rows sorted by `sortWorklist`; each row: name, amount, chip "متأخر N يوم (من <date>)" / "مستحق النهارده" / "يستحق <date>", buttons **واتساب** (disabled when the phone is invalid) and **تسجيل دفعة** (→ payment with customerId + contractId). Late rows get a terracotta edge. Empty: "مفيش أقساط مستحقة دلوقتي".

**Customers** — search pill "ابحث بالاسم أو الموبايل" (300 ms debounce, keep previous data), list of customers **with invoices** (name, phone, chevron). Empty: "لسه مفيش عملاء. أول فاتورة تعملها، العميل بتاعها هيظهر هنا." + "فاتورة جديدة".

**Customer file** — back, name, details card (phone, national ID, address, blacklist chip), buttons "فاتورة جديدة" (→ `/sale/new?customerId=`) and "تسجيل دفعة" (only if a contract has an open balance), list of contract cards: contract no., product, كاش/قسط, paid, remaining, status chip (مدفوع بالكامل / جاري / غير معروف).

**New invoice** (most important)
1. Customer: search; matching customers listed; **"عميل جديد"** row → inline fields: name, phone, national ID (optional), address (optional), prefilled from the search text (digits → phone, else name), with "اختار عميل موجود". If preselected via `customerId`, show it.
2. Product name, price; toggle **كاش / تقسيط**; for installment: down payment, interest %, duration chips 1–5 years.
3. Sale date (default today, Cairo; future rejected).
4. **Live preview card** (installment only, never throws on partial input): hero **القسط الشهري** in the largest font + "× N شهر", then الباقي بعد المقدم, الإجمالي بعد الفايدة, أول قسط (Arabic date), and القسط الأخير only if different.
5. External invoice number (optional), payment method chips (cash default; label "طريقة دفع المقدم" for installment).
6. "حفظ الفاتورة": validate customer + sale; if new customer and the phone already exists → banner "فيه عميل بنفس الرقم ده: X" with "الفاتورة لـ X" / "لأ، ده عميل تاني"; then upsert the customer (fixed id per form), then `create_sale` with the attempt id; on success reset and replace to `/contract/<id>`. Server Arabic errors are shown as-is; otherwise "تعذر حفظ الفاتورة، حاول مرة تانية".

**Contract** — back, header (contract no., product, external invoice no.), total / paid / remaining + status chip, "تسجيل دفعة" if open; installments table (رقم، الميعاد، المستحق، المدفوع، الحالة chip); payments list (receipt no., amount, method, date, "اتعدّلت" chip, "تعديل" if editable).

**Record payment** — total amount, method, one row per open installment contract (product, remaining, amount input), live sum indicator, save disabled until `validateSplit` passes; single open contract → auto-fill.

**Edit payment** — same form prefilled; offers the payment's own contracts (even if settled) + the customer's other open contracts; remaining = current + own line.

**Import (`/import`)** — pick .xlsx/.csv (max 500 rows, 5 MB) or download the template (12 Arabic headers). Rows are parsed/normalized, computed (remaining, count, last installment) and shown in a preview with inline edit, per-row errors/warnings, duplicate detection (phone + product + total + first month, skipped by default; "تخطي" chip) and a summary count. Save runs row by row (customer reuse by phone within the shop, then `import_contract`; the row id never changes between retries, and the server rejects a different payload for an existing id, telling the user to open and edit the contract instead); inputs are locked while saving; failed rows stay listed for retry.

**Settings** — shop name, "تسجيل الخروج".

All screens: loading, error-with-retry, and empty states. No blank screens, no infinite spinners.

---

## 7. Design system

Colors (light; dark set exists for later):
```
paper #FBF7EC   surface #FFFFFF   surfaceSunken #F3EDDC   line #E4DBC4   lineStrong #857D5F
ink #1C2521     inkMuted #4F5A54
brand #0B5D4B   brandStrong #084537   brandSoft #DDEFE7   onBrand #FFFFFF
coin #F2B134    onCoin #2A1C00   coinSoft #FCEFCB          (coin = "+ فاتورة" + highlights only)
paid #11694B/#DFF1E8  partial #274F93/#E1EAF8  due #7A5200/#FCEFCB
overdue #A2400F/#FBE4D6 (terracotta)  unknown #4F5A54/#E9E6DB  error #B3261E/#FBE3E1
```
Type (IBM Plex Sans Arabic): title1 28/40 bold · title2 22/34 bold · title3 18/30 semibold · body 16/28 · bodyStrong 16/28 semibold · label 16/24 semibold · helper 15/24 · chip 14/20 semibold · displayMoney 40/52 bold · moneyLg 22/30 bold · moneyMd 18/28 semibold.
Spacing 4/8/12/16/20/24/32/40/48 · radius sm 8, md 12, lg 16, xl 24, pill · tap min 48, buttons/inputs 56 · web column max 480px centered · gutter 16.

Rules: money status = **icon + word + color** (check / half-circle / clock / calendar-x / question), overdue is terracotta never red, red only for errors; Lucide icons only; back = chevron-right; `flexDirection: 'row'` (not `row-reverse`) for RTL rows; money text `writingDirection: 'ltr'` + tabular numerals; Egyptian Arabic copy, no "من فضلك"/"تم بنجاح". On web, register one `@font-face` family with weights 400/500/600/700 and apply it globally; don't block first paint on font loading.

Logo: wordmark "Notah | نوتة" in ledger green with amber dots; app icon = cream "ن" curve with an amber dot on ledger green.

---

## 8. Infrastructure

- **Supabase project** (free tier to start): run migrations in order; enable `pg_cron`; email/password auth.
- **Web deploy:** `npx expo export -p web` → `dist/`; `wrangler.toml`:
  ```toml
  name = "notah"
  compatibility_date = "2026-10-31"
  [assets]
  directory = "./dist"
  not_found_handling = "single-page-application"
  ```
  `npx wrangler deploy`. Env vars are baked at build time from `mobile/.env.local`.
- **Keepalive worker** (`worker/`): cron `0 1 * * *`, `fetch(SUPABASE_URL + '/rest/v1/tenant?select=id&limit=1', { headers: { apikey: ANON, Authorization: 'Bearer ' + ANON } })`. Anon key set as a wrangler secret. Without it the free project pauses and the app shows "can't reach server".
- Before paying customers: Supabase Pro (backups, no pausing).

---

## 9. Required tests

### 9.1 SQL (pgTAP, each file `begin; … rollback;`)
Helper `tests.as_new_owner(shop text)` (security definer, revoked from clients): inserts an `auth.users` row, sets `request.jwt.claims`, calls `signup_tenant`, returns the tenant id; tests then `set local role authenticated`.
- Schedule: 15000 @ 0.18 × 12 → sum 17,700, first 1,475.00. 10000 @ 0.10 × 3 → sum 11,000, last 3,666.66. 15000 @ 0.30 × 24 from 2026-11-01 → first 812.50 due 2026-12-01. From 2026-01-31 → first due 2026-02-28.
- contract_no per shop starts at 1 and increments independently; works for an RLS-bound user.
- create_sale: installment 25000/10000/30%/2y → 24 installments, sum 19,500, one 10,000 down-payment line; cash 7000 → 0 installments, payment 7000, remaining 0; same id twice → one contract, one payment; exact Arabic errors for down ≥ price, years 6, other shop's customer, future date; no rows written on rejection; backdated sale's payment `received_at` = sale date and excluded from this month's KPI.
- record_payment: 2000 split 1000/1000 across two contracts → each `paid` +1000, one receipt; oldest-first (1000 on 812.50/month → #1 paid, #2 partial 187.50); overpay rejected, nothing changed; zero/foreign/duplicate/other-customer lines rejected; same id twice → one payment.
- update_payment: 5000→500 equals a fresh 500; editing A leaves B's allocations untouched and no negative `amount_paid`; move money to another contract; overpay on edit rejected and payment unchanged; audit row with before/after and `edited_at` set; down payment not editable.
- import_contract (`import_contract_test.sql`): schedule/remainder, down + opening payments flagged `is_opening`, excluded from KPI, idempotent on id, future-date / 600-cap / paid_months / foreign-customer rejections.
- v_contract_balance for a legacy contract with down payment and no lines: remaining = installment balance.

### 9.2 App (jest)
- `previewInstallments` matches every SQL case above (same numbers), sums exactly, clamps month-end incl. leap years.
- Validation messages equal the server's; Arabic-Indic digits normalized; 2-decimal caps; impossible dates (2026-02-30) rejected.
- `idForAttempt`/`useAttempt`: retry keeps id, edit after failure → new id, two sequential successful identical submits → different ids.
- `validateSplit`, `autoSplit`, `editableContracts`, `sortWorklist`, `formatDateAr`, `whatsappLink`, `escapeSearch`, `customerSelect`, `prefillFromSearch`, auth error mapping.
- Import (`importRows.test.ts`, `importSummary.test.ts`): header/alias mapping, phone normalization, raw date serials, count/last-installment math, duplicate keys, summary counts.
- Auth state machine: stale-closure regression (refreshProfile uses the live session), pending-signup provisioned once and restored on failure, sign-out clears profile/shopName/cache, loading always ends, transient error keeps the profile.

---

## 10. Pitfalls already learned (avoid them)

1. Tab screens don't remount → put forms in a Stack above tabs and reset ids after success.
2. `refreshProfile` capturing a stale `session` → new owners stuck on loading.
3. A `for update` on the tenant row inside a non-definer trigger locks nothing under RLS → make sequence triggers security definer.
4. Check-then-insert idempotency races → take an advisory lock on the id first.
5. Ignoring `allocate_payment`'s leftover silently loses overpayments → validate remaining before allocating.
6. `row-reverse` for RTL puts labels on the wrong side → use `row`.
7. PostgREST `*` acts as `%` in `ilike` → strip it; never build `.or()` strings from user input.
8. Copying links out of RTL text can inject invisible characters into URLs.
9. The free Supabase project pauses after a week idle → deploy the keepalive from day one.
10. Server "today" must be the Cairo date, or early-morning sales get rejected as "future".
11. Excel phone cells lose the leading 0 and date cells read as JS Dates shift a day → normalize phones (re-add the 0, Arabic digits) and read raw serials/strings, not Date objects.

---

## 11. Build order (milestones — each ends green and deployable)

1. **Foundation:** Supabase project, tenancy + RLS + `signup_tenant`, audit, keepalive worker. Tests: isolation between two shops.
2. **Money engine:** `build_schedule`, `allocate_payment`, `installment_status`, contract/installment/customer tables with checks and `contract_no`. Schedule tests.
3. **Sales:** payment/payment_line/allocation, `create_sale`, views (`v_contract_balance`, KPI, worklist), `flip_overdue` + cron. create_sale tests.
4. **Payments:** `fn_check_payment_lines`, `fn_apply_payment_lines`, `record_payment`, `update_payment`. Payment and edit tests. Run the security advisor: no ERROR.
5. **App shell:** Expo app, RTL, fonts, theme, UI kit (Screen, Button, Field, Money, StatusChip), Supabase client, `lib/*` with tests, auth + gate.
6. **Screens:** customers list + file, new invoice (with inline new customer), contract, record/edit payment, home, settings.
7. **Deploy** web to Cloudflare; run the acceptance checklist (§12) signed in on a phone.
8. **Then:** Excel import, voice commands, ID-card OCR, Android/iOS + offline sync, landing page (see `NOTAH.md` §9).

---

## 12. Acceptance checklist (on the deployed site, signed in, on a phone)

1. Sign up → lands on home (no endless loading).
2. New invoice → "عميل جديد" → wrong phone shows an Arabic error; a phone that exists shows the duplicate banner.
3. Installment 25,000 / 10,000 / 30% / 2 years → preview **812.50 × 24**, first due one month later; saved contract matches.
4. Cash sale 7,000 → contract paid, remaining 0; customer appears in the customers list.
5. Second installment invoice for the same customer; record 2,000 split 1,000/1,000 → both balances −1,000, one receipt.
6. Pay more than remaining → blocked with a message.
7. Edit the 2,000 payment to 500 → balances recalculated, "اتعدّلت" shown.
8. Record the same 812.50 twice from the worklist → **two** receipts (not one).
9. Home: collected this month includes down payment + cash + payments.
10. WhatsApp opens a prefilled Arabic message; double-tap "حفظ الفاتورة" creates one invoice.
