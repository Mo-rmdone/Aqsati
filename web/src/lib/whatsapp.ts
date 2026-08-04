// The MVP's entire reminder mechanism: a `wa.me` click-to-send link, not the
// paid WhatsApp Cloud API (PRODUCT.md Constraints — "no paid service may
// become a hard MVP dependency"; docs/05-implementation-plan.md §1 rationale).
// The merchant taps "واتساب" on a worklist row, WhatsApp opens with this
// message pre-filled, the merchant hits send. $0/month, zero setup, works
// from day one.
//
// Verbatim from the Task 10 brief (web/src/lib/whatsapp.ts snippet) — message
// copy and the Egypt phone-normalization rule are both load-bearing product
// decisions, not implementation details, so they're reproduced exactly rather
// than "improved."
export function reminderLink(p: {
  phone: string;
  name: string;
  amount: number;
  dueDate: string;
  merchant: string;
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
