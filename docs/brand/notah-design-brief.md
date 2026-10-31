# Design Brief — نوتة | Notah

**What I need from you:** a brand identity and a complete design system for Notah, plus the key app screens designed with it. The app already works (functionally); it currently looks neutral and unbranded. Your design will replace that look.

---

## 1. The product in one paragraph

**Notah (نوتة)** replaces the paper ledger ("الدفتر" / "النوتة") that Egyptian shop owners use to track installment sales — fridges, washing machines, stoves, electronics sold on monthly payments. The owner records each sale (cash or installments), the app calculates the monthly installment, tracks who paid and who is late, and sends WhatsApp reminders. The name is literally the notebook it replaces: *"your نوتة, but it does the math and remembers for you."*

## 2. Who uses it

- **The shop owner** — Egyptian, 30–60 years old, owns a home-appliance or electronics shop, often in a governorate city, not Cairo-only.
- Not tech-savvy. Comfortable with WhatsApp, Facebook, Vodafone Cash. Has been using a paper notebook for years and trusts it.
- **Phone first.** Most have no computer. Android, mid-range devices, often with large system font sizes.
- Uses the app **inside the shop**: bright lighting, a customer standing in front of them handing over cash, interruptions, one hand busy.
- Single user per shop (the owner). No staff accounts yet.

**The moment that matters:** a customer walks in to pay this month's installment. The owner must find the customer, see what's due, record the payment, and be *sure* it was saved — in under 20 seconds, without doubt.

## 3. Brand personality

| Is | Is not |
|---|---|
| Trustworthy — like a reliable accountant you've known for years | A flashy fintech / crypto / bank app |
| Warm, Egyptian, familiar — speaks Egyptian Arabic (عامية) | Formal government Arabic, or a translated Western app |
| Calm and clear about money | Anxious, red-everywhere, punishing |
| Simple, big, obvious | Dense dashboards, tiny text, clever-but-hidden gestures |
| Modern but humble | Luxurious, cold, corporate |

**Feeling in the first second:** *"ده بتاعي، وسهل، ومش هيضيّع فلوسي"* — "this is made for me, it's easy, and it won't lose my money."

Note on values: installment pricing will be reviewed for Islamic-finance (murabaha-style) compliance. The brand should feel honest and fair — no aggressive debt-collection imagery.

## 4. Identity deliverables

1. **Logo**
   - Wordmark in Arabic **نوتة** and Latin **Notah**, plus a lockup "نوتة | Notah".
   - A simple symbol/app icon that works at 48 px on an Android home screen.
   - Concept starting points (pick or beat them): a notebook/ledger page, a ruled line or tick mark, a coin or receipt folded into the letter shapes, the dot of the ة. Avoid generic wallet/card/chart icons.
2. **Color palette** — primary, neutrals, and **semantic money colors** (see §6). Must work in light mode in bright shop light; provide dark mode too.
3. **Typography** — one Arabic + Latin family pairing (Google Fonts, free, works in React Native/Expo). Must render Arabic beautifully at small sizes and have clear tabular numerals. Candidates to evaluate: IBM Plex Sans Arabic, Cairo, Tajawal, Readex Pro, Noto Kufi Arabic.
4. **Tone of voice** — 6–10 example strings in Egyptian Arabic (buttons, success, errors, empty states).
5. **App icon + splash screen.**

## 5. Design system deliverables

Deliver as **design tokens** (JSON or a table) so they can be dropped into a React Native `theme.ts`:

- Colors (primitive + semantic), light and dark
- Type scale (sizes, weights, line heights) — minimum body text 16 px
- Spacing scale, radii, elevation/shadows
- Icon style (one icon set, e.g. Phosphor / Lucide / Tabler — name it)

**Components** (with states: default, pressed, disabled, loading, error):
- Buttons (primary, secondary, danger, text), large tap targets (min 48 px)
- Text input with label, helper, inline error (Arabic)
- Amount input (money) and percent input
- Segmented toggle (كاش / تقسيط), chip selector (1–5 سنين)
- Search bar
- Customer row / card
- Contract card (product, contract number, cash/installment tag, paid, remaining, status)
- Installment row (number, due date, amount due, amount paid, status chip)
- Payment row (receipt no., amount, date, "اتعدّلت" edited badge)
- KPI tile (label + big money number + status dot)
- Status chips: مدفوع / جزئي / متأخر / مستحق / غير معروف
- Money display (always "1,234.50 ج.م", tabular digits)
- Bottom tab bar (4 tabs, center "+ فاتورة" action emphasized)
- Banner (warning, e.g. duplicate phone), toast/confirmation, empty state, loading skeleton, error state with retry
- "Not synced" indicator (future offline mode)

## 6. Hard constraints

- **Arabic only, right-to-left.** Mirror everything correctly (back arrows, progress, tab order). Design in RTL first, not flipped LTR.
- **Numbers:** Latin digits (0–9), as the app already uses — consistent with money in Egyptian receipts and banking apps. Currency "ج.م". Always two decimals for money.
- **Money status colors must be distinguishable without color** (icon or label too) — paid / partial / overdue / due soon / unknown.
- **Overdue ≠ alarm.** Overdue needs attention but should not look like an error or punishment. Reserve true error red for system errors.
- **Accessibility:** WCAG AA contrast minimum; readable at Android "large font" setting; tap targets ≥ 48 px.
- **Mobile first:** design at 390 × 844. Web is the same app in a phone-width column on desktop (centered, max ~480 px) — no separate desktop layout needed now.
- **Implementation:** React Native (Expo), plain StyleSheet + a `theme.ts` token file. No exotic effects that RN can't do (heavy blur, complex gradients on text).

## 7. Screens to design (they already exist functionally)

1. **تسجيل الدخول / إنشاء حساب** — signup asks: shop name, owner name, email, password.
2. **الرئيسية (لوحة التحصيل)** — header with shop name; 3 KPI tiles: **مستحق الأسبوع ده**, **المحصّل الشهر ده**, **إجمالي المتأخرات**; then list **"مين لازم أكلمه النهارده"** — each row: customer name, amount, "متأخر 5 يوم" or "يستحق 3 نوفمبر", buttons **واتساب** and **تسجيل دفعة**. Empty state for a new shop.
3. **العملاء** — search by name or phone, list, "عميل جديد".
4. **عميل جديد** — name, phone, national ID (optional), address (optional). Duplicate-phone warning banner: "العميل ده موجود بالفعل: …" with "حفظ برضه".
5. **ملف العميل** — details + list of contracts (cards) + buttons "فاتورة جديدة" / "تسجيل دفعة".
6. **فاتورة جديدة** (most important) — customer → product name → price → **كاش / تقسيط** toggle → for installments: down payment, interest %, duration chips 1–5 years → **live preview card**: remaining, total after interest, **monthly installment (hero number)**, number of installments, first due date → optional external invoice number → payment method → "حفظ الفاتورة".
7. **تفاصيل العقد** — header (contract no., product), balance, installment table, payments list with edit.
8. **تسجيل دفعة** — total amount + method + one row per open contract (product, remaining, amount input) + live sum check; single-contract case auto-fills.
9. **الإعدادات** — shop name, sign out.

Later (not now, but the system must support it): voice-command button, Excel import flow, ID-card scan flow, offline/sync states, landing page.

## 8. Realistic sample data (use it, no lorem ipsum)

- Shop: **معرض الأمانة للأجهزة الكهربائية**
- Customers: محمود عبد الحميد · 01012345678 / أم ياسين · 01123456789 / سيد الشحات · 01234567890
- Sale: ثلاجة توشيبا 16 قدم — 25,000.00 ج.م — مقدم 10,000.00 — فايدة 30% — سنتين → **القسط 812.50 ج.م × 24 شهر**, أول قسط 1 ديسمبر 2026
- Cash sale: غسالة فوق أوتوماتيك — 7,000.00 ج.م كاش
- KPIs: مستحق الأسبوع ده 4,062.50 · المحصّل الشهر ده 38,450.00 · إجمالي المتأخرات 6,912.50
- Worklist: "سيد الشحات — 812.50 ج.م — متأخر 12 يوم"

## 9. Anti-goals (fail even if pretty)

- Looks like a bank or a crypto wallet.
- English-first layout with Arabic squeezed in.
- Small grey text, low contrast, thin fonts.
- The monthly installment number or "saved ✓" confirmation isn't the loudest thing on its screen.
- Red everywhere for late customers.
- Generic stock-illustration people.

## 10. What to hand back

1. Logo files (SVG + PNG), app icon (Android adaptive: foreground + background), splash.
2. Token file (colors light/dark, type, spacing, radii, shadows) + font names.
3. Component sheet with states.
4. The 9 screens above at 390 px wide, RTL, with the sample data.
5. One-page brand summary: name usage, colors, fonts, tone-of-voice examples.
