# Notah v2 — Plan 4 of 5: Settings + WhatsApp account summary — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the owner a real الإعدادات screen (shop data + logo, installment defaults, WhatsApp reminder template, change password) and, after recording a payment, a one-tap "ابعت كشف حسابه على واتساب".

**Architecture:** New `tenant` columns hold shop data, defaults and the template. They are written only through one security-definer RPC (`update_shop_settings`, owner only); `tenant` keeps its select-only RLS. The logo lives in a private `shop-logos` storage bucket under `<tenant_id>/…`, scoped by storage RLS and shown via signed URLs. The client reads settings with one React Query hook. Reminder and account-summary messages are pure functions in `lib/whatsapp.ts` / `lib/template.ts`.

**Tech Stack:** Expo SDK 58 + Expo Router (web), React Native Web, TanStack Query 5, Supabase (Postgres, RLS, Storage, Auth), pgTAP via MCP `execute_sql` in `begin … rollback`, Jest + Testing Library.

**Spec:** `docs/superpowers/specs/2026-11-01-notah-screens-requirements.md` §3.6 (defaults), §3.7 (account summary), §3.9 (settings), §7 ("Settings defaults affect new invoices only. Shop logo is uploaded to a private storage bucket (RLS per shop)", WhatsApp placeholder rule). Visual reference: approved Hi-Fi https://claude.ai/artifact/NCwdZo9cBsHYLyQJu2FkoV (الإعدادات frame).

## Global Constraints

- Everything from plan 1's Global Constraints still holds: theme tokens only, RTL, tap ≥ 48 / inputs 56, text ≥ 16 on phone, `formatEGP`, Egyptian Arabic copy (no "من فضلك", no "تم بنجاح"), `useIsDesktop` ≥ 1024, Cairo day via `todayISO()`.
- No tests under `mobile/src/app/`.
- On web, open external links (wa.me) **synchronously** in the press handler — never after an `await` (popup blockers). Any data a link needs is loaded before the button is enabled.
- DB: new functions `security definer`, `set search_path = ''`, revoke from `public`/`anon`, grant to `authenticated`. Never write non-rolled-back data to the live project from automation; pgTAP runs in `begin … rollback` with `tests.as_new_owner`.
- Never read, print or store a password beyond the single auth call that uses it.
- Settings defaults affect **new invoices only**; voice/URL prefill still wins over defaults.
- Commits end with a blank line + `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. A template with a placeholder that appears twice, or an unknown `{شيء}` → every known placeholder replaced everywhere; unknown text left as typed. (Task 2 test.)
2. Empty/whitespace template saved → reminders fall back to the built-in default message, never an empty WhatsApp message. (Task 1 SQL test: stored as null; Task 2 test.)
3. Customer with no valid Egyptian mobile → the summary button is hidden (same rule as `whatsappLink`), not a broken link. (Task 6 test.)
4. Wrong current password on change-password → "كلمة المرور الحالية غلط" and the password is **not** changed. (Task 4 test.)
5. A non-owner profile (or another shop) calling `update_shop_settings` or writing into another shop's logo folder → rejected. (Task 1 SQL tests.)

---

### Task 1: Database — shop settings columns, RPC, logo bucket

**Files:**
- Create: `supabase/migrations/0028_shop_settings.sql`
- Create: `supabase/tests/shop_settings_test.sql`
- Modify: `mobile/src/lib/database.types.ts` (regenerate)

**Interfaces — Produces:**
- `tenant` new nullable columns: `address text` (≤ 200), `phone text` (≤ 20), `logo_path text`, `default_rate numeric(6,2)` (0–200), `default_years int` (1–5), `whatsapp_template text` (≤ 500). Check constraints for each bound.
- `public.update_shop_settings(p_name text, p_address text, p_phone text, p_default_rate numeric, p_default_years int, p_whatsapp_template text) returns void` — updates the caller's tenant (`current_tenant_id()`); raises `42501` unless `current_role() = 'owner'`; `p_name` trimmed and required (1–80 chars, else `22023`); other text args trimmed, empty → null; writes an `audit_log` row (`entity_type 'tenant'`, `action 'settings'`, before/after json) like existing audited RPCs.
- `public.set_shop_logo(p_path text) returns void` — owner only; `p_path` must be null or start with `current_tenant_id()::text || '/'` (else `22023`); sets `logo_path`.
- Storage bucket `shop-logos`: `public = false`, `file_size_limit = 1048576`, `allowed_mime_types = {image/png,image/jpeg,image/webp}`. Policies on `storage.objects` for `authenticated` (select/insert/update/delete): `bucket_id = 'shop-logos' and (storage.foldername(name))[1] = public.current_tenant_id()::text`; insert/update/delete additionally require `public.current_role() = 'owner'`.

- [ ] **Step 1: Write the failing pgTAP test** (`supabase/tests/shop_settings_test.sql`, same style as `voice_usage_test.sql`): owner updates all fields → row matches; `'  '` template → null; rate 250 → check violation; years 0 → violation; empty name → `22023`; second owner (another tenant via `tests.as_new_owner`) cannot change the first tenant (row unchanged); a profile with role `viewer` → `42501`; `set_shop_logo('other-uuid/logo.png')` → `22023`; storage policy: inserting into `storage.objects` with another tenant's folder fails under RLS; anon cannot execute either function; audit row written.
- [ ] **Step 2:** Run it via MCP `execute_sql` inside `begin … rollback` → fails (functions missing).
- [ ] **Step 3:** Write `0028_shop_settings.sql`; apply with MCP `apply_migration`.
- [ ] **Step 4:** Re-run the test → all pass. Run `get_advisors` (security) → no new warnings for these objects.
- [ ] **Step 5:** Regenerate `database.types.ts` (MCP `generate_typescript_types`); `npx tsc --noEmit` green.
- [ ] **Step 6: Commit** `feat(db): shop settings, update_shop_settings, private logo bucket`.

### Task 2: Settings API, template rendering, reminder uses the template

**Files:**
- Create: `mobile/src/api/settings.ts`, `mobile/src/lib/template.ts`
- Modify: `mobile/src/lib/whatsapp.ts`, `mobile/src/app/(app)/(tabs)/index.tsx` (pass the template), `mobile/src/lib/auth.tsx` (refresh `shopName` after rename)
- Test: `mobile/src/lib/__tests__/template.test.ts`, `mobile/src/api/__tests__/settings.test.ts`, extend `mobile/src/lib/__tests__/whatsapp.test.ts` (create if missing)

**Interfaces — Produces:**
- `type ShopSettings = { name: string; address: string | null; phone: string | null; logoPath: string | null; defaultRate: number | null; defaultYears: number | null; whatsappTemplate: string | null }`
- `useShopSettings(): UseQueryResult<ShopSettings>` — key `['shopSettings', tenantId]`, selects from `tenant` by `profile.tenant_id`.
- `useUpdateShopSettings()` — mutation calling `update_shop_settings`; on success invalidates `['shopSettings']` and calls a new `refreshShopName()` exposed by `useAuth()`.
- `uploadShopLogo(tenantId: string, file: Blob, mime: string): Promise<string>` — uploads to `shop-logos/<tenantId>/logo-<timestamp>.<ext>` (`upsert: false`), then `set_shop_logo`, then removes the previous object (best effort); returns the new path. `removeShopLogo(tenantId, path)` → `set_shop_logo(null)` then remove.
- `useLogoUrl(path: string | null)` — signed URL (`createSignedUrl(path, 3600)`), key `['logoUrl', path]`, `staleTime` 50 min.
- `lib/template.ts`: `DEFAULT_TEMPLATE` (the current reminder copy expressed with placeholders: `أهلاً {العميل} 👋\nتذكير بقسط بمبلغ {المبلغ} مستحق بتاريخ {التاريخ}.\nبرجاء السداد في أقرب وقت. شكراً لتعاملك معنا — {المحل}`), `PLACEHOLDERS = ['{العميل}','{المبلغ}','{التاريخ}','{المحل}']`, `renderTemplate(template: string | null, vars: { customer: string; amount: number; date: string | null; shop: string }): string` — null/blank → `DEFAULT_TEMPLATE`; amount via `formatEGP`; date via `formatDateAr`, missing date → `'—'`.
- `followupReminder(row, merchant, template?: string | null)` — amount = overdue total if anything is overdue, else the next due amount (spec §7); date = Cairo today when overdue, else `next_due_date`. When `template` is null/blank the output equals today's messages exactly (keep the overdue wording `متأخر عليك …` for the default case).

- [ ] **Step 1:** Failing tests: `renderTemplate` replaces repeated placeholders, leaves `{شيء}` untouched, blank → default, money formatted `1,234.50 ج.م`; `followupReminder` with no template == current outputs (snapshot the two existing cases); with a template uses overdue total; `useShopSettings` maps snake_case → camelCase (mock supabase as in `customers.test.tsx`).
- [ ] **Step 2:** Run `npx jest template whatsapp settings` → fail.
- [ ] **Step 3:** Implement; Home passes `settings.data?.whatsappTemplate` to `followupReminder`.
- [ ] **Step 4:** Tests pass; `npx tsc --noEmit` green.
- [ ] **Step 5: Commit** `feat(mobile): shop settings api and WhatsApp template rendering`.

### Task 3: الإعدادات screen — shop data, logo, defaults, template

**Files:**
- Modify: `mobile/src/app/(app)/(tabs)/settings.tsx`
- Create: `mobile/src/ui/SettingsSection.tsx` (titled card used by every section)
- Create: `mobile/src/lib/settingsForm.ts` (pure validation + diff) and `mobile/src/lib/__tests__/settingsForm.test.ts`

**Interfaces:**
- Consumes: Task 2 hooks.
- `validateSettings(f: SettingsForm): Partial<Record<keyof SettingsForm, string>>` — name required (≤ 80) "اكتب اسم المحل"; phone optional, digits after `normalizeDigits`, ≤ 20; rate empty or 0–200 "النسبة من 0 لـ 200"; template ≤ 500 "الرسالة طويلة (500 حرف بالكتير)".

**Layout** (match the Hi-Fi; phone = one column 480; desktop = centered 720 column, sections stacked):
1. **بيانات المحل:** logo preview (64, rounded) + "غيّر اللوجو" / "شيل اللوجو" (web file picker like `import.tsx` `pickFile`, `accept="image/png,image/jpeg,image/webp"`; > 1 MB → "الصورة كبيرة، اختار صورة أقل من 1 ميجا" before upload); fields الاسم, العنوان, التليفون. Helper text "بيظهروا على الإيصالات والكشوف".
2. **إعدادات التقسيط:** الفايدة الافتراضية % (numeric), المدة الافتراضية chips 1–5 سنين (same chip component as sale/new) + "بدون" to clear. Helper "بتتطبق على الفواتير الجديدة بس".
3. **رسالة الواتساب:** multiline field prefilled with the stored template or `DEFAULT_TEMPLATE`; placeholder chips (tap inserts at the end); live preview rendered with sample data (`سيد`, 1500, today, shop name); "رجّع الرسالة الأصلية" resets to default (saved as null).
4. **الحساب:** المستخدم name, "غيّر كلمة المرور" (→ `/settings/password`, Task 4), تسجيل الخروج.

One "حفظ" button for sections 1–3 (disabled until something changed); success → inline "اتحفظ" for 3 s; error → `colors.error` text "ماتحفظش، جرّب تاني". Non-owner roles see the values read-only (no save button).

- [ ] **Step 1:** Failing `settingsForm` tests (each rule above, template equal to default → saved as null, unchanged form → no diff).
- [ ] **Step 2:** Implement `settingsForm.ts`; tests pass.
- [ ] **Step 3:** Build the screen and `SettingsSection`; add a render test in `mobile/src/ui/__tests__/SettingsSection.test.tsx` (title + children).
- [ ] **Step 4:** `npx jest` + `npx tsc --noEmit` green.
- [ ] **Step 5: Commit** `feat(mobile): settings screen with shop data, logo, defaults and template`.

### Task 4: Change password

**Files:**
- Create: `mobile/src/app/(app)/settings/password.tsx`
- Create: `mobile/src/lib/password.ts`, test `mobile/src/lib/__tests__/password.test.ts`
- Modify: `mobile/src/app/(app)/_layout.tsx` only if the stack needs the route registered

**Interfaces:**
- `changePassword(email: string, current: string, next: string): Promise<'ok' | 'wrong_current' | 'weak' | 'same' | 'failed'>` — `next === current` → `'same'` (no calls); `next.length < 6` → `'weak'` (same rule as signup); `signInWithPassword({ email, password: current })` error → `'wrong_current'` (stop); `auth.updateUser({ password: next })` error mapped with `authErrors` (`weak_password` → `'weak'`), else `'failed'`.
- Screen: three fields (الحالية, الجديدة, تأكيد الجديدة; `secureTextEntry`, `autoComplete` current-password / new-password); mismatch → "الكلمتين مش زي بعض"; messages: wrong_current "كلمة المرور الحالية غلط", weak "كلمة المرور ضعيفة (6 حروف على الأقل)", same "اختار كلمة مختلفة عن الحالية", failed "ماتغيرتش، جرّب تاني"; ok → back to الإعدادات with "اتغيّرت كلمة المرور".

- [ ] **Step 1:** Failing tests for every branch, asserting `updateUser` is **not** called on `wrong_current`/`same`/`weak`.
- [ ] **Step 2:** Implement; tests pass; tsc green.
- [ ] **Step 3: Commit** `feat(mobile): change password`.

### Task 5: New invoice uses the settings defaults

**Files:**
- Modify: `mobile/src/app/(app)/sale/new.tsx`
- Create: `mobile/src/lib/saleDefaults.ts`, test `mobile/src/lib/__tests__/saleDefaults.test.ts`

**Interfaces:**
- `initialRateYears(prefill: { rate?: string; years?: number }, settings: { defaultRate: number | null; defaultYears: number | null } | undefined): { rate: string; years: number }` — prefill wins per field; else settings; else `''` / `1`.
- The form seeds rate/years **once** when settings first arrive and the user hasn't touched those fields (a ref flag); later settings refetches never overwrite typed values.

- [ ] **Step 1:** Failing tests: prefill wins; settings used; nulls → `''`/1; rate `0` stays `'0'`.
- [ ] **Step 2:** Implement and wire; tests + tsc green.
- [ ] **Step 3: Commit** `feat(mobile): new invoice starts from the shop's default rate and years`.

### Task 6: After a payment — "ابعت كشف حسابه على واتساب"

**Files:**
- Modify: `mobile/src/app/(app)/payment/new.tsx`
- Modify: `mobile/src/lib/whatsapp.ts` (add `accountSummaryMessage`)
- Create: `mobile/src/ui/PaymentDone.tsx`, test `mobile/src/ui/__tests__/PaymentDone.test.tsx`
- Test: extend `mobile/src/lib/__tests__/whatsapp.test.ts`

**Interfaces:**
- `accountSummaryMessage(p: { customer: string; paidNow: number; totalPaid: number; invoices: { title: string; remaining: number }[]; shop: string }): string` —
  ```
  أهلاً {customer} 👋
  استلمنا منك النهارده {paidNow}.
  إجمالي اللي دفعته: {totalPaid}
  الباقي:
  • {title}: {remaining}        (one line per invoice with remaining > 0)
  شكراً لتعاملك معنا — {shop}
  ```
  When nothing remains: replace the الباقي block with `خلّصت كل أقساطك 🎉`.
- `PaymentDone({ customerId, paidNow, onDone })`: after save the screen shows this instead of navigating away. It loads `v_customer_summary` (name, phone, paid_total) and `useCustomerContracts(customerId)` (refetched after invalidation) — title = `product_desc` or `فاتورة {contract_no}`. Shows "اتسجلت الدفعة: {paidNow}", the primary "ابعت كشف حسابه على واتساب" (disabled with spinner until data loads; hidden when `whatsappLink` returns null, with "رقم العميل مش موبايل مصري" helper), and secondary "تمام" → the old navigation target. Press opens the link synchronously (`Linking.openURL` / `window.open` like Home's WhatsApp button) and records a `contact_log` whatsapp entry the same way Home does (reuse its hook from `api/followup.ts`).
- `payment/new.tsx`: `onSubmit` stores `paidNow` (sum of lines) in state instead of `router.replace`.

- [ ] **Step 1:** Failing tests: message with two invoices (one at 0 omitted), all-paid variant, money format; `PaymentDone` shows disabled button while loading, hides it for a non-Egyptian phone, "تمام" calls `onDone`, pressing send calls the opener synchronously with a `https://wa.me/20…` URL.
- [ ] **Step 2:** Implement; `npx jest` + tsc green.
- [ ] **Step 3: Commit** `feat(mobile): send account summary on WhatsApp after a payment`.

### Task 7: Docs

**Files:** `NOTAH.md` (tenant columns, `update_shop_settings`, `set_shop_logo`, `shop-logos` bucket, settings screen, account summary), `mobile/CLAUDE.md` only if a new rule emerged.

- [ ] **Step 1:** Update docs; commit `docs: settings and WhatsApp account summary`.

---

## Self-review notes

- Spec coverage: §3.9.1 → Tasks 1–3; §3.9.2 → Tasks 1, 3, 5; §3.9.3 → Tasks 1–3; §3.9.4 → Tasks 3–4; §3.7 summary → Task 6; §7 private bucket/RLS → Task 1; defaults new-invoices-only → Task 5. Printing the logo is plan 5 (it consumes `useLogoUrl`).
- Ruling: `tenant` gets no UPDATE policy; writes go through owner-checked RPCs so the anon/authenticated table grants stay harmless.
- Ruling: the reminder `{التاريخ}` for an overdue customer is today's date (the message is about the total overdue now), for a not-yet-late customer the next due date.
