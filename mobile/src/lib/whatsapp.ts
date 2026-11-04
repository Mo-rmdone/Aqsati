// The MVP's reminder mechanism is a `wa.me` click-to-send link, not the paid
// WhatsApp Cloud API. Ported from web/src/lib/whatsapp.ts; message copy and the
// Egypt phone-normalization rule are product decisions, kept as-is.
import type { Tables } from './database.types';
import { formatDateAr, todayISO } from './date';
import { formatEGP } from './money';
import { renderTemplate } from './template';

/** Egypt mobile only (01[0125]xxxxxxxx): returns a wa.me link, or null for anything else. */
export function whatsappLink(phone: string, msg: string): string | null {
  const digits = phone.replace(/\D/g, '');
  if (!/^01[0125][0-9]{8}$/.test(digits)) return null;
  return `https://wa.me/20${digits.slice(1)}?text=${encodeURIComponent(msg)}`;
}

/** A tel: link for any phone with 7+ digits (landlines too); null when there is nothing to dial. */
export function callLink(phone: string | null | undefined): string | null {
  const digits = (phone ?? '').replace(/[^\d+]/g, '');
  return digits.replace(/\D/g, '').length >= 7 ? `tel:${digits}` : null;
}

/**
 * wa.me link for a follow-up row, or null while the shop template is still loading
 * (so the default message can never go out for a shop with a custom one).
 * `settings` errors count as settled and fall back to the default message.
 */
export function followupReminderLink(
  row: Tables<'v_followup'>,
  merchant: string,
  settings: { isSuccess: boolean; isError: boolean; template: string | null },
): string | null {
  if (!row.phone || !(settings.isSuccess || settings.isError)) return null;
  return whatsappLink(row.phone, followupReminder(row, merchant, settings.template));
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

/** Account statement sent right after a payment: what was paid today, the total, and each invoice that still has a balance. */
export function accountSummaryMessage(p: {
  customer: string;
  paidNow: number;
  totalPaid: number;
  invoices: { title: string; remaining: number }[];
  shop: string;
}): string {
  const open = p.invoices.filter((i) => i.remaining > 0);
  const rest =
    open.length > 0
      ? `الباقي:\n${open.map((i) => `• ${i.title}: ${formatEGP(i.remaining)}`).join('\n')}`
      : 'خلّصت كل أقساطك 🎉';
  return (
    `أهلاً ${p.customer} 👋\n` +
    `استلمنا منك النهارده ${formatEGP(p.paidNow)}.\n` +
    `إجمالي اللي دفعته: ${formatEGP(p.totalPaid)}\n` +
    `${rest}\n` +
    `شكراً لتعاملك معنا — ${p.shop}`
  );
}

/** Per-customer follow-up reminder:the overdue total when anything is overdue, else the next installment. */
export function followupReminder(
  row: Tables<'v_followup'>,
  merchant: string,
  template?: string | null,
): string {
  const name = row.name ?? '';
  if (template && template.trim()) {
    const overdue = (row.overdue_count ?? 0) > 0;
    return renderTemplate(template, {
      customer: name,
      amount: overdue ? (row.overdue_amount ?? 0) : (row.next_due_amount ?? 0),
      date: overdue ? todayISO() : row.next_due_date,
      shop: merchant,
    });
  }
  const tail = `برجاء السداد في أقرب وقت. شكراً لتعاملك معنا — ${merchant}`;
  if ((row.overdue_count ?? 0) > 0) {
    return `أهلاً ${name} 👋\n` + `متأخر عليك ${formatEGP(row.overdue_amount ?? 0)} من أقساطك.\n` + tail;
  }
  const when = row.next_due_date ? ` مستحق بتاريخ ${formatDateAr(row.next_due_date)}` : '';
  return (
    `أهلاً ${name} 👋\n` +
    `تذكير بقسط بمبلغ ${formatEGP(row.next_due_amount ?? 0)}${when}.\n` +
    tail
  );
}
