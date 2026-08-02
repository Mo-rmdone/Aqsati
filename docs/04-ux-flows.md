# UX Flows — Actors & End-to-End Journey

> Product: **أقساطي / Aqsati** — cloud installment & collections system (قسط + آجل).
> This document defines **who uses the system (actors)**, the **whole journey** from first contact to renewal, each actor's **daily flow**, the **customer self-service** path, the **dashboard interaction loop**, and the **lifecycle states** the UI must reflect.

---

## 1. Main actors

| # | Actor (EN / AR) | Type | Primary goal | Access | Key screens |
|---|---|---|---|---|---|
| A1 | **Merchant Owner / Manager** — صاحب المكتب / المدير | Primary | See the whole book; make sure money is collected; grow branches | Full (owner) | Dashboard, reports, investor module, users/billing |
| A2 | **Accountant / Data-entry** — المحاسب | Primary | Create contracts & آجل invoices, record payments, issue receipts | Scoped (no billing/users) | Contract wizard, payments, customers, reports |
| A3 | **Collector / Field agent** — المحصّل | Primary | Work the daily route; collect cash; mark paid on the spot | Route-scoped | Collector route view, record payment, cash session |
| A4 | **Investor / Partner** — المساهم | Secondary | See deposits, capital share, and profit distribution | Read-mostly | Investor statement |
| A5 | **Customer / Buyer** — العميل / المشتري | External | Know what's owed & when; pay easily; avoid disputes | Tokenized self-service (no account) | Reminder message, self-service portal, pay flow |
| A6 | **Platform Super-Admin** — فريق أقساطي | Internal | Onboard tenants, support, migrate data, manage subscriptions | Platform-level | Admin console, migration tool, support |

**Supporting actor:** *Prospect / Trial user* — the owner **before** they convert (drives phases A–B). Same person as A1, different mindset (evaluating, not operating).

---

## 2. The whole journey (end-to-end, 9 phases)

```
DISCOVER → ONBOARD → CONFIGURE → SELL/CREATE → AUTOMATE → COLLECT/RECONCILE → EXCEPTIONS → REPORT/DECIDE → RETAIN/EXPAND
   A          B           C            D            E              F                 G              H               I
```

### Phase A — Discover & sign up  *(Prospect → Trial)*
1. Sees a WhatsApp/Facebook demo of the "reminder + overdue dashboard" hook, or is visited by field sales.
2. Lands on site → starts **free 14–30 day trial** (phone + OTP, no card).
3. First-run wizard asks: business type (مكتب تقسيط / shop / wholesale), # branches, rough # of contracts.
- **Success signal:** account created + reaches empty dashboard.

### Phase B — Onboard & migrate  *(remove switching cost)*
1. Guided setup checklist appears on the dashboard (progress bar).
2. **Data migration:** upload Excel/photos of the ledger → Aqsati (with Super-Admin help / OCR) imports customers + open balances.
3. Add branches, invite users (accountant, collector), assign roles.
- **Success signal (activation):** first real contract created **and** first reminder sent within 48h.

### Phase C — Configure
1. Set interest methods (flat / reducing / zero) and default terms.
2. Define **reminder rules** (days-before, on-due, days-after × WhatsApp/SMS) and pick message templates (Arabic).
3. Connect payment channels (Fawry / InstaPay / wallet reference) for reconciliation.
4. Set quiet hours, receipt numbering, contract PDF template.

### Phase D — Sell & create a contract  *(the core create loop)*
1. Customer walks in / B2B order placed.
2. Accountant opens **contract wizard**: pick/create customer → (optional **risk badge** shows green/amber/red) → product & price → down payment → terms → **live schedule preview** → confirm.
3. System generates legal **contract PDF** + first receipt; e-sign / capture ID (optional).
4. For B2B: create an **آجل invoice** with due date instead of a schedule.
- **Output:** an Active contract with a full due schedule; reminders auto-armed.

### Phase E — Automate collections
1. Nightly job flips due → overdue, recomputes aging buckets & PAR.
2. **Reminder engine** fires the right nudge per rule (v2: AI next-best-action picks time/channel).
3. Dashboard worklist populates with who's due/late, per branch & collector.

### Phase F — Collect & reconcile  *(money in)*
- **Path 1 — Digital (auto):** customer pays via link/Fawry/InstaPay → webhook → **auto-matched** to the installment → receipt auto-issued, balance updated. *(No human.)*
- **Path 2 — In-store (manual):** accountant records payment → allocation waterfall applies → prints سند قبض.
- **Path 3 — Field (collector):** collector marks paid on route (offline-capable) → syncs → cash reconciled at day-end.
- **Path 4 — Auto-debit (v-later):** mandate pulls the installment on due date automatically.

### Phase G — Exceptions & recovery
1. Overdue escalation ladder (reminder → call task → collector visit).
2. **Restructure** options: reschedule, extend, settle (lump sum + waive), early payoff (with rebate), waive a fee.
3. Chronic late payer → **blacklist / risk-score** flag (visible next time at contract creation).

### Phase H — Report & decide
1. Owner reviews collections, **aging**, **cashflow forecast**, PAR, collector/branch performance, interest profit.
2. Investor payout run → per-investor statements (A4).
3. ETA e-invoice submission where applicable.

### Phase I — Retain & expand
1. Trial → paid conversion (founding pricing).
2. Subscription renewal + dunning (your own SaaS billing).
3. Upsell: add branches/users, WhatsApp/SMS bundles, e-invoice, online payments, risk/analytics.
- **Loop back:** more contracts → phase D again; the book compounds → data moat.

---

## 3. Per-actor daily flows

**A1 Owner (morning routine):** login → dashboard → scan KPI tiles (expected / collected / overdue / PAR) → check aging + AI nudge → drill into 60+ bucket → assign/escalate → glance at branch league table → done in minutes.

**A2 Accountant (throughout day):** create contracts (wizard) · record in-store payments + receipts · add آجل invoices · answer "how much is left?" from customer 360 · run end-of-day collections report.

**A3 Collector (field loop):** open **today's route** (due list + addresses, sorted by area) → visit → collect cash → **mark paid** (offline) → repeat → **day-end cash session** reconcile (collected vs. handed over → variance flag) → sync.

**A4 Investor (periodic):** login → investor statement → see deposits, capital %, profit share for the period. Read-only.

**A5 Customer (event-driven):** receives WhatsApp reminder → taps link → OTP → sees own schedule/balance → **pay now** (or request a plan) → gets receipt. *(No account, no install.)*

**A6 Super-Admin (as needed):** onboard tenant, run migration, resolve support, manage plans/limits.

---

## 4. Customer self-service flow (the viral loop — E4)

```
Reminder (WhatsApp) → tap link → phone OTP → Portal: balance + next due + schedule
        → [Pay now]  → choose method → pay → receipt + balance updates on merchant dashboard instantly
        → [Request a plan] → merchant sees request → approves/restructures (Phase G)
```
- Shows **only that customer's** data; token-scoped; no cross-customer leakage.
- Every customer touch quietly markets Aqsati to other merchants ("why doesn't my other shop do this?").

---

## 5. Dashboard interaction loop (the daily engine)

The dashboard is **scanned and operated**, not read. Its loop:

```
LOGIN ─► SUMMARY FIRST (KPI tiles: expected · collected · overdue · PAR)
      ─► TRIAGE (aging buckets + AI next-best-action nudge)
      ─► ACT on the worklist:
             • Bulk "reminder to all overdue"      → confirm → sent (toast)
             • Row action: WhatsApp / Mark paid     → record payment modal → receipt
             • Drill into a customer                → customer 360 → contract detail
             • Filter by branch / collector / bucket
      ─► VERIFY (tiles + worklist update after the action)
      ─► EXPORT / hand off (report, collector route)
```

**Information-design rules for the dashboard:**
- Summary before detail; the number that needs attention (overdue, PAR) is visually loudest.
- **State encoded in form, not just number:** status chips (مستحق اليوم = green, متأخر = amber, حرج = red), aging bars, severity stripes.
- Semantic colors (good/warn/critical) are separate from the brand accent.
- Every actionable row *looks* actionable (WhatsApp / تحصيل buttons inline).
- One-click bulk action for the #1 job (chase overdue).

---

## 6. Lifecycle states the UI must reflect

**Contract:** `Draft → Active → (Current ↔ Overdue) → [Restructured] → Completed | Defaulted | Void`

**Installment:** `Pending → Due → Partial → Paid` · or `Pending → Overdue (1–30 / 31–60 / 60+) → Paid | Waived`

**آجل invoice:** `Open → Partial → Paid` · aging: `Current → 1–30 → 31–60 → 61–90 → 90+`

**Payment:** `Recorded → Reconciled` (source: manual / auto / field / mandate) · reversible via `Voided/Refunded` (audited)

**Reminder:** `Queued → Sent → Delivered → Read → Failed(retry)` · respects opt-out & quiet hours

**Subscription (your SaaS):** `Trial → Active → Past-due(dunning) → Canceled` · plus plan/limit gating

---

## 7. Key journey moments to get right (make-or-break UX)

1. **Activation** — first contract + first reminder within 48h. Guided checklist + free migration are the levers.
2. **The create loop** — a contract in under 2 minutes with a trustworthy live schedule.
3. **The daily triage** — open app, see exactly who to chase, act in one click.
4. **The payment moment** — auto-reconcile so "did he pay?" never needs a human.
5. **The customer touch** — a reminder that's respectful + a pay link that just works.

> These map directly to the wireframes (dashboard = §5, contract wizard = §D) and the feature specs in `02-feature-specs.md`.
