# Notah v2 — Plan 3 of 5: Correcting and cancelling invoices, refunds — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the owner correct an invoice (تصحيح فاتورة) or cancel it (إلغاء فاتورة) safely. Any money returned to the customer is recorded as a refund. "المحصّل" becomes payments − refunds. Each invoice shows a readable سجل التعديلات.

**Architecture:**
- A new `refund` table, written only by RPCs.
- Two new owner-only security-definer RPCs:
  - `cancel_contract` sets `status = 'void'` and records the optional refund.
  - `correct_contract` rebuilds the schedule with the existing `build_schedule`, re-allocates the contract's existing installment payments oldest-first, and turns any excess into a refund.
- Views are updated so a void invoice drops out of balances, the worklist, aging and KPIs, but is still listed as "ملغية".
- A `v_contract_history` view gives the client the audit rows for one invoice in a form it can render.

**Tech Stack:** Expo SDK 58 + Expo Router (web), React Native Web, TanStack Query 5, Supabase Postgres (RLS, security-definer RPCs, pgTAP via MCP `execute_sql` in `begin … rollback`), Jest + Testing Library.

**Spec:** `docs/superpowers/specs/2026-11-01-notah-screens-requirements.md`:
- §3.4 (filter "ملغية")
- §3.5 (correct/cancel on invoice detail)
- §6 (transaction rules)
- §7 (owner's refund decisions; "Refund record", "Correction keeps history", "Cancelled invoices", "Audit visibility")

Visual reference: the approved Hi-Fi, https://claude.ai/artifact/NCwdZo9cBsHYLyQJu2FkoV (invoice detail frame).

## Global Constraints

- **UI rules from plans 1, 2 and 4 still apply:**
  - Theme tokens only. RTL.
  - Tap targets ≥ 48; inputs 56; text ≥ 16 on phone.
  - Money via `formatEGP` / `<Money>`.
  - Statuses are icon + word + color through `<StatusChip>`.
  - Overdue is terracotta. **Red is used only for errors and destructive actions** (the cancel confirm button is destructive, so it is red).
  - Egyptian Arabic copy, never "من فضلك" or "تم بنجاح".
  - Desktop breakpoint `useIsDesktop` at ≥ 1024. Cairo day via `todayISO()` on the client and `(now() at time zone 'Africa/Cairo')::date` in SQL.
- **Never break (NOTAH.md §3.5):**
  - No wrong installment.
  - No payment saved twice and no payment lost.
  - Payments are never deleted, and `received_at` never changes.
  - A shop never sees another shop's data.
- **Refunds:** a refund is always a `refund` row, never a negative payment. "المحصّل" = non-opening payments − refunds, each counted on its own date. Past months never change.
- **Security of the new functions:**
  - New money functions are `security definer`, `set search_path = ''`, revoked from `public`/`anon`, granted to `authenticated`.
  - **Owner only:** they raise `42501` unless `public.current_role() = 'owner'`.
  - Every id they receive must belong to `current_tenant_id()`.
  - Idempotent on a client `p_id` (advisory lock + exists check, as `record_payment` does).
- **SQL testing:** pgTAP runs only in `begin … rollback` with `tests.as_new_owner`. Never write data to the live project that isn't rolled back. Schema migrations go through MCP `apply_migration`.
- No tests under `mobile/src/app/`.
- **Commits** end with a blank line + `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Decisions this plan makes (spec §7 leaves them to the build)

1. **What can be corrected:**
   - **Installment invoice, `interest_method <> 'imported'`:** product, external invoice no, price, down payment, rate, years, sale date.
   - **Cash invoice:** product, external invoice no, price, sale date.
   - **Imported invoice:** product and external invoice no only. Its schedule came from the paper ledger.
2. **Corrections fix typos, not returns:**
   - When the down payment changes, the down-payment payment changes with it (both `payment.amount` and its `payment_line`). This is the spec's rule.
   - When a cash invoice's price changes, its cash payment changes to the new price.
   - A real return of goods is a cancel, not a correction.
   - **Refund on correction:** when the installment payments received for the invoice exceed the new installment total, the extra is a refund. The invoice then becomes fully paid. The refund method is required in that case.
3. **A down-payment or cash payment that also carries lines for other invoices** (not possible through `create_sale` today) makes the correction fail with `22023`. The app says "الفاتورة دي مرتبطة بدفعة فيها فواتير تانية، عدّل الدفعة الأول".
4. **Cancel:**
   - The dialog shows the total paid (every `payment_line` of the invoice, opening balance included). The owner enters the refund (0 up to paid; default = paid) and its method.
   - Payments and their allocations stay as history.
   - A void invoice can't receive new payments. Existing payments can't be moved onto it or edited on it: `record_payment` and `update_payment` reject a void contract with `22023`.
   - A void invoice can't be corrected or cancelled again (`22023`).
5. **Views:**
   - `v_contract_balance` keeps void rows and gains a `status` column. Consumers filter.
   - `v_worklist`, `v_aging`, `v_installment_aging`, `v_collections_kpi` and `v_followup` exclude void.
   - `v_invoice_list` now includes void rows with `status = 'cancelled'`.
   - `v_customer_summary` keeps excluding void, so a customer whose only invoice is cancelled leaves the lists. Their file still opens from search or the invoices list.
   - `v_recent_activity` adds refund rows: `kind = 'refund'`, positive amount, shown with a minus sign.
6. **KPI dates** use the Cairo calendar (they currently use `CURRENT_DATE` / `now()` in UTC). This is fixed in the same view rewrite.

## Review Focus

1. **Correct a contract that has 3 paid installments, raising the price:**
   - The same payments are re-allocated oldest-first over the new schedule.
   - `sum(amount_paid)` is unchanged.
   - No payment rows are added or removed, and every `received_at` is unchanged.

   Covered by the Task 2 SQL test.
2. **Correct a contract down so that paid installments exceed the new total:**
   - The installments are fully paid.
   - A refund row holds the exact excess.
   - The KPI "collected this month" drops by that refund in the current Cairo month only.

   Covered by the Task 2 SQL test.
3. **Cancel with a partial refund:**
   - Status is void and the refund row is written.
   - The invoice is gone from the worklist, KPI expected/overdue, v_customer_summary and v_followup.
   - It is still in v_invoice_list as `cancelled`.
   - `record_payment` onto it fails.

   Covered by the Task 1 SQL test.
4. **Double submit of cancel/correct with the same `p_id`:** one refund, one audit row, the same result. Covered by the Task 1 and Task 2 SQL tests.
5. **A second shop, or a non-owner role, calling either RPC:** rejected and nothing changed. Covered by the Task 1 and Task 2 SQL tests.

---

### Task 1: Database — refunds, cancel, void-aware views and guards

**Files:**
- Create: `supabase/migrations/0029_refund_cancel.sql`
- Create: `supabase/tests/refund_cancel_test.sql`
- Modify: `mobile/src/lib/database.types.ts` (add the new table, columns, function and view columns from `generate_typescript_types`)

**Interfaces — Produces:**

**`refund` table**
- **Columns:**
  - `id uuid pk default gen_random_uuid()`
  - `tenant_id uuid not null` (FK tenant)
  - `contract_id uuid not null` (FK contract)
  - `customer_id uuid not null`
  - `amount numeric(12,2) not null check (amount > 0)`
  - `method text not null`, using the same check set as `payment.method`
  - `refunded_at timestamptz not null default now()`
  - `reason text not null check (reason in ('cancel','correction'))`
  - `note text` (≤ 200)
  - `op_id uuid not null unique`: the RPC's client `p_id`
  - `created_by uuid not null default auth.uid()`
- **Access:**
  - RLS on, with a `select` policy by `tenant_id = current_tenant_id()`.
  - No insert/update/delete policies.
  - `revoke all … from anon`.
  - Index on `(tenant_id, refunded_at)`.

**`contract` new columns**
- `cancelled_at timestamptz`
- `cancel_reason text` (≤ 200)

**`cancel_contract(p_id uuid, p_contract uuid, p_refund numeric, p_method text, p_reason text) returns uuid`** (returns `p_contract`)
- Owner only.
- Errors:
  - Contract not in the caller's shop → `42501`.
  - Already void → `22023`.
  - `p_refund < 0` or greater than the paid total → `22023`.
  - `p_refund > 0` with an invalid method → `22023`.
- Sets `status = 'void'`, `cancelled_at = now()` and `cancel_reason` (trimmed; empty → null).
- When `p_refund > 0`, inserts a `refund` with `reason 'cancel'`.
- Writes `audit_log` with action `'contract_cancel'`, `entity_type 'contract'`, and `after_json` holding `{refund, method, reason}`.
- **Idempotent:** if a refund or audit row with this `op_id` already exists, return without doing anything. Track the op in `audit_log.after_json->>'op_id'` when there is no refund.

**Void guards**
- `record_payment` and `update_payment_apply` raise `22023` when any line targets a contract with `status = 'void'`.
- Re-create both with their current bodies plus this check. Read the latest definitions from the live DB (`pg_get_functiondef`), not from an older migration.

**Views**
- **`v_contract_balance`:** add a `status` column and keep void rows.
- **`v_worklist`, `v_aging`, `v_installment_aging`, `v_followup`:** add `c.status <> 'void'`.
- **`v_invoice_list`:**
  - Include void rows with `status = 'cancelled'`.
  - Add a `cancelled_at` column.
  - For void rows, `remaining` and `overdue_count` are 0 and `next_due_date` is null.
- **`v_collections_kpi`** (same columns, so the client is unchanged):
  - `expected_this_week` = unpaid remainder due from the Cairo today to today + 7, on non-void contracts.
  - `overdue_total` = unpaid remainder of past-due (`due_date < Cairo today`) installments on non-void contracts.
  - `collected_this_month` = non-opening payments with `received_at` in the Cairo month, minus refunds with `refunded_at` in the Cairo month.
- **`v_recent_activity`:** union refund rows with `kind 'refund'`, `at = refunded_at`, and a positive amount.
- Every changed view keeps `security_invoker = true` and `revoke select … from anon`.
- Use `create or replace view` where the columns only grow; otherwise drop and recreate in dependency order, re-granting.

- [ ] **Step 1: Write the failing pgTAP test.** Copy the style of `supabase/tests/shop_settings_test.sql`. Assertions:
  - The owner cancels with refund 300 of 1000 paid:
    - status is `void`
    - one refund of 300 with `reason 'cancel'`
    - an audit row exists
  - Same `p_id` again: still one refund.
  - Refund 1001 → `22023`.
  - Negative refund → `22023`.
  - Cancelling again with a new id → `22023`.
  - A second shop cancelling it → `42501`, row unchanged.
  - A `viewer` role → `42501`.
  - `record_payment` to the void contract → `22023`.
  - `update_payment` moving a line onto it → `22023`.
  - `v_invoice_list` shows it as `cancelled`.
  - `v_customer_summary`, `v_worklist` and `v_followup` don't include it.
  - KPI `collected_this_month` = payments − 300 (both today).
  - A refund dated last month (inserted as postgres inside the test) doesn't change this month.
  - `anon` has no execute privilege (`has_function_privilege`).
- [ ] **Step 2:** Run it through MCP `execute_sql` inside `begin … rollback`. Expected: it fails.
- [ ] **Step 3:** Write the migration and apply it with `apply_migration`.
- [ ] **Step 4:** The test passes. Run the existing `supabase/tests/*` files touching the changed views and RPCs (`v2_lists_test.sql`, `v2_list_fixes_test.sql`, `update_payment_test.sql`, the follow-up tests); they still pass. `get_advisors` (security) shows no new warnings.
- [ ] **Step 5:** Update `database.types.ts`. `npx tsc --noEmit` is green.
- [ ] **Step 6: Commit** `feat(db): refunds, cancel_contract, void-aware views and payment guards`.

### Task 2: Database — correct_contract and the invoice history view

**Files:**
- Create: `supabase/migrations/0030_correct_contract.sql`
- Create: `supabase/tests/correct_contract_test.sql`
- Modify: `mobile/src/lib/database.types.ts`

**Interfaces — Produces:**

**`correct_contract(p_id uuid, p_contract uuid, p jsonb, p_refund_method text) returns jsonb`**

Input:
- `p` keys: `product_desc`, `external_invoice_no`, `price`, `down_payment`, `rate`, `years`, `sale_date`.
- A key that is missing means "unchanged".
- The keys allowed depend on the contract kind (see Decisions §1). Any other key → `22023`.

Steps:
1. **Checks:**
   - Owner only. Contract in the caller's shop (`42501`). Not void (`22023`).
   - Validate the same way `create_sale` does: price > 0, 0 ≤ down < price, rate 0–200, years 1–5, sale date ≤ Cairo today.
2. **Unchanged input:** if nothing changes, return without writing.
3. **Installment, non-imported, with any money/date field changed:**
   - Lock the contract row and the advisory lock on `p_id`.
   - Delete the contract's `payment_allocation` rows for installment lines, then its `installment` rows.
   - Update the contract fields (`total_price`, `down_payment`, `interest_rate`, `num_installments = years × 12`, `start_date`).
   - Rebuild the schedule with `build_schedule`, using the same call `create_sale` uses (read it).
   - Update the down-payment payment: its `payment_line.amount` and `payment.amount`. If down becomes 0, delete that line and payment only if it is the payment's single line and no other allocation uses it, otherwise `22023`. If down goes from 0 to > 0, insert a down-payment payment dated the sale date.
   - Re-allocate every installment `payment_line` of this contract, ordered by `payment.received_at, payment.id`, using `allocate_payment(p_payment, p_contract, amount)`. Cap each allocation at the contract's remaining balance.
   - The un-allocatable total becomes one `refund` with `reason 'correction'` and `method = p_refund_method`. A missing or invalid method when there is excess → `22023`.
4. **Cash:** update `total_price` and the cash payment's line and amount to the new price. The same "single line" rule applies.
5. **Audit:** write `audit_log` with action `'contract_correct'`, `entity_type 'contract'`, `before_json` / `after_json` = the user-facing fields (`product_desc`, `external_invoice_no`, `price`, `down_payment`, `rate`, `years`, `sale_date`), and `after_json.op_id = p_id`. The existing row triggers on `installment` and `contract` may also log; that's fine.
6. **Returns:** `{ "refund": <amount or 0>, "total": <new total payable> }`.
7. **Idempotent:** an audit row with this `op_id` already exists → return the stored result.

Read the real current `create_sale`, `build_schedule` and `allocate_payment` bodies from the live DB first. Reuse them; don't re-implement the money math.

**`v_contract_history`** (`security_invoker`, anon revoked)
- Columns: `contract_id`, `at`, `action`, `before_json`, `after_json`.
- Rows:
  - `audit_log` rows with `entity_type = 'contract'` and action in (`contract_correct`, `contract_cancel`).
  - `payment_edit` rows for payments that have (or had, per `before_json`) a line on that contract. Read how `update_payment_apply` writes `payment_edit` to get the shape.
- Ordered newest first by consumers.

- [ ] **Step 1: Write the failing pgTAP test.** Assertions:
  - **Price raised on a contract with 3 paid installments:**
    - total amount_paid is unchanged
    - payments count is unchanged
    - every `received_at` is unchanged
    - the first 3 installments are re-filled oldest-first
    - the new monthly matches the NOTAH.md §3.2 math (price 25,000, down 10,000, 30%, 2 years → 812.50 × 24)
  - **Price cut below paid:** all installments are paid, the refund equals the exact excess, and the return value's `refund` matches.
  - **Excess with no method** → `22023`.
  - **Down payment changed:** the down payment's payment amount follows.
  - **Cash price changed:** the cash payment follows.
  - **Imported contract:** price key → `22023`; product only → ok.
  - **Same `p_id` twice:** one refund, one audit row.
  - **Other shop** → `42501`. **Viewer** → `42501`. **Void contract** → `22023`.
  - **`v_contract_history`:** shows the correction and a payment edit for that contract only.
  - **Anon:** no execute privilege.
- [ ] **Step 2:** Run in `begin … rollback`. Expected: it fails.
- [ ] **Step 3:** Write the migration and apply it.
- [ ] **Step 4:** The test passes. Re-run the Task 1 test and `update_payment_test.sql`. Run advisors.
- [ ] **Step 5:** Update types. tsc is green.
- [ ] **Step 6: Commit** `feat(db): correct_contract with re-allocation and refunds, invoice history view`.

### Task 3: Client API and pure logic

**Files:**
- Create: `mobile/src/api/corrections.ts`
- Create: `mobile/src/lib/correction.ts`
- Create: `mobile/src/lib/history.ts`
- Tests:
  - `mobile/src/lib/__tests__/correction.test.ts`
  - `mobile/src/lib/__tests__/history.test.ts`
  - `mobile/src/api/__tests__/corrections.test.ts`
- Modify:
  - `mobile/src/lib/status.ts` (add `cancelled`)
  - `mobile/src/ui/StatusChip.tsx` (cancelled = `colors.unknown` / `unknownBg` with an `Ban` icon, word "ملغية")
  - `mobile/src/api/invoices.ts` (`InvoiceQuery.status` adds `'cancelled'`; `'all'` excludes cancelled)
  - `mobile/src/api/payments.ts` (`openInstallmentContracts` drops `status === 'void'`)

**Interfaces — Produces:**

**Hooks** (each mutation takes a client `id` from `useAttempt`)
- `useCancelContract()`: mutation `{ id, contractId, customerId, refund: number, method: PaymentMethod | null, reason: string }`.
- `useCorrectContract()`: mutation `{ id, contractId, customerId, changes: CorrectionChanges, refundMethod: PaymentMethod | null }` → `{ refund: number; total: number }`.
- Both invalidate the same keys `invalidateAfterPayment` does: contracts, customer, invoices, dashboard/KPI, followup, recent activity, plus `['contractHistory', contractId]`.
- `useContractHistory(contractId)` reads `v_contract_history`, newest first.

**`lib/correction.ts`**
- `type CorrectionChanges = Partial<{ productDesc: string; externalInvoiceNo: string | null; price: number; downPayment: number; rate: number; years: number; saleDate: string }>`
- `correctableFields(contract): Array<keyof CorrectionChanges>`, following Decisions §1.
- `diffCorrection(original, form): CorrectionChanges`: only the changed fields.
- `previewCorrection(contract, changes, installmentPaid: number): { total: number; monthly: number | null; last: number | null; refund: number }`
  - Reuse the existing preview math in `mobile/src/api/sales.ts` / `lib` (find `derivePreview`). Don't duplicate it.
  - `refund = max(0, installmentPaid − new installment total)`.
- `toCorrectionPayload(changes)` → the jsonb keys the RPC expects (`product_desc`, …).

**`lib/history.ts`**
- `describeHistory(row): { title: string; lines: string[] }`. Readable Arabic:
  - `contract_correct` → title "تصحيح الفاتورة", with one line per changed field: "السعر: 20,000.00 ج.م ← 25,000.00 ج.م", "المقدم: …", "الفايدة: 20% ← 30%", "المدة: سنة ← سنتين", "التاريخ: …", "المنتج: …", "رقم الفاتورة: …".
  - `contract_cancel` → title "إلغاء الفاتورة", with "رجّعنا للعميل: 300.00 ج.م (كاش)" or "مارجعناش فلوس", plus the reason.
  - `payment_edit` → title "تعديل دفعة رقم {receipt_no}", with "المبلغ: … ← …" and "الطريقة: … ← …".
  - **The arrow reads RTL as old ← new**, written as `${old} ← ${new}`.

- [ ] **Step 1:** Write the failing tests:
  - `correctableFields` for each of the three kinds
  - `diffCorrection` ignores unchanged fields and trims text
  - `previewCorrection`:
    - the NOTAH.md example (812.50 × 24)
    - refund when paid > new total
    - 0 otherwise
  - `describeHistory` for each action, including Arabic money and year words
  - hooks call the right RPC names and arguments (mock supabase like `customers.test.tsx`)
  - `openInstallmentContracts` drops void
  - the invoices query maps the `'cancelled'` filter
- [ ] **Step 2:** Implement. The tests pass. tsc is green.
- [ ] **Step 3: Commit** `feat(mobile): corrections api, preview and readable history`.

### Task 4: Cancel an invoice (UI)

**Files:**
- Create: `mobile/src/ui/CancelSheet.tsx` and `mobile/src/ui/__tests__/CancelSheet.test.tsx`. Follow `ContactSheet.tsx` for the sheet/modal pattern.
- Modify:
  - `mobile/src/app/(app)/contract/[id].tsx`
  - `mobile/src/app/(app)/(tabs)/invoices/index.tsx` (filter chip "ملغية")
  - `mobile/src/app/(app)/(tabs)/customers/[id].tsx` (void invoices greyed, with the cancelled chip, not counted in totals)

**Behaviour:**
- **Invoice detail actions** (owner only, hidden on void): "تصحيح" (Task 5) and "إلغاء الفاتورة" (secondary style, error-colored text).
- **CancelSheet contents:**
  - "الفاتورة دي اتدفع فيها {paid}"
  - field "هترجّع للعميل كام؟", prefilled with paid, accepts 0
  - method chips (the same list as the payment form), shown only when the refund is > 0
  - optional reason "السبب (اختياري)"
  - red confirm button "إلغاء الفاتورة"
  - secondary "رجوع"
- **Validation:**
  - refund > paid → "مينفعش ترجّع أكتر من اللي اتدفع"
  - refund > 0 without a method → "اختار طريقة الرجوع"
- **On success:** the sheet closes. The detail shows the "ملغية" chip, the cancel date, and "رجّعنا {refund}" when the refund is > 0. Action buttons are hidden and "تسجيل دفعة" is hidden.
- **Errors:** `22023` → "الفاتورة دي اتلغت قبل كده" (if void) or the server message mapped to "ماتلغتش، جرّب تاني". `42501` → "مش مسموحلك".
- **Retry:** uses the same `useAttempt` id; editing the form gets a new id.

- [ ] **Step 1:** Write failing CancelSheet tests:
  - prefill = paid
  - the method is required only when refund > 0
  - the over-paid error
  - confirm calls `onConfirm` with numbers (Arabic digits normalized)
  - the confirm button uses the destructive variant
- [ ] **Step 2:** Implement and wire the screens. The full jest suite and tsc are green.
- [ ] **Step 3: Commit** `feat(mobile): cancel an invoice with an optional refund`.

### Task 5: Correct an invoice (UI)

**Files:**
- Create: `mobile/src/app/(app)/contract/[id]/correct.tsx`. If `contract/[id].tsx` is a file route, convert it to `contract/[id]/index.tsx` with no behaviour change, so `/contract/<id>/correct` resolves.
- Create: `mobile/src/ui/CorrectionPreview.tsx` and `mobile/src/ui/__tests__/CorrectionPreview.test.tsx`.

**Behaviour:**
- **The form:** shows only `correctableFields`, prefilled from the contract. It reuses the field components and year chips from `sale/new.tsx` (`ui/Chip.tsx` exists). Imported invoices show the note "الفاتورة دي متستوردة، تقدر تعدّل الاسم ورقم الفاتورة بس".
- **CorrectionPreview:**
  - "قبل ← بعد" for the total and the monthly installment.
  - When `refund > 0`: "اللي اتدفع أكتر من الإجمالي الجديد، هيرجع للعميل {refund}", with method chips (required).
  - When the down payment or cash price changes: the note "الدفعة المقدمة هتتعدل بالمبلغ الجديد".
- **Save button:** "حفظ التصحيح", disabled until something has changed. On success it returns to the invoice detail and shows "اتصححت الفاتورة" (one-shot, same pattern as the settings banner). If there was a refund, the note says "ورجّعنا {refund}".
- **Errors:**
  - Validation errors are shown per field: the same messages `sale/new.tsx` uses.
  - `22023` from the linked-payment rule → the Decisions §3 message.
  - Anything else → "ماتصححتش، جرّب تاني".

- [ ] **Step 1:** Write failing CorrectionPreview tests:
  - before/after totals
  - the refund block only when > 0
  - the refund method is required
  - the down-payment note
- [ ] **Step 2:** Implement. The full jest suite and tsc are green.
- [ ] **Step 3: Commit** `feat(mobile): correct an invoice with live before/after preview`.

### Task 6: سجل التعديلات on the invoice detail

**Files:**
- Create: `mobile/src/ui/HistoryList.tsx` and `mobile/src/ui/__tests__/HistoryList.test.tsx`
- Modify: `mobile/src/app/(app)/contract/[id]` detail screen

**Behaviour:** a section titled "سجل التعديلات" at the bottom of the detail.
- One card per row from `describeHistory`: title, date with `formatDateAr` + time, and lines.
- Empty → "مفيش تعديلات على الفاتورة دي".
- Loading → spinner. Error → "تعذر تحميل السجل".
- Show at most 20, with a "عرض الكل" button that shows the rest.

- [ ] **Step 1:** Write failing HistoryList tests: empty, rows rendered in order, more than 20 → "عرض الكل".
- [ ] **Step 2:** Implement and wire. jest and tsc are green.
- [ ] **Step 3: Commit** `feat(mobile): invoice change history`.

### Task 7: Docs

**Files:** `NOTAH.md`. Cover:
- the `refund` table
- the new columns
- `cancel_contract` and `correct_contract` in the RPC table
- the void rules in §3
- the view changes, including the KPI now using Cairo dates and subtracting refunds
- `v_contract_history`
- the screens

- [ ] **Step 1:** Update the docs. Commit `docs: corrections, cancellation and refunds`.

---

## Self-review notes

- **Spec coverage:**
  - §3.5 correct/cancel → Tasks 2, 4, 5
  - §6 rows تصحيح/إلغاء → Tasks 1, 2
  - §7 refund decisions → Tasks 1, 2, 4, 5
  - "Correction keeps history" → Task 2 (`received_at` untouched, re-allocation only)
  - "Cancelled invoices" listing + filter → Tasks 1, 3, 4
  - "Audit visibility" → Tasks 2, 6
  - KPI minus refunds → Task 1
- **Left to plan 5:** the reports' المحصّل / المبيعات / المتوقع consume `refund` and void exclusion.
- **Ruling:** imported invoices can't have their money corrected. Their schedule is the owner's paper record, and rebuilding it with flat math would invent installments. Cancel still works for them.
