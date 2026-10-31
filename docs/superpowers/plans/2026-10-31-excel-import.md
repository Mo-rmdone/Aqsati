# Excel Import Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a shop owner upload a spreadsheet of running installment contracts (with what was already paid), review and edit every row, and save them as customers + contracts + opening-balance payments.

**Architecture:** A new security-definer RPC `import_contract` writes one contract with an explicit schedule from the ledger numbers, a down payment, and one editable opening-balance payment. The app parses `.xlsx`/`.csv` on the client (SheetJS), validates and previews rows in pure functions, then saves row by row with per-row client ids.

**Tech Stack:** Supabase Postgres + pgTAP; Expo Router + TypeScript; SheetJS (`xlsx` from the official CDN tarball); react-query; jest-expo.

**Spec:** `docs/superpowers/specs/2026-10-31-excel-import-design.md` (also read `NOTAH.md` §3 and `mobile/CLAUDE.md`)

## Global Constraints

- Template columns, in this order, Arabic headers exactly: `اسم العميل`, `الموبايل`, `الرقم القومي`, `العنوان`, `السلعة`, `المبلغ الكلي`, `المقدم`, `القسط الشهري`, `عدد الشهور المدفوعة`, `أول شهر اتدفع`, `آخر شهر اتدفع`, `رقم الفاتورة`.
- `المبلغ الكلي` = full price including interest. `remaining = total − down`; `count = ceil(remaining / monthly)`; installments 1..count−1 = monthly, last = remaining − monthly×(count−1); `due(i) = first + (i−1) months` (month-end clamp); `sale_date = first − 1 month`; `already_paid = min(paid, count) installments' amounts`.
- `أول شهر اتدفع` = due month of the first installment. Month-only input → day 1; a full date → its day.
- Phone `^01[0125][0-9]{8}$`; national ID optional `^[23][0-9]{13}$`.
- Opening-balance payment: one payment, `is_opening = true`, method `cash`, `received_at = least(due date of the last paid installment, now())`, recorded through `payment_line(kind='installment')` + `allocate_payment` so it is editable via `update_payment`; excluded from `collected_this_month`.
- Imported contracts: `interest_method = 'imported'`, `interest_rate = 0`, any `num_installments ≥ 1`.
- Duplicate across uploads = same (phone, product, total, first due month) → shown "موجود بالفعل", skipped by default.
- Existing customer with the same phone (oldest if several) is reused untouched.
- Max 500 rows. Who can import: owner/manager/accountant. Every client write carries a client id generated once per row at parse time.
- Live Supabase project `vvwhhcndctsumamtqhsz` holds real data: migrations via MCP `apply_migration`; SQL tests via `execute_sql` in `begin … rollback` (pattern: `supabase/tests/payment_hardening_test.sql`); never sign in from automation.
- UI rules: `mobile/CLAUDE.md` (theme tokens only, RTL `row`, Lucide, 56px controls, Egyptian Arabic copy).

## Review Focus

1. **Uneven totals** (15,500 remaining at 1,000/month) — 16 installments, last 500, sums exactly. Test: Task 1 `uneven remainder`, Task 2 `computeContract uneven`.
2. **A spreadsheet with messy cells** (Arabic digits, `"25,000"`, spaces, Excel date serials, `11/2025`) — parsed to the right numbers/dates, not rejected. Test: Task 2 `parseCell` cases.
3. **Re-upload of an already-imported file** — rows flagged "موجود بالفعل" and skipped. Test: Task 3 `markDuplicates`.
4. **Paid months more than the number of installments** — row error, never saved. Test: Task 1 rejection + Task 2 validation.
5. **Save interrupted halfway, then retried** — no duplicate contracts or customers. Test: Task 3 `saveRows retry reuses ids`.

---

### Task 1: Database — `import_contract`, opening balance, KPI

**Files:**
- Create: `supabase/migrations/0018_import_contract.sql`
- Create: `supabase/tests/import_contract_test.sql`

**Interfaces:**
- Produces:
  - `contract.interest_method` check allows `'imported'`; `contract_sale_type_installments_check` becomes: `(sale_type='cash' and num_installments=0) or (sale_type='installment' and interest_method='imported' and num_installments >= 1) or (sale_type='installment' and interest_method <> 'imported' and num_installments in (12,24,36,48,60))`.
  - `payment.is_opening boolean not null default false`.
  - `import_contract(p jsonb) returns uuid` — security definer, `search_path=''`, granted to `authenticated` only. Keys: `id`, `customer_id`, `product_desc`, `total_price`, `down_payment`, `monthly`, `first_due` (date), `paid_months` (int), `external_invoice_no`. Same structure as `create_sale` in `0016` (role owner/manager/accountant → `'غير مصرح لك بتسجيل البيع'`; advisory lock + idempotent return; customer in tenant → `'العميل غير موجود'`). New Arabic errors: `'المقدم لازم يكون أقل من المبلغ الكلي'`, `'القسط الشهري لازم يكون أكبر من صفر ومش أكبر من الباقي'`, `'عدد الشهور المدفوعة أكبر من عدد الأقساط'`.
  - Writes: contract; explicit installments per Global Constraints; if down > 0 a payment + `payment_line(kind='down_payment')` dated `sale_date`; if paid_months > 0 a payment (`is_opening=true`) via `public.fn_apply_payment_lines(pay_id, tenant, [{contract_id, amount}])`; then set each installment's status with `public.installment_status(...)` (so past-due unpaid become `overdue`).
  - `v_collections_kpi.collected_this_month` excludes `is_opening` payments (keep columns and `security_invoker`).

- [ ] **Step 1: Write the failing tests** (`import_contract_test.sql`, one `as_new_owner` shop, run as `authenticated`):
  - `25,000/10,000/1,000, 6 paid from first_due = 6 months before current month` → 15 installments of 1,000; first 6 `paid`; `v_contract_balance.remaining = 9000.00`; one opening payment of 6000 with `is_opening`; installments 7.. with due < today are `overdue`.
  - `uneven remainder`: total 25,500, down 10,000, monthly 1,000 → 16 installments, last 500.00, sum 15,500.
  - `same id twice` → 1 contract, 1 opening payment.
  - `paid_months > count` → exact error, nothing written.
  - `other shop's customer` → `'العميل غير موجود'`.
  - `opening payment is editable`: `update_payment(open_id, 'cash', [{contract, 4000}])` → paid installments become 4.
  - `KPI excludes opening`: `collected_this_month` doesn't include the 6000 (first_due in the current month case: paid 1 → 1000 not counted).
  - `create_sale` still rejects `years` 6 (constraint unchanged for flat).
- [ ] **Step 2: Run via `execute_sql` — fails** (`function public.import_contract(jsonb) does not exist`).
- [ ] **Step 3: Write and apply `0018_import_contract.sql`** (MCP `apply_migration` name `import_contract`).
- [ ] **Step 4: Run new test + `create_sale_test.sql` + `update_payment_test.sql` + `payment_hardening_test.sql` — all `ok`. Run `get_advisors` (security): no ERROR.**
- [ ] **Step 5: Regenerate `mobile/src/lib/database.types.ts`** (MCP `generate_typescript_types`). **Commit** `feat(db): import_contract with opening balance`.

---

### Task 2: Pure import logic — parse, compute, validate

**Files:**
- Create: `mobile/src/lib/importRows.ts`
- Test: `mobile/src/lib/__tests__/importRows.test.ts`

**Interfaces:**
- Consumes: `normalizeDigits` (`src/api/sales.ts`), `validateCustomer` (`src/lib/validation.ts`), `newId` (`src/lib/ids.ts`).
- Produces:
  - `IMPORT_COLUMNS: readonly { key: keyof RawRow; header: string; required: boolean }[]` (headers per Global Constraints; also accept English aliases `name, phone, national_id, address, product, total, down, monthly, paid_months, first_month, last_month, invoice_no`).
  - `type RawRow = Record<'name'|'phone'|'nationalId'|'address'|'product'|'total'|'down'|'monthly'|'paidMonths'|'firstMonth'|'lastMonth'|'invoiceNo', string>`
  - `rowsFromSheet(matrix: unknown[][]): { rows: RawRow[]; error?: string }` — first row = headers (trim, match Arabic or alias); missing required header → Arabic error naming it; skips fully empty rows; > 500 rows → error `'الملف فيه أكتر من 500 عقد'`.
  - `parseAmount(cell: string): number | null` (strips `,` spaces `ج.م`, normalizes digits; NaN → null), `parseMonth(cell: string): string | null` → `YYYY-MM-DD` (accepts `YYYY-MM`, `YYYY-MM-DD`, `MM/YYYY`, `DD/MM/YYYY`, Excel serial number).
  - `type ImportRow = { id: string; customerId: string; raw: RawRow; errors: string[]; warnings: string[]; computed: ComputedContract | null; duplicate: boolean; skip: boolean; status: 'pending'|'saved'|'failed'; failure?: string }`
  - `type ComputedContract = { total: number; down: number; monthly: number; remaining: number; count: number; last: number; paidMonths: number; alreadyPaid: number; left: number; firstDue: string; lastDue: string; saleDate: string }`
  - `computeContract(r: { total; down; monthly; paidMonths; firstDue }): ComputedContract` — piaster integer math; reuse month-add/clamp from `src/lib/money.ts` (export it there if private).
  - `validateRow(raw: RawRow): { errors: string[]; warnings: string[]; computed: ComputedContract | null }` — spec §6 rules with Arabic messages; warning when `lastMonth` ≠ firstDue + (paid−1) months; warning added later for same phone/different name (Task 3).
  - `toImportRows(raws: RawRow[]): ImportRow[]` — ids via `newId()` once; `customerId` shared by rows with the same normalized phone.

- [ ] **Step 1: Failing tests:** `computeContract` 25,000/10,000/1,000/6 from `2025-11-01` → `{count:15,last:1000,alreadyPaid:6000,left:9000,firstDue:'2025-11-01',lastDue:'2027-01-01',saleDate:'2025-10-01'}`; `computeContract uneven` 25,500 → `{count:16,last:500}`; month-end clamp from `2026-01-31`; `parseCell` cases: `'٢٥٬٠٠٠'`, `'25,000 ج.م'`, `' 1000 '` → numbers; `parseMonth('2025-11')`, `('11/2025')`, `('2025-11-15')`, `(45962)` (Excel serial) → expected ISO; `validateRow` errors for bad phone, down ≥ total, monthly > remaining, paid > count (exact Arabic), warning for last-month mismatch; `rowsFromSheet` missing `الموبايل` header → error naming it; English aliases accepted; `toImportRows` same phone → same customerId, ids stable.
- [ ] **Step 2: `npx jest importRows` fails. Step 3: implement. Step 4: passes; full `npx jest` + `npx tsc --noEmit` clean. Step 5: commit** `feat(mobile): import row parsing, math and validation`.

---

### Task 3: Import data layer — file reading, template, duplicates, saving

**Files:**
- Create: `mobile/src/api/import.ts`
- Test: `mobile/src/api/__tests__/import.test.ts`
- Modify: `mobile/package.json` — add `xlsx` from `https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz` (not the npm registry version).

**Interfaces:**
- Consumes: Task 1 RPC, Task 2 types/functions, `findCustomerByPhone`, `useCreateCustomer` pattern (`src/api/customers.ts`).
- Produces:
  - `readSpreadsheet(file: { arrayBuffer(): Promise<ArrayBuffer>; name: string }): Promise<unknown[][]>` (first sheet, raw values, dates as serials).
  - `downloadTemplate(): void` — builds an `.xlsx` with the 12 headers, one example row (the 25,000 example), and a second sheet "تعليمات" (Arabic notes incl. "المبلغ الكلي بالفايدة", "أول شهر اتدفع = شهر أول قسط"); web download via Blob.
  - `markDuplicates(rows: ImportRow[], existing: { phone: string; product: string; total: number; firstDue: string }[]): ImportRow[]` — sets `duplicate` and `skip=true` on matches (product compared trimmed).
  - `fetchExistingImports(): Promise<{phone; product; total; firstDue}[]>` — contracts with `interest_method='imported'`, joined customer phone and installment `seq_no=1` due date.
  - `markNameConflicts(rows): ImportRow[]` — warning `'نفس الموبايل بأسماء مختلفة'`.
  - `saveRows(rows: ImportRow[], onProgress: (done: number, total: number) => void): Promise<ImportRow[]>` — for each non-skipped row without errors and status ≠ saved: resolve customer (existing by phone → use its id for every row of that phone; else upsert with the row's `customerId`), then `rpc('import_contract', { p })` with the row `id`; per-row try/catch sets `saved`/`failed` + Arabic failure; never throws. Invalidates `['customers']`, `['dashboard']` at the end.

- [ ] **Step 1: Failing tests** (mocked supabase): `markDuplicates` marks and skips matching row only; `saveRows` skips rows with errors/skip; `saveRows retry reuses ids` — first run fails row 2 (RPC error), second run sends row 2 with the same id and does not resend row 1; existing customer by phone is used instead of creating; `downloadTemplate` sheet headers equal `IMPORT_COLUMNS` order.
- [ ] **Step 2: fails. Step 3: implement. Step 4: jest + tsc clean. Step 5: commit** `feat(mobile): import file reading, template, duplicate check and saving`.

---

### Task 4: Import screen and entry points

**Files:**
- Create: `mobile/src/app/(app)/import.tsx`
- Modify: `mobile/src/app/(app)/(tabs)/customers/index.tsx` (secondary button "استيراد من إكسل" → `/import`)
- Modify: `mobile/src/app/(app)/contract/[id].tsx` (chip "مستورد" when `interest_method='imported'`; payment label "رصيد افتتاحي" when `is_opening`)
- Modify: `mobile/src/api/payments.ts` (select `is_opening`, `interest_method`)

**Interfaces:**
- Consumes: Tasks 2–3.
- Screen (Arabic, back button, phone-width): **Step 1** "نزّل القالب" + "اختار الملف" (`<input type="file" accept=".xlsx,.csv">` on web via a hidden input; parse errors shown). **Step 2 Preview**: summary "N عقد · M عميل · K محتاجين مراجعة · D موجودين بالفعل"; filter chips الكل / محتاج مراجعة; card per row (customer, product, total, down, `monthly × count`, paid → left, first/last month formatted with `formatDateAr`, chips: error (error tone) / warning (due tone) / "موجود بالفعل" (unknown tone) with toggle "تخطي"); tap → inline editor of all raw fields re-validated live; remove row. **Step 3 Save**: button "حفظ N عقد" (rows with errors excluded, count shown), progress "بنحفظ X من N", result "اتحفظ X عقد · Y فشلوا" with failed rows editable and "حاول تاني".

- [ ] **Step 1: Failing test** `mobile/src/app/__tests__/importSummary.test.ts` for a pure `summarize(rows)` helper (put it in `src/lib/importRows.ts`): counts total/customers/needsReview/duplicates/ready.
- [ ] **Step 2–4: implement helper + screen; jest + tsc clean; `npx expo export -p web` builds; open `/import` in the browser pane (it redirects to login without a session — confirm bundle has no console errors only).**
- [ ] **Step 5: Commit** `feat(mobile): Excel import screen`.

---

### Task 5: Deploy and document

**Files:**
- Modify: `NOTAH.md` (§2 status, §3 rules for import, §4 RPC list, §9 roadmap)
- Modify: `NOTAH-BUILD.md` (add `import_contract` to §4 and the import screen to §6)

- [ ] **Step 1:** `cd mobile && npm run build:web && npx wrangler deploy` → `Deployed notah`; curl `/import` → 200.
- [ ] **Step 2:** Update docs; commit `docs: Excel import in NOTAH.md / NOTAH-BUILD.md`; push `main` only after the user approves.
- [ ] **Step 3:** Hand the user a 5-step check: download template → fill 3 rows (one uneven, one with paid months, one re-used phone) → upload → edit a row → save → upload the same file again (all "موجود بالفعل").
