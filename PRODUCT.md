# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users
Primary: staff at Egyptian installment offices (مكاتب تقسيط) and credit-selling SMBs (retail electronics, furniture, appliances, auto/moto dealers, B2B wholesale) — five roles: owner/manager (see the whole book, ensure collection), accountant (create contracts/invoices, record payments), collector (records payments from the field; the dedicated offline field app is post-MVP), viewer (read-only). Job: replace paper-ledger (كشكول)/Excel/WhatsApp tracking of installment (قسط) and deferred B2B credit (آجل) sales with a system that shows exactly who owes money and who's late, and gets it collected. Secondary, out of MVP: investor/partner (capital tracking) and the end customer/buyer (self-service portal).

## Product Purpose
Aqsati automates the Egyptian merchant's installment-and-collections cycle end to end: generate a payment schedule when a contract is created, record and allocate payments against it, run a daily collections dashboard that shows who to chase, and send WhatsApp reminders — so collections stop leaking and merchants get paid without manual chasing. Success = measurable lift in overdue amounts collected within 60 days of adoption (the design-partner metric).

## Positioning
Aqsati is a collections-first, dual-ledger (قسط + آجل) system, not a bolt-on accounting feature. Direct competitors (Qasetly, Aksat, Qest, SMACC, Daftra) are record-keepers; Aqsati is built to be the outcome — reminders, reconciliation, and a live delinquency dashboard are the product, not add-ons. The real incumbent is paper + Excel + WhatsApp. A merchant chooses Aqsati because it's Arabic-first, covers both installment and deferred-credit sales in one ledger, and its `wa.me`-based reminders work from day one with zero setup cost or WhatsApp Business approval friction.

## Operating Context
In-branch, Arabic-speaking, Egypt-based small offices; EGP currency; Africa/Cairo timezone. Staff enter contracts and record payments during the day; the owner reviews the dashboard each morning. Customers are reminded and pay via WhatsApp click-to-send links, cash, or common Egyptian payment rails (InstaPay, Fawry, wallet, card, bank). No assumption of reliable card-based payment; cash-first workflows are the default. Multi-branch offices exist under one tenant.

## Capabilities and Constraints
**MVP capabilities (what's being built first):** tenancy + auth + roles + RLS + audit log; customer records; installment contracts with an auto-generated payment schedule (flat/zero interest; reducing-balance is schema-ready but not yet implemented); آجل (deferred B2B credit) invoices with aging; payments with an oldest-first allocation waterfall and receipts; a collections dashboard (KPI tiles, aging buckets, worklist); free `wa.me` WhatsApp reminders (not the paid Cloud API); core reports (aging, collections, customer statement).

**Deliberately deferred (roadmap, not current capability):** auto-reconciliation webhooks, auto-debit mandates, ETA e-invoice integration, the investor/partner module, the collector field app, AI next-best-action reminder optimization, credit risk scoring, and the customer self-service portal (planned as the first post-MVP build — it's the intended viral loop).

**Constraints:** must run at $0/month infrastructure cost (Supabase free tier + Cloudflare Pages/Workers free tier) — no paid service may become a hard MVP dependency. All monetary math is `NUMERIC`, computed in Postgres functions, never in JS. RLS is mandatory on every table. Every financial mutation must write an audit row via trigger.

## Brand Commitments
Name: أقساطي / Aqsati. Tagline: "Get paid, automatically." Confirmed palette: deep teal (#0E7C6B) + ink navy as primary, one warm amber accent, with semantic green/amber/red reserved for status (not brand accent). No separate wireframe files exist in the repo — these written notes are the complete visual evidence on hand; treat them as binding until a real comp establishes more.

## Evidence on Hand
No customer testimonials, case studies, or real usage data yet (pre-launch). Design-partner target: 5–10 Egyptian installment offices, not yet onboarded. Do not fabricate customer quotes, benchmarks, or pricing beyond what's stated in the investor-pitch doc's draft tiers (Free / Basic ~4,990 / Pro ~9,990 / Business ~24,990 EGP/yr — explicitly marked as needing validation before raise).

## Product Principles
- RLS-enforced tenant isolation is the trust foundation — a leak must be impossible at the database, not just hidden in the UI.
- Money math lives in exactly one place (Postgres functions) and is never recalculated in the frontend.
- The dashboard is the daily-use surface: summary before detail, the number needing attention is visually loudest, every actionable row is one click from action.
- Match how Egyptian merchants already work rather than force new behavior — `wa.me` reminders over paid API, cash-first payment recording, Arabic RTL by default.
- Free-tier-first: no MVP feature may create a hard dependency on a paid service.

## Accessibility & Inclusion
Arabic RTL is the default UI direction; an Eastern/Western Arabic-numeral toggle and Hijri/Gregorian date display option are planned. No formal accessibility standard (e.g. WCAG level) has been established yet — left as an open decision.
