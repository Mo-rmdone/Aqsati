# Notah Phase 1 (Web-First on Expo) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship Notah's core (owner signup, customers, cash/installment sales, payments split across contracts, payment edits, collections home) as an Expo app whose **web build** is deployed and testable from a desktop or phone browser.

**Architecture:** New Expo Router app in `mobile/` (web target only in this phase; the same code becomes the Android/iOS app in Phase 2). It talks directly to the existing Supabase project; all money logic lives in Postgres RPCs (`create_sale`, `record_payment`, `update_payment`), made idempotent on client-generated UUIDs. A TypeScript copy of the schedule formula drives the instant preview and is pinned to the SQL by shared test cases.

**Tech Stack:** Expo (latest SDK at time of `create-expo-app`) + Expo Router + TypeScript, `@supabase/supabase-js`, `@tanstack/react-query`, `jest-expo`; Supabase Postgres 17 + pgTAP; Cloudflare Workers Static Assets for hosting.

**Spec:** `docs/superpowers/specs/2026-10-31-notah-mobile-v1-design.md`

## Global Constraints

- UI is Arabic only, right-to-left; currency EGP, shown with 2 decimals.
- Single user per shop (owner). No roles UI. Do not remove backend role support.
- Interest = flat, once on the whole contract: `financed = price − down`; `total = round(financed × rate, 2) + financed`; installment = `round(total / n, 2)`, **last installment absorbs the residual**.
- Rate is entered as a percent (30 → stored `0.30`). Duration is entered in **years 1–5**; `num_installments = years × 12`.
- First installment is due **one month after the sale date**, then monthly on the same day (month-end clamps: Jan 31 → Feb 28/29).
- No late fees. No customer credit balance. Paying more than a contract's remaining balance is rejected.
- Every write the client sends carries a client-generated UUID; sending it twice must be a no-op that returns the same id.
- Phase 1 web is online-only (no local queue).
- Customer: `name` and `phone` required; phone matches `^01[0125][0-9]{8}$`; `national_id` optional, if present `^[23][0-9]{13}$`; duplicate phone in the same shop = warning, not a block.
- Supabase project ref `vvwhhcndctsumamtqhsz`. Only the public anon key in the client. Existing data is test-only; old `web/` may break and is retired at the end.

## Review Focus

1. **Double submit on a slow phone connection** (tapping "save" twice, or a retried request) — must create exactly one sale/payment. Tests: Task 2 "create_sale is idempotent", Task 3 "record_payment is idempotent".
2. **Sale on the 29th–31st of a month** — first due date must clamp, never skip a month or land in the past. Test: Task 1 "first due clamps to month end"; Task 5 TS mirror of the same case.
3. **Preview disagreeing with the saved schedule** (rounding) — the merchant tells the customer one number and the DB stores another. Test: Task 5 "preview matches SQL cases" uses the identical cases as Task 1.
4. **Editing a payment that touched an installment later paid by another payment** — reversing must not corrupt the other payment's allocations or leave a negative `amount_paid`. Test: Task 4 "edit leaves other payments' allocations intact".
5. **Split amounts that don't add up** (lines sum ≠ total, a zero/negative line, a contract of another customer) — must be rejected with an Arabic message, nothing written. Tests: Task 3 "rejects mismatched/foreign lines"; Task 8 "split validation".

---

## How to run things

- **SQL migrations:** save under `supabase/migrations/NNNN_name.sql`, then apply to the live project with the Supabase MCP `apply_migration` (same SQL). Docker is not available here, so `supabase db reset` is not used.
- **SQL tests:** pgTAP files under `supabase/tests/`. Run each by sending the whole file (it wraps itself in `begin; … rollback;`) through the Supabase MCP `execute_sql`. Expected output: every row `ok N - …`, no `not ok`. Tests that need a logged-in user create one inside the transaction using the helper from Task 1 (`tests.as_new_owner()`), so nothing persists.
- **App tests:** `cd mobile && npx jest` (jest-expo preset).
- **App type-check:** `cd mobile && npx tsc --noEmit`.
- **Run the web app:** `cd mobile && npx expo start --web` (port 8081). UI flows that sign in are verified by the user against the acceptance checklist in Task 10 — the implementer must not sign up or sign in against the live Supabase project.

---

### Task 1: Schema changes for sales, contract numbers, first-due shift, customer rules

**Files:**
- Create: `supabase/migrations/0012_notah_sales_schema.sql`
- Create: `supabase/tests/helpers.sql` (pgTAP helper, loaded at the top of every test file via copy — see Step 1)
- Modify: `supabase/tests/schedule_test.sql` (add date cases)
- Create: `supabase/tests/sales_schema_test.sql`

**Interfaces:**
- Produces:
  - `contract.sale_type text not null default 'installment' check (sale_type in ('installment','cash'))`
  - `contract.contract_no bigint not null`, unique `(tenant_id, contract_no)`, assigned by trigger `fn_contract_no()` (same tenant-row lock pattern as `fn_receipt_no`, `0006_payments.sql:31`); backfill existing rows by `row_number() over (partition by tenant_id order by created_at)`.
  - `contract.external_invoice_no text` (nullable).
  - Check replacing `num_installments >= 1`: `(sale_type='cash' and num_installments=0) or (sale_type='installment' and num_installments in (12,24,36,48,60))`.
  - `build_schedule(...)` unchanged signature; `due_date := (p_start + make_interval(months => i))::date` (was `i - 1`). Postgres month arithmetic already clamps month-end.
  - Customer checks: `phone ~ '^01[0125][0-9]{8}$'`; `national_id is null or national_id ~ '^[23][0-9]{13}$'`. Existing violating test rows: delete them in the migration (data is test-only).
  - `create extension if not exists pgtap with schema extensions;`
  - Test helper `tests.as_new_owner(p_shop text) returns uuid` (schema `tests`, created by this migration, `security definer`, revoked from anon/authenticated): inserts an `auth.users` row, sets `request.jwt.claims` (`sub`, `role=authenticated`) with `set_config(..., true)`, `set local role authenticated` is done by the caller, calls `signup_tenant(p_shop, 'Owner')`, returns the tenant id.

- [ ] **Step 1: Write the failing tests**

`supabase/tests/schedule_test.sql` — keep the 4 amount cases, add:
```sql
select is((select due_date from public.build_schedule(15000,0.30,24,'2026-11-01','flat') where seq_no=1),
          '2026-12-01'::date, 'first installment one month after sale');
select is((select due_date from public.build_schedule(15000,0.30,24,'2026-01-31','flat') where seq_no=1),
          '2026-02-28'::date, 'first due clamps to month end');
select is((select amount_due from public.build_schedule(15000,0.30,24,'2026-11-01','flat') where seq_no=1),
          812.50::numeric, 'spec example: 25k price, 10k down, 30%, 2y -> 812.50');
```
(update `plan(N)` accordingly).

`supabase/tests/sales_schema_test.sql`:
- `contract_no starts at 1 and increments per shop` — two shops via `as_new_owner`, insert 2 contracts in shop A and 1 in B → A gets 1,2; B gets 1.
- `cash contract must have 0 installments` — `throws_ok` inserting `sale_type='cash', num_installments=12`.
- `installment contract months must be 12..60 step 12` — `throws_ok` for 18; `lives_ok` for 24.
- `phone must be Egyptian mobile` — `throws_ok` for `'0123'`, `lives_ok` for `'01012345678'`.
- `national id must be 14 digits starting 2/3` — `throws_ok` for `'123'`.

- [ ] **Step 2: Run the tests to verify they fail**

Run each file through MCP `execute_sql`. Expected: `not ok` on the new cases (due date `2026-11-01`, missing columns/extension errors).

- [ ] **Step 3: Write and apply `0012_notah_sales_schema.sql`**

Contents as listed under Interfaces. Apply with MCP `apply_migration` name `notah_sales_schema`.

- [ ] **Step 4: Run the tests to verify they pass**

Expected: all `ok`.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/0012_notah_sales_schema.sql supabase/tests/
git commit -m "feat(db): sale type, contract numbers, first due one month after sale"
```

---

### Task 2: `create_sale` RPC, payment lines, contract balances, KPI rewrite

**Files:**
- Create: `supabase/migrations/0013_create_sale.sql`
- Create: `supabase/tests/create_sale_test.sql`

**Interfaces:**
- Consumes: Task 1 columns, `build_schedule`, `fn_receipt_no` (payment receipt numbers).
- Produces:
  - Table `payment_line(id uuid pk default gen_random_uuid(), payment_id uuid not null references payment on delete cascade, contract_id uuid not null references contract, tenant_id uuid not null references tenant on delete cascade, amount numeric(14,2) not null check (amount > 0), kind text not null check (kind in ('down_payment','cash','installment')))`, RLS select by tenant like `payment`, no write policy. This is the merchant's per-contract split; `payment_allocation` stays the per-installment detail.
  - `create_sale(p jsonb) returns uuid` — `security definer`, `search_path=''`, owner/manager/accountant only, granted to `authenticated`. Keys: `id` (uuid, required, client-generated), `customer_id`, `product_desc` (required, non-empty), `sale_type`, `total_price` (>0), `sale_date` (date), `external_invoice_no` (nullable), `payment_method` (one of the `payment.method` values, default `'cash'`); installment only: `down_payment` (0 ≤ down < total), `rate_percent` (0–200), `years` (1–5).
    - If a contract with `id` already exists for the caller's tenant → return `id` without writing (idempotent).
    - Verifies `customer_id` belongs to the caller's tenant.
    - Installment: inserts contract (`interest_rate = rate_percent/100`, `num_installments = years*12`, `start_date = sale_date`, `interest_method='flat'`), installments from `build_schedule(total − down, rate, n, sale_date)`, and if `down > 0` a `payment` (amount = down) + `payment_line(kind='down_payment')`.
    - Cash: contract with `num_installments=0, down_payment=total_price, interest_rate=0, interest_method='zero'`, a `payment` (amount = total) + `payment_line(kind='cash')`.
    - Errors are raised with Arabic messages (e.g. `'المقدم لازم يكون أقل من السعر'`).
  - View `v_contract_balance` (`security_invoker=true`): `contract_id, tenant_id, customer_id, contract_no, product_desc, sale_type, total_payable, paid, remaining, next_due_date` where `total_payable` = cash: `total_price`; installment: `down_payment + sum(installment.amount_due)`; `paid = coalesce(sum(payment_line.amount),0)`; `remaining = total_payable − paid`.
  - `v_collections_kpi.collected_this_month` redefined as `sum(payment.amount)` for payments with `received_at` in the current month (expected_this_week / overdue_total unchanged). Keep column names.
  - Drop `create_contract(jsonb)` (replaced).

- [ ] **Step 1: Write the failing tests** (`create_sale_test.sql`, all inside one `as_new_owner` shop)
  - `installment sale writes 24 installments of 812.50 and a 10000 down payment` — price 25000, down 10000, 30%, 2 years → `count(installment)=24`, `sum(amount_due)=19500.00`, one payment of 10000 with a `down_payment` line.
  - `cash sale writes no installments and one full payment` — price 7000 cash → 0 installments, payment 7000, line kind `cash`, `v_contract_balance.remaining = 0`.
  - `create_sale is idempotent` — call twice with the same `id` → 1 contract, 1 payment.
  - `rejects down payment >= price` and `rejects years outside 1..5` — `throws_ok`.
  - `rejects a customer from another shop` — second shop's customer id → `throws_ok`.
  - `balance view: remaining = 19500 right after the installment sale` (25000 − 10000 + 4500).
  - `collected_this_month includes down payments and cash sales` = 17000 after both sales above.

- [ ] **Step 2: Run to verify they fail** — expected: `function public.create_sale(jsonb) does not exist`.

- [ ] **Step 3: Write and apply `0013_create_sale.sql`** (MCP `apply_migration` name `create_sale`).

- [ ] **Step 4: Run to verify they pass** — all `ok`. Re-run `schedule_test.sql` and `sales_schema_test.sql` too.

- [ ] **Step 5: Commit** — `git commit -m "feat(db): create_sale RPC with down payment, cash sales, balances"`

---

### Task 3: `record_payment` split across contracts

**Files:**
- Create: `supabase/migrations/0014_record_payment_lines.sql`
- Create: `supabase/tests/record_payment_test.sql`

**Interfaces:**
- Consumes: `payment_line`, `allocate_payment(p_payment uuid, p_contract uuid, p_amount numeric)` (`0007_credit_invoices.sql:72`).
- Produces: `record_payment(p_id uuid, p_customer uuid, p_method text, p_lines jsonb) returns uuid` — `p_lines` = `[{"contract_id": uuid, "amount": number}, …]`. Drop the old 5-arg `record_payment`. Same grants pattern as the old one (authenticated only).
  - If a payment with `p_id` exists for the tenant → return it, write nothing.
  - Rejects (Arabic message, nothing written): empty lines; any `amount <= 0`; duplicate `contract_id` in lines; contract not in caller's tenant or not belonging to `p_customer`; cash contract; any line amount > that contract's unpaid installment balance `sum(amount_due − amount_paid)`.
  - Inserts `payment(id=p_id, amount = sum(lines), contract_id = null when >1 line else that contract)`, one `payment_line(kind='installment')` per line, then `allocate_payment(p_id, contract, amount)` per line.

- [ ] **Step 1: Write the failing tests**
  - `one payment split 1000/1000 across fridge and washer contracts` → each contract's `paid` rises by 1000 in `v_contract_balance`; one receipt number.
  - `allocation goes to oldest due installment first` — pay 1000 on a 812.50/month contract → inst #1 `paid`, inst #2 `partial` with 187.50.
  - `rejects paying more than the remaining balance` — `throws_ok`; contract unchanged.
  - `rejects mismatched/foreign lines` — zero amount, other customer's contract, other shop's contract, duplicate contract → each `throws_ok`.
  - `record_payment is idempotent` — same `p_id` twice → 1 payment, balances moved once.

- [ ] **Step 2: Run to verify they fail.**
- [ ] **Step 3: Write and apply `0014_record_payment_lines.sql`.**
- [ ] **Step 4: Run all SQL test files; all `ok`.**
- [ ] **Step 5: Commit** — `git commit -m "feat(db): record_payment splits one receipt across contracts, rejects overpayment"`

---

### Task 4: `update_payment` (edit, never delete)

**Files:**
- Create: `supabase/migrations/0015_update_payment.sql`
- Create: `supabase/tests/update_payment_test.sql`

**Interfaces:**
- Consumes: Task 3 tables/functions.
- Produces:
  - `payment.edited_at timestamptz` (null until edited).
  - `installment_status(p_due numeric, p_paid numeric, p_due_date date) returns text` (`stable`, since it reads `current_date`): `paid` if `p_paid >= p_due`; else `overdue` if `p_due_date < current_date`; else `partial` if `p_paid > 0`; else `pending`.
  - `update_payment(p_id uuid, p_method text, p_lines jsonb) returns uuid` — same validation as `record_payment` (lines must belong to the payment's customer). Rejects payments that have a `down_payment` or `cash` line (`'المقدم والبيع الكاش جزء من الفاتورة ومش بيتعدلوا من هنا'`). In one transaction: lock the payment; for each of its `payment_allocation` rows subtract the amount from the installment and recompute status with `installment_status`; delete its allocations and lines; then validate the new lines against the now-restored balances; insert new lines; `allocate_payment` per line; set `amount`, `method`, `contract_id` rule as in Task 3, `edited_at = now()`; insert one `audit_log` row (`action='payment_edit'`, `entity_type='payment'`, `before_json` = old `{amount, method, lines}`, `after_json` = new).

- [ ] **Step 1: Write the failing tests**
  - `edit 5000 -> 500 restores installments and re-allocates` — after edit, balances equal a fresh 500 payment.
  - `edit leaves other payments' allocations intact` — payment A 1000, payment B 1000 on the same contract; edit A to 200 → B's allocation rows unchanged, no installment `amount_paid < 0`, sum of allocations = 1200.
  - `edit can move money to another contract` — 1000 on fridge → 1000 on washer.
  - `edit rejects overpayment` — and the payment stays as before (transaction rolled back).
  - `edit writes an audit row with before/after` and sets `edited_at`.
  - `down payment cannot be edited` — `throws_ok`.

- [ ] **Step 2: Run to verify they fail.**
- [ ] **Step 3: Write and apply `0015_update_payment.sql`.**
- [ ] **Step 4: Run all SQL test files; all `ok`.** Then run Supabase MCP `get_advisors` (security): no new `ERROR`; new functions revoke anon.
- [ ] **Step 5: Commit** — `git commit -m "feat(db): update_payment re-allocates and audits payment edits"`

---

### Task 5: Expo app scaffold, RTL, Supabase client, money + validation libraries

**Files:**
- Create: `mobile/` via `npx create-expo-app@latest mobile --template default` (Expo Router + TS), then remove the template's demo screens/components.
- Create: `mobile/app/+html.tsx` — `<html lang="ar" dir="rtl">`.
- Create: `mobile/src/lib/supabase.ts`, `mobile/src/lib/ids.ts`, `mobile/src/lib/money.ts`, `mobile/src/lib/validation.ts`, `mobile/src/lib/whatsapp.ts`
- Create: `mobile/src/lib/database.types.ts` (generate via Supabase MCP `generate_typescript_types` after Task 4)
- Create: `mobile/src/lib/__tests__/money.test.ts`, `mobile/src/lib/__tests__/validation.test.ts`, `mobile/src/lib/__tests__/whatsapp.test.ts`
- Create: `mobile/.env.example` (`EXPO_PUBLIC_SUPABASE_URL=`, `EXPO_PUBLIC_SUPABASE_ANON_KEY=`); real values in `mobile/.env.local` copied from `web/.env.local` (gitignored — verify).
- Modify: root `.gitignore` if `mobile/.env.local` is not already covered.

**Interfaces:**
- Produces:
  - `supabase: SupabaseClient<Database>` from `src/lib/supabase.ts` (session persisted in `localStorage` on web, `@react-native-async-storage/async-storage` on native; `detectSessionInUrl: false`).
  - `newId(): string` — `expo-crypto` `randomUUID()`.
  - `previewInstallments(input: { price: number; down: number; ratePercent: number; years: number; saleDate: string /* YYYY-MM-DD */ }): { financed: number; total: number; monthly: number; last: number; count: number; firstDue: string; schedule: { seq: number; dueDate: string; amount: number }[] }` — mirrors `build_schedule`; work in integer piasters to avoid float drift; month add clamps to month end.
  - `splitTotal(total: number, n: number): number[]` — `n` amounts of `round(total/n, 2)`, last one absorbs the residual (the core of `previewInstallments`, exported for the SQL case B test).
  - `formatEGP(n: number): string` — `"812.50 ج.م"` style, Latin digits, 2 decimals, thousands separator.
  - `validateCustomer(c: { name: string; phone: string; nationalId?: string }): Partial<Record<'name'|'phone'|'nationalId', string>>` — Arabic messages; same regexes as Global Constraints.
  - `validateSale(...)` — same rules as `create_sale` (Task 2), Arabic messages.
  - `whatsappLink(phone: string, msg: string): string` and `reminderMessage(p: { customer: string; amount: number; dueDate: string; merchant: string }): string` — port from `web/src/lib/whatsapp.ts`.

- [ ] **Step 1: Scaffold** the app, add deps: `@supabase/supabase-js @tanstack/react-query expo-crypto @react-native-async-storage/async-storage`, dev `jest-expo jest @types/jest`; set `"jest": {"preset": "jest-expo"}`. Run `npx expo start --web` once: the blank app renders RTL at `http://localhost:8081`.

- [ ] **Step 2: Write the failing tests**

`money.test.ts` — the **same cases as the SQL tests** (Task 1 + `schedule_test.sql`):
```ts
test('preview matches SQL cases', () => {
  expect(previewInstallments({ price: 25000, down: 10000, ratePercent: 30, years: 2, saleDate: '2026-11-01' }))
    .toMatchObject({ financed: 15000, total: 19500, monthly: 812.5, last: 812.5, count: 24, firstDue: '2026-12-01' });
  // SQL case B: 10000 @10% over 3 months -> 3666.67 x2 + 3666.66; expressed through the years API is impossible,
  // so also unit-test the internal splitTotal(11000, 3) -> [3666.67, 3666.67, 3666.66]
});
test('first due clamps to month end', () => {
  expect(previewInstallments({ price: 16000, down: 1000, ratePercent: 30, years: 2, saleDate: '2026-01-31' }).firstDue)
    .toBe('2026-02-28');
});
test('schedule sums exactly to total', () => { /* sum(schedule.amount) === total for 3 odd totals */ });
```
`validation.test.ts`: `'01012345678'` ok; `'0123'`, `'02012345678'` rejected; national id `'29001011234567'` ok, `'123'` rejected; empty name rejected; down ≥ price rejected; years 6 rejected.
`whatsapp.test.ts`: `whatsappLink('01012345678', 'x')` → `https://wa.me/201012345678?text=x`.

- [ ] **Step 3: Run `npx jest` — fails** (modules missing).
- [ ] **Step 4: Implement** the five lib files.
- [ ] **Step 5: Run `npx jest` and `npx tsc --noEmit` — pass.**
- [ ] **Step 6: Commit** — `git commit -m "feat(mobile): Expo app scaffold, RTL, Supabase client, money/validation libs"`

---

### Task 6: Auth (signup creates the shop, login, sign out) and app shell

**Files:**
- Create: `mobile/src/lib/auth.tsx`
- Create: `mobile/app/_layout.tsx` (QueryClientProvider + AuthProvider + redirect gate)
- Create: `mobile/app/(auth)/login.tsx`, `mobile/app/(auth)/signup.tsx`
- Create: `mobile/app/(app)/_layout.tsx` — bottom tabs: الرئيسية (`index`), العملاء (`customers`), + فاتورة (`sale/new`), الإعدادات (`settings`)
- Create: `mobile/app/(app)/settings.tsx` (shop name, sign out)
- Create: `mobile/src/ui/` — `Screen`, `Field` (label + error text), `Button` (with `loading`), `Money` (uses `formatEGP`), `StatusChip`, `theme.ts` (colors/spacing tokens; neutral palette — identity comes later)

**Interfaces:**
- Consumes: `supabase`.
- Produces: `useAuth(): { session: Session | null; profile: Profile | null; shopName: string | null; loading: boolean; refreshProfile(): Promise<void>; signOut(): Promise<void> }`. **`refreshProfile` reads `supabase.auth.getSession()` live** — never a captured `session` (this exact stale-closure bug left every new owner stuck on loading in the old web; see commit `28b62e9`).
- Signup screen: shop name, owner name, email, password → `auth.signUp` → if session, `rpc('signup_tenant')` → `refreshProfile()` → `/`; if no session (email confirmation on), stash `{tenantName, fullName}` and provision on first login exactly like `web/src/lib/auth-context.tsx:84-114`.
- Redirect gate: no session → `(auth)/login`; session + profile → `(app)`; session without profile after load → a screen with "إعادة المحاولة" calling `refreshProfile` (never an infinite spinner).

- [ ] **Step 1: Write the failing test** `mobile/src/lib/__tests__/auth.test.tsx`: mock `supabase` so `getSession` returns a session only after `signUp`; render `AuthProvider`, call `refreshProfile()` from a component whose render captured `session === null` → expect the profile query to run with the live user id. (`@testing-library/react-native` dev dep.)
- [ ] **Step 2: Run `npx jest auth` — fails.**
- [ ] **Step 3: Implement** auth provider, layouts, login/signup/settings, UI kit.
- [ ] **Step 4: `npx jest` + `npx tsc --noEmit` pass; `npx expo start --web` shows the login screen RTL with no console errors** (check with the browser pane: navigate to `http://localhost:8081`, `read_console_messages` errors only → none). Do not submit the forms.
- [ ] **Step 5: Commit** — `git commit -m "feat(mobile): auth, signup provisions the shop, tab shell"`

---

### Task 7: Customers — list/search, add, customer file

**Files:**
- Create: `mobile/src/api/customers.ts`, `mobile/src/api/contracts.ts`
- Create: `mobile/app/(app)/customers/index.tsx`, `mobile/app/(app)/customers/new.tsx`, `mobile/app/(app)/customers/[id].tsx`

**Interfaces:**
- Consumes: `supabase`, `newId`, `validateCustomer`, UI kit.
- Produces:
  - `useCustomers(search: string)` — name `ilike` or phone prefix; escape `%`, `_`, `,`, `(`, `)` in the term (the old web had a PostgREST filter-injection bug here, fixed in `f356a49` — port that escaping).
  - `useCreateCustomer()` — `insert` with client `id` via `upsert(..., { onConflict: 'id', ignoreDuplicates: true })`; returns the id.
  - `findCustomerByPhone(phone: string): Promise<{id: string; name: string} | null>` — for the duplicate warning.
  - `useCustomerContracts(customerId)` — from `v_contract_balance`, newest first.
  - `useCustomer(id)`.
- Screens: list with search box + "عميل جديد"; new-customer form (name, phone, national id, address) with inline Arabic errors, and on a phone match a non-blocking banner "العميل ده موجود بالفعل: {name}" linking to the file + "حفظ برضه"; customer file: details, each contract card (رقم العقد, السلعة, كاش/قسط, المدفوع, الباقي, الحالة), buttons "فاتورة جديدة" (→ `sale/new?customerId=`) and "تسجيل دفعة" (→ `payment/new?customerId=`, hidden when nothing remains).

- [ ] **Step 1: Write the failing test** `mobile/src/api/__tests__/customers.test.ts`: `escapeSearch('a,b(%_)')` returns the term with those characters escaped/neutralised; `useCreateCustomer` called twice with the same id issues an upsert with `ignoreDuplicates: true` both times (mock client).
- [ ] **Step 2: Run — fails.** **Step 3: Implement.** **Step 4: `npx jest`, `npx tsc --noEmit` pass; web renders the three screens without console errors (unauthenticated render of the screens behind a mocked session is acceptable).**
- [ ] **Step 5: Commit** — `git commit -m "feat(mobile): customers list, add with duplicate-phone warning, customer file"`

---

### Task 8: New sale (cash / installment with live preview)

**Files:**
- Create: `mobile/src/api/sales.ts`
- Create: `mobile/app/(app)/sale/new.tsx`

**Interfaces:**
- Consumes: `previewInstallments`, `validateSale`, `newId`, `useCustomers`, `create_sale` RPC (Task 2).
- Produces: `useCreateSale()` — the `id` is generated **once when the form mounts** (kept in state), so a double tap or retry re-sends the same id. On success → `contract/[id]`.
- Screen order: customer (preselected from `customerId` param, else searchable picker) → اسم السلعة → السعر → toggle **كاش / تقسيط** → (installment) المقدم, نسبة الفايدة %, المدة (chips 1–5 سنين) → preview card: الباقي, الإجمالي بعد الفايدة, القسط الشهري, عدد الأقساط, أول قسط (date) — updates on every keystroke → رقم الفاتورة الخارجي (اختياري) → طريقة الدفع (for the down payment / cash) → "حفظ الفاتورة" (disabled while saving).

- [ ] **Step 1: Write the failing test** `mobile/src/api/__tests__/sales.test.ts`: the payload builder `toCreateSalePayload(form, id)` maps `{ratePercent: 30, years: 2}` → `{rate_percent: 30, years: 2, sale_type: 'installment', id}` and cash forms omit installment keys; and **split validation**: `validateSale` rejects down ≥ price with the Arabic message.
- [ ] **Step 2: Run — fails. Step 3: Implement. Step 4: tests + tsc pass; web screen renders; preview shows 812.50 / 24 / 2026-12-01 for 25000/10000/30%/2y on 2026-11-01 (set the date field) — verify in the browser pane without saving.**
- [ ] **Step 5: Commit** — `git commit -m "feat(mobile): new sale screen with cash/installment and live preview"`

---

### Task 9: Contract detail, record payment (split), edit payment

**Files:**
- Create: `mobile/src/api/payments.ts`
- Create: `mobile/app/(app)/contract/[id].tsx`, `mobile/app/(app)/payment/new.tsx`, `mobile/app/(app)/payment/[id]/edit.tsx`
- Create: `mobile/src/lib/split.ts` + `mobile/src/lib/__tests__/split.test.ts`

**Interfaces:**
- Consumes: `record_payment`, `update_payment` RPCs; `v_contract_balance`; `newId`.
- Produces:
  - `validateSplit(total: number, lines: { contractId: string; amount: number; remaining: number }[]): string | null` — Arabic error or null: lines (non-zero) must sum to `total`; each `0 < amount ≤ remaining`; at least one line.
  - `autoSplit(total, contracts)` — one open contract → all to it; otherwise empty lines for the merchant to fill.
  - `useRecordPayment()` (id fixed at mount, like sales), `useUpdatePayment()`, `useContract(id)` (contract + installments + its payments with `edited_at`).
- Contract screen: header (رقم العقد, السلعة, رقم الفاتورة الخارجي), balance, installment table (رقم، الميعاد، المستحق، المدفوع، الحالة), payments list (إيصال رقم، المبلغ، التاريخ، "اتعدّلت" badge when `edited_at`), each installment payment has "تعديل".
- Payment screen: المبلغ الكلي + طريقة الدفع + one row per open contract (السلعة، الباقي، input) + live sum indicator; save disabled until `validateSplit` passes. Edit screen = same form prefilled; down-payment/cash payments show no edit button.

- [ ] **Step 1: Write the failing tests** `split.test.ts`: sum mismatch rejected; line > remaining rejected; zero-only lines rejected; single open contract auto-fills the total; valid 1000/1000 of 2000 returns null.
- [ ] **Step 2: Run — fails. Step 3: Implement. Step 4: tests + tsc pass; screens render in web without console errors.**
- [ ] **Step 5: Commit** — `git commit -m "feat(mobile): contract detail, split payments, payment edit"`

---

### Task 10: Collections home, web deploy, acceptance

**Files:**
- Create: `mobile/src/api/dashboard.ts`, `mobile/app/(app)/index.tsx`
- Create: `mobile/wrangler.toml` (name `notah`, `compatibility_date` = today, `[assets] directory = "./dist"`, `not_found_handling = "single-page-application"`)
- Modify: `mobile/package.json` — script `"build:web": "expo export -p web"`
- Create: `docs/superpowers/plans/notah-phase1-acceptance.md` (the checklist below)

**Interfaces:**
- Consumes: `v_collections_kpi`, `v_worklist`, `whatsappLink`, `reminderMessage`, `useAuth().shopName`.
- Home: three tiles (مستحق الأسبوع ده, المحصّل الشهر ده, إجمالي المتأخرات) and the "مين لازم أكلمه النهارده" list (overdue first by days late, then due soonest): name, amount, due date/late days, buttons واتساب and تسجيل دفعة (→ `payment/new?customerId=`). Empty state when no rows.

- [ ] **Step 1: Write the failing test** `mobile/src/api/__tests__/dashboard.test.ts`: `sortWorklist(rows)` puts overdue (largest `days_late`) first, then by `due_date`; nulls last.
- [ ] **Step 2: Run — fails. Step 3: Implement home. Step 4: `npx jest`, `npx tsc --noEmit` pass.**
- [ ] **Step 5: Build and deploy the web app**
  Run: `cd mobile && npm run build:web && npx wrangler deploy`
  Expected: `Deployed notah` with URL `https://notah.<account>.workers.dev`. `curl` it → 200, page title present; browser pane shows the RTL login screen, no console errors.
- [ ] **Step 6: Hand the acceptance checklist to the user** (they sign up and run it on their phone browser; the implementer does not):
  1. Sign up → lands on home, no endless loading.
  2. Add customer; wrong phone shows an Arabic error; same phone again shows the duplicate warning.
  3. Installment sale 25,000 / 10,000 / 30% / 2 years → preview 812.50 × 24, first due one month later; saved contract matches.
  4. Cash sale 7,000 → contract shows paid, remaining 0.
  5. Second installment contract for the same customer; record 2,000 split 1,000/1,000; both balances drop by 1,000; one receipt.
  6. Try to pay more than remaining → blocked with a message.
  7. Edit the 2,000 payment to 500 on one contract → balances recalculated; "اتعدّلت" shown.
  8. Home tiles: collected this month includes down payment + cash + payments.
  9. WhatsApp button opens a prefilled Arabic message.
  10. Double-tap "حفظ" on a sale → only one contract created.
- [ ] **Step 7: Commit** — `git add mobile docs && git commit -m "feat(mobile): collections home and web deploy"`; push to `main` only after the user approves.

---

## Out of this plan (later phases, per spec)

Phase 2 native builds + offline queue (spec 7.3), voice commands, Excel import, ID-card OCR, identity/landing page, retiring the old `aqsati` web worker (after the user confirms Notah web works).
