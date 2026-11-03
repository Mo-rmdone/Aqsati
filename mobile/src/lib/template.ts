import { formatDateAr } from './date';
import { formatEGP } from './money';

export const DEFAULT_TEMPLATE =
  'أهلاً {العميل} 👋\nتذكير بقسط بمبلغ {المبلغ} مستحق بتاريخ {التاريخ}.\nبرجاء السداد في أقرب وقت. شكراً لتعاملك معنا — {المحل}';

export const PLACEHOLDERS = ['{العميل}', '{المبلغ}', '{التاريخ}', '{المحل}'] as const;

export interface TemplateVars {
  customer: string;
  amount: number;
  date: string | null;
  shop: string;
}

/** Fills the known placeholders (everywhere they appear); unknown `{…}` text is left as typed. Blank template -> default. */
export function renderTemplate(template: string | null, vars: TemplateVars): string {
  const source = template && template.trim() ? template : DEFAULT_TEMPLATE;
  const values: Record<string, string> = {
    '{العميل}': vars.customer,
    '{المبلغ}': formatEGP(vars.amount),
    '{التاريخ}': vars.date ? formatDateAr(vars.date) : '—',
    '{المحل}': vars.shop,
  };
  // Single pass so a value that itself contains a placeholder is never re-expanded.
  return source.replace(/\{(?:العميل|المبلغ|التاريخ|المحل)\}/g, (m) => values[m]);
}
