// The MVP's reminder mechanism is a `wa.me` click-to-send link, not the paid
// WhatsApp Cloud API. Ported from web/src/lib/whatsapp.ts; message copy and the
// Egypt phone-normalization rule are product decisions, kept as-is.
import { formatEGP } from './money';

/** Egypt mobile only (01[0125]xxxxxxxx): returns a wa.me link, or null for anything else. */
export function whatsappLink(phone: string, msg: string): string | null {
  const digits = phone.replace(/\D/g, '');
  if (!/^01[0125][0-9]{8}$/.test(digits)) return null;
  return `https://wa.me/20${digits.slice(1)}?text=${encodeURIComponent(msg)}`;
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
