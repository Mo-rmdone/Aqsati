# Notah v2 — Plan 2 of 5: Follow-up (المتابعة) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn "مين لازم أكلمه النهارده" into a per-customer follow-up list with اتصلت / واتساب marks, a note with an optional promise date, smart ordering, and a سجل التواصل in the customer file.

**Architecture:** An append-only `contact_log` table (RLS, same role gate as `message_log`) records every contact. A new security-invoker view `v_followup` groups the current worklist per customer and joins today's contacts and the active promise, returning a `bucket` the client sorts by. The client writes contacts with idempotent inserts (client UUID); pressing WhatsApp writes a `whatsapp` contact before opening the chat.

**Tech Stack:** Supabase (Postgres, RLS, pgTAP via MCP `execute_sql`), Expo Router web + React Native Web, TanStack Query 5, Jest.

**Spec:** `docs/superpowers/specs/2026-11-01-notah-screens-requirements.md` §4, §6 (متابعة row), §7 (promise note, contacted today = Cairo day, WhatsApp placeholders = total overdue or next due). Visual reference: https://claude.ai/artifact/NCwdZo9cBsHYLyQJu2FkoV (Main.dc.html worklist, CustomerFile.dc.html سجل التواصل).

## Global Constraints

- Everything from plan 1's Global Constraints (`docs/superpowers/plans/2026-11-01-notah-v2-shell-and-lists.md`) still binds: theme tokens only; RTL `row`; text ≥ 16 on phone (15 only in desktop tables); `<Money>`; `<StatusChip>` (overdue terracotta); Egyptian Arabic, no "من فضلك"/"تم بنجاح"; `useIsDesktop()` for ≥ 1024; `todayISO()` / Cairo day everywhere; no tests under `mobile/src/app/`; SQL tests in `begin … rollback`.
- `contact_log` is append-only: no update/delete policies (a contact that happened stays a fact).
- Insert allowed for roles `owner, manager, accountant, collector` in the caller's tenant (mirror `message_log_insert`).
- "Contacted today" and "promise active" use the Cairo calendar day: `(now() at time zone 'Africa/Cairo')::date`.
- Ordering (top → bottom): bucket 0 = needs a call (no contact today, no active promise); bucket 1 = promised (promise_date > Cairo today); bucket 2 = contacted today. Inside a bucket: `days_late` desc, then `next_due_date` asc, then name.
- A promise whose date is today or past no longer counts (the customer returns to bucket 0 unless contacted today).
- WhatsApp reminder for a customer uses their total overdue amount; if nothing is overdue, the next due installment's amount and date.

## Review Focus

1. Customer contacted yesterday → back in bucket 0 today (Cairo day boundary at 22:00/21:00 UTC). (Task 1 test.)
2. Promise dated today → bucket 0, not 1. (Task 1 test.)
3. Double-tap on اتصلت / WhatsApp → one row, not two (idempotent client id). (Task 2 test.)
4. Customer with two overdue contracts appears once with the summed overdue amount. (Task 1 test.)
5. Another shop's contacts never appear in `v_followup` or the customer's سجل التواصل. (Task 1 test.)

---

### Task 1: `contact_log` table and `v_followup` view

**Files:**
- Create: `supabase/migrations/0023_followup.sql`, `supabase/tests/followup_test.sql`
- Modify: `mobile/src/lib/database.types.ts` (regenerate)

**Interfaces:**
- Produces:
  - `contact_log(id uuid pk, tenant_id uuid not null fk tenant, customer_id uuid not null fk customer, kind text not null check in ('call','whatsapp','note'), note text null (≤ 500 chars), promise_date date null, created_by uuid null fk profile default auth.uid(), created_at timestamptz not null default now())`; index `(tenant_id, customer_id, created_at desc)`. RLS: select = same tenant; insert = same tenant + role gate; `revoke all … from anon`. A `promise_date` is only allowed with kind `note` (check constraint).
  - `v_followup(tenant_id, customer_id, name, phone, overdue_amount numeric, overdue_count int, days_late int, next_due_date date, next_due_amount numeric, status text ('late'|'due'), contacted_today bool, last_contact_kind text, last_contact_at timestamptz, last_note text, promise_date date, bucket int)`. Rows: customers with at least one open installment (amount_due > amount_paid, contract not void) due on or before Cairo today + 7 days. `days_late` = Cairo today − oldest past-due due_date (0 if none past due); `status` = 'late' if overdue_count > 0 else 'due'. `promise_date` = latest non-null promise_date among the customer's notes if it is > Cairo today, else null. `last_*` = most recent contact_log row for the customer (any day).
- [ ] **Step 1: Write `supabase/tests/followup_test.sql`** (header from `supabase/tests/helpers.sql`; build data with `tests.as_new_owner`, `create_sale`, direct `update installment set due_date …`, inserts into `contact_log` with explicit `created_at`). Assertions:
  - insert as owner works; a `viewer`-role insert is rejected; update and delete are rejected (no policy → 0 rows affected or error).
  - `promise_date` with kind `call` violates the check.
  - customer with two late contracts → one `v_followup` row, `overdue_amount` = sum, `overdue_count` = 2.
  - no contact → `bucket = 0`; a `call` at Cairo-today 09:00 → `bucket = 2`, `contacted_today = true`; a `call` at Cairo-yesterday 23:30 (= 21:30 UTC in winter) → `bucket = 0`.
  - note with `promise_date = Cairo today + 3` → `bucket = 1`, `promise_date` set; with `promise_date = Cairo today` → `bucket = 0`, `promise_date` null.
  - `last_note` / `last_contact_kind` reflect the newest row.
  - customer whose only installment is due in 10 days → not in the view; due in 5 days → in it with `status = 'due'`, `days_late = 0`.
  - another shop sees 0 rows of shop A in `contact_log` and `v_followup`.
- [ ] **Step 2: Run via MCP `execute_sql`** — expected: fails (relations missing).
- [ ] **Step 3: Write `0023_followup.sql`** (`security_invoker` view, `revoke select on v_followup from anon`).
- [ ] **Step 4: Apply with MCP `apply_migration` (name `0023_followup`), re-run** — every line `ok`.
- [ ] **Step 5: Regenerate types; `cd mobile && npx tsc --noEmit`** — clean.
- [ ] **Step 6: Commit** `feat(db): contact_log + v_followup`.

### Task 2: Follow-up API and helpers

**Files:**
- Create: `mobile/src/api/followup.ts`, `mobile/src/lib/promise.ts`
- Modify: `mobile/src/lib/whatsapp.ts`
- Test: `mobile/src/api/__tests__/followup.test.ts`, `mobile/src/lib/__tests__/promise.test.ts`, `mobile/src/lib/__tests__/whatsapp.test.ts`

**Interfaces:**
- Consumes: `v_followup`, `contact_log` (Task 1); `todayISO()`; `newId()` or the existing id helper in `mobile/src/lib/ids.ts`.
- Produces:
  - `type FollowupRow = Tables<'v_followup'>`; `useFollowup()` → `FollowupRow[]` ordered `bucket asc, days_late desc, next_due_date asc, name asc` (server `.order` calls), key `['dashboard','followup']`.
  - `useLogContact()` mutation `{ id: string; customerId: string; kind: 'call' | 'whatsapp' | 'note'; note?: string; promiseDate?: string }` → upsert into `contact_log` `onConflict: 'id', ignoreDuplicates: true`; trims note, sends `null` for empty; invalidates `['dashboard']` and `['contacts', customerId]`.
  - `useCustomerContacts(customerId)` → newest first, limit 50, key `['contacts', customerId]`.
  - `promiseChoices(today: string): { label: string; date: string }[]` → بكره (+1), بعد 3 أيام (+3), بعد أسبوع (+7), أول الشهر الجاي (1st of next month) — ISO dates computed on the calendar, no time zone math.
  - `parseDayMonth(input: string, today: string): string | null` — accepts `d/m` or `d/m/yyyy` (Arabic-Indic digits allowed via `normalizeDigits`); `d/m` without year means the next occurrence on or after tomorrow; returns null for invalid dates (31/2) or dates not after today.
  - `followupReminder(row: FollowupRow, merchant: string): string` in `whatsapp.ts` — uses `overdue_amount` with "متأخر عليك" wording when `overdue_count > 0`, else `next_due_amount` + `formatDateAr(next_due_date)` with the existing reminder wording.
- [ ] **Step 1: Failing tests:** `promiseChoices('2026-11-30')` → `2026-12-01`, `2026-12-03`, `2026-12-07`, `2026-12-01`; `parseDayMonth('5/12','2026-11-30')` → `2026-12-05`; `parseDayMonth('٥/١٢','2026-11-30')` → `2026-12-05`; `parseDayMonth('1/11','2026-11-30')` → `2027-11-01`; `parseDayMonth('31/2', …)` → null; `parseDayMonth('30/11/2026','2026-11-30')` → null; `useLogContact` called twice with the same id issues two upserts with `ignoreDuplicates: true` and the same `id`; empty note → `note: null`; `followupReminder` overdue vs next-due wording and amounts.
- [ ] **Step 2: Run** `cd mobile && npx jest src/api/__tests__/followup.test.ts src/lib/__tests__/promise.test.ts src/lib/__tests__/whatsapp.test.ts` — FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run tests + `npx tsc --noEmit`** — PASS.
- [ ] **Step 5: Commit** `feat(mobile): follow-up API, promise dates, per-customer reminder`.

### Task 3: Home worklist → follow-up list

**Files:**
- Modify: `mobile/src/app/(app)/(tabs)/index.tsx`
- Create: `mobile/src/ui/ContactSheet.tsx`
- Test: `mobile/src/ui/__tests__/ContactSheet.test.tsx`

**Interfaces:**
- Consumes: `useFollowup`, `useLogContact`, `promiseChoices`, `parseDayMonth`, `followupReminder`, `whatsappLink`, `customerStatusChip`-style chip (late → متأخر/overdue, due → مستحق/due), `DataTable`, `useIsDesktop`.
- Produces: `<ContactSheet visible customerName onClose onSave={(v: { note: string; promiseDate?: string }) => void} today />` — RN `Modal` (transparent, centered card on desktop, bottom sheet on phone): title "ملاحظة على <name>", multiline note field (≤ 500), "وعد يدفع يوم" choice chips from `promiseChoices` + a text field "أو اكتب التاريخ (يوم/شهر)" validated with `parseDayMonth` (error "التاريخ مش صحيح"), buttons حفظ (primary) / رجوع. Save is disabled when note is empty and no promise is chosen.
- [ ] **Step 1: Failing tests (ContactSheet):** choosing "بعد 3 أيام" then حفظ calls `onSave({ note: '', promiseDate: <today+3> })`; typing `31/2` shows "التاريخ مش صحيح" and حفظ does nothing; empty note + no promise → حفظ disabled.
- [ ] **Step 2: Run** — FAIL.
- [ ] **Step 3: Implement** ContactSheet and the Home list. Section title "مين لازم أكلمه النهارده" + count of bucket 0 ("N محتاجين مكالمة"). Each customer row (desktop table: العميل (name + phone) · المتأخر (or القسط الجاي) · من (days) · الحالة · المتابعة; phone: card) has: اتصلت toggle-button (logs `call` once; after logging shows "✓ اتصلت" and is disabled), WhatsApp icon button (logs `whatsapp` with a fresh id, then opens `followupReminder` via `whatsappLink`; hidden when the link is null), ملاحظة button (opens ContactSheet; save logs `note`), تسجيل دفعة (as today). Rows in bucket 2 render dimmed (`inkMuted` text) with "✓ <اتصلت|واتساب> · <last_note>"; bucket 1 rows show "وعد يدفع <formatDateAr(promise_date)>". Each mutation uses a fresh `id` per press attempt kept in a ref until success (so a double press reuses it). Remove the old per-installment `WorkRow` and `useWorklist` usage from Home (keep `useWorklist` exported if other code uses it).
- [ ] **Step 4: Run tests + tsc** — PASS.
- [ ] **Step 5: Commit** `feat(mobile): home follow-up list with call/WhatsApp marks, notes and promises`.

### Task 4: سجل التواصل in the customer file

**Files:**
- Modify: `mobile/src/app/(app)/(tabs)/customers/[id].tsx`
- Test: `mobile/src/api/__tests__/followup.test.ts` (add `contactLine` cases)

**Interfaces:**
- Consumes: `useCustomerContacts`, `useLogContact`, `ContactSheet` (Task 3).
- Produces: `contactLine(c): { title: string; sub: string }` in `followup.ts` — call → "اتصلت", whatsapp → "واتساب", note → the note text (or "ملاحظة"); a promise adds " · وعد يدفع <formatDateAr(date)>"; `sub` = `formatDateAr(localDateISO(created_at)) · timeAr(created_at)`.
- [ ] **Step 1: Failing tests** for `contactLine` (all three kinds, with/without promise, empty note).
- [ ] **Step 2: Run** — FAIL.
- [ ] **Step 3: Implement** the card "سجل التواصل" (side column on desktop, after البيانات; below on phone): newest 10 with icon per kind (Phone, MessageCircle, StickyNote from Lucide) on a brandSoft dot, "عرض الكل" when more; empty state "لسه مفيش تواصل مسجّل"; buttons "اتصلت" and "ملاحظة" (opens ContactSheet) that log for this customer. The file's existing WhatsApp action also logs a `whatsapp` contact before opening the chat.
- [ ] **Step 4: Run tests + tsc** — PASS.
- [ ] **Step 5: Commit** `feat(mobile): contact log in the customer file`.

### Task 5: Checks and docs

**Files:**
- Modify: `NOTAH.md` (contact_log, v_followup, follow-up rules), `mobile/CLAUDE.md` only if a new rule emerged.

- [ ] **Step 1:** `cd mobile && npx jest && npx tsc --noEmit` — all green.
- [ ] **Step 2:** Update docs (table, view, ordering buckets, promise rule).
- [ ] **Step 3: Commit** `docs: follow-up`. No deploy or push without the user's go-ahead.
