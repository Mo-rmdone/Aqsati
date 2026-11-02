# Notah — Voice assistant (المساعد الصوتي) — Design

Date: 2026-11-02 · Status: draft for approval · Builds on: `NOTAH.md`, `docs/superpowers/specs/2026-11-01-notah-screens-requirements.md`

## 1. Intent

The shop owner is often busy at the counter. Talking is faster than typing Arabic names and amounts. The assistant lets them say what happened or ask a question in Egyptian Arabic, and Notah prepares the action or answers. **It never saves money changes by itself**: it opens the normal form, pre-filled, for the owner to check and press حفظ.

Success: the owner records a payment by voice in under ~10 seconds, and gets a customer's balance by asking.

## 2. What the owner decided

| Topic | Decision |
|---|---|
| Commands in v1 | Record a payment · Create an invoice · Ask questions · Navigate/search |
| Money changes | Open the normal form pre-filled; owner checks and presses حفظ |
| Speech → text | Browser speech recognition (free) first |
| Understanding the sentence | AI (Claude) reads the text and returns a structured intent |
| Trigger | Mic button: press, speak, stops when the owner stops talking |
| Placement | Home screen only |
| Not sure (two أحمد, unclear amount) | Show choices to tap ("تقصد مين؟") |
| Reply | On screen + spoken aloud |
| What the AI sees | Only what's needed: the spoken sentence (and today's date). Numbers come from the database. |
| Questions in v1 | Customer balance / last payment · Who's late today · Today's / this month's numbers · Remaining on a specific invoice |
| Cost | Cheapest fast model with a monthly cap |
| Where the AI call runs | Supabase Edge Function |
| Devices | Android / Chrome (phone and computer). iPhone Safari shows "not supported" for now. |
| Fixing what was heard | The heard text appears in an editable box; the owner can correct it and press "تمام" before it is understood |

## 3. Flow

1. Owner taps the mic on Home. The button turns into a listening state ("بسمعك…"); tapping again cancels.
2. Browser speech recognition (`lang = 'ar-EG'`, single utterance, final result only) produces the text. A client-side safety timeout stops listening after 10 s. The text appears in an editable box ("سمعتك بتقول:") with "تمام" (send) and "إلغاء"; the owner can fix a misheard name or amount first.
3. On "تمام" the client sends the text to the Edge Function `voice-intent` with the user's session.
4. The function checks the session and the shop's monthly budget, calls Claude with a fixed tool schema, and returns **one intent** (§4). It never touches shop data.
5. The client resolves the intent with the existing data layer (RLS-scoped):
   - **Customer names** are matched with the existing customer search (name contains / phone prefix). 0 matches → "مش لاقي عميل اسمه …" + search box prefilled; 1 match → continue; 2+ → a choice list "تقصد مين؟" (name, phone, remaining).
   - **Record payment** → opens `/payment/new?customerId=…&amount=…&method=…` (and `contractId` when the invoice hint matches exactly one open invoice).
   - **Create invoice** → opens `/sale/new?customerId=…&product=…&price=…&type=…&down=…&rate=…&years=…&ext=…`. An unknown customer opens the form with the new-customer fields prefilled from the spoken name.
   - **Questions** → answered from existing views and shown as a card + spoken: balance from `v_customer_summary` (paid, remaining, overdue, next due, last payment from `payment`); who's late from `v_followup` (count + top 5 names); numbers from `v_collections_kpi` / payments today; invoice remaining from `v_invoice_list`.
   - **Navigate** → opens the customer file, invoice detail, or a list screen.
   - **Not understood** → "مفهمتش، جرّب تقولها تاني" with examples.
6. The reply card text is spoken with the browser's speech synthesis (Arabic voice if the device has one; silent otherwise — the card is always shown).

## 4. Intents (the AI's only output)

Returned through Claude tool use; the function validates the shape and drops anything else.

- `record_payment { customer: string, amount: number, method?: 'cash'|'instapay'|'fawry'|'wallet'|'card'|'bank', invoice_hint?: string }`
- `create_invoice { customer: string, product?: string, price?: number, sale_type?: 'cash'|'installment', down_payment?: number, rate_percent?: number, years?: number, external_invoice_no?: string }`
- `ask_balance { customer: string }`
- `ask_late {}`
- `ask_totals { period: 'today'|'month' }`
- `ask_invoice { customer: string, invoice_hint?: string }`
- `open { target: 'customer'|'invoice'|'customers'|'invoices'|'home', customer?: string, invoice_hint?: string }`
- `unknown { reason?: string }`

Amounts in Egyptian speech ("ألفين", "خمسة وعشرين ألف", "ألف ونص") are converted to numbers by the model; the form still validates them.

## 5. Constraints

- **No money change without the owner pressing حفظ** in the normal form (existing validation and idempotency apply).
- The AI receives only: the transcript, today's Cairo date, and the fixed instructions. No customer list, no balances, no IDs.
- The function requires a signed-in user (Supabase JWT) and resolves the shop from it; anon is rejected.
- **Monthly cap per shop**: default **US$3/month**. The function records each call's token usage and estimated cost in a usage table; when the month's total reaches the cap it returns `budget_exceeded` and the button shows "خلّصت حصة الشهر للمساعد الصوتي". The cap is a constant in the function for v1 (Settings can expose it later).
- Model: the cheapest current fast Claude model (Haiku tier), low max tokens, no streaming.
- The Anthropic API key lives only in the Supabase function secrets. **The owner sets it himself**; Claude Code never handles it.
- Unsupported browser (no speech recognition, e.g. Firefox) → the mic shows "الميكروفون مش مدعوم في المتصفح ده — جرّب Chrome". Microphone permission denied → "محتاج إذن الميكروفون".
- Copy in Egyptian Arabic; brand tokens; mic button is a large round control (≥ 56 px), brand-coloured (coin stays reserved for + فاتورة).
- Works on the web app (phone and computer). Native builds come later.

### Claude's decisions (can be changed)

- **Shop and usage:** the function runs with the caller's JWT (no service-role key). It calls a new security-definer RPC `voice_reserve()` that resolves the shop with the existing `public.current_tenant_id()`, locks the shop's row for the current Cairo month in a `voice_usage` table, and returns whether the month is under the cap; after the Claude call it calls `voice_record(input_tokens, output_tokens)` to add the usage. `voice_usage` has RLS select for the shop and no direct client writes (both RPCs revoked from anon). A small overshoot from concurrent calls is acceptable (the reservation lock keeps it to at most one call per concurrent request). Failed Claude calls count only the tokens the API reports.
- **Model and price:** model id pinned in a constant (`claude-haiku-5-5`), price per token in constants; cost = tokens × price.
- **Invalid pre-fill values:** the form opens with whatever matched; values the form can't take (unknown method, out-of-range rate/years) are dropped, and the form's normal validation shows anything still wrong. Nothing is auto-corrected.
- **Invoice hint matching:** against the customer's open invoices' `product_desc` (contains, case/diacritics-insensitive) and `external_invoice_no` (exact). Exactly one match → pre-select it; 0 or 2+ → a choice list "أنهي فاتورة؟" (product, remaining), with "مش عارف" opening the form without a pre-selected invoice.
- **"Who's late":** all customers with overdue installments (`v_followup` rows with `status = 'late'`): count, total overdue, and the top 5 by days late.
- **Today's numbers:** today = sum of non-opening payments received on the Cairo day (from `payment`); this month = `v_collections_kpi.collected_this_month`.
- **Last payment:** newest `payment` row for the customer (date + amount).
- **Spoken reply:** best effort; if the device has no Arabic voice the reply is silent and the card is enough.
- **New customer from voice:** `sale/new` already has the inline new-customer fields; the spoken name pre-fills the name field (same path as the existing "عميل جديد" from search).

## 6. Non-goals (v1)

- Always-listening / wake word; voice on screens other than Home.
- Saving anything without the form; editing or cancelling invoices or payments by voice.
- Multi-turn voice conversations (one sentence → one intent).
- Server-side speech-to-text (AI transcription) and iPhone Safari support — only if browser recognition proves too weak or iPhone owners need it.
- Reports beyond the four question types.

## 7. Left to the builder

- Exact prompt wording and few-shot examples (Egyptian phrasing, amounts, methods).
- Exact `voice_usage` columns (per shop, per Cairo month: calls, input/output tokens, cost).
- Pre-fill query-parameter names and how the forms read them (both forms need new prefill support for amount, method, product, price, type, down, rate, years, external no).
- Reply card layout on phone vs computer (follow the brand and the Home Hi-Fi).
