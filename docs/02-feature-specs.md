# Feature Specifications — Implementation Blueprint

> Product: **أقساطي / Aqsati** — cloud installment & collections system (قسط + آجل) for the Egyptian market.
> Audience: the engineering team building v1. Each feature lists **Purpose · User stories · Data model · Business logic · Screens · Integrations · Edge cases · Acceptance criteria.**
> Notation: `entities` in code font; 🔑 = MVP-critical; ⭐ = competitive-edge feature (see `01-competitive-edge.md`).

---

## 0. Foundation & architecture (build first — everything sits on this)

### 0.1 Multi-tenant model 🔑
- **Purpose:** every merchant/office is an isolated tenant; multi-branch under one tenant.
- **Data model:**
  - `tenant` (id, name, plan, status, created_at, settings_json, locale='ar-EG', timezone='Africa/Cairo', currency='EGP')
  - `branch` (id, tenant_id, name, address, phone)
  - `user` (id, tenant_id, name, phone, email, password_hash, role, branch_id, status)
  - Every business row carries `tenant_id` → enforced at the ORM/query layer (row-level scoping).
- **Business logic:** all queries auto-filter by `tenant_id` from the auth token. Never trust a client-supplied tenant id.
- **Acceptance:** a user from tenant A can never read/write tenant B data (test with cross-tenant id probing).

### 0.2 Auth, roles & permissions 🔑
- **Roles:** `owner`, `manager`, `accountant`, `collector` (محصّل), `viewer`. Custom roles later.
- **Permission matrix (v1):**
  | Action | owner | manager | accountant | collector | viewer |
  |---|---|---|---|---|---|
  | Create/edit contract | ✅ | ✅ | ✅ | ❌ | ❌ |
  | Record payment | ✅ | ✅ | ✅ | ✅ (own route) | ❌ |
  | Delete/void | ✅ | ✅ | ❌ | ❌ | ❌ |
  | View investor module | ✅ | ✅ | ✅ | ❌ | ❌ |
  | Manage users/billing | ✅ | ❌ | ❌ | ❌ | ❌ |
  | View reports | ✅ | ✅ | ✅ | own | ✅ |
- **Auth:** phone + password; OTP for password reset and customer portal. JWT access + refresh. Optional 2FA for owner.
- **Acceptance:** each role blocked from out-of-scope actions at API level (not just hidden in UI).

### 0.3 Audit log 🔑 (money app → non-negotiable)
- **Data model:** `audit_log` (id, tenant_id, user_id, action, entity_type, entity_id, before_json, after_json, ip, created_at).
- **Logged:** contract create/edit/void, payment create/edit/delete, price/schedule changes, permission changes, exports.
- **Acceptance:** every financial mutation produces an immutable audit row; log is read-only in UI.

### 0.4 i18n / RTL 🔑
- Arabic-first RTL UI; Eastern-or-Western Arabic numerals toggle; Hijri/Gregorian date display option; EGP formatting. English as secondary locale.
- **Acceptance:** full RTL layout, no clipped/mirrored components, Arabic input everywhere including search.

### 0.5 Recommended stack
- Frontend: Next.js/React (RTL), TanStack Query, a headless component lib (Radix/shadcn) themed RTL.
- Backend: NestJS (Node/TS) **or** Laravel (large EG talent pool). REST + webhooks; background jobs (BullMQ/Horizon) for reminders & reconciliation.
- DB: PostgreSQL (money math in `NUMERIC`, never float). Redis for jobs/cache.
- Files: S3-compatible (contract docs, ID images).
- Observability: structured logs + error tracking (Sentry).

---

## 1. Customer & guarantor management 🔑

- **Purpose:** the master record every contract attaches to.
- **User stories:** As an accountant I add a customer with ID and phone in <1 min; I see all their contracts and total balance on one page; I attach a guarantor (كفيل).
- **Data model:**
  - `customer` (id, tenant_id, name, national_id, phone, alt_phone, address, gov/city, notes, photo_url, id_front_url, id_back_url, risk_score, blacklist_flag, created_at)
  - `guarantor` (id, tenant_id, customer_id, name, national_id, phone, relation, id_doc_url)
- **Business logic:** duplicate detection on `national_id` + `phone` (warn, don't hard-block); customer 360 view aggregates all contracts, آجل invoices, payments, and current total outstanding.
- **Screens:** customer list (search by name/phone/ID, filter by status/overdue), customer detail (profile, contracts, timeline, balance), add/edit form.
- **Edge cases:** customer with no national_id (informal); same person across branches; merged duplicates.
- **Acceptance:** create/search/edit customer; 360 view shows correct aggregate outstanding across قسط + آجل.

---

## 2. Installment contract management 🔑

- **Purpose:** create and manage an installment sale with an auto-generated payment schedule.
- **User stories:** I create a contract by entering total price, down payment, interest %, and number of installments; the system builds the full due schedule; I can print a legal contract PDF.
- **Data model:**
  - `contract` (id, tenant_id, branch_id, customer_id, guarantor_id, product_desc, cash_price, total_price, down_payment, interest_rate, interest_method, num_installments, frequency[monthly/weekly/custom], start_date, status[active/completed/defaulted/void], created_by, created_at)
  - `installment` (id, contract_id, seq_no, due_date, amount_due, amount_paid, status[pending/partial/paid/overdue/waived], paid_at)
- **Business logic — schedule generation:**
  - Support interest methods: **flat/add-on** (most common in EG: interest on principal spread evenly), **reducing balance**, and **zero-interest**. Store method; compute schedule deterministically in `NUMERIC`.
  - Rounding rule: round each installment to nearest piaster/pound (configurable); push residual to the **last** installment so Σ installments = total_price exactly.
  - Down payment reduces financed principal before schedule build.
  - Frequency drives `due_date` progression (monthly = same day each month with month-end handling).
- **Screens:** contract wizard (customer → product/price → terms → preview schedule → confirm), contract detail (schedule table with per-installment status, actions: record payment, reschedule, waive, void), printable contract + schedule PDF (Arabic legal template + سند/receipt).
- **Integrations:** PDF generation; document vault (§9).
- **Edge cases:** early payoff (recompute remaining, optional interest rebate for reducing-balance), extra/partial down payment, mid-contract restructuring (§12), voiding after payments (guard + audit), month-end due dates (e.g., Jan 31 → Feb 28).
- **Acceptance:** for a known example (price, down, rate, n) the generated schedule matches a hand-calculated reference to the piaster; Σ = total; PDF renders correct Arabic.

---

## 3. Deferred / آجل sales (B2B receivables) 🔑 ⭐(gap vs. competitors)

- **Purpose:** track open credit sales (no fixed installment schedule) with due dates and running balance — for wholesale/B2B and shop tabs.
- **User stories:** I sell goods on 30-day credit to a shop; I record the invoice; I see aging (كم عدى عليه) and get reminded when it's due.
- **Data model:**
  - `credit_invoice` (id, tenant_id, branch_id, customer_id, invoice_no, issue_date, due_date, amount, amount_paid, status[open/partial/paid/overdue], terms_days, notes)
  - shares `payment` table with contracts (polymorphic `payable_type`/`payable_id`).
- **Business logic:** running balance per customer; **aging buckets** (current, 1–30, 31–60, 61–90, 90+); statement of account per customer combining invoices + payments.
- **Screens:** آجل list with aging color-coding; customer statement (كشف حساب) printable/PDF; add invoice form.
- **Edge cases:** partial payments across multiple invoices (allocation order — oldest first / manual); credit notes/returns; converting an آجل balance into an installment plan.
- **Acceptance:** aging report reconciles to sum of open balances; statement PDF matches ledger.

---

## 4. Payments, receipts & allocation 🔑

- **Purpose:** record money in against installments/invoices and produce a receipt.
- **User stories:** customer pays a partial amount; I record it; it applies to the right installment(s); a سند قبض prints; balance updates instantly.
- **Data model:**
  - `payment` (id, tenant_id, branch_id, payable_type[contract/credit_invoice], payable_id, customer_id, amount, method[cash/instapay/fawry/wallet/card/bank], reference, received_by, received_at, reconciled[bool], source[manual/auto], receipt_no)
  - `payment_allocation` (id, payment_id, installment_id/invoice_id, amount) — a payment can split across multiple installments.
- **Business logic — allocation waterfall:** default oldest-overdue-first: fees → oldest installment principal → next, until amount consumed; overpayment → credit balance or next installment (configurable). Everything in `NUMERIC`; recompute installment statuses after allocation.
- **Screens:** quick "record payment" modal (from contract, customer, or global), receipt preview/print, payments ledger with filters.
- **Integrations:** receipt PDF; auto-reconciliation (§13) sets `source='auto'`.
- **Edge cases:** overpayment, refunds/reversals (create negative payment + audit), duplicate reference, backdated payment, currency (EGP only v1).
- **Acceptance:** partial + multi-installment allocation correct; voiding a payment restores prior statuses; receipt numbers are gapless per tenant.

---

## 5. Collections & delinquency dashboard 🔑 (the hook)

- **Purpose:** the home screen that shows "who owes me and who's late" and drives daily collection work.
- **User stories:** I open the app and immediately see due-today, this-week, and overdue totals, and a worklist I can act on (call / send reminder / mark paid).
- **Data model:** derived views over `installment` + `credit_invoice` + `payment`; `collection_task` (id, tenant_id, customer_id, payable_ref, due_date, bucket, assigned_to, status, last_action_at) optional for worklist.
- **Business logic:**
  - KPI tiles: **Expected today / this week / this month**, **Collected (period)**, **Overdue total**, **PAR%** (overdue ÷ outstanding), **collection rate**.
  - Aging buckets: due-soon, 1–30, 31–60, 61–90, 90+.
  - Worklist: sortable/filterable by branch, collector, bucket, amount; bulk actions (send reminder to all overdue).
  - Nightly job flips `pending`→`overdue` past due_date; recomputes buckets.
- **Screens:** dashboard (tiles + charts + worklist), overdue drill-down, per-collector view.
- **Acceptance:** tiles reconcile to underlying rows; changing a payment updates dashboard within one refresh/job cycle; bulk reminder fires to correct set.

---

## 6. Automated reminders — omnichannel 🔑 ⭐(E1/E2 seed)

- **Purpose:** automatically nudge customers before/after due dates via WhatsApp + SMS (+ email), reducing manual calls.
- **User stories:** I turn on reminders once; customers get a WhatsApp X days before due and again when overdue, in Arabic, with amount and a pay link.
- **Data model:**
  - `reminder_rule` (id, tenant_id, trigger[days_before/on_due/days_after], offset_days, channel[whatsapp/sms/email], template_id, active)
  - `message_template` (id, tenant_id, channel, name, body_ar, variables) — vars: {name, amount, due_date, balance, pay_link, merchant_name}
  - `message_log` (id, tenant_id, customer_id, payable_ref, channel, template_id, body, status[queued/sent/delivered/read/failed], provider_msg_id, cost, sent_at)
- **Business logic:** scheduler enumerates upcoming/overdue installments daily, matches rules, renders template, enqueues send via provider; respects quiet hours & per-customer opt-out; retries on failure; dedupe (don't double-send same reminder/day). Cost metering per message (feeds add-on billing).
- **Integrations:** **WhatsApp Business API** (template/HSM approval), local **SMS gateway** (EG sender ID), email (SES). Provider webhooks update delivery/read status.
- **Edge cases:** WhatsApp template rejection/opt-in rules, invalid number, DND/quiet hours, provider outage (queue + retry), Arabic encoding in SMS (Unicode segments cost more — meter accordingly).
- **Acceptance:** rule fires exactly once per due event per channel; delivery status reflected in `message_log`; opt-out honored; costs recorded.
- **Evolution to ⭐E1 (Next-Best-Action):** v1 rules-based; v2 adds per-customer optimal send-time/channel learned from `message_log` + payment response (start with heuristics: "pays after WhatsApp within 24h" → prefer WhatsApp).

---

## 7. Reports 🔑

- **Purpose:** the numbers owners/accountants need.
- **Reports (v1):** collections report (by period/branch/collector), **aging report**, **cashflow forecast** (expected inflows by date from schedules), customer statement (كشف حساب), profit report (interest earned), overdue list, collector performance.
- **Business logic:** all parameterized by date range + branch + collector; server-side aggregation; export to **PDF + Excel/CSV**.
- **Acceptance:** each report reconciles to source ledgers; exports open cleanly in Excel with Arabic intact (UTF-8 BOM).

---

## 8. Investor / partner module ⭐(steals Qest's edge)

- **Purpose:** installment offices funded by multiple investors track deposits, capital share, and profit distribution.
- **Data model:**
  - `investor` (id, tenant_id, name, phone, notes)
  - `investor_txn` (id, investor_id, type[deposit/withdrawal/profit_share], amount, date, note)
  - link capital deployment to contracts (optional): `contract.funded_by` or a funding pool.
- **Business logic:** per-investor balance, capital contribution %, profit allocation by share of pool or per assigned contracts; statements per investor.
- **Screens:** investor list + balances, investor statement, profit-distribution run.
- **Acceptance:** investor balances and profit shares reconcile to pool math and contract interest earned.

---

## 9. Guarantor & document vault ⭐(E10 seed)

- **Purpose:** paperless legal-grade record — store ID images, signed contract, guarantor docs.
- **Data model:** `document` (id, tenant_id, owner_type[customer/contract/guarantor], owner_id, kind, file_url, uploaded_by, created_at).
- **Business logic:** upload from web + mobile capture; virus/type/size validation; access-scoped; optional **ID OCR** (E10) to auto-fill name/national_id.
- **Acceptance:** documents attach, preview, download; permissions enforced; OCR (if enabled) prefills fields with manual override.

---

## 10. ETA e-invoice integration ⭐(matches Daftra; compliance selling point)

- **Purpose:** issue Egyptian Tax Authority-compliant electronic invoices for sales.
- **Business logic:** map sale/contract to ETA document schema; sign & submit via ETA API; store UUID/status; handle rejections; taxpayer profile config per tenant.
- **Integrations:** ETA e-invoicing API; digital signature (e-seal/USB token or HSM per ETA rules).
- **Acceptance:** a test invoice submits and returns a valid UUID in the ETA sandbox; failures surface actionable errors. *(Scope as a Pro+ add-on; requires ETA onboarding per merchant.)*

---

## 11. Collector mobile view / field app ⭐(E7)

- **Purpose:** the محصّل works a daily route offline and records collections in the field.
- **User stories:** collector opens today's route (customers due, addresses, amounts), collects cash, marks paid on the spot (works with no signal), reconciles cash at end of day.
- **Data model:** reuse `payment` (source='field', received_by=collector, geo_lat/lng, offline_id for sync); `collector_route` (id, collector_id, date, stops[]); `cash_session` (id, collector_id, date, opening, collected_total, handover_total, variance).
- **Business logic:** offline-first (local queue → sync on connectivity, idempotent by `offline_id`); optional GPS stamp; day-end cash reconciliation (collected vs. handed over → variance flag).
- **Integrations:** later native app (Android-lead); v1 = responsive PWA.
- **Edge cases:** duplicate sync, conflicting edits (server wins + audit), GPS denied, cash variance disputes.
- **Acceptance:** offline-recorded payments sync exactly once; cash session reconciles; route reflects real-time due list.

---

## 12. Payment-plan restructuring / early payoff ⭐(E-moat)

- **Purpose:** renegotiate a struggling customer's schedule instead of writing off (humane collections + recovery).
- **Business logic:** actions — **reschedule** (new dates/amounts), **extend** (add installments), **settle** (accept lump sum < balance, waive rest), **early payoff** (recompute + optional interest rebate), **waive** a fee/installment. Every action versions the schedule and writes audit + reason.
- **Screens:** restructuring wizard from contract detail; before/after schedule diff.
- **Acceptance:** restructured schedule recomputes correctly; original preserved in history; balances stay consistent.

---

## 13. Auto-reconciliation / smart payment matching ⭐(E2 — high-impact edge)

- **Purpose:** incoming digital payments auto-match to the right customer/installment — no manual entry.
- **Business logic:** ingest payment notifications (Fawry/InstaPay/Paymob/bank webhook or statement import); match by **reference code** (issue a unique code per customer/contract), then by phone/amount/date heuristics; auto-create `payment` with `source='auto'`, `reconciled=true`; unmatched → review queue.
- **Integrations:** Fawry, Paymob, InstaPay/IPN webhooks; CSV bank-statement import fallback.
- **Edge cases:** partial/over amount, duplicate webhook (idempotency key), ambiguous match (route to review), refunds/chargebacks.
- **Acceptance:** a webhook with a valid reference posts and allocates automatically; ambiguous cases land in review; no double-posting.

---

## 14. Recurring auto-debit mandates ⭐(E3 — flips chase→pull)

- **Purpose:** collect installments automatically on due date via a stored mandate.
- **Business logic:** customer authorizes mandate (card-on-file / wallet / InstaPay recurring where available); scheduler triggers pull on due date; on success auto-post payment; on failure → retry policy + fallback to reminder cadence (§6).
- **Integrations:** Paymob/Fawry recurring, InstaPay recurring rails (pluggable — enable what's live in EG).
- **Edge cases:** insufficient funds, expired card, mandate revoked, partial capture, dispute.
- **Acceptance:** a live mandate auto-collects on due date in sandbox; failures degrade gracefully to reminders. *(Ship as capability matures; architect now.)*

---

## 15. Customer self-service portal ⭐(E4 — viral loop)

- **Purpose:** the buyer sees their own schedule/balance and pays — no app install, no login friction.
- **User stories:** customer taps the link in the WhatsApp reminder, verifies via OTP, sees remaining balance and next due, downloads statement, taps "pay now."
- **Business logic:** tokenized link per customer/contract; phone-OTP auth; read-only schedule + pay action (§13/§14); optional request-a-plan (feeds §12).
- **Edge cases:** shared phones, expired token, privacy (show only that customer's data).
- **Acceptance:** customer with a valid link sees only their own data and can pay; payment reflects in merchant dashboard instantly.

---

## 16. Credit risk score & approve/limit engine ⭐(E5 — moat)

- **Purpose:** recommend whether to sell a buyer on installments and a max limit.
- **Business logic:** v1 rules + internal history (past on-time %, current exposure, blacklist); v2 alt-data + optional **I-Score / credit-bureau** pull; output score band (green/amber/red) + suggested limit. Never auto-decline silently — advise the merchant, log reason.
- **Edge cases:** thin-file/new customer, bureau unavailable, disputed blacklist.
- **Acceptance:** score computes from defined inputs; recommendation + reason shown at contract creation; overrides audited.

---

## 17. Portfolio-at-risk & analytics ⭐(E6 — enterprise stickiness)

- **Purpose:** portfolio health for multi-branch offices/funders.
- **Reports:** PAR by bucket, vintage/cohort curves, expected loss, roll-rates, collector/branch league table, interest yield.
- **Acceptance:** metrics reconcile to ledgers; cohort curves match a spot-checked sample.

---

## 18. Billing & subscription (your own SaaS monetization) 🔑

- **Purpose:** enforce plans/limits and collect subscription revenue.
- **Data model:** `subscription` (tenant_id, plan, status, renew_at, seats, branches, contract_limit), `usage_counter` (messages, contracts), `invoice`.
- **Business logic:** plan gating (users/branches/contract soft-limits with upgrade prompts — never hard-block a merchant's money data), metered add-ons (SMS/WhatsApp bundles), free-trial expiry, dunning for your own subscription.
- **Integrations:** Paymob/Fawry for collecting subscription fees.
- **Acceptance:** limits enforced with graceful upgrade path; trial→paid conversion tracked.

---

## 19. Non-functional requirements

- **Money correctness:** all monetary math in `NUMERIC`/decimal; centralized schedule & allocation engine with unit tests against reference cases; no floats.
- **Security:** encryption at rest (IDs/docs), TLS, per-tenant isolation, rate limiting, PII access logging; least-privilege roles.
- **Reliability:** background jobs idempotent; webhook idempotency keys; retries with backoff; daily backups + restore drill.
- **Performance:** dashboards/report queries indexed (tenant_id, due_date, status); pagination on all lists; async heavy reports.
- **Auditability:** immutable audit log for all financial mutations (§0.3).
- **Localization:** Arabic RTL, EGP, Cairo timezone, Excel exports UTF-8 BOM.

---

## 20. Suggested build sequence (maps to plan milestones)

1. **M0–M1 Foundation:** §0 (tenancy, auth/roles, audit, RTL) + §1 customers.
2. **M1–M3 MVP spine:** §2 contracts + schedule engine, §3 آجل, §4 payments/receipts, §5 dashboard, §6 reminders (rules-based), §7 reports, §18 billing. → onboard 5–10 design partners.
3. **M3–M4 Differentiation:** §13 auto-reconciliation, §9 vault(+OCR), §8 investor, §10 e-invoice, §12 restructuring, §15 self-service portal.
4. **M4–M6 Edge/moat:** §11 collector app, §14 auto-debit, §16 risk score, §6→⭐E1 next-best-action, §17 portfolio analytics.

> Each feature above is written so a developer can open it, model the tables, implement the logic, build the screen, and check it against the acceptance criteria. Start with §0 and the **schedule + allocation engine** (§2/§4) — they're the mathematical heart the whole product depends on, so cover them with unit tests first (TDD).
