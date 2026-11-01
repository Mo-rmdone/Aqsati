# Notah — Screens & Business Requirements (v2)

Date: 2026-11-01 · Status: draft for approval · Builds on: `NOTAH.md` (current product), brand in `docs/brand/design-system/`

This document defines **what every screen contains and what every action does**, for both the phone and the computer. It is the input for wireframes (Figma), then high-fidelity design, then implementation. Items marked **(new)** don't exist in the app today.

## 1. Principles

- **One product, two sizes.** The same features on phone and computer. The computer adds **printing / PDF**.
- **Navigation:** phone = bottom tab bar; computer = right-side (RTL) sidebar with the content in the middle.
- The owner is the only user (one shop). Arabic, Egyptian dialect, RTL. Money `1,234.50 ج.م`.
- Corrections are allowed but always **audited** (what changed, old → new, when).

## 2. Navigation

| Phone (bottom bar) | Computer (sidebar) |
|---|---|
| الرئيسية | الرئيسية |
| العملاء | العملاء |
| **+ فاتورة** (center action) | + فاتورة جديدة (button at top of sidebar) |
| الفواتير **(new)** | الفواتير **(new)** |
| الإعدادات | التقارير **(new)** |
| — (التقارير from Home / الإعدادات on phone) | الإعدادات |

Also reachable: استيراد من إكسل (from العملاء), ملف العميل, تفاصيل الفاتورة, تسجيل دفعة.

## 3. Screens

### 3.1 الرئيسية (Home)
1. **Numbers:** مستحق الأسبوع ده · المحصّل الشهر ده · إجمالي المتأخرات (existing).
2. **Quick actions (new):** فاتورة جديدة · تسجيل دفعة (opens customer search first) · بحث عن عميل.
3. **مين لازم أكلمه النهارده** (existing) + **follow-up (new)**, see §4.
4. **آخر العمليات (new):** the latest ~10 events today: invoices created, payments recorded, corrections, cancellations — each tappable.

### 3.2 العملاء (Customers)
- List row: **name, phone, status** (منتظم / متأخر / متأخر كتير / خلّص — icon + word + color).
- Search by name/phone (existing).
- **Filters (new):** الكل · دفعوا الشهر ده · متأخرين الشهر ده · متأخرين كتير (**2+ installments past due**) · عليهم فلوس.
- Buttons: استيراد من إكسل (existing). No standalone "add customer" (customers are created in the invoice — existing rule).

### 3.3 ملف العميل (Customer file)
1. **Summary (new):** total paid, total remaining, next due installment (date + amount), status.
2. **الفواتير:** all their invoices (existing cards).
3. **سجل الدفعات (new):** every payment with date, amount, method, which invoice(s).
4. **سجل التواصل (new):** calls / WhatsApp / notes with dates (§4).
5. **Edit details + notes (new):** name, phone, national ID, address, free-text notes.
6. Actions: فاتورة جديدة · تسجيل دفعة · كشف حساب (print/PDF + WhatsApp).

### 3.4 الفواتير (Invoices list) **(new)**
- Every invoice: contract no., customer, product, amount, كاش/قسط, remaining, status.
- **Search:** contract no., external invoice no., product, customer.
- **Filters:** date (النهارده / الشهر ده / فترة), type (كاش / قسط), status (جاري / متأخر / خلّص / ملغية).

### 3.5 تفاصيل الفاتورة (Invoice / contract detail)
Existing content (balance, installments, payments) plus:
- **طباعة / PDF (new):** contract with installment schedule for signing.
- **إرسال واتساب (new):** contract PDF to the customer.
- **تصحيح الفاتورة (new):** edit everything — product, price, down payment, rate/years (or monthly/count for imported), first due date, external invoice no. — **even after payments**, because data comes from paper/Excel and can contain mistakes. The schedule is recalculated and all payments already made are re-allocated oldest-first. Allowed only if the paid amount ≤ the new total. Every correction is audited (old → new) and the invoice shows "اتصحّحت".
- **إلغاء الفاتورة (new):** marks it ملغية (kept in history, removed from balances/worklist). If money was paid on it, it is recorded as **مرتجع للعميل** (a refund): it is subtracted from "المحصّل" for the day it happens and shows as a negative line in reports.

### 3.6 فاتورة جديدة (New invoice) — existing
Unchanged (customer inside the invoice, cash/installment, live preview). Defaults for rate and years come from Settings **(new)**.

### 3.7 تسجيل دفعة (Record payment) — existing
Unchanged (split across contracts). After saving: **no forced receipt**; an option **"ابعت كشف حسابه على واتساب" (new)** — a message with what he paid now, total paid, and remaining per invoice.

### 3.8 التقارير (Reports) **(new)**
All with a date range and print/PDF:
1. **المحصّل:** by day/month, split into installments / down payments / cash sales, minus refunds.
2. **المتأخرين:** every late customer with amount and days late.
3. **المبيعات:** invoices in the period: count and value, cash vs installment.
4. **المتوقع:** money due in the coming months (by month).

### 3.9 الإعدادات (Settings)
1. **بيانات المحل (new):** name, address, phone, logo — printed on PDFs.
2. **إعدادات التقسيط (new):** default interest % and default years.
3. **رسالة الواتساب (new):** editable reminder template with placeholders ({العميل}, {المبلغ}, {التاريخ}, {المحل}).
4. **الحساب:** change password **(new)**, sign out (existing).

## 4. Follow-up (متابعة) **(new)**
- In **مين لازم أكلمه النهارده**, each customer has a check: **اتصلت** / **بعتله واتساب**.
- Pressing the WhatsApp button marks **بعتله واتساب** automatically.
- Optional **note** with the result ("وعد يدفع يوم 15").
- A customer contacted today moves to the bottom of the list (with the mark visible); the mark resets per installment cycle — i.e. a new due installment brings them back to the top.
- All contacts appear in **سجل التواصل** in the customer file.

## 5. Printing / PDF **(new)**
Each with the shop details from Settings, Arabic RTL, A4 (and a narrow receipt layout for the payment receipt):
1. **إيصال دفعة** — available from the payment (not forced).
2. **عقد بجدول الأقساط** — for signing.
3. **كشف حساب العميل** — invoices, payments, remaining.
4. **التقارير** — §3.8.

## 6. Transactions (what changes money) and their rules

| Action | Effect | Audited |
|---|---|---|
| فاتورة جديدة | contract + schedule + down payment / cash payment | yes |
| استيراد | contracts + opening balance | yes |
| تسجيل دفعة | payment split across invoices, oldest installment first | yes |
| تعديل دفعة | re-allocation | yes (existing) |
| **تصحيح فاتورة** | schedule recalculated, payments re-allocated; rejected if paid > new total | yes, old → new |
| **إلغاء فاتورة** | status ملغية; paid money → refund record; excluded from balances, worklist, KPIs except as a negative in "المحصّل" | yes |
| متابعة | contact log entry (no money) | yes |

## 7. Decisions (after review)

### Owner's decisions
- **Refund on cancel:** the cancel dialog shows the paid amount; the owner enters how much is refunded (all / part / nothing) and the method. Only the entered amount is a refund; the rest stays as the shop's money.
- **Correction with paid > new total:** allowed; the invoice becomes fully paid and the excess is recorded as a **refund** to the customer (same refund record as cancel).
- **Promise note** ("وعد يدفع يوم 15"): the owner picks the promised date; the customer moves to the bottom until that date; if still unpaid on that date he returns to the top.
- **Reports on phone:** a "التقارير" button on Home (under the numbers).

### Claude's decisions (can be changed)
- **Refund record:** a new `refund` table (amount, method, date, contract, reason) — never a negative payment. "المحصّل" = payments − refunds on their own dates; past months never change.
- **Correction keeps history:** payments keep their `received_at`; only their allocation to installments is redone. Editing the down payment edits the down-payment payment amount too (audited). Opening balances are re-allocated like any payment.
- **Cancelled invoices:** excluded from balances, worklist, KPIs, المتوقع and المبيعات; still listed (filter "ملغية") and in the customer file, greyed.
- **Customer status** = the worst across their invoices: متأخر كتير (any invoice with 2+ past-due installments) > متأخر (any past-due) > منتظم (open balance, nothing past due) > خلّص (everything paid). "دفعوا الشهر ده" = any payment received this month.
- **Contacted today** uses the Cairo calendar day.
- **Reports:** المحصّل excludes opening balances and imported down payments (like the Home tile) and subtracts refunds; المتوقع = unpaid remainder of installments due in each coming month (overdue shown as its own line); المبيعات = invoices created in Notah in the period at full payable amount (incl. interest), split cash/installment; imported contracts are not sales.
- **WhatsApp reminder placeholders** use the customer's total overdue (or the next due installment if none overdue); a customer with several late invoices gets one message with the total.
- **Sending PDFs on WhatsApp:** a phone browser can't attach a file through a wa.me link. "إرسال واتساب" opens the phone's share sheet with the PDF (Web Share API) where supported; otherwise it downloads the PDF and opens WhatsApp to the customer, and the owner attaches it. Text-only messages (reminders, account summary) stay one tap.
- **Audit visibility:** invoice detail gets a "سجل التعديلات" section listing corrections and payment edits in readable form (field, old → new, date).
- **Settings defaults** affect new invoices only. Shop logo is uploaded to a private storage bucket (RLS per shop). PDF layouts are fixed (shop details + logo), not customizable.
- **Computer layout:** the same web app, responsive: ≥ 1024px wide shows the sidebar and wider content (tables for lists); forms open as pages, centered at a comfortable width.
- **Editing a customer:** a phone change that matches another customer shows the same "موجود بالفعل" warning (not a block); later imports bind by the current phone; national ID stays optional.

## 8. Out of scope for this round
Voice commands, ID-card scan, staff accounts, landing page, offline mode (later phases in `NOTAH.md`).

## 9. Next steps
1. Approve this document.
2. **Wireframes in Figma** (phone + computer) for every screen above → owner reviews and comments in Figma.
3. High-fidelity design with the brand tokens.
4. Implementation plan and build.
