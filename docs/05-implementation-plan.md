# Aqsati MVP — Implementation Plan (Free-Tier Stack)

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a production-usable MVP of the installment & collections system (قسط + آجل) to 5–10 design-partner offices in Egypt, at **$0/month infrastructure cost**.

**Architecture:** Supabase is the backend — Postgres holds the data, **RLS enforces tenant isolation at the database**, and all money-critical logic (schedule generation, payment allocation) lives in **Postgres functions** so the math is transactional and lives in exactly one place. React (Vite SPA) talks to Supabase directly; there is no hand-written API layer to build or host. Cloudflare Pages serves the frontend; one Cloudflare Worker cron keeps the free Supabase project alive and flips overdue installments nightly.

**Tech Stack:** React 18 + Vite + TypeScript · TailwindCSS (RTL) + Radix · TanStack Query · react-hook-form + zod · Supabase (Postgres 15, Auth, Storage, RLS) · Cloudflare Pages + Workers Cron · Vitest + pgTAP

---

## Global Constraints

Every task's requirements implicitly include these.

- **Money is `NUMERIC(14,2)`. Never `float`, never JS `number` for arithmetic.** All monetary math happens in Postgres. The frontend formats, it does not calculate.
- **RLS is enabled on every table in `public`. No exceptions.** A table without a policy is a data leak.
- **Every financial mutation writes an audit row.** Enforced by trigger, not by application code.
- **Arabic RTL is the default direction.** `dir="rtl"` on `<html>`; use CSS logical properties (`margin-inline-start`, not `margin-left`).
- **Currency:** EGP. **Timezone:** `Africa/Cairo`. **Locale:** `ar-EG`.
- **TDD for the money engine is mandatory.** Schedule generation and payment allocation get failing tests before implementation.
- **Free tier only.** No paid service may become a hard dependency of the MVP.

---

## 1. Stack decision — and why

### The recommendation: **Supabase as the backend, not a hand-written API**

You asked for a backend recommendation. For *this* app, the answer is that you should not build a traditional backend for the MVP. Here's the honest reasoning:

| Requirement (from `02-feature-specs.md`) | Why Supabase answers it natively |
|---|---|
| §0.1 Multi-tenancy — "a user from tenant A can never read tenant B" | **RLS enforces this in the database.** Even if the React app has a bug, the leak is impossible. A NestJS layer would re-implement this in app code, where bugs *are* possible. |
| §19 Money correctness — `NUMERIC`, never float | Postgres `NUMERIC` natively; schedule + allocation as SQL functions = one source of truth, transactional. |
| §0.3 Audit log — immutable, every mutation | Postgres triggers. Cannot be bypassed by any client. |
| §0.2 Auth + roles | Supabase Auth (phone/OTP + password) + role claims in RLS policies. |
| §9 Document vault | Supabase Storage with per-tenant path policies. |
| Speed to MVP | **No API layer to write, test, deploy, or host.** This is the single biggest time saving available. |

**The tradeoff I want you to see clearly:** putting business logic in SQL functions is less familiar than TypeScript and harder to refactor. I'm recommending it **only for the money-critical invariants** (schedule generation, allocation waterfall, audit) — the places where a bug costs a merchant real money. Everything else (screens, filters, reports, reminder composition) stays in TypeScript where it's easy to change.

**When to add a real backend:** when you ship auto-reconciliation webhooks (§13), auto-debit mandates (§14), or the ETA e-invoice integration (§10) — all of which need server-held secrets. Those go in Cloudflare Workers, incrementally. You will not need to rewrite anything.

**Why Vite SPA and not Next.js:** this is an authenticated internal dashboard. There is no SEO surface and no SSR requirement. A Vite SPA deploys to Cloudflare Pages as pure static files — simpler, faster, and free forever. Build the public marketing site separately later.

### Free-tier reality (verified July 2026)

| Service | Free allowance | Does MVP fit? |
|---|---|---|
| **Supabase** | 500 MB Postgres · 50,000 MAU · 1 GB storage · 5 GB bandwidth · 500k Edge Function calls/mo · 2 projects | ✅ Yes. 500 MB holds hundreds of thousands of installment rows. |
| **Cloudflare Pages** | ~100 GB bandwidth/mo, unlimited static requests, free custom domain + SSL | ✅ Yes, comfortably. |
| **Cloudflare Workers** | 100,000 requests/day + Cron Triggers | ✅ Yes — we use a handful of cron runs/day. |
| **Cloudflare R2** *(later, for documents)* | 10 GB storage, 1M ops/mo | ✅ Fallback if Supabase's 1 GB fills. |

### ⚠️ Two free-tier traps — and the fixes

**Trap 1: Supabase pauses a free project after 7 consecutive days with no database requests.**
Your merchants may not log in over a holiday, and the project goes dark. **Fix:** the Cloudflare Worker cron (Task 3) pings the database daily. This is the *primary reason* that Worker exists, beyond the nightly job. Free, permanent fix.

**Trap 2: WhatsApp automation is NOT free.** This matters because reminders are your product's hook.
Meta's Cloud API moved to **per-message billing** — utility templates cost roughly **$0.008–$0.012 each** in most markets. Customer-initiated *service* conversations are free, but **you can't rely on that** — a payment reminder is business-initiated by definition.

**The MVP fix (and it's a good one):** ship **`wa.me` click-to-send links** instead of API automation.

> The merchant taps "واتساب" on an overdue row → WhatsApp opens with the Arabic message **pre-filled** (name, amount, due date, balance) → they hit send. **Cost: zero. Approval process: none. Deliverability: perfect** (it's a normal personal message).

This is not a downgrade in disguise — it matches how Egyptian merchants already work, it removes the Meta Business verification barrier from onboarding, and it still delivers the core value ("I know exactly who to chase, and the message writes itself"). Upgrade to true automation via Cloud API **only once paying customers justify the per-message cost** — at which point it becomes a billable add-on (per your pricing model in `03-investor-pitch.md`), not a cost center.

---

## 2. MVP scope

**IN — build this:**
Tenancy + auth + roles + RLS + audit · Customers · Installment contracts with schedule engine · آجل (deferred) invoices · Payments, allocation waterfall, receipts · Collections dashboard · `wa.me` reminders · Core reports (aging, collections, customer statement)

**OUT — deliberately deferred:**
Auto-reconciliation webhooks (§13) · auto-debit mandates (§14) · ETA e-invoice (§10) · investor module (§8) · collector field app (§11) · AI next-best-action (§E1) · risk scoring (§16) · customer self-service portal (§15)

> **First thing to build after MVP:** the customer self-service portal (§15). It's cheap, and it's your viral loop.

---

## 3. File structure

```
aqsati/
├─ supabase/
│  ├─ migrations/
│  │  ├─ 0001_tenancy.sql          # tenant, branch, profile, roles + RLS helper
│  │  ├─ 0002_audit.sql            # audit_log + generic trigger
│  │  ├─ 0003_customers.sql        # customer, guarantor
│  │  ├─ 0004_contracts.sql        # contract, installment
│  │  ├─ 0005_money_fns.sql        # build_schedule(), allocate_payment()
│  │  ├─ 0006_payments.sql         # payment, payment_allocation, receipts
│  │  ├─ 0007_credit_invoices.sql  # آجل invoices + aging view
│  │  └─ 0008_dashboard_views.sql  # KPI + worklist views
│  └─ tests/                       # pgTAP — money engine tests live here
│     ├─ schedule_test.sql
│     └─ allocation_test.sql
├─ worker/                         # Cloudflare Worker (cron only)
│  ├─ src/index.ts                 # daily: keepalive ping + flip overdue
│  └─ wrangler.toml
└─ web/                            # React SPA → Cloudflare Pages
   ├─ src/
   │  ├─ lib/supabase.ts           # typed client
   │  ├─ lib/format.ts             # EGP + ar-EG date formatting (display only)
   │  ├─ lib/whatsapp.ts           # wa.me link builder
   │  ├─ features/
   │  │  ├─ dashboard/             # KPI tiles, aging, worklist
   │  │  ├─ contracts/             # wizard + detail
   │  │  ├─ customers/
   │  │  ├─ payments/
   │  │  └─ reports/
   │  ├─ components/ui/            # Radix + Tailwind primitives (RTL)
   │  └─ routes/
   └─ vite.config.ts
```

**Why this shape:** the money engine is isolated in `0005_money_fns.sql` with its own pgTAP tests — it is the one place a bug costs real money, so it gets its own file, its own tests, and its own review gate. Frontend is split by *feature*, not by technical layer, so files that change together live together.

---

## 4. Which of your skills to use, and when

| Phase | Skill to invoke | Why |
|---|---|---|
| Money engine (Tasks 4–5) | `superpowers:test-driven-development` | Non-negotiable. Failing test first, always. |
| UI build (Tasks 8–11) | `frontend-design` then `impeccable` | Design direction, then audit for slop/a11y/RTL bugs. |
| Dashboard charts (Task 10) | `dataviz` | **Load before writing any chart code.** |
| Deploy (Task 12) | `cloudflare` + `wrangler` | Correct Pages/Workers config. |
| Before claiming done | `superpowers:verification-before-completion` | Evidence before assertions. |
| Executing this plan | `superpowers:subagent-driven-development` | Fresh subagent per task + review gate. |

---

## 5. Tasks

### Phase 0 — Infrastructure

### Task 1: Accounts, repo, and skeleton

**Files:**
- Create: `package.json`, `web/` (Vite scaffold), `supabase/config.toml`, `.gitignore`, `.env.example`

- [ ] **Step 1: Create free accounts** — Supabase (new project, region: Frankfurt — closest low-latency to Egypt) and Cloudflare. Record the project URL and anon key.
- [ ] **Step 2: Scaffold the repo**

```bash
npm create vite@latest web -- --template react-ts
cd web && npm i @supabase/supabase-js @tanstack/react-query react-router-dom react-hook-form zod @hookform/resolvers
npm i -D tailwindcss @tailwindcss/vite vitest @testing-library/react
```

- [ ] **Step 3: Install Supabase CLI and link**

```bash
npm i -D supabase
npx supabase init
npx supabase link --project-ref <your-project-ref>
```

- [ ] **Step 4: Write `.env.example`** (never commit real keys)

```
VITE_SUPABASE_URL=https://<ref>.supabase.co
VITE_SUPABASE_ANON_KEY=<anon-key>
```

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "chore: scaffold Vite SPA + Supabase project"
```

---

### Task 2: Tenancy schema + RLS foundation

**Files:**
- Create: `supabase/migrations/0001_tenancy.sql`

**Interfaces:**
- Produces: `public.current_tenant_id()` → `uuid`, `public.current_role()` → `text`, `public.signup_tenant(p_tenant_name text, p_full_name text)` → `uuid`. Every later table's RLS policy calls the first two; the frontend calls `signup_tenant` once, right after auth sign-up.

- [ ] **Step 1: Write the migration**

```sql
create extension if not exists "pgcrypto";

create table public.tenant (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  plan text not null default 'trial',
  created_at timestamptz not null default now()
);

create table public.branch (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenant(id) on delete cascade,
  name text not null,
  phone text
);

-- links a Supabase auth user to one tenant + role
create table public.profile (
  id uuid primary key references auth.users(id) on delete cascade,
  tenant_id uuid not null references public.tenant(id) on delete cascade,
  branch_id uuid references public.branch(id),
  full_name text not null,
  role text not null default 'accountant'
    check (role in ('owner','manager','accountant','collector','viewer'))
);

-- SECURITY DEFINER so the lookup itself is not blocked by RLS
create or replace function public.current_tenant_id()
returns uuid language sql stable security definer set search_path = public as $$
  select tenant_id from public.profile where id = auth.uid()
$$;

create or replace function public.current_role()
returns text language sql stable security definer set search_path = public as $$
  select role from public.profile where id = auth.uid()
$$;

alter table public.tenant  enable row level security;
alter table public.branch  enable row level security;
alter table public.profile enable row level security;

create policy tenant_self on public.tenant for select to authenticated
  using (id = (select public.current_tenant_id()));

create policy branch_isolation on public.branch for all to authenticated
  using      (tenant_id = (select public.current_tenant_id()))
  with check (tenant_id = (select public.current_tenant_id()));

create policy profile_isolation on public.profile for select to authenticated
  using (tenant_id = (select public.current_tenant_id()));

create index on public.branch  (tenant_id);
create index on public.profile (tenant_id);

-- self-serve signup: creates tenant + owner profile atomically, bypassing RLS.
-- Called once, right after supabase.auth.signUp() succeeds (see Task 8). This is the
-- ONLY path that creates a tenant/profile row — there is no direct insert policy on
-- either table, so a brand-new user (no profile yet, current_tenant_id() = null) can
-- still get provisioned.
create or replace function public.signup_tenant(p_tenant_name text, p_full_name text)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_tenant_id uuid;
begin
  if exists (select 1 from public.profile where id = auth.uid()) then
    raise exception 'profile already exists for this user';
  end if;

  insert into public.tenant(name) values (p_tenant_name) returning id into v_tenant_id;

  insert into public.profile(id, tenant_id, full_name, role)
  values (auth.uid(), v_tenant_id, p_full_name, 'owner');

  return v_tenant_id;
end $$;

revoke all on function public.signup_tenant(text, text) from public;
grant execute on function public.signup_tenant(text, text) to authenticated;
```

> **Note the `(select ...)` wrapper** around `current_tenant_id()` in every policy. Postgres caches the result per statement instead of re-evaluating per row — without it, RLS gets slow as tables grow.

- [ ] **Step 2: Apply and verify**

Run: `npx supabase db push`
Expected: migration applies with no errors.

- [ ] **Step 3: Prove isolation manually** — create two tenants via `signup_tenant` (this is the real signup path — inviting a second user into an existing tenant is a later, separate capability, not covered here), then query `branch` as each. Expected: each sees only their own rows.
- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/0001_tenancy.sql
git commit -m "feat(db): tenancy schema with RLS isolation helpers"
```

---

### Task 3: Audit log + Cloudflare keepalive Worker

**Files:**
- Create: `supabase/migrations/0002_audit.sql`, `worker/src/index.ts`, `worker/wrangler.toml`

- [ ] **Step 1: Write the audit migration**

```sql
create table public.audit_log (
  id bigserial primary key,
  tenant_id uuid not null,
  user_id uuid,
  action text not null,
  entity_type text not null,
  entity_id uuid,
  before_json jsonb,
  after_json jsonb,
  created_at timestamptz not null default now()
);

create or replace function public.fn_audit() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.audit_log(tenant_id, user_id, action, entity_type, entity_id, before_json, after_json)
  values (
    coalesce(new.tenant_id, old.tenant_id),
    auth.uid(),
    lower(tg_op),
    tg_table_name,
    coalesce(new.id, old.id),
    case when tg_op in ('UPDATE','DELETE') then to_jsonb(old) end,
    case when tg_op in ('INSERT','UPDATE') then to_jsonb(new) end
  );
  return coalesce(new, old);
end $$;

alter table public.audit_log enable row level security;
create policy audit_read on public.audit_log for select to authenticated
  using (tenant_id = (select public.current_tenant_id()));
-- no insert/update/delete policy: only the SECURITY DEFINER trigger writes here
create index on public.audit_log (tenant_id, created_at desc);
```

- [ ] **Step 2: Write the Worker** (keepalive + nightly overdue flip)

```ts
// worker/src/index.ts
export default {
  async scheduled(_event: ScheduledEvent, env: Env) {
    const res = await fetch(`${env.SUPABASE_URL}/rest/v1/rpc/flip_overdue`, {
      method: "POST",
      headers: {
        apikey: env.SUPABASE_SERVICE_KEY,
        Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`,
        "Content-Type": "application/json",
      },
      body: "{}",
    });
    if (!res.ok) throw new Error(`flip_overdue failed: ${res.status}`);
  },
};
interface Env { SUPABASE_URL: string; SUPABASE_SERVICE_KEY: string }
```

```toml
# worker/wrangler.toml
name = "aqsati-cron"
main = "src/index.ts"
compatibility_date = "2026-01-01"

[triggers]
crons = ["0 1 * * *"]   # 03:00 Cairo (01:00 UTC) daily
```

> This single cron does double duty: it runs the nightly overdue job **and** its database call is the daily ping that stops Supabase from pausing the free project.

- [ ] **Step 3: Set the secret** (never commit it)

```bash
npx wrangler secret put SUPABASE_SERVICE_KEY
```

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/0002_audit.sql worker/
git commit -m "feat: audit trigger + cron worker (overdue flip + keepalive)"
```

---

### Phase 1 — The money engine (TDD, highest risk)

> **Invoke `superpowers:test-driven-development` before this phase.** These two functions are the mathematical heart of the product. Every downstream number — balances, aging, dashboards, reports — is wrong if they are wrong.

### Task 4: Schedule generation

**Files:**
- Create: `supabase/migrations/0005_money_fns.sql`, `supabase/tests/schedule_test.sql`

**Interfaces:**
- Produces: `public.build_schedule(p_financed numeric, p_annual_rate numeric, p_num int, p_start date, p_method text) returns table(seq_no int, due_date date, amount_due numeric)`. Task 6 calls this when a contract is created.

- [ ] **Step 1: Write the failing test**

```sql
-- supabase/tests/schedule_test.sql
begin;
select plan(4);

-- Case A: clean division. 15,000 financed @ 18% flat over 12 months
-- interest = 15000 * 0.18 = 2700 ; total = 17700 ; each = 1475.00
select is( (select sum(amount_due) from public.build_schedule(15000,0.18,12,'2026-09-01','flat')),
           17700.00::numeric, 'A: installments sum to total payable' );
select is( (select amount_due from public.build_schedule(15000,0.18,12,'2026-09-01','flat') where seq_no=1),
           1475.00::numeric, 'A: first installment correct' );

-- Case B: residual. 10,000 financed @ 10% flat over 3 months
-- interest = 1000 ; total = 11000 ; 11000/3 = 3666.6667 -> 3666.67 x2, last absorbs residual
select is( (select sum(amount_due) from public.build_schedule(10000,0.10,3,'2026-09-01','flat')),
           11000.00::numeric, 'B: rounding residual does not break the total' );
select is( (select amount_due from public.build_schedule(10000,0.10,3,'2026-09-01','flat') where seq_no=3),
           3666.66::numeric, 'B: last installment absorbs the residual' );

select * from finish();
rollback;
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `npx supabase test db`
Expected: FAIL — `function public.build_schedule(...) does not exist`

- [ ] **Step 3: Implement**

```sql
create or replace function public.build_schedule(
  p_financed numeric, p_annual_rate numeric, p_num int,
  p_start date, p_method text default 'flat'
) returns table(seq_no int, due_date date, amount_due numeric)
language plpgsql immutable as $$
declare
  v_interest numeric(14,2);
  v_total    numeric(14,2);
  v_base     numeric(14,2);
  i int;
begin
  if p_num < 1 then raise exception 'num_installments must be >= 1'; end if;

  v_interest := case
    when p_method = 'zero' then 0
    -- flat/add-on: the rate is a flat rate on the full financed amount for the whole
    -- term (NOT annualized/prorated by month count — do not divide by 12 here)
    else round(p_financed * p_annual_rate, 2)
  end;

  v_total := p_financed + v_interest;
  v_base  := round(v_total / p_num, 2);

  for i in 1..p_num loop
    seq_no    := i;
    due_date  := (p_start + make_interval(months => i - 1))::date;
    -- last installment absorbs any rounding residual so the sum is exact
    amount_due := case when i < p_num then v_base
                       else v_total - (v_base * (p_num - 1)) end;
    return next;
  end loop;
end $$;
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx supabase test db`
Expected: PASS — 4/4.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/0005_money_fns.sql supabase/tests/schedule_test.sql
git commit -m "feat(money): schedule generation with exact-sum rounding"
```

---

### Task 5: Payment allocation waterfall

**Files:**
- Modify: `supabase/migrations/0005_money_fns.sql`
- Create: `supabase/tests/allocation_test.sql`

**Interfaces:**
- Consumes: `installment` table from Task 6 (create that table's migration first if executing strictly in order — the function is written against its columns `id, contract_id, seq_no, due_date, amount_due, amount_paid, status`).
- Produces: `public.allocate_payment(p_contract uuid, p_amount numeric) returns numeric` (returns unallocated remainder). Task 7 adds a second overload, `allocate_payment(p_payment uuid, p_contract uuid, p_amount numeric)`, once `payment`/`payment_allocation` exist — this 2-arg version stays exactly as built here for the Phase-1 pgTAP test.

- [ ] **Step 1: Write the failing test**

```sql
-- supabase/tests/allocation_test.sql
begin;
select plan(3);

-- fixture: two installments of 3000, the first overdue
insert into public.contract(id, tenant_id, customer_id, total_price, num_installments, status)
  values ('11111111-1111-1111-1111-111111111111', ...);  -- see Task 6 fixture helper
insert into public.installment(contract_id, seq_no, due_date, amount_due, amount_paid, status) values
  ('11111111-1111-1111-1111-111111111111',1,'2026-07-01',3000,0,'overdue'),
  ('11111111-1111-1111-1111-111111111111',2,'2026-08-01',3000,0,'pending');

-- pay 5000: oldest first -> 3000 clears #1, 2000 partially pays #2
select is( public.allocate_payment('11111111-1111-1111-1111-111111111111', 5000),
           0.00::numeric, 'nothing left unallocated' );
select is( (select status from public.installment where seq_no=1), 'paid',    'oldest installment cleared' );
select is( (select amount_paid from public.installment where seq_no=2), 2000.00::numeric, 'remainder partially pays next' );

select * from finish();
rollback;
```

- [ ] **Step 2: Run and confirm failure**

Run: `npx supabase test db`
Expected: FAIL — `function public.allocate_payment(...) does not exist`

- [ ] **Step 3: Implement**

```sql
create or replace function public.allocate_payment(p_contract uuid, p_amount numeric)
returns numeric language plpgsql as $$
declare
  r record;
  v_left numeric(14,2) := p_amount;
  v_take numeric(14,2);
begin
  -- oldest-due first
  for r in
    select id, amount_due, amount_paid
    from public.installment
    where contract_id = p_contract and status <> 'paid'
    order by due_date, seq_no
    for update
  loop
    exit when v_left <= 0;
    v_take := least(v_left, r.amount_due - r.amount_paid);

    update public.installment
       set amount_paid = amount_paid + v_take,
           status = case when amount_paid + v_take >= amount_due then 'paid' else 'partial' end,
           paid_at = case when amount_paid + v_take >= amount_due then now() else paid_at end
     where id = r.id;

    v_left := v_left - v_take;
  end loop;

  return v_left;  -- overpayment remainder -> caller stores as credit
end $$;
```

- [ ] **Step 4: Verify tests pass**

Run: `npx supabase test db`
Expected: PASS — all allocation + schedule tests green.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/0005_money_fns.sql supabase/tests/allocation_test.sql
git commit -m "feat(money): oldest-first payment allocation waterfall"
```

---

### Phase 2 — Domain tables

### Task 6: Customers, contracts, installments

**Files:**
- Create: `supabase/migrations/0003_customers.sql`, `supabase/migrations/0004_contracts.sql`

- [ ] **Step 1: Write the migrations**

```sql
-- 0003_customers.sql
create table public.customer (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenant(id) on delete cascade,
  name text not null,
  phone text not null,
  national_id text,
  address text,
  blacklist_flag boolean not null default false,
  created_at timestamptz not null default now()
);
alter table public.customer enable row level security;
create policy customer_read on public.customer for select to authenticated
  using (tenant_id = (select public.current_tenant_id()));
create policy customer_write on public.customer for insert to authenticated
  with check (tenant_id = (select public.current_tenant_id())
              and public.current_role() in ('owner','manager','accountant'));
create policy customer_update on public.customer for update to authenticated
  using (tenant_id = (select public.current_tenant_id()))
  with check (tenant_id = (select public.current_tenant_id())
              and public.current_role() in ('owner','manager','accountant'));
create policy customer_delete on public.customer for delete to authenticated
  using (tenant_id = (select public.current_tenant_id())
         and public.current_role() in ('owner','manager'));
create index on public.customer (tenant_id, phone);
create trigger customer_audit after insert or update or delete
  on public.customer for each row execute function public.fn_audit();
```

```sql
-- 0004_contracts.sql
create table public.contract (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenant(id) on delete cascade,
  branch_id uuid references public.branch(id),
  customer_id uuid not null references public.customer(id),
  product_desc text,
  total_price numeric(14,2) not null,
  down_payment numeric(14,2) not null default 0,
  interest_rate numeric(6,4) not null default 0,
  interest_method text not null default 'flat' check (interest_method in ('flat','reducing','zero')),
  num_installments int not null check (num_installments >= 1),
  start_date date not null,
  status text not null default 'active'
    check (status in ('draft','active','completed','defaulted','void')),
  created_at timestamptz not null default now()
);

create table public.installment (
  id uuid primary key default gen_random_uuid(),
  contract_id uuid not null references public.contract(id) on delete cascade,
  seq_no int not null,
  due_date date not null,
  amount_due numeric(14,2) not null,
  amount_paid numeric(14,2) not null default 0,
  status text not null default 'pending'
    check (status in ('pending','partial','paid','overdue','waived')),
  paid_at timestamptz,
  unique (contract_id, seq_no)
);

alter table public.contract    enable row level security;
alter table public.installment enable row level security;

create policy contract_read on public.contract for select to authenticated
  using (tenant_id = (select public.current_tenant_id()));
create policy contract_write on public.contract for insert to authenticated
  with check (tenant_id = (select public.current_tenant_id())
              and public.current_role() in ('owner','manager','accountant'));
create policy contract_update on public.contract for update to authenticated
  using (tenant_id = (select public.current_tenant_id()))
  with check (tenant_id = (select public.current_tenant_id())
              and public.current_role() in ('owner','manager','accountant'));
create policy contract_delete on public.contract for delete to authenticated
  using (tenant_id = (select public.current_tenant_id())
         and public.current_role() in ('owner','manager'));

-- installments inherit isolation through their parent contract; direct client writes
-- are role-gated the same as contracts. Collectors record payments through the
-- record_payment() RPC (Task 7), which is SECURITY DEFINER and does its own role
-- check, so they never need a direct installment-write policy.
create policy installment_read on public.installment for select to authenticated
  using (exists (select 1 from public.contract c
                 where c.id = contract_id and c.tenant_id = (select public.current_tenant_id())));
create policy installment_write on public.installment for insert to authenticated
  with check (exists (select 1 from public.contract c
                       where c.id = contract_id and c.tenant_id = (select public.current_tenant_id())
                       and public.current_role() in ('owner','manager','accountant')));
create policy installment_update on public.installment for update to authenticated
  using (exists (select 1 from public.contract c
                 where c.id = contract_id and c.tenant_id = (select public.current_tenant_id())))
  with check (exists (select 1 from public.contract c
                       where c.id = contract_id and c.tenant_id = (select public.current_tenant_id())
                       and public.current_role() in ('owner','manager','accountant')));
-- no delete policy on installment: installments are never deleted, only transitioned via status

create index on public.contract (tenant_id, status);
create index on public.installment (contract_id, due_date);
create index on public.installment (due_date, status);
create trigger contract_audit after insert or update or delete
  on public.contract for each row execute function public.fn_audit();
create trigger installment_audit after insert or update or delete
  on public.installment for each row execute function public.fn_audit();
```

- [ ] **Step 2: Add the contract-creation RPC** (wraps schedule generation in one transaction)

```sql
create or replace function public.create_contract(p jsonb)
returns uuid language plpgsql security invoker as $$
declare v_id uuid; v_financed numeric(14,2);
begin
  insert into public.contract(tenant_id, branch_id, customer_id, product_desc,
                              total_price, down_payment, interest_rate,
                              interest_method, num_installments, start_date)
  values (public.current_tenant_id(), (p->>'branch_id')::uuid, (p->>'customer_id')::uuid,
          p->>'product_desc', (p->>'total_price')::numeric, (p->>'down_payment')::numeric,
          (p->>'interest_rate')::numeric, p->>'interest_method',
          (p->>'num_installments')::int, (p->>'start_date')::date)
  returning id into v_id;

  v_financed := (p->>'total_price')::numeric - (p->>'down_payment')::numeric;

  insert into public.installment(contract_id, seq_no, due_date, amount_due)
  select v_id, s.seq_no, s.due_date, s.amount_due
  from public.build_schedule(v_financed, (p->>'interest_rate')::numeric,
                             (p->>'num_installments')::int, (p->>'start_date')::date,
                             p->>'interest_method') s;
  return v_id;
end $$;
```

- [ ] **Step 3: Apply and smoke-test** — call `create_contract` from the Supabase SQL editor with the Task 4 Case-A numbers. Expected: 12 installment rows of 1,475.00 summing to 17,700.00.
- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/0003_customers.sql supabase/migrations/0004_contracts.sql
git commit -m "feat(db): customers, contracts, installments + create_contract RPC"
```

---

### Task 7: Payments, آجل invoices, dashboard views

**Files:**
- Create: `supabase/migrations/0006_payments.sql`, `0007_credit_invoices.sql`, `0008_dashboard_views.sql`

- [ ] **Step 1: Payments + receipt numbering**

```sql
create table public.payment (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenant(id) on delete cascade,
  customer_id uuid not null references public.customer(id),
  contract_id uuid references public.contract(id),
  credit_invoice_id uuid,
  amount numeric(14,2) not null check (amount > 0),
  method text not null default 'cash'
    check (method in ('cash','instapay','fawry','wallet','card','bank')),
  reference text,
  receipt_no bigint,
  source text not null default 'manual' check (source in ('manual','auto','field')),
  received_at timestamptz not null default now()
);
alter table public.payment enable row level security;
create policy payment_read on public.payment for select to authenticated
  using (tenant_id = (select public.current_tenant_id()));
-- no insert/update/delete policy: all writes go through record_payment() (SECURITY
-- DEFINER, defined in Step 2 below once credit_invoice/payment_allocation exist)
create index on public.payment (tenant_id, received_at desc);
create trigger payment_audit after insert or update or delete
  on public.payment for each row execute function public.fn_audit();

-- gapless, collision-proof per-tenant receipt numbers
alter table public.payment add constraint payment_receipt_no_unique unique (tenant_id, receipt_no);

create or replace function public.fn_receipt_no() returns trigger
language plpgsql as $$
begin
  -- lock the tenant row to serialize concurrent inserts for the same tenant;
  -- without this, two simultaneous payments can both read the same max() and collide
  perform 1 from public.tenant where id = new.tenant_id for update;
  select coalesce(max(receipt_no),0)+1 into new.receipt_no
  from public.payment where tenant_id = new.tenant_id;
  return new;
end $$;
create trigger payment_receipt before insert on public.payment
  for each row execute function public.fn_receipt_no();
```

> `record_payment()`, `allocate_payment(p_payment, ...)`, and `allocate_credit_payment()` are defined in **Step 2** below — they need `credit_invoice` and `payment_allocation` to exist first, since `record_payment` now branches between an installment contract and an آجل invoice.

- [ ] **Step 2: آجل invoices with aging + payment allocation**

```sql
create table public.credit_invoice (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenant(id) on delete cascade,
  customer_id uuid not null references public.customer(id),
  invoice_no text,
  issue_date date not null default current_date,
  due_date date not null,
  amount numeric(14,2) not null,
  amount_paid numeric(14,2) not null default 0,
  status text not null default 'open' check (status in ('open','partial','paid'))
);
alter table public.credit_invoice enable row level security;

create policy ci_read on public.credit_invoice for select to authenticated
  using (tenant_id = (select public.current_tenant_id()));
create policy ci_write on public.credit_invoice for insert to authenticated
  with check (tenant_id = (select public.current_tenant_id())
              and public.current_role() in ('owner','manager','accountant'));
create policy ci_update on public.credit_invoice for update to authenticated
  using (tenant_id = (select public.current_tenant_id()))
  with check (tenant_id = (select public.current_tenant_id())
              and public.current_role() in ('owner','manager','accountant'));

create trigger credit_invoice_audit after insert or update or delete
  on public.credit_invoice for each row execute function public.fn_audit();

alter table public.payment
  add constraint payment_credit_invoice_fk foreign key (credit_invoice_id) references public.credit_invoice(id);

create view public.v_aging as
select tenant_id, customer_id, id, due_date, (amount - amount_paid) as outstanding,
  case
    when due_date >= current_date then 'current'
    when current_date - due_date between 1 and 30  then 'b1_30'
    when current_date - due_date between 31 and 60 then 'b31_60'
    when current_date - due_date between 61 and 90 then 'b61_90'
    else 'b90_plus'
  end as bucket
from public.credit_invoice where status <> 'paid';

-- traces exactly which installment(s)/invoice a payment funded — needed so a payment
-- can later be voided/reversed correctly, and for itemized receipt detail
create table public.payment_allocation (
  id uuid primary key default gen_random_uuid(),
  payment_id uuid not null references public.payment(id) on delete cascade,
  installment_id uuid references public.installment(id),
  credit_invoice_id uuid references public.credit_invoice(id),
  amount numeric(14,2) not null check (amount > 0),
  check (num_nonnulls(installment_id, credit_invoice_id) = 1)
);
alter table public.payment_allocation enable row level security;
create policy payment_allocation_read on public.payment_allocation for select to authenticated
  using (exists (select 1 from public.payment p
                 where p.id = payment_id and p.tenant_id = (select public.current_tenant_id())));
-- no write policy: only allocate_payment()/allocate_credit_payment() (SECURITY DEFINER) write here
create index on public.payment_allocation (payment_id);

-- Task 5 defined allocate_payment(contract, amount) for the Phase-1 pgTAP test; this
-- overload adds payment-id tracing now that payment/payment_allocation exist.
create or replace function public.allocate_payment(p_payment uuid, p_contract uuid, p_amount numeric)
returns numeric language plpgsql security definer set search_path = public as $$
declare
  r record;
  v_left numeric(14,2) := p_amount;
  v_take numeric(14,2);
begin
  for r in
    select id, amount_due, amount_paid
    from public.installment
    where contract_id = p_contract and status <> 'paid'
    order by due_date, seq_no
    for update
  loop
    exit when v_left <= 0;
    v_take := least(v_left, r.amount_due - r.amount_paid);

    update public.installment
       set amount_paid = amount_paid + v_take,
           status = case when amount_paid + v_take >= amount_due then 'paid' else 'partial' end,
           paid_at = case when amount_paid + v_take >= amount_due then now() else paid_at end
     where id = r.id;

    insert into public.payment_allocation(payment_id, installment_id, amount)
    values (p_payment, r.id, v_take);

    v_left := v_left - v_take;
  end loop;

  return v_left;
end $$;
-- internal helper only, called from record_payment() below via its SECURITY
-- DEFINER context (which works regardless of the caller's own grants) — not
-- a public entry point. Closing this needs all three: revoke the implicit
-- PUBLIC grant every new function gets, AND revoke Supabase's separate
-- project-level default grant to anon/authenticated (neither alone is
-- sufficient — see the identical fix on Task 2's tenancy functions).
revoke all on function public.allocate_payment(uuid, uuid, numeric) from public;
revoke execute on function public.allocate_payment(uuid, uuid, numeric) from anon, authenticated;

-- آجل counterpart to allocate_payment — a credit_invoice has no per-installment
-- schedule, so it's a single running balance rather than a waterfall loop
create or replace function public.allocate_credit_payment(p_payment uuid, p_invoice uuid, p_amount numeric)
returns numeric language plpgsql security definer set search_path = public as $$
declare
  v_due numeric(14,2);
  v_paid numeric(14,2);
  v_take numeric(14,2);
begin
  select amount, amount_paid into v_due, v_paid
  from public.credit_invoice where id = p_invoice for update;

  v_take := least(p_amount, v_due - v_paid);

  update public.credit_invoice
     set amount_paid = amount_paid + v_take,
         status = case when amount_paid + v_take >= amount then 'paid' else 'partial' end
   where id = p_invoice;

  insert into public.payment_allocation(payment_id, credit_invoice_id, amount)
  values (p_payment, p_invoice, v_take);

  return p_amount - v_take;  -- overpayment remainder, if any
end $$;
-- internal helper only, same reasoning as allocate_payment above
revoke all on function public.allocate_credit_payment(uuid, uuid, numeric) from public;
revoke execute on function public.allocate_credit_payment(uuid, uuid, numeric) from anon, authenticated;

-- record a payment against either a contract (installments) or a credit_invoice
-- (آجل), and allocate it atomically. SECURITY DEFINER + explicit role check so a
-- collector can call it without needing a direct write policy on payment/installment.
create or replace function public.record_payment(
  p_contract uuid, p_credit_invoice uuid, p_customer uuid, p_amount numeric, p_method text
) returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_tenant uuid := public.current_tenant_id();
begin
  if public.current_role() not in ('owner','manager','accountant','collector') then
    raise exception 'not authorized to record payments';
  end if;

  insert into public.payment(tenant_id, customer_id, contract_id, credit_invoice_id, amount, method)
  values (v_tenant, p_customer, p_contract, p_credit_invoice, p_amount, p_method)
  returning id into v_id;

  if p_contract is not null then
    perform public.allocate_payment(v_id, p_contract, p_amount);
  elsif p_credit_invoice is not null then
    perform public.allocate_credit_payment(v_id, p_credit_invoice, p_amount);
  else
    raise exception 'must specify either p_contract or p_credit_invoice';
  end if;

  return v_id;
end $$;
-- record_payment IS a legitimate client entry point (called by authenticated
-- users), gated by its own internal current_role() check above — anon must
-- still be blocked explicitly (auth.uid() being null would fail harmlessly,
-- but don't rely on that — see Task 2's identical finding).
revoke all on function public.record_payment(uuid, uuid, uuid, numeric, text) from public;
revoke execute on function public.record_payment(uuid, uuid, uuid, numeric, text) from anon;
grant execute on function public.record_payment(uuid, uuid, uuid, numeric, text) to authenticated;
```

- [ ] **Step 3: Dashboard views + the overdue flip the Worker calls**

```sql
create view public.v_collections_kpi as
select c.tenant_id,
  sum(i.amount_due - i.amount_paid) filter (
    where i.status <> 'paid' and i.due_date between current_date and current_date + 7
  ) as expected_this_week,
  sum(i.amount_paid) filter (where date_trunc('month', i.paid_at) = date_trunc('month', now())) as collected_this_month,
  sum(i.amount_due - i.amount_paid) filter (where i.status = 'overdue') as overdue_total
from public.installment i join public.contract c on c.id = i.contract_id
group by c.tenant_id;

create view public.v_worklist as
select c.tenant_id, c.id as contract_id, cu.id as customer_id, cu.name, cu.phone,
       i.id as installment_id, i.due_date, (i.amount_due - i.amount_paid) as amount,
       (current_date - i.due_date) as days_late, i.status
from public.installment i
join public.contract c  on c.id = i.contract_id
join public.customer cu on cu.id = c.customer_id
where i.status in ('pending','partial','overdue') and i.due_date <= current_date + 7;

-- called nightly by the Cloudflare Worker using the service_role key (which
-- bypasses grants entirely) — anon/authenticated have no legitimate reason
-- to trigger this directly. Closing this needs both the implicit PUBLIC
-- grant every new function gets AND Supabase's separate project-level
-- default grant to anon/authenticated (neither alone is sufficient — see
-- the identical fix on Task 2's tenancy functions).
create or replace function public.flip_overdue() returns int
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  update public.installment set status = 'overdue'
   where status in ('pending','partial') and due_date < current_date;
  get diagnostics n = row_count;
  return n;
end $$;
revoke all on function public.flip_overdue() from public;
revoke execute on function public.flip_overdue() from anon, authenticated;
```

- [ ] **Step 4: Apply, then commit**

```bash
npx supabase db push
git add supabase/migrations/
git commit -m "feat(db): payments, credit invoices, aging + dashboard views"
```

---

### Phase 3 — Frontend

> **Invoke `frontend-design` before Task 8** to set the visual direction. Reuse the design language already established in the published wireframes (deep teal `#0E7C6B` + ink navy, amber accent, semantic green/amber/red for status).

### Task 8: App shell, RTL, auth

**Files:**
- Create: `web/src/lib/supabase.ts`, `web/src/lib/format.ts`, `web/src/routes/*`, `web/index.html`

- [ ] **Step 1: Set RTL globally** — in `web/index.html`: `<html lang="ar" dir="rtl">`. In Tailwind, use logical properties only.
- [ ] **Step 2: Typed Supabase client**

```ts
// web/src/lib/supabase.ts
import { createClient } from "@supabase/supabase-js";
export const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY
);
```

Generate types: `npx supabase gen types typescript --linked > web/src/lib/database.types.ts`

- [ ] **Step 3: Display-only formatters** (the frontend never calculates money)

```ts
// web/src/lib/format.ts
export const egp = (n: number) =>
  new Intl.NumberFormat("ar-EG", { style: "currency", currency: "EGP",
    minimumFractionDigits: 2 }).format(n);
export const arDate = (d: string) =>
  new Intl.DateTimeFormat("ar-EG", { dateStyle: "medium",
    timeZone: "Africa/Cairo" }).format(new Date(d));
```

> **Deliberate MVP substitution:** `02-feature-specs.md` / `04-ux-flows.md` specify phone+OTP auth. Supabase's free tier has no bundled SMS provider — OTP needs a paid Twilio/MessageBird add-on — so the MVP uses **Supabase email/password** to stay at $0. Upgrade to phone+OTP once a paying-customer budget covers SMS; it's required anyway for §15's customer self-service portal, which is already out of MVP scope for the same reason.

- [ ] **Step 4: Auth + protected routes** — Supabase email/password login. Immediately after `supabase.auth.signUp(...)` succeeds, call `supabase.rpc('signup_tenant', { p_tenant_name, p_full_name })` (Task 2) to provision the new tenant + owner profile before routing into the app. Redirect unauthenticated users to `/login`; load the user's `profile` (tenant + role) into a context on boot.
- [ ] **Step 5: Commit**

```bash
git add web/src && git commit -m "feat(web): RTL app shell, auth, typed client"
```

---

### Task 9: Contract wizard

**Files:**
- Create: `web/src/features/contracts/ContractWizard.tsx`, `ScheduleTable.tsx`

Build the 5-step flow already designed in the wireframe (customer → product/price → terms → schedule preview → confirm).

- [ ] **Step 1: Zod schema for terms**

```ts
export const termsSchema = z.object({
  customer_id: z.string().uuid(),
  total_price: z.coerce.number().positive(),
  down_payment: z.coerce.number().min(0),
  interest_rate: z.coerce.number().min(0).max(1),
  interest_method: z.enum(["flat", "reducing", "zero"]),
  num_installments: z.coerce.number().int().min(1).max(120),
  start_date: z.string(),
}).refine(v => v.down_payment < v.total_price, {
  message: "الدفعة المقدمة لازم تكون أقل من السعر الكلي", path: ["down_payment"],
});
```

- [ ] **Step 2: Live schedule preview — call the database, don't recalculate in JS**

```ts
const { data: schedule } = useQuery({
  queryKey: ["schedule", terms],
  enabled: termsSchema.safeParse(terms).success,
  queryFn: async () => {
    const { data, error } = await supabase.rpc("build_schedule", {
      p_financed: terms.total_price - terms.down_payment,
      p_annual_rate: terms.interest_rate,
      p_num: terms.num_installments,
      p_start: terms.start_date,
      p_method: terms.interest_method,
    });
    if (error) throw error;
    return data;
  },
});
```

> This is the important architectural rule in practice: **the preview the merchant sees is generated by the exact same function that will persist the contract.** Preview and reality cannot diverge.

- [ ] **Step 3: Submit via `create_contract` RPC**, then navigate to the contract detail page.
- [ ] **Step 4: Verify** — create a contract with 18,000 / 3,000 down / 18% / 12. Expected: 12 rows of ١٬٤٧٥٫٠٠ summing to ١٧٬٧٠٠٫٠٠.
- [ ] **Step 5: Commit**

```bash
git add web/src/features/contracts && git commit -m "feat(web): contract wizard with live DB-backed schedule preview"
```

---

### Task 10: Collections dashboard + `wa.me` reminders

**Files:**
- Create: `web/src/features/dashboard/Dashboard.tsx`, `AgingBars.tsx`, `Worklist.tsx`, `web/src/lib/whatsapp.ts`

> **Invoke the `dataviz` skill before writing the chart.**

- [ ] **Step 1: KPI tiles + aging** — query `v_collections_kpi` and `v_aging`. Encode state in form, not just number: green/amber/red chips and severity-colored aging bars (per the wireframe).
- [ ] **Step 2: The `wa.me` link builder — this is the MVP's reminder engine**

```ts
// web/src/lib/whatsapp.ts
export function reminderLink(p: {
  phone: string; name: string; amount: number; dueDate: string; merchant: string;
}) {
  // Egypt: strip leading 0, prefix country code 20
  const intl = p.phone.replace(/\D/g, "").replace(/^0/, "20");
  const msg =
    `أهلاً ${p.name} 👋\n` +
    `تذكير بقسط بمبلغ ${p.amount.toLocaleString("ar-EG")} ج.م ` +
    `مستحق بتاريخ ${p.dueDate}.\n` +
    `برجاء السداد في أقرب وقت. شكراً لتعاملك معنا — ${p.merchant}`;
  return `https://wa.me/${intl}?text=${encodeURIComponent(msg)}`;
}
```

- [ ] **Step 3: Wire it into the worklist** — each overdue row gets a "واتساب" button opening `reminderLink(...)` in a new tab, and a "تحصيل" button opening the record-payment modal.
- [ ] **Step 4: Log the touch** — after the merchant opens a reminder link, insert a `message_log` row so the dashboard can show "last reminded" and you can later prove uplift to design partners.
- [ ] **Step 5: Commit**

```bash
git add web/src/features/dashboard web/src/lib/whatsapp.ts
git commit -m "feat(web): collections dashboard + free wa.me reminders"
```

---

### Task 11: Payments, customers, reports

**Files:**
- Create: `web/src/features/payments/RecordPaymentModal.tsx`, `web/src/features/customers/*`, `web/src/features/reports/*`

- [ ] **Step 1: Record-payment modal** — calls `record_payment` RPC; on success invalidate the dashboard and contract queries so tiles update immediately.
- [ ] **Step 2: Receipt (سند قبض)** — print-friendly HTML route (`@media print`), no PDF library needed for MVP.
- [ ] **Step 3: Customer 360** — profile + contracts + آجل invoices + total outstanding + payment timeline.
- [ ] **Step 4: Three reports** — aging, collections by period, customer statement (كشف حساب). Export to CSV with a UTF-8 BOM (`﻿`) so Arabic opens correctly in Excel.
- [ ] **Step 5: Commit**

```bash
git add web/src/features && git commit -m "feat(web): payments, customer 360, reports with Arabic-safe CSV"
```

---

### Phase 4 — Ship

### Task 12: Deploy + harden

- [ ] **Step 1: Deploy the frontend to Cloudflare Pages**

```bash
npx wrangler pages deploy web/dist --project-name aqsati
```

Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` as Pages build environment variables. Connect the Git repo for automatic deploys on push.

- [ ] **Step 2: Deploy the cron Worker**

```bash
npx wrangler deploy --config worker/wrangler.toml
```

- [ ] **Step 3: Run the Supabase security advisor** — Dashboard → Advisors. Expected: **zero** "RLS disabled" findings. Fix any before going live.
- [ ] **Step 4: Verify tenant isolation and role enforcement with real accounts** — sign up two fresh accounts via the real `signup_tenant` flow (not the dashboard) to get tenant A and tenant B. As tenant A, attempt to fetch a known tenant-B contract id directly via the client. Expected: empty result, not an error. Then, as a `viewer`-role profile in tenant A, attempt to insert a contract via the client. Expected: an RLS-denied error — proving the role matrix from `02-feature-specs.md` §0.2 is enforced at the database, not just hidden in the UI.
- [ ] **Step 5: Commit and tag**

```bash
git commit -am "chore: production deploy config" && git tag v0.1.0-mvp
```

---

## 6. Verification (end-to-end, before calling it done)

> Invoke `superpowers:verification-before-completion`. Run these and paste real output — do not assert success without it.

1. **Money engine:** `npx supabase test db` → all pgTAP tests pass.
2. **Tenant isolation:** two tenants, cross-tenant id probe returns empty. Supabase Advisors shows no RLS gaps.
3. **Full journey on the deployed site:** sign up → create customer → create contract (18,000/3,000/18%/12) → confirm 12 × 1,475 = 17,700 → record a 1,475 payment → installment #1 flips to `paid` → dashboard tiles update → open a `wa.me` reminder and confirm the Arabic message is pre-filled correctly.
4. **Partial payment:** pay 700 against a 1,475 installment → status `partial`, `amount_paid` = 700, balance correct.
5. **Overdue job:** backdate an installment, invoke `flip_overdue`, confirm status → `overdue` and it appears in the worklist and aging bucket.
6. **Audit:** confirm every one of the above wrote an `audit_log` row.
7. **Arabic/RTL:** no clipped or mirrored layout; CSV export opens in Excel with Arabic intact.
8. **Keepalive:** confirm the Worker cron ran (Cloudflare dashboard → Worker → Logs) and the Supabase project stays active.

---

## 7. Cost summary

| Item | MVP cost |
|---|---|
| Supabase (DB, auth, storage, RLS) | **$0** |
| Cloudflare Pages (frontend + SSL + custom domain) | **$0** |
| Cloudflare Workers (cron + keepalive) | **$0** |
| WhatsApp reminders via `wa.me` links | **$0** |
| Domain name (optional, recommended) | ~$10/yr |
| **Total** | **$0/mo + optional domain** |

**First things that will cost money — and the trigger to pay for each:**
- **Supabase Pro ($25/mo)** — when you exceed 500 MB, need daily backups, or want the pause risk gone entirely. Trigger: first paying customers.
- **WhatsApp Cloud API (~$0.008–0.012/utility message)** — when merchants ask for *automatic* reminders rather than tap-to-send. Sell it as the metered add-on already in your pricing model, so it's revenue-positive from day one.

---

## 8. Self-review notes

- **Spec coverage:** §0 (tenancy/auth/audit/RTL) → Tasks 2, 3, 8. §1 customers → Task 6/11. §2 contracts + schedule → Tasks 4, 6, 9. §3 آجل → Task 7. §4 payments/allocation → Tasks 5, 7, 11. §5 dashboard → Task 10. §6 reminders → Task 10 (`wa.me` variant). §7 reports → Task 11. §18 billing and §8–17 are explicitly out of MVP scope (§2 above).
- **Known gap to close in execution:** Task 5's pgTAP fixture references a contract-insert helper defined in Task 6. If executing strictly in order, apply the Task 6 migration before running the allocation test, or inline a minimal tenant/customer/contract fixture at the top of `allocation_test.sql`.
- **Reducing-balance interest** is accepted by the schema's `interest_method` check but `build_schedule` currently implements `flat` and `zero` only. Flat is the dominant Egyptian method, so this is correct for MVP — add the reducing-balance branch (with an early-payoff rebate) when a design partner asks for it.
- **Fixes applied per fix-plan review:** the schedule interest formula (was prorating by term length, contradicting its own comment and failing its own Case-B test), a `signup_tenant()` RPC to make self-serve onboarding actually possible, role-aware RLS on `customer`/`contract`/`installment`/`credit_invoice` matching the §0.2 permission matrix (previously tenant-isolation-only), آجل payment allocation via `allocate_credit_payment()` (previously credit invoices had no way to record a payment at all), a `payment_allocation` table for traceability/future reversal support, a `credit_invoice` audit trigger (previously the only unaudited financial table), a lock + unique constraint fixing a `receipt_no` race condition, and an explicit callout that email/password auth is a deliberate free-tier substitution for the spec's phone+OTP. See the task-by-task edits above for details.
