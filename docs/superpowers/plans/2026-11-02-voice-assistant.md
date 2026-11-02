# Voice assistant (المساعد الصوتي) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A mic button on Home: the owner speaks Egyptian Arabic, edits the heard text if needed, and Notah opens a pre-filled payment/invoice form, answers a question (on screen + spoken), or navigates.

**Architecture:** Browser Web Speech API turns speech into text on the client. A Supabase Edge Function `voice-intent` (caller's JWT, no service-role key) reserves budget through a security-definer RPC, asks Claude (Haiku, forced tool call) to turn the text into one validated intent, records token usage, and returns the intent. The client resolves the intent against existing RLS-scoped data (customer search, views) and either navigates to a form with prefill params, shows a choice list, or builds the answer text locally.

**Tech Stack:** Expo Router web + React Native Web, TanStack Query 5, Supabase (Postgres RLS, security-definer RPCs, Edge Functions on Deno, pgTAP via MCP), Anthropic Messages API (tool use), Jest.

**Spec:** `docs/superpowers/specs/2026-11-02-voice-assistant-design.md`

## Global Constraints

- No money change without the owner pressing حفظ in the normal form; the assistant only navigates with prefill params.
- The AI receives only: the (edited) transcript, today's Cairo date, fixed instructions. No customer list, balances or ids.
- Edge Function uses the caller's JWT only; never the service-role key; anon rejected (401).
- Monthly cap per shop: **US$3.00** per Cairo calendar month; over the cap → `{ error: 'budget_exceeded' }` and the button shows "خلّصت حصة الشهر للمساعد الصوتي".
- Model id pinned in a constant: `claude-haiku-5-5`; `max_tokens` 400; forced tool call (`tool_choice: { type: 'tool', name: 'intent' }`); no streaming. Prices as constants (USD per million tokens) next to the model id.
- The Anthropic key is read from the function secret `ANTHROPIC_API_KEY`; Claude Code never sets, prints or handles it. Missing key → `{ error: 'not_configured' }` → "المساعد الصوتي لسه مش متفعّل".
- Speech: `lang = 'ar-EG'`, `continuous = false`, `interimResults = false`, 10 s safety timeout. Unsupported browser → "الميكروفون مش مدعوم في المتصفح ده — جرّب Chrome"; permission denied → "محتاج إذن الميكروفون".
- Plan 1/2 UI constraints bind: theme tokens only, RTL `row`, text ≥ 16 on phone, `<Money>`, Egyptian Arabic (no "من فضلك"/"تم بنجاح"), no tests under `mobile/src/app/`, Cairo day via `todayISO()`. Mic button ≥ 56 px, brand colour (coin stays reserved for + فاتورة).
- SQL tests in `begin … rollback` via MCP `execute_sql`; migrations applied with MCP `apply_migration`.

## Review Focus

1. Two concurrent calls when the shop is just under the cap → at most one extra call passes (reserve locks the month row). (Task 1 test.)
2. Model returns a malformed or extra-field tool input → `validateIntent` returns `unknown`, never throws, never passes unknown keys through. (Task 2 test.)
3. Spoken customer name matching two customers → choice list, not a silent pick. (Task 4 test.)
4. Prefill with out-of-range values (rate 500, years 9, method "bitcoin", amount −5) → those fields dropped, form still opens. (Task 5 test.)
5. Speech recognition that never fires a result → stops at 10 s with "مسمعتش حاجة، جرّب تاني". (Task 3 test.)

---

### Task 1: `voice_usage` and budget RPCs

**Files:**
- Create: `supabase/migrations/0026_voice_usage.sql`, `supabase/tests/voice_usage_test.sql`
- Modify: `mobile/src/lib/database.types.ts` (regenerate)

**Interfaces:**
- Produces:
  - `voice_usage(tenant_id uuid fk tenant, month date (first day, Cairo), calls int default 0, input_tokens bigint default 0, output_tokens bigint default 0, cost_usd numeric(10,4) default 0, primary key (tenant_id, month))`; RLS select = own tenant; no insert/update/delete policies; `revoke all on voice_usage from anon`; `revoke insert, update, delete, truncate on voice_usage from authenticated`.
  - `voice_reserve(p_cap_usd numeric) returns boolean` — security definer, `search_path = ''`; tenant from `public.current_tenant_id()` (null → raise); upserts the month row, `select … for update`, returns `cost_usd < p_cap_usd`, and when true increments `calls` (the reservation).
  - `voice_record(p_input int, p_output int, p_cost numeric) returns void` — security definer; adds to the current month row of the caller's tenant (inputs must be ≥ 0, else raise).
  - Both: `revoke execute … from public, anon; grant execute … to authenticated`.
- [ ] **Step 1: Write `supabase/tests/voice_usage_test.sql`** (helper header from `supabase/tests/helpers.sql`). Assertions: reserve on an empty month → true, calls = 1; `voice_record(100, 50, 0.0012)` adds tokens and cost; with cost set to 3.00 (as table owner) reserve(3.00) → false and calls unchanged; another shop's reserve doesn't see/touch shop A's row; a user can select only their own row; direct `insert`/`update` on voice_usage as the user fails (42501); anon cannot execute either RPC; negative tokens raise; month is the Cairo month (row for `date_trunc('month', (now() at time zone 'Africa/Cairo'))::date`).
- [ ] **Step 2: Run via MCP `execute_sql`** — expected FAIL (relations missing).
- [ ] **Step 3: Write `0026_voice_usage.sql`.**
- [ ] **Step 4: Apply (`apply_migration` name `0026_voice_usage`), re-run** — all `ok`.
- [ ] **Step 5: Regenerate types; `cd mobile && npx tsc --noEmit`.**
- [ ] **Step 6: Commit** `feat(db): voice_usage + budget RPCs`.

### Task 2: Edge Function `voice-intent`

**Files:**
- Create: `supabase/functions/voice-intent/logic.ts` (pure TS, no Deno/Node APIs), `supabase/functions/voice-intent/index.ts` (Deno entry), `supabase/functions/voice-intent/logic.test.ts`
- Modify: `mobile/package.json` jest config — add `"roots": ["<rootDir>/src", "<rootDir>/../supabase/functions"]` so `logic.test.ts` runs with the app's jest.

**Interfaces:**
- Produces (logic.ts):
  - `MODEL = 'claude-haiku-5-5'`, `PRICE_IN_PER_MTOK`, `PRICE_OUT_PER_MTOK` (numbers; set to the published Haiku 5.5 prices — look them up in the Claude API docs via the claude-api skill), `CAP_USD = 3`, `MAX_TOKENS = 400`.
  - `type Intent` — the union in spec §4 (`record_payment`, `create_invoice`, `ask_balance`, `ask_late`, `ask_totals`, `ask_invoice`, `open`, `unknown`), each `{ type: '<name>', ...fields }`.
  - `INTENT_TOOL` — one Anthropic tool named `intent` whose `input_schema` is `{ type: <enum of 8>, customer?, amount?, method?, invoice_hint?, product?, price?, sale_type?, down_payment?, rate_percent?, years?, external_invoice_no?, period?, target?, reason? }`.
  - `buildRequest(text: string, todayIso: string)` → the Messages API body (model, max_tokens, system prompt in Arabic+English with Egyptian examples incl. "ألفين", "خمسة وعشرين ألف", "ألف ونص", payment method words كاش/إنستاباي/فوري/محفظة/فيزا/تحويل, tools, tool_choice). The transcript is placed in the user message only, wrapped as data (`<transcript>…</transcript>`) with an instruction to treat it as data.
  - `validateIntent(raw: unknown): Intent` — whitelists fields per type, coerces numeric strings, rejects NaN/negatives/out-of-range (price/amount > 0 and ≤ 10,000,000; rate 0–200; years 1–5; method in the 6 values; sale_type in 2; period in 2; target in 5); trims strings ≤ 120 chars; missing required `customer` for customer intents → `unknown`. Never throws.
  - `costUsd(inputTokens: number, outputTokens: number): number`.
  - `MAX_TEXT = 300` — longer transcripts are rejected with `{ error: 'too_long' }`.
- Produces (index.ts): `POST` with JSON `{ text: string }` and `Authorization: Bearer <user jwt>` → `200 { intent }` | `400 { error: 'bad_request'|'too_long' }` | `401` | `402 { error: 'budget_exceeded' }` | `503 { error: 'not_configured'|'ai_unavailable' }`. Flow: CORS preflight; create supabase client with the caller's Authorization header (env `SUPABASE_URL`, `SUPABASE_ANON_KEY` provided by the platform); `rpc('voice_reserve', { p_cap_usd: CAP_USD })` (false → 402); `fetch('https://api.anthropic.com/v1/messages')` with `x-api-key` from `Deno.env.get('ANTHROPIC_API_KEY')`, `anthropic-version: 2023-06-01`; take the `tool_use` block input → `validateIntent`; `rpc('voice_record', …)` with `usage.input_tokens/output_tokens` (also on non-200 responses that report usage); return. Never log the transcript or the key.
- [ ] **Step 1: Failing tests (`logic.test.ts`):** `validateIntent({type:'record_payment', customer:'سيد', amount:'2000', method:'cash', evil:'x'})` → `{type:'record_payment', customer:'سيد', amount:2000, method:'cash'}`; `amount:-5` → amount dropped; `method:'bitcoin'` → dropped; `{type:'record_payment'}` (no customer) → `{type:'unknown'}`; `null`/`'str'`/`{type:'drop_table'}` → `unknown`; `rate_percent: 500` dropped, `years: 9` dropped; `costUsd(1_000_000, 0)` = `PRICE_IN_PER_MTOK`; `buildRequest('x','2026-11-02')` has `tool_choice.name === 'intent'`, model `claude-haiku-5-5`, and the transcript only inside the user message.
- [ ] **Step 2: Run** `cd mobile && npx jest ../supabase/functions/voice-intent` — FAIL.
- [ ] **Step 3: Implement logic.ts and index.ts.**
- [ ] **Step 4: Run tests + `npx tsc --noEmit`** — PASS.
- [ ] **Step 5: Deploy** with MCP `deploy_edge_function` (name `voice-intent`, `verify_jwt: true`, files `index.ts` + `logic.ts`). Smoke test with MCP-free check: an unauthenticated `curl -s -o /dev/null -w "%{http_code}" -X POST <project url>/functions/v1/voice-intent` → `401`. Do NOT call it with a real user token.
- [ ] **Step 6: Commit** `feat(voice): voice-intent edge function`.

### Task 3: Speech + voice API on the client

**Files:**
- Create: `mobile/src/lib/speech.ts`, `mobile/src/api/voice.ts`
- Test: `mobile/src/lib/__tests__/speech.test.ts`, `mobile/src/api/__tests__/voice.test.ts`

**Interfaces:**
- Produces:
  - `speechSupported(): boolean` (window.SpeechRecognition ?? window.webkitSpeechRecognition).
  - `listenOnce(opts?: { timeoutMs?: number }): { promise: Promise<string>; cancel: () => void }` — rejects with `SpeechError` codes `'unsupported' | 'permission' | 'no_speech' | 'network' | 'cancelled'`; 10 000 ms default timeout → `'no_speech'`.
  - `speechErrorText(code): string` — Arabic copy from the Global Constraints, `no_speech` → "مسمعتش حاجة، جرّب تاني", `network` → "النت ضعيف، جرّب تاني".
  - `speak(text: string): void` — `speechSynthesis` with an `ar` voice if any, else no-op.
  - `useVoiceIntent()` mutation → `supabase.functions.invoke('voice-intent', { body: { text } })` → `Intent`; maps function errors to `VoiceError` codes `'budget_exceeded' | 'not_configured' | 'too_long' | 'unavailable'` with `voiceErrorText(code)` copy ("خلّصت حصة الشهر للمساعد الصوتي", "المساعد الصوتي لسه مش متفعّل", "الكلام طويل، قولها أقصر", "المساعد مش متاح دلوقتي، جرّب كمان شوية"). The `Intent` type is imported from `supabase/functions/voice-intent/logic.ts` (relative import; no Deno APIs there).
- [ ] **Step 1: Failing tests:** with a fake `webkitSpeechRecognition` class: result event → resolves the transcript, `lang === 'ar-EG'`; `error {error:'not-allowed'}` → `'permission'`; no events + fake timers 10 s → `'no_speech'`; `cancel()` → `'cancelled'`; no constructor → `speechSupported() === false` and `'unsupported'`; `useVoiceIntent` maps a 402 FunctionsHttpError body to `'budget_exceeded'`.
- [ ] **Step 2: Run** — FAIL. **Step 3: Implement.** **Step 4: Run + tsc** — PASS.
- [ ] **Step 5: Commit** `feat(voice): speech recognition and intent client`.

### Task 4: Intent resolver and answers

**Files:**
- Create: `mobile/src/lib/voice/resolve.ts`
- Test: `mobile/src/lib/__tests__/voiceResolve.test.ts`

**Interfaces:**
- Consumes: `Intent` (Task 2); data via an injected `VoiceData` interface so the resolver is pure and testable:
  `findCustomers(q: string): Promise<{ id; name; phone; remaining: number }[]>` (reuse `useCustomerSummaries` query logic as a plain function, limit 6), `customerSummary(id)`, `lastPayment(id): Promise<{ amount; received_at } | null>`, `openInvoices(customerId): Promise<{ id; contract_no; product_desc; external_invoice_no; remaining }[]>`, `lateSummary(): Promise<{ count; total; top: { name; days_late }[] }>`, `totals(): Promise<{ today: number; month: number }>`.
- Produces:
  - `type VoiceOutcome = { kind: 'navigate'; path: string; say?: string } | { kind: 'chooseCustomer'; options: CustomerOption[]; then: Intent } | { kind: 'chooseInvoice'; options: InvoiceOption[]; customerId: string; then: Intent } | { kind: 'answer'; text: string } | { kind: 'message'; text: string }`.
  - `resolveIntent(intent: Intent, data: VoiceData, picked?: { customerId?: string; contractId?: string | null }): Promise<VoiceOutcome>` — implements spec §3 step 5 and "Claude's decisions": 0 customers → `message` "مش لاقي عميل اسمه <name>" (create_invoice with 0 → navigate to `/sale/new?newName=<name>&…`); 2+ → `chooseCustomer`; invoice_hint matches by `product_desc` contains (normalized: strip Arabic diacritics/tatweel, unify أ/إ/آ→ا, ة→ه, ى→ي, lowercase) or exact `external_invoice_no`; 1 → preselect, else `chooseInvoice` ("مش عارف" = `contractId: null`).
  - `paymentPath(p)`, `salePath(p)` — build `/payment/new?customerId=&amount=&method=&contractId=` and `/sale/new?customerId=&newName=&product=&price=&type=&down=&rate=&years=&ext=` omitting undefined params (URL-encoded).
  - Answer builders (Arabic, Latin digits, `formatEGP`): `balanceText`, `lateText`, `totalsText`, `invoiceText`. Examples: "سيد الشحات: دفع 16,925.00 ج.م، والباقي عليه 13,075.00 ج.م، منهم 1,625.00 ج.م متأخر. القسط الجاي 812.50 ج.م يوم 1 ديسمبر 2026. آخر دفعة 2,000.00 ج.م يوم 1 نوفمبر 2026." / "عندك 3 عملاء متأخرين بإجمالي 9,120.00 ج.م: سيد الشحات (34 يوم)، …" / "النهارده حصّلت 8,012.50 ج.م، والشهر ده 42,300.00 ج.م." / zero late → "مفيش حد متأخر النهارده".
- [ ] **Step 1: Failing tests** for every intent type with a fake `VoiceData`: one/zero/two customer matches; invoice hint one/none/two; create_invoice unknown customer → `newName`; `open` targets; answer strings exactly as above for fixed data; normalization ("التلاجه" matches "تلاجة").
- [ ] **Step 2: Run** — FAIL. **Step 3: Implement** (plus a `useVoiceData()` hook in `mobile/src/api/voice.ts` that implements `VoiceData` with supabase queries on `v_customer_summary`, `payment`, `v_invoice_list` (status ≠ settled), `v_followup` (status = 'late'), `v_collections_kpi`, Cairo-today payments sum excluding `is_opening`). **Step 4: Run + tsc** — PASS.
- [ ] **Step 5: Commit** `feat(voice): intent resolver and spoken answers`.

### Task 5: Form prefills

**Files:**
- Create: `mobile/src/lib/prefill.ts`
- Modify: `mobile/src/app/(app)/payment/new.tsx`, `mobile/src/ui/PaymentForm.tsx`, `mobile/src/app/(app)/sale/new.tsx`
- Test: `mobile/src/lib/__tests__/prefill.test.ts`

**Interfaces:**
- Produces:
  - `parsePaymentPrefill(params): { amount?: number; method?: PaymentMethod; contractId?: string }` — amount finite, > 0, ≤ 10,000,000 (else dropped); method must be in `PAYMENT_METHODS`.
  - `parseSalePrefill(params): Partial<SaleForm> & { newName?: string }` — strings for the form's string fields; `type` ∈ cash/installment; rate 0–200; years 1–5; price/down > 0; down < price else down dropped; `ext` ≤ 40 chars; `newName` ≤ 80 chars.
  - `PaymentForm` gets `initialTotal?: string` (the total box starts with it; the normal auto-split applies).
  - `payment/new` reads `amount`, `method` (and existing `customerId`, `contractId`); `sale/new` reads the sale fields and `newName` (opens the inline new-customer fields with the name filled, same path as "عميل جديد").
- [ ] **Step 1: Failing tests:** valid values pass through as numbers/strings; rate 500, years 9, method "bitcoin", amount −5, down ≥ price → dropped; missing params → `{}`.
- [ ] **Step 2: Run** — FAIL. **Step 3: Implement.** **Step 4: Run + tsc** — PASS.
- [ ] **Step 5: Commit** `feat(voice): payment and sale form prefills`.

### Task 6: Mic button and voice panel on Home

**Files:**
- Create: `mobile/src/ui/VoicePanel.tsx`
- Modify: `mobile/src/app/(app)/(tabs)/index.tsx`
- Test: `mobile/src/ui/__tests__/VoicePanel.test.tsx`

**Interfaces:**
- Consumes: Tasks 3–5.
- Produces: `<VoicePanel onNavigate={(path) => void} />` — a state machine `idle → listening → heard → thinking → (choose | answer | message) → idle`:
  - idle: round mic button (Lucide `Mic`, ≥ 56 px, brand fill) + caption "اسأل أو سجّل بصوتك"; unsupported → disabled + the unsupported text.
  - listening: pulsing ring (respect reduced motion), "بسمعك…", cancel.
  - heard: "سمعتك بتقول:" + editable multiline `TextInput` with the transcript + "تمام" (primary) / "إلغاء".
  - thinking: spinner "بفكّر…".
  - choose: "تقصد مين؟" / "أنهي فاتورة؟" list of buttons (name · phone · remaining / product · remaining), plus "مش عارف" for invoices; picking calls `resolveIntent` again with `picked`.
  - answer: card with the text, spoken via `speak()`, "تمام" closes.
  - message/errors: the Arabic text with "جرّب تاني".
  - navigate: calls `onNavigate(path)` and returns to idle.
- Home: on phone, a card under the tiles with the mic; on desktop, in the side column above آخر العمليات.
- [ ] **Step 1: Failing tests** (mock `listenOnce`, `useVoiceIntent`, `resolveIntent`): press mic → heard text shown in an editable input; edit then "تمام" sends the edited text; answer outcome shows the text and calls `speak`; `chooseCustomer` shows options and picking re-resolves with `picked.customerId`; navigate outcome calls `onNavigate`; unsupported → button disabled with the copy.
- [ ] **Step 2: Run** — FAIL. **Step 3: Implement.** **Step 4: Run + tsc** — PASS.
- [ ] **Step 5: Commit** `feat(voice): home mic button and voice panel`.

### Task 7: Docs and owner setup steps

**Files:**
- Modify: `NOTAH.md` (voice section: flow, intents, cap, files, RPCs, function), `mobile/CLAUDE.md` only if a new rule emerged.
- Create: `docs/voice-assistant-setup.md` — the owner's steps in Egyptian Arabic: create an API key at console.anthropic.com (Settings → API Keys), set a monthly spend limit there too, then in Supabase dashboard → Edge Functions → Secrets add `ANTHROPIC_API_KEY`; how to test (Chrome, allow microphone, say "سيد عليه كام؟"); what each error message means.

- [ ] **Step 1:** `cd mobile && npx jest && npx tsc --noEmit` — green.
- [ ] **Step 2:** Write the docs.
- [ ] **Step 3: Commit** `docs: voice assistant`. No deploy of the web app or push without the user's go-ahead.
