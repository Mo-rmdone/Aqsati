# Notah v2 — Plan 1 of 5: Desktop shell, lists and files — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give Notah the approved v2 look and navigation (sidebar on computer, invoices tab on phone) and build the read-mostly screens: الرئيسية, العملاء, ملف العميل, الفواتير, تفاصيل الفاتورة.

**Architecture:** Three new security-invoker SQL views compute customer status, the invoice list and recent activity; the client reads them through new React Query hooks. One responsive layer (`useIsDesktop`, ≥ 1024 px) switches between the phone tab bar and a right-hand sidebar, and between list rows and tables. No new money-changing RPCs in this plan.

**Tech Stack:** Expo SDK 58 + Expo Router (web output "single"), React Native Web, TanStack Query 5, Supabase (Postgres views, RLS, pgTAP via MCP `execute_sql`), Jest + Testing Library, Lucide icons.

**Spec:** `docs/superpowers/specs/2026-11-01-notah-screens-requirements.md`. Visual reference (approved Hi-Fi, computer): https://claude.ai/artifact/NCwdZo9cBsHYLyQJu2FkoV — match its layout, hierarchy and copy; colors/type come from `mobile/src/ui/theme.ts`.

### The five plans (this is plan 1)

1. **Shell, lists, files** (this plan): §2 navigation, §3.1 Home (no follow-up, no reports button yet), §3.2, §3.3 (no contacts log), §3.4, §3.5 (no print/correct/cancel yet).
2. **Follow-up** (§4): contact log, اتصلت/واتساب marks, promise date, worklist ordering, سجل التواصل.
3. **Correction, cancellation, refunds** (§3.5, §6, §7): `refund` table, `correct_contract`, `cancel_contract`, سجل التعديلات, KPI/المحصّل minus refunds.
4. **Settings + WhatsApp summary** (§3.7, §3.9): shop data/logo bucket, defaults, template, password.
5. **Reports + printing** (§3.8, §5): four reports, PDFs (receipt, contract, statement, reports), share sheet.

## Global Constraints

- All colors, spacing, radii, type from `mobile/src/ui/theme.ts`; no hand-written hex or px in screens (`mobile/CLAUDE.md`).
- RTL first: `flexDirection: 'row'` follows writing direction; never `row-reverse`; back = chevron-right; "forward" = chevron-left.
- Tap targets ≥ 48; buttons/inputs 56 (desktop table actions may be 40–48); text ≥ 16 on phone, 15 allowed in desktop tables/helpers; chips 14 with an icon.
- Money `1,234.50 ج.م` via `<Money>` / `formatEGP`, Latin digits, two decimals.
- Statuses = icon + word + color via `<StatusChip>`; overdue is terracotta, never red. Red = system errors and destructive actions only.
- Coin amber only for the "+ فاتورة" action.
- Copy in Egyptian Arabic; no "من فضلك", no "تم بنجاح".
- Desktop breakpoint: window width ≥ 1024 px → sidebar + wide content (max 1200 px); below → phone tabs and the 480 px column.
- Cairo calendar day for every "today/this month" in new SQL: `(now() at time zone 'Africa/Cairo')::date`.
- Customers appear in lists only if they have ≥ 1 contract (existing rule).
- New views: `with (security_invoker = true)`, `revoke select … from anon`. Never write non-rolled-back data to the live project from automation; SQL tests run in `begin … rollback` with `tests.as_new_owner`.
- Phone nav order (RTL, right→left): الرئيسية · العملاء · + فاتورة · الفواتير · الإعدادات. Sidebar order: + فاتورة جديدة, الرئيسية, العملاء, الفواتير, التقارير, الإعدادات (التقارير shown disabled with "قريب" until plan 5).

## Review Focus

1. Customer whose only contract is fully paid → status خلّص, excluded from عليهم فلوس, still in الكل. (Task 1 test.)
2. Two late installments split across two contracts (one each) → متأخر, not متأخر كتير (the rule is 2+ on one invoice). (Task 1 test.)
3. Imported contract with unknown remaining (null) → invoice status "غير معروف", never خلّص; customer list doesn't crash on nulls. (Task 1 + Task 4 tests.)
4. Search text containing `%`, `_`, `,` or Arabic-Indic digits in the invoices search → no PostgREST error, digits normalized. (Task 4 test.)
5. Window resized across 1024 px → layout switches without losing the current route. (Task 2 test.)

---

### Task 1: SQL views for status, invoice list, recent activity

**Files:**
- Create: `supabase/migrations/0021_v2_lists.sql`
- Create: `supabase/tests/v2_lists_test.sql`
- Modify: `mobile/src/lib/database.types.ts` (regenerated)

**Interfaces:**
- Produces (SQL, all tenant-scoped through RLS of base tables):
  - `customer.notes text null` (new column).
  - `v_customer_summary(customer_id, tenant_id, name, phone, invoice_count int, paid_total numeric, remaining_total numeric, overdue_amount numeric, overdue_count int, max_overdue_per_contract int, next_due_date date, next_due_amount numeric, paid_this_month bool, late_this_month bool, has_unknown bool, status text)`; `status ∈ ('late_many','late','regular','done','unknown')`.
  - `v_invoice_list(contract_id, tenant_id, contract_no, external_invoice_no, customer_id, customer_name, customer_phone, product_desc, sale_type, sale_date date, total_payable, paid, remaining, overdue_count int, next_due_date, status text)`; `status ∈ ('late','open','settled','unknown')`.
  - `v_recent_activity(tenant_id, at timestamptz, kind text, customer_id, customer_name, contract_id, contract_no, amount numeric)`; `kind ∈ ('sale','payment')` (plans 2–3 extend it).

- [ ] **Step 1: Write `supabase/tests/v2_lists_test.sql`** (helpers header from `supabase/tests/helpers.sql`). Build with `tests.as_new_owner('Shop V')`, `create_sale` and `record_payment` (as the existing tests do) and direct `update installment set due_date …` to age installments. Assertions (plan 12):
  - customer with one cash sale → `status = 'done'`, `remaining_total = 0`.
  - installment contract with 2 past-due unpaid installments → `status='late_many'`, `overdue_count=2`, `max_overdue_per_contract=2`.
  - same customer shape but one past-due installment on each of two contracts → `status='late'`, `max_overdue_per_contract=1`.
  - nothing past due, remaining > 0 → `regular`; `next_due_date`/`next_due_amount` = earliest open installment (amount_due − amount_paid).
  - a non-opening payment received this Cairo month → `paid_this_month = true`; an opening payment only → false.
  - past-due unpaid installment whose due_date is in the current Cairo month → `late_this_month = true`.
  - `v_invoice_list` rows: cash sale → `settled`; late contract → `late`, `overdue_count` matches; `sale_date` = the `sale_date` passed to `create_sale` (stored in `contract.start_date`).
  - `v_recent_activity` returns one `sale` row per contract and one `payment` row per non-opening payment, newest first by `at`.
  - another shop's owner sees 0 rows in all three views.
- [ ] **Step 2: Run it via MCP `execute_sql`** — expected: fails (views don't exist).
- [ ] **Step 3: Write `0021_v2_lists.sql`.** Definitions:
  - Past-due = `due_date < cairo_today and amount_due > amount_paid` (do not rely on the nightly `overdue` flag). Exclude `contract.status = 'void'` everywhere (plan 3 uses it for cancelled).
  - `remaining` per contract from `v_contract_balance`; `has_unknown` = any contract with null remaining; customer `status`: `late_many` if `max_overdue_per_contract ≥ 2`, else `late` if `overdue_count ≥ 1`, else `unknown` if `has_unknown`, else `regular` if `remaining_total > 0`, else `done`.
  - Invoice `status`: `unknown` if remaining null, `settled` if remaining = 0, `late` if overdue_count > 0, else `open`.
  - `v_customer_summary` inner-joins contracts (only customers with invoices).
  - `revoke select on <view> from anon;` for all three.
- [ ] **Step 4: Apply with MCP `apply_migration` (name `0021_v2_lists`), re-run the test** — expected: every line `ok`, no `not ok`.
- [ ] **Step 5: Regenerate types** with MCP `generate_typescript_types` into `mobile/src/lib/database.types.ts`; `cd mobile && npx tsc --noEmit` — expected: no errors.
- [ ] **Step 6: Commit** `feat(db): v2 list views (customer summary, invoice list, recent activity) + customer notes`.

### Task 2: Responsive shell — sidebar, tabs, shared UI pieces

**Files:**
- Modify: `mobile/src/ui/theme.ts` (add `size.contentMax: 1200`, `size.sidebar: 248`, `breakpoint.desktop: 1024`)
- Create: `mobile/src/ui/layout.ts`, `mobile/src/ui/Sidebar.tsx`, `mobile/src/ui/Tile.tsx`, `mobile/src/ui/DataTable.tsx`, `mobile/src/ui/FilterChips.tsx`
- Modify: `mobile/src/ui/Screen.tsx`, `mobile/src/app/(app)/_layout.tsx`, `mobile/src/app/(app)/(tabs)/_layout.tsx`
- Create: `mobile/src/app/(app)/(tabs)/invoices/_layout.tsx`, `mobile/src/app/(app)/(tabs)/invoices/index.tsx` (placeholder screen "الفواتير" until Task 4)
- Test: `mobile/src/ui/__tests__/layout.test.tsx`, `mobile/src/ui/__tests__/Sidebar.test.tsx`

**Interfaces:**
- Produces:
  - `isDesktopWidth(width: number): boolean` and `useIsDesktop(): boolean` (`useWindowDimensions`) in `layout.ts`.
  - `<Sidebar />` — logo (brand mark "ن" + "نوتة"), coin button "+ فاتورة جديدة" → `/sale/new`, nav items with Lucide icons (House, Users, FileText, ChartColumn, SlidersHorizontal), active item from `usePathname()` (brandSoft bg, brand text). التقارير disabled with a "قريب" chip.
  - `<Screen title onBack actions?: ReactNode wide?>`: desktop → `maxWidth: size.contentMax`, padding `space[8]`, title row with `actions` on the end side; phone unchanged.
  - `<Tile label value tone? />` (value: number → `<Money>`; string → text). Extract from Home.
  - `<DataTable<T> columns={{ key, title, width?, render(row) }[]} rows={T[]} keyOf onRowPress? empty? />` — header row on `surfaceSunken`, row hairlines, horizontal scroll when wider than container.
  - `<FilterChips options={{ value, label, count? }[]} value onChange />` — selected = brand fill, onBrand text.
- [ ] **Step 1: Failing tests:** `isDesktopWidth(1023) === false`, `isDesktopWidth(1024) === true`; Sidebar renders the six labels, marks `/customers` active when `usePathname` returns `/customers/abc` (mock `expo-router`), and pressing "+ فاتورة جديدة" calls `router.push('/sale/new')`.
- [ ] **Step 2: Run** `cd mobile && npx jest src/ui/__tests__` — expected: FAIL (modules missing).
- [ ] **Step 3: Implement.** `(app)/_layout.tsx`: desktop → `<View style={{flex:1, flexDirection:'row'}}><Sidebar/><View style={{flex:1}}><Stack …/></View></View>`; phone → current Stack. `(tabs)/_layout.tsx`: add `invoices` tab (FileText icon, title "الفواتير") after `sale`; on desktop `tabBarStyle: { display: 'none' }`.
- [ ] **Step 4: Run tests + `npx tsc --noEmit`** — expected: PASS, no errors.
- [ ] **Step 5: Commit** `feat(mobile): responsive shell — sidebar on desktop, invoices tab, shared Tile/DataTable/FilterChips`.

### Task 3: العملاء — status, filters, table

**Files:**
- Modify: `mobile/src/api/customers.ts`, `mobile/src/app/(app)/(tabs)/customers/index.tsx`
- Create: `mobile/src/lib/status.ts`
- Test: `mobile/src/api/__tests__/customers.test.tsx`, `mobile/src/lib/__tests__/status.test.ts`

**Interfaces:**
- Consumes: `v_customer_summary` (Task 1); `DataTable`, `FilterChips`, `Screen` (Task 2).
- Produces:
  - `type CustomerFilter = 'all' | 'paid_month' | 'late_month' | 'late_many' | 'owes'`.
  - `type CustomerSummary = Tables<'v_customer_summary'>`.
  - `useCustomerSummaries(search: string, filter: CustomerFilter)` → `CustomerSummary[]` (limit 50, ordered by `status` severity then name). Search: same two-call name/phone merge as `useCustomers` with `escapeSearch` + `normalizeDigits`.
  - `applyCustomerFilter(filter)` mapping: `paid_month` → `.eq('paid_this_month', true)`, `late_month` → `.eq('late_this_month', true)`, `late_many` → `.eq('status','late_many')`, `owes` → `.gt('remaining_total', 0)`.
  - In `status.ts`: `customerStatusChip(status: string | null): { label: string; tone: Tone }` — `late_many`→`متأخر كتير`/overdue, `late`→`متأخر`/overdue, `regular`→`منتظم`/paid, `done`→`خلّص`/unknown, else `غير معروف`/unknown; `invoiceStatusChip(status)` — `late`→`متأخر`/overdue, `open`→`جاري`/due, `settled`→`خلّص`/paid, else `غير معروف`/unknown.
- [ ] **Step 1: Failing tests:** status mapping table (all 5 + null); `useCustomerSummaries('', 'late_many')` calls `.from('v_customer_summary')` and `.eq('status','late_many')`; `'٠١٠'` search becomes `ilike('phone','010%')`.
- [ ] **Step 2: Run** `npx jest src/api/__tests__/customers.test.tsx src/lib/__tests__/status.test.ts` — FAIL.
- [ ] **Step 3: Implement** the hook and screen: header "العملاء" + count, action "استيراد من إكسل" (secondary); search + FilterChips (الكل · دفعوا الشهر ده · متأخرين الشهر ده · متأخرين كتير · عليهم فلوس); desktop `DataTable` columns الاسم · الموبايل · الفواتير · الباقي عليه · أقرب قسط (`amount · date`) · الحالة; phone rows: name, phone, status chip, remaining. Row press → `/customers/[id]`. Hint text: "العميل الجديد بيتضاف من جوه الفاتورة." Keep the empty/error states of the current screen.
- [ ] **Step 4: Run tests + tsc** — PASS.
- [ ] **Step 5: Commit** `feat(mobile): customers list with status, filters and desktop table`.

### Task 4: الفواتير — list, search, filters

**Files:**
- Create: `mobile/src/api/invoices.ts`
- Modify: `mobile/src/app/(app)/(tabs)/invoices/index.tsx`
- Test: `mobile/src/api/__tests__/invoices.test.ts`

**Interfaces:**
- Consumes: `v_invoice_list` (Task 1), `invoiceStatusChip` (Task 3), `escapeSearch`, `normalizeDigits`.
- Produces:
  - `type InvoiceQuery = { search: string; date: 'today' | 'month' | 'all' | { from: string; to: string }; type: 'all' | 'cash' | 'installment'; status: 'all' | 'open' | 'late' | 'settled' }` (plan 3 adds `'cancelled'`).
  - `dateRange(date: InvoiceQuery['date'], today: string): { from?: string; to?: string }` (ISO dates; `month` = first..last day of today's month).
  - `useInvoices(q: InvoiceQuery)` → `{ rows: InvoiceRow[]; count: number; total: number }` from `v_invoice_list`, ordered `contract_no desc`, limit 100. Search: a numeric term (after `normalizeDigits`) matches `contract_no` exactly or `external_invoice_no` prefix; any term also matches `product_desc`/`customer_name` ilike — run as separate typed calls and merge by `contract_id` (no `.or()` strings).
- [ ] **Step 1: Failing tests:** `dateRange('month','2026-11-15')` → `{from:'2026-11-01', to:'2026-11-30'}`; `dateRange('today', d)` → `{from:d,to:d}`; search `'41'` issues `.eq('contract_no', 41)`; search `'تلا_جة%'` passes the escaped pattern to `ilike`; `status:'late'` adds `.eq('status','late')`; a row with `remaining: null` maps to chip `غير معروف`.
- [ ] **Step 2: Run** `npx jest src/api/__tests__/invoices.test.ts` — FAIL.
- [ ] **Step 3: Implement** hook + screen: title "الفواتير" + subtitle (period · count); full-width search ("ابحث برقم العقد، رقم الفاتورة الخارجي، السلعة، أو العميل"); three labelled chip groups (التاريخ: النهارده/الشهر ده/الكل · النوع: الكل/كاش/قسط · الحالة: الكل/جاري/متأخر/خلّص); desktop table رقم · العميل · السلعة · النوع · التاريخ · الإجمالي · الباقي · الحالة with a footer "بيعت في الفترة: N فاتورة · X ج.م"; phone rows. Row press → `/contract/[id]`. A custom range picker is out of scope (plan 5 reports bring a date-range input; reuse then).
- [ ] **Step 4: Run tests + tsc** — PASS.
- [ ] **Step 5: Commit** `feat(mobile): invoices list with search and filters`.

### Task 5: ملف العميل — summary, payments log, edit + notes

**Files:**
- Modify: `mobile/src/app/(app)/(tabs)/customers/[id].tsx`, `mobile/src/api/customers.ts`, `mobile/src/api/payments.ts`
- Create: `mobile/src/app/(app)/customer/[id]/edit.tsx`
- Modify (if it doesn't already): `mobile/src/app/(app)/sale/new.tsx` — accept `?customerId=` and preselect that customer
- Test: `mobile/src/api/__tests__/customers.test.tsx`, `mobile/src/api/__tests__/payments.test.ts`

**Interfaces:**
- Consumes: `v_customer_summary`, `v_invoice_list` (filtered by `customer_id`), `findCustomerByPhone`, `validation.ts` phone/national-id validators, `Tile`, `DataTable`.
- Produces:
  - `useCustomerSummary(id)` → `CustomerSummary | null`.
  - `useCustomerPayments(customerId)` → `CustomerPayment[]` where `CustomerPayment = { id; receipt_no; received_at; amount; method; is_opening; lines: { contract_id; contract_no; amount; kind }[] }`, newest first (payment + `payment_line` + `contract(contract_no)`).
  - `paymentSpreadText(lines): string` → `"#41: 1,000.00 · #33: 1,000.00"`, or `"#41"` when one line.
  - `useUpdateCustomer()` mutation `{ id, name, phone, nationalId, address, notes }` → `customer.update`, invalidates `['customer', id]`, `['customer-summary']`, `['customers']`.
- [ ] **Step 1: Failing tests:** `paymentSpreadText` for one and two lines; `useUpdateCustomer` sends trimmed values and `null` for empty optional fields.
- [ ] **Step 2: Run** — FAIL.
- [ ] **Step 3: Implement.** File screen: breadcrumb (desktop) / back (phone); title = name + status chip, subtitle phone; actions تسجيل دفعة (primary, only when remaining > 0), واتساب (opens chat via existing `whatsappLink` with an empty message), كشف حساب (hidden until plan 5). Tiles: دفع لحد دلوقتي · الباقي عليه · متأخر عليه (terracotta) · القسط الجاي. Main column: الفواتير table (رقم · السلعة · النوع · الإجمالي · الباقي · الحالة → `/contract/[id]`) + "فاتورة جديدة ليه" (→ `/sale/new?customerId=`), سجل الدفعات table (التاريخ · المبلغ · الطريقة · اتوزعت على). Side column (desktop) / below (phone): البيانات (موبايل, رقم قومي, عنوان) + notes on `coinSoft` + "تعديل" → `/customer/[id]/edit`. Edit screen: fields الاسم, الموبايل, الرقم القومي, العنوان, ملاحظات; same validation as the invoice's inline customer; a phone that belongs to another customer shows "الرقم ده موجود بالفعل عند <name>" as a warning (save still allowed).
- [ ] **Step 4: Run tests + tsc** — PASS.
- [ ] **Step 5: Commit** `feat(mobile): customer file summary, payments log, edit details and notes`.

### Task 6: تفاصيل الفاتورة — v2 layout

**Files:**
- Modify: `mobile/src/app/(app)/contract/[id].tsx`
- Test: `mobile/src/app/(app)/contract/__tests__/detail.test.tsx` (new)

**Interfaces:**
- Consumes: `useContract(id)` (existing), `invoiceStatusChip`, `Tile`, `DataTable`, `Screen actions`.
- Produces: `installmentWindow(installments, today: string, size = 4)` in `mobile/src/api/payments.ts` → the slice starting at the last paid installment before the first open one (so the reader sees context), plus `hiddenCount`.
- [ ] **Step 1: Failing test:** `installmentWindow` on 24 installments with #1–#9 paid, today in #11's month → returns #9..#12, `hiddenCount: 20`; on all paid → last 4.
- [ ] **Step 2: Run** — FAIL.
- [ ] **Step 3: Implement** per Hi-Fi: crumb "الفواتير › #N"; title = product + status chip (+ "مستورد" chip when imported); subtitle "عقد #N · <customer link> · <sale date>"; actions تسجيل دفعة (primary, when open). Tiles الإجمالي · المدفوع (with progress bar, `brand` on `surfaceSunken`) · الباقي · متأخر. Main: الأقساط table (window + "عرض كل الأقساط (N)" toggle), الدفعات table (إيصال · التاريخ · المبلغ · الطريقة · تعديل when editable; keep opening/edited chips). Side: بيانات الفاتورة (رقم الفاتورة الخارجي, السعر, المقدم, الفايدة "15% سنوي · 2 سنين" from `interest_rate`/`num_installments`, أول قسط, الإجمالي بالفايدة). Print/WhatsApp/correct/cancel buttons are NOT added in this plan.
- [ ] **Step 4: Run tests + tsc** — PASS.
- [ ] **Step 5: Commit** `feat(mobile): invoice detail v2 layout`.

### Task 7: الرئيسية — tiles, quick actions, worklist table, recent activity

**Files:**
- Modify: `mobile/src/app/(app)/(tabs)/index.tsx`, `mobile/src/api/dashboard.ts`, `mobile/src/app/(app)/(tabs)/customers/index.tsx` (accept `?q=` to prefill search and `?pick=payment` so a row press goes to `/payment/new?customerId=` with the title "اختار العميل")
- Test: `mobile/src/api/__tests__/dashboard.test.ts`

**Interfaces:**
- Consumes: `v_recent_activity` (Task 1), `useCollectionsKpi`, `useWorklist`, `Tile`, `DataTable`.
- Produces: `useRecentActivity(limit = 10)`; `activityText(row): { title: string; sub: string }` — sale → `"فاتورة جديدة #52"` / `"<name> · <time>"`; payment → `"دفعة 2,000.00 ج.م"` / `"<name> · <time>"` (time as `h:mm ص|م`, Cairo).
- [ ] **Step 1: Failing tests:** `activityText` for both kinds incl. `10:42 ص` and `3:05 م` formatting; `useRecentActivity` orders by `at desc` and limits 10.
- [ ] **Step 2: Run** — FAIL.
- [ ] **Step 3: Implement:** header title + Cairo date subtitle ("الأحد 1 نوفمبر 2026"); quick actions: customer search (→ العملاء with the term), تسجيل دفعة (opens customer search first: navigate to `/customers?pick=payment`, where tapping a customer goes to `/payment/new?customerId=`), فاتورة جديدة on phone only (desktop has it in the sidebar). Tiles (3). Worklist: desktop table العميل (name + phone) · المتأخر · من · الحالة · (واتساب, تسجيل دفعة); phone keeps current cards. آخر العمليات card (icon dot per kind) — side column on desktop, below on phone; tap → contract. The التقارير button and follow-up controls come in plans 5 and 2.
- [ ] **Step 4: Run tests + tsc** — PASS.
- [ ] **Step 5: Commit** `feat(mobile): home v2 — quick actions, worklist table, recent activity`.

### Task 8: Verify on web and document

**Files:**
- Modify: `NOTAH.md` (screens + views section), `mobile/CLAUDE.md` (desktop rules: `useIsDesktop`, `DataTable`, contentMax)

- [ ] **Step 1:** `cd mobile && npx jest && npx tsc --noEmit && npx expo lint` — expected: all green.
- [ ] **Step 2:** Start the web dev server (`npx expo start --web`) via the preview tool; with a test account the user signs into, check at 1440 px and 390 px: sidebar ↔ tabs switch, each of the 5 screens matches the Hi-Fi structure, RTL order, no horizontal page scroll on phone. Screenshot both widths of العملاء and تفاصيل الفاتورة.
- [ ] **Step 3:** Update the docs (what each new view returns; the responsive rules).
- [ ] **Step 4: Commit** `docs: v2 shell and lists`. Do not deploy or push without the user's go-ahead.
