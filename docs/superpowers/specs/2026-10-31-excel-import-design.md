# Excel Import — Design

Date: 2026-10-31 · Status: draft for approval · Builds on: `NOTAH.md`, `NOTAH-BUILD.md`

## 1. Why

The biggest barrier to adopting Notah is the paper ledger: a shop owner with 50–300 running installment contracts will not type them in one by one. The owner copies the ledger into a structured spreadsheet once, uploads it, reviews it, and starts working in Notah with all customers **and their running contracts and what was already paid**.

## 2. Goals

- One upload brings in customers **and** their installment contracts **and** what was already paid.
- The owner reviews and can edit every row before anything is saved.
- Re-trying a save never duplicates a contract.
- After import, imported contracts behave like any other: they appear in the worklist, accept payments, and their "already paid" amount can be edited later like any payment.

## 3. Non-goals

- Cash sales in the import (only running installment contracts).
- Importing payment history month by month (only "how many months were paid").
- Recomputing interest: imported contracts have no interest rate; their numbers come from the ledger.
- Exporting to Excel (separate feature).

## 4. Anti-goals

- An imported contract whose installments don't add up to what the ledger says the customer owes.
- Silently importing a bad row (wrong phone, impossible numbers) without the owner seeing it.
- Duplicate customers for the same phone in one shop, or duplicate contracts after a retry.

## 5. The spreadsheet (owner's decision)

One row = one installment contract. Same phone on several rows = same customer.

| Column (Arabic header in the template) | Required | Example | Meaning |
|---|---|---|---|
| اسم العميل | ✔ | محمود عبد الحميد | |
| الموبايل | ✔ | 01012345678 | Egyptian mobile, `^01[0125][0-9]{8}$` |
| الرقم القومي | | 29001011234567 | `^[23][0-9]{13}$` if present |
| العنوان | | المنصورة | |
| السلعة | ✔ | ثلاجة توشيبا 16 قدم | |
| المبلغ الكلي | ✔ | 25000 | **Full price including interest** = everything the customer pays (down payment + all installments) |
| المقدم | ✔ (0 allowed) | 10000 | |
| القسط الشهري | ✔ | 1000 | |
| عدد الشهور المدفوعة | ✔ (0 allowed) | 6 | Installments already paid before Notah |
| أول شهر اتدفع | ✔ | 2025-11 | Month of the **first installment** (YYYY-MM or YYYY-MM-DD) |
| آخر شهر اتدفع | | 2026-04 | Used only as a cross-check |
| رقم الفاتورة | | 1043 | Optional external invoice number |

Accepted files: `.xlsx` and `.csv` (UTF-8). A downloadable template (`.xlsx`) with these headers, one example row, and a short Arabic instructions row/sheet.

## 6. How each row becomes a contract (owner's decision)

```
remaining_at_start = total − down                    // e.g. 25,000 − 10,000 = 15,000
count              = ceil(remaining_at_start / monthly)   // 15,000 / 1,000 = 15 installments
installments 1..count−1 = monthly; last = remaining_at_start − monthly × (count − 1)
due(i)             = first_month + (i − 1) months    // first installment = "أول شهر اتدفع"
sale_date          = first_month − 1 month
already_paid       = min(paid_months, count) × monthly, capped at remaining_at_start
```
Each installment is deducted from the 15,000: after 6 paid months, 9,000 remains.

Validation per row (shown in the preview, Arabic):
- required fields present; phone / national ID formats; numbers > 0 (down ≥ 0, paid months ≥ 0).
- `down < total`; `monthly ≤ total − down`.
- `paid_months ≤ count` (else: "عدد الشهور المدفوعة أكبر من عدد الأقساط").
- If "آخر شهر اتدفع" is given and `first_month + (paid_months − 1)` ≠ it → **warning** (not an error): "الشهور المدفوعة مش متطابقة مع أول وآخر شهر".
- first month not in the future beyond today + 1 month (sanity).
- Same phone with different names across rows → warning.

Errors block saving that row; warnings don't.

## 7. Saving

- **Server function `import_contract(p jsonb) returns uuid`** (security definer, owner/manager/accountant, tenant-checked, advisory lock + idempotent on the client `id` — same pattern as `create_sale`). Input: `id`, `customer_id`, product, total, down, monthly, first_month (date), paid_months, external_invoice_no.
  - Inserts a contract with `sale_type = 'installment'`, `interest_method = 'imported'` (new allowed value), `interest_rate = 0`, `total_price = total`, `down_payment = down`, `num_installments = count`, `start_date = sale_date`.
  - **The `num_installments` check must allow imported contracts of any length ≥ 1** (today it only allows 12/24/36/48/60). Change the constraint to: cash → 0; installment with method flat → 12..60 step 12; installment with method imported → ≥ 1.
  - Inserts the explicit schedule from §6 (not `build_schedule`).
  - Down payment > 0 → a payment + `payment_line(kind='down_payment')` dated `sale_date`.
  - `paid_months > 0` → **one "opening balance" payment** of `already_paid`, dated the last paid month's due date (capped at now), recorded through the normal payment path (`payment_line(kind='installment')` + `allocate_payment`, oldest first) so it marks the first N installments paid **and stays editable** with the normal "edit payment" screen. Method `cash`. A flag `payment.is_opening = true` (new nullable boolean) lets the UI label it "رصيد افتتاحي".
  - Statuses: past-due unpaid installments become `overdue` immediately (run `installment_status` for the contract's rows at the end), not only at the nightly job.
- **Customers:** rows are grouped by phone. For each phone the client looks up an existing customer (`findCustomerByPhone`); if none, it creates one with a client id (idempotent upsert, as today). Then each row calls `import_contract` with its own client id.
- Ids are generated once per row when the file is parsed and kept for the whole review session, so re-pressing "حفظ" after a partial failure only creates what is missing.
- Save runs row by row with a progress indicator ("بنحفظ 23 من 48"); a failed row stays in the list with its error; saved rows are marked ✓. No all-or-nothing transaction across rows.

## 8. Screens

1. **Customers screen:** secondary button "استيراد من إكسل".
2. **Import screen** (`/import`, in the stack above tabs):
   - Step 1: "نزّل القالب" (download template) + "اختار الملف" (file picker).
   - Step 2 — **Preview:** summary card ("48 عقد · 41 عميل · 3 محتاجين مراجعة"), filter chips (الكل / محتاج مراجعة), one card per row: customer, product, total, down, monthly × count, paid months → remaining, first/last month, with error/warning chips. Tapping a card opens an inline editor for all fields (same validation live). Rows can be removed.
   - Step 3 — **Save:** "حفظ N عقد" (disabled while any row has an error, or offer "حفظ الصفوف السليمة بس"), progress, then a result screen: "اتحفظ 45 عقد · 3 فشلوا" with the failures listed and editable for retry.
3. **Contract screen:** imported contracts show a small "مستورد" chip; the opening-balance payment shows "رصيد افتتاحي" and is editable.

## 9. Decisions made by Claude (can be changed)

- Parsing on the client with SheetJS (`xlsx`) for both xlsx and csv; no file is uploaded to the server.
- One opening-balance payment instead of N monthly payments (simpler, editable, matches "عدد الشهور المدفوعة").
- Count = ceil(remaining / monthly); last installment absorbs the remainder.
- Row-by-row saving with per-row idempotency instead of one big transaction (a 300-row file shouldn't fail entirely because of one row).
- Max 500 rows per file.
- Template headers in Arabic; header matching tolerant to extra spaces and the English names listed in the template's second sheet.
- Dates accepted as `YYYY-MM`, `YYYY-MM-DD`, `MM/YYYY`, Excel date serials; Arabic-Indic digits normalized.
- **"أول شهر اتدفع" means the due month of the first installment** (even if 0 months were paid). The template's helper row says so. `sale_date` is derived (one month earlier) and only used internally.
- **Due day:** if a full date is given, its day is used for every installment (month-end clamped, like normal sales); if only a month is given, day **1**.
- **Re-uploading the same file:** before saving, each row is checked against the shop's existing imported contracts by *(customer phone, product, total, first month)*. A match is shown as "موجود بالفعل" and **skipped by default** (the owner can untick "تخطي"). This makes "fix the sheet and upload again" safe across sessions.
- **Existing customer with the same phone:** the existing customer is used as-is (name/ID/address in the file are ignored), and the row shows "عميل موجود: <name>". If several customers share the phone, the oldest is used.
- **"Collected this month" excludes opening-balance payments** (`is_opening = true`) — it's money from before Notah. The KPI view is updated accordingly; down payments of imported contracts are dated in the past, so they don't count either.
- **Editing the opening balance** works like any payment edit (any amount up to the remaining balance; a non-multiple of the monthly amount leaves one installment partial — acceptable). The `is_opening` flag and `received_at` are kept on edit.
- **Who can import:** owner, manager, accountant (same as creating a sale).
- **A customer created for rows that all failed** stays (it has no invoices, so it doesn't appear in the customers list); retrying reuses it.

## 10. Tests that pin it

- SQL: `import_contract` for 25,000/10,000/1,000/6 paid from 2025-11 → 15 installments of 1,000; first 6 paid; balance remaining 9,000; opening payment 6,000 editable via `update_payment`; past-due unpaid → overdue; same id twice → one contract; uneven remainder (e.g. 15,500 / 1,000 → 16 installments, last 500); paid_months > count rejected; other shop's customer rejected.
- App: row parsing/mapping (headers, date formats, digits), the §6 math (count, last, already paid, cross-check warning), validation messages, grouping by phone, id stability across re-save.
