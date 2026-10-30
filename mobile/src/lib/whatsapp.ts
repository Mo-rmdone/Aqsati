// The MVP's reminder mechanism is a `wa.me` click-to-send link, not the paid
// WhatsApp Cloud API. Ported from web/src/lib/whatsapp.ts; message copy and the
// Egypt phone-normalization rule are product decisions, kept as-is.
import { formatEGP } from './money';

/** Egypt: strip non-digits, replace leading 0 with country code 20. */
export function whatsappLink(phone: string, msg: string): string {
  const intl = phone.replace(/\D/g, '').replace(/^0/, '20');
  return `https://wa.me/${intl}?text=${encodeURIComponent(msg)}`;
}

export function reminderMessage(p: {
  customer: string;
  amount: number;
  dueDate: string;
  merchant: string;
}): string {
  return (
    `أهلاً ${p.customer} 👋\n` +
    `تذكير بقسط بمبلغ ${formatEGP(p.amount)} ` +
    `مستحق بتاريخ ${p.dueDate}.\n` +
    `برجاء السداد في أقرب وقت. شكراً لتعاملك معنا — ${p.merchant}`
  );
}
