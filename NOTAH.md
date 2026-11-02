# نوتة | Notah — Project Documentation

> **For any AI model or developer joining this project:** read this file first. It describes what Notah is, what is built, how it works, the rules that must not be broken, and what is left to do. Last updated: 2026-10-31.

---

## 1. What Notah is

**Notah (نوتة)** replaces the paper ledger ("الدفتر" / "النوتة") that Egyptian shop owners use to track **installment sales** (تقسيط): fridges, washing machines, stoves, electronics sold on monthly payments.

The owner records every sale as an invoice (cash or installment). Notah calculates the monthly installment, builds the schedule, tracks payments, shows who is late, and sends WhatsApp reminders.

- **User:** the shop owner only (one user per shop for now). Egyptian, 30–60 years old, not tech-savvy, phone-first (most have no computer).
- **Language:** Arabic only, right-to-left, Egyptian dialect (عامية) in the UI.
- **Currency:** EGP, shown as `1,234.50 ج.م` with Latin digits and two decimals.
- **Key moment:** a customer stands in the shop paying this month's installment — the owner must find them, record the payment and be *sure* it was saved, in under 20 seconds.

**Live app:** https://notah.mohamedramadan.workers.dev (web; works in a phone browser).
**Repository:** github.com/Mo-rmdone/Aqsati (branch `main`).

---

## 2. Status at a glance

| Area | Status |
|---|---|
| Phase 1 core (web) | ✅ Built, reviewed, deployed |
| Brand identity + design system | ✅ Applied (tokens, font, icons, logo, app icon) |
| Customer created inside the invoice | ✅ Done |
| End-to-end acceptance by the owner (signed in) | ⏳ Not yet run — see §9 |
| Screen designs from Claude Design | ⏳ Not received yet |
| Phase 2: Android/iOS app + offline | ⏳ Not started |
| Follow-up (home list, call/WhatsApp/note + promise, contact log in the customer file) | ✅ Built (migrations 0023–0025 applied; app pending deploy) |
| Excel import (customers + running contracts + paid months) | ✅ Built (pending deploy) |
| Voice assistant (Home mic, Haiku intents, $3/month cap) | ✅ Built (needs the `ANTHROPIC_API_KEY` secret; see §4.5) |
| ID-card OCR | ⏳ Not started |
| Landing page | ⏳ Not started |
| Islamic-finance (Shariah) review of pricing | ⏳ Pending, external |

---

## 3. Product rules (agreed with the owner — do not change without asking)

### 3.1 Sales / invoices
- **Every sale is an invoice (فاتورة)**, either **كاش** (cash) or **تقسيط** (installment). Internally each invoice is a `contract` row with `sale_type`.
- An invoice has: product name, price, optional **external invoice number** (from a paper invoice or a cashier system), and an automatic **contract number** per shop (1, 2, 3…).
- **One customer can have many independent invoices** (fridge, washer, stove — each its own contract).
- **The customer is created inside the new-invoice form** ("عميل جديد"); there is no separate "add customer" step. The customers list shows only customers who have at least one invoice.

### 3.2 Installment math (method "A", flat, once on the whole contract)
```
financed  = price − down_payment
interest  = round(financed × rate, 2)          // rate entered as percent: 30 → 0.30
total     = financed + interest
n         = years × 12                          // years: 1–5
monthly   = round(total / n, 2)
last      = total − monthly × (n − 1)           // last installment absorbs rounding
due(i)    = sale_date + i months                // first installment one month after the sale
```
- Month-end clamps (Jan 31 → Feb 28/29).
- Rounding is **half away from zero** (Postgres `round`). The client preview works in integer piasters and must match the server to the piaster.
- **Example:** price 25,000, down 10,000, 30%, 2 years, sale 2026-11-01 → financed 15,000, total 19,500, **812.50 × 24**, first due 2026-12-01.
- Amount and rate inputs accept at most 2 decimals; Arabic-Indic digits (٠–٩) are normalized.

### 3.3 Payments
- The **down payment** is a real payment recorded at sale time; a **cash sale** is recorded with one payment for the full price. Both count in "collected this month".
- A payment can be **split across several of the customer's contracts**, chosen by the owner (e.g. 2,000 → 1,000 fridge + 1,000 washer). If the customer has one open contract, the amount goes to it automatically.
- Inside a contract, money goes to the **oldest due installment first**.
- **Paying more than a contract's remaining balance is rejected.** There is **no customer credit balance**.
- **Payments can be edited, never deleted** (change amount and/or distribution, including moving it to another contract). Every edit is audited (before/after) and the payment shows "اتعدّلت". Down-payment and cash-sale payments are not editable from the payment screen.
- **No late fees** until the Shariah review decides.

### 3.4 Customers
- Name and phone required. Phone must be an Egyptian mobile: `^01[0125][0-9]{8}$`. National ID optional; if given `^[23][0-9]{13}$`.
- A duplicate phone in the same shop is a **warning, not a block** ("use the existing customer, or it's someone else").

### 3.4b Follow-up (v2)
Home lists customers with something due within 7 days or overdue (`v_followup`) in buckets: 0 needs a call, 1 promised (latest `promise_date` after the Cairo today), 2 contacted today (a call or WhatsApp on the Cairo day; a note alone is not a contact). Contacts are written to `contact_log` by `useLogContact`; the client never sends `created_at`/`created_by`. WhatsApp opens synchronously in the press handler and logs in parallel; "اتصلت" is one-way (no undo). `promise_date` is only valid on notes. Last contact ties break by newest `created_at`.

### 3.5 Never break these (anti-goals)
- Any money error: wrong installment, a payment saved twice, a payment silently lost.
- One shop seeing another shop's data.
- The owner not knowing whether something was saved.
- The app being slower or harder than the paper ledger.

### 3.6 Excel import
- **One row = one running installment contract** (customer + product + schedule + paid months). Columns (Arabic headers): اسم العميل، الموبايل، الرقم القومي، العنوان، السلعة، المبلغ الكلي، المقدم، القسط الشهري، عدد الشهور المدفوعة، أول شهر اتدفع، آخر شهر اتدفع، رقم الفاتورة. A downloadable template is provided.
- **المبلغ الكلي = total price including interest.** Remaining = total − down. Installment count = `ceil(remaining / monthly)`; the last installment absorbs the remainder.
- First due = "أول شهر اتدفع" (month only → day 1). Paid months are recorded as **one editable payment** marked "رصيد افتتاحي" (opening balance, oldest installments first).
- The imported down payment and the opening balance are **excluded from "collected this month"**.
- **Re-upload safety:** the duplicate check is against previously imported contracts only (not manually created ones): a row whose phone + product + total + first month already exists is skipped by default (can be overridden per row). Identical rows inside the same file get a warning.
- **Same phone = same customer:** an existing customer is reused untouched (never overwritten).
- Files: .xlsx or .csv. CSV must be UTF-8 (BOM optional); dates in CSV are read as day/month/year. Limits: max 500 rows, 5 MB. The user sees a **preview with inline edit** before saving. Saving is row-by-row and retry-safe (client UUID per row); failures are listed and can be retried.

---

## 4. Architecture

```
mobile/      Expo (React Native) app — the ONLY frontend. Web build is deployed now;
             the same code becomes the Android/iOS app in Phase 2.
supabase/    Postgres schema, RLS, money logic (RPCs), pgTAP tests.
worker/      Cloudflare Worker "aqsati-cron": daily keepalive ping so the free
             Supabase project doesn't pause.
docs/        Specs, plans, brand, design system, this project's history.
```

### 4.1 Stack
- **Frontend:** Expo SDK 58, Expo Router (typed routes), TypeScript, React Native 0.88, react-native-web, `@tanstack/react-query`, `@supabase/supabase-js`, `lucide-react-native` icons, IBM Plex Sans Arabic (`@expo-google-fonts/ibm-plex-sans-arabic`). Tests: jest-expo.
- **Backend:** Supabase (Postgres 17) — project ref `vvwhhcndctsumamtqhsz`, region eu-central-1, free tier. Auth = Supabase email/password. All money logic in SQL functions; the client never computes saved money.
- **Hosting:** Cloudflare Workers Static Assets — worker `notah` (web app), worker `aqsati-cron` (keepalive). Account subdomain `mohamedramadan.workers.dev`.
- **Scheduled jobs:** `pg_cron` job `flip-overdue` at 01:00 UTC (03:00 Cairo) marks past-due installments `overdue`.

### 4.2 Data model (main tables)
| Table | Purpose |
|---|---|
| `tenant` | A shop. |
| `profile` | User ↔ shop, role (`owner` now; manager/accountant/collector/viewer supported in DB). |
| `customer` | Shop's customers. `notes` (free text, v2). |
| `contract` | An invoice. `sale_type` cash/installment, `contract_no` per shop, `external_invoice_no`, price, down payment, rate, `num_installments`, `start_date`. `interest_method` includes `'imported'` (explicit schedule, any installment count ≥ 1). |
| `installment` | Schedule rows: `seq_no`, `due_date`, `amount_due`, `amount_paid`, `status` (pending/partial/paid/overdue). |
| `payment` | A receipt: `receipt_no` per shop, amount, method (cash/instapay/fawry/wallet/card/bank), `received_at`, `edited_at`, `is_opening` (money from before Notah; excluded from "collected this month"). |
| `payment_line` | The owner's split of a payment per contract (`kind` down_payment/cash/installment). |
| `payment_allocation` | Per-installment detail of where money went. |
| `contact_log` | Follow-up log (v2, `0023`–`0025`): `kind` call/whatsapp/note, `note` (≤500), `promise_date` (notes only), `created_by`, `created_at`. Insert-only for the app (no update/delete); the insert policy pins `created_by = auth.uid()`, `created_at` within −5/+1 min of now, and the customer must be visible under RLS. |
| `audit_log` | Every change (triggers) + explicit `payment_edit` rows. |
| `credit_invoice` | Legacy آجل invoices — **not used in v1**. |

Views (all `security_invoker`, RLS-scoped): `v_contract_balance` (paid/remaining per contract), `v_collections_kpi` (home tiles), `v_worklist` ("who to call today"), `v_aging`, `v_installment_aging`, `v_followup` (home follow-up list, see §3.4b).

v2 list views (migration `0021_v2_lists.sql`, `security_invoker`, anon revoked; void contracts excluded; past-due is computed from `due_date < Cairo today` and unpaid, not from the nightly flag):
- `v_invoice_list` — one row per non-void contract: contract_no, external_invoice_no, customer name/phone, product, sale_type, `sale_date`, `total_payable`, `paid`, `remaining`, `overdue_count`, `next_due_date`, `status` (`settled` / `late` / `open` / `unknown`).
- `v_customer_summary` — one row per customer with at least one non-void contract: `invoice_count`, `paid_total`, `remaining_total`, `overdue_amount`, `overdue_count`, `max_overdue_per_contract`, `next_due_date`/`next_due_amount`, `paid_this_month`, `late_this_month`, `has_unknown`, `status` (`late_many` / `late` / `unknown` / `regular` / `done`).
- `v_recent_activity` — sales and non-opening payments, newest first: `at`, `kind` (`sale` / `payment`), customer, contract, `amount`.

### 4.3 Server functions (RPCs) — the only way money is written
| Function | What it does |
|---|---|
| `signup_tenant(p_tenant_name, p_full_name)` | Creates the shop + owner profile after signup. |
| `create_sale(p jsonb)` | Creates an invoice: contract, schedule, down-payment/cash payment. Idempotent on client `id`. Rejects future sale dates (Cairo date). |
| `import_contract(p jsonb)` | Imports one running contract. Keys: `id` (client uuid), `customer_id`, `product_desc`, `total_price` (incl. interest), `down_payment`, `monthly`, `first_due` (date), `paid_months`, `external_invoice_no`. Checks: down < total; 0 < monthly ≤ remaining; first due ≤ Cairo today + 1 month; ≤ 600 installments; paid_months ≤ count. Builds the schedule (last absorbs remainder), down payment and one opening-balance payment (`is_opening`). Idempotent on `id`. |
| `record_payment(p_id, p_customer, p_method, p_lines jsonb)` | One receipt split across contracts; validates ownership, rejects overpayment; idempotent on `p_id`. |
| `update_payment(p_id, p_method, p_lines jsonb)` | Edits a payment: reverses its allocations, re-validates, re-allocates, audits. |
| `build_schedule(...)`, `allocate_payment(...)` | Internal money math. |
| `flip_overdue()` | Nightly status update (pg_cron). |

**Idempotency:** every client write carries a client-generated UUID. Re-sending it is a no-op returning the same id (advisory lock + exists check). A pure retry reuses the id; any edit to the form after a failed attempt gets a new id (`mobile/src/lib/attempt.ts`).

**Security:** RLS on every table, tenant-scoped. Security-definer functions use `set search_path = ''`, check that every passed id belongs to the caller's shop, and internal helpers are revoked from `anon`/`authenticated`. Only the public anon key is in the client. Query cache is cleared on sign-out / user change.

### 4.4 App screens (routes in `mobile/src/app`)
| Route | Screen |
|---|---|
| `/login`, `/signup` | Sign in / create shop. |
| `/` (tab) | Home (v2: quick actions, worklist table, recent activity from `v_recent_activity`): tiles (مستحق الأسبوع ده، المحصّل الشهر ده، إجمالي المتأخرات) + "مين لازم أكلمه النهارده" with WhatsApp + record payment. |
| `/customers` (tab) | Customers (from `v_customer_summary`): search, status filter chips, `?q` param (see `lib/customersParams.ts`). Table on desktop, rows on phone. |
| `/invoices` (tab) | All invoices (from `v_invoice_list`) with filter chips; table on desktop, rows on phone. |
| `/customers/[id]` | Customer file: details, notes, invoices, payments, new invoice, record payment. |
| `/customer/[id]/edit` | Edit customer name, phone and notes. |
| `/sale/new` (center "+ فاتورة") | New invoice with customer search or **عميل جديد**, cash/installment, live preview (monthly installment is the hero number). |
| `/contract/[id]` | Contract: balance, installment table, payments, edit. |
| `/payment/new`, `/payment/[id]/edit` | Record / edit a split payment. |
| `/import` | Excel import: pick file, preview/edit rows, save row-by-row. |
| `/settings` (tab) | Shop name, sign out. |

**Responsive shell (v2):** at width ≥ 1024 (`useIsDesktop()` in `mobile/src/ui/layout.ts`) the bottom tabs are replaced by a right-hand `Sidebar`; content is capped at `size.contentMax` (1200). Lists use `DataTable` on desktop and rows on phone; `Screen actions` render on desktop only. Shared pieces: `ui/Tile`, `ui/DataTable`, `ui/FilterChips`, `lib/status.ts` (status chips), `api/invoices.ts`. Dates use Cairo day helpers in `lib/date.ts` (`todayISO`, `headerDateAr`, `timeAr`).

Forms (`sale/new`, `payment/*`, `contract/*`) live in a Stack above the tabs so they unmount when closed and never carry state into the next sale.

### 4.5 Voice assistant (v1)
Mic button on Home (`ui/VoicePanel.tsx`). The owner speaks Egyptian Arabic; the app answers or opens a pre-filled form. **It never saves anything by voice** — money actions only open the form for the owner to confirm.

**Flow:** `lib/speech.ts` (browser Web Speech, `ar-EG`, one absolute mic deadline, cancellable `speak`) → transcript shown and editable → `useVoiceIntent` (`api/voice.ts`) calls Edge Function `voice-intent` → validated intent → `lib/voice/resolve.ts` (`resolveIntent`) looks up customers/invoices via `useVoiceData` (normal RLS-scoped reads) → outcome: navigate (prefill params, `lib/prefill.ts`), answer text (shown and spoken), pick-a-customer / pick-an-invoice list, or a message. Stale results are dropped with a run counter.

**Intents** (whitelist in `supabase/functions/voice-intent/logic.ts`, `validateIntent`): `record_payment`, `create_invoice`, `ask_balance`, `ask_late`, `ask_totals` (today|month), `ask_invoice`, `open` (customer|invoice|customers|invoices|home), `unknown`. Anything else or malformed becomes `unknown`.

**Edge Function `voice-intent`** (`verify_jwt`): Claude Haiku 5.5, forced `intent` tool call, 15 s timeout, text max 300 chars. Errors: 400 `bad_request`/`too_long`, 401 `unauthorized`, 402 `budget_exceeded`, 503 `not_configured` (no `ANTHROPIC_API_KEY`) or `ai_unavailable`. The key is a Supabase Edge Function secret; owner steps are in `docs/voice-assistant-setup.md`.

**Budget design:** table `voice_usage(tenant_id, month, cost_usd, calls, tokens)`, month in Cairo time. `voice_reserve(p_cap_usd, p_charge_usd)` runs *before* the AI call: it locks the month row, checks the role (owner/manager/accountant/collector) and adds the **worst-case** cost (4,000 input + 400 output tokens, about $0.0006) only if the total stays within the cap ($3 per shop per month, `CAP_USD`); otherwise it returns false and the function answers 402. `voice_record(p_input, p_output)` only stores token counts for reporting. So a slow or failed call can never push spending past the cap. Migrations `0026_voice_usage.sql`, `0027_voice_budget_upfront.sql`.

**What the AI sees:** only the transcript text (inside `<transcript>`, treated as untrusted data) and today's date. It never sees customers, invoices or amounts; those are looked up in the app after the intent comes back.

**Files:** `lib/speech.ts`, `api/voice.ts`, `lib/voice/{resolve,normalize}.ts`, `lib/prefill.ts` (+ payment/sale form prefills), `ui/VoicePanel.tsx`, `supabase/functions/voice-intent/{index,logic}.ts`.

**Devices:** needs the Web Speech API: «مضمون على Chrome (أندرويد والكمبيوتر). على الآيفون ممكن يشتغل في Safari بس مش مجرّب». Firefox (and any browser without the API) shows "الميكروفون مش مدعوم في المتصفح ده — جرّب Chrome". Chrome sends the audio to Google's recognition service, so it needs internet.

---

## 5. Design system

Source of truth: `docs/brand/design-system/` (tokens.json, CLAUDE.md, logo files). Applied in `mobile/src/ui/theme.ts`. Rules for code: `mobile/CLAUDE.md`.

- Colors: ledger green `#0B5D4B` (brand), coin amber `#F2B134` (only the "+ فاتورة" action and highlights), paper background `#FBF7EC`. Light and dark tokens exist; only light is wired.
- Money statuses = **icon + word + color**: مدفوع (paid, green, check), جزئي (partial, blue, half circle), مستحق (due, amber, clock), متأخر (overdue, **terracotta, not red**, calendar), غير معروف (unknown, grey, question). Red is for system errors only.
- Font: IBM Plex Sans Arabic. Icons: Lucide only. Buttons/inputs 56px, touch targets ≥ 48px, text ≥ 16px.
- RTL: `flexDirection: 'row'` follows the writing direction; don't use `row-reverse` for RTL. Back = chevron-right.
- Copy in Egyptian Arabic, no "من فضلك" / "تم بنجاح".

---

## 6. How to run, test and deploy

```bash
# App
cd mobile
npm install
npx expo start --web          # dev at http://localhost:8081
npx jest                      # 81 unit tests
npx tsc --noEmit              # type-check
npm run build:web             # export to mobile/dist
npx wrangler deploy           # publish worker "notah"
```
- `mobile/.env.local` (gitignored) must contain `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_ANON_KEY` — they are baked in at build time.
- **Database:** migrations in `supabase/migrations/` are applied to the live project (Supabase MCP `apply_migration` or `supabase db push`). Note: live migration history names differ slightly from repo files for 0012/0013 (fixes were applied as separate migrations); the final schema matches.
- **SQL tests:** pgTAP files in `supabase/tests/`, each wrapped in `begin; … rollback;`. Run by sending the whole file through `execute_sql` (no Docker here). They use `tests.as_new_owner(shop)` to simulate a signed-in owner.
- **Never** sign up / sign in or write test data against the live project from automation; tests must roll back.

---

## 7. Decisions already made (and their cost if wrong)

1. Expo for web now so the same code becomes the mobile app (no rewrite).
2. Money logic only on the server; client preview mirrors it for instant feedback.
3. Customer phone/national-ID checks are `NOT VALID` (don't apply to the one legacy customer whose phone doesn't match); new/edited rows are enforced.
4. Legacy contract balance fixed in the view, not by inserting synthetic payments.
5. آجل (credit invoices) dropped from v1.
6. After a failed save, editing the form gets a new id → rare duplicate invoice possible if the "failed" save actually succeeded (visible in the customer file).
7. The overdue tile updates nightly (03:00 Cairo); the worklist uses live "days late".
8. Sale "today" uses the Africa/Cairo date.
9. Native auth tokens must use `expo-secure-store` in Phase 2 (web uses localStorage).
10. Old Vite web app ("Aqsati") removed; its Cloudflare worker deleted. Only `notah` remains.

---

## 8. Known gaps / small issues (backlog)

- The new-invoice screen (`sale/new`) has no on-screen back button; the browser/phone back works.
- Due-today rows don't show a date; the WhatsApp button is disabled with no hint when the phone is invalid.
- Retrying an identical payment **edit** writes a second audit row.
- KPI month boundary mixes UTC and Cairo dates around midnight on the 1st.
- `allocate_payment` leftover is ignored (validation makes it unreachable; add a defensive raise).
- Search results merge name/phone matches without strict date order.
- No screen-level (component) tests; logic is covered by unit + SQL tests.
- Dark mode tokens exist but aren't switchable yet.
- Missing brand assets: SVG logos, Android monochrome icon.

---

## 9. What to do next (roadmap)

### Now
1. **Owner acceptance run** on the live site, signed in (checklist: `docs/superpowers/plans/notah-phase1-acceptance.md`): signup, add customer via invoice, installment sale 25,000/10,000/30%/2y → 812.50×24, cash sale, split payment 1,000/1,000, overpay blocked, edit a payment, home tiles, WhatsApp, double-tap save creates one invoice.
2. Apply the **screen designs** from Claude Design when delivered (9 screens at 390×844).

### Next features (owner's priority order)
3. ~~**Excel import**~~ ✅ Done (pending deploy): customers + running contracts + paid months, template, preview/edit before saving. See §3.6.
4. ~~**Voice commands**~~ ✅ Built as an AI voice assistant (§4.5); owner setup in `docs/voice-assistant-setup.md`. An in-app phrase guide is still open.
5. **ID-card scanning (OCR):** photograph front and back of the Egyptian national ID, extract name, address, national ID (and derive birth date / gender / governorate), store images securely in the customer file; owner reviews before saving.

### Phase 2 — mobile app
6. Android + iOS builds from the same Expo code (EAS), Google Play first.
7. **Offline mode** on mobile: local copy of the shop's data, queued writes marked "لم تتم المزامنة", ordered sync, server stays the source of truth (idempotency already in place).
8. `expo-secure-store` for auth tokens, RTL on first launch, push notifications later.

### Later
9. Landing page / marketing site.
10. Staff accounts and roles in the UI (DB already supports them).
11. Shariah review of pricing and late fees; then possibly other interest methods.
12. Upgrade to Supabase Pro ($25/mo) before real paying customers (backups, no pausing).

---

## 10. Where to find more

| File | Contents |
|---|---|
| `docs/superpowers/specs/2026-10-31-notah-mobile-v1-design.md` | Full v1 design (the agreed spec). |
| `docs/superpowers/plans/2026-10-31-notah-phase1-web.md` | Phase 1 implementation plan (10 tasks). |
| `docs/superpowers/plans/notah-phase1-acceptance.md` | Acceptance checklist for the owner. |
| `docs/brand/notah-design-brief.md` | Brief used with Claude Design. |
| `docs/brand/design-system/` | Tokens, rules, logo, icons. |
| `mobile/CLAUDE.md` | Coding rules for UI work. |
| `PRODUCT.md`, `docs/01–05` | Original product research, competitive edge, pitch, early specs (from the Aqsati era — business context still valid, technical parts superseded by this file). |
