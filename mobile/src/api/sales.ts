import { useMutation, useQueryClient } from '@tanstack/react-query';

import { previewInstallments, type InstallmentPreview } from '../lib/money';
import { supabase } from '../lib/supabase';
import { validateSale } from '../lib/validation';

export type PaymentMethod = 'cash' | 'instapay' | 'fawry' | 'wallet' | 'card' | 'bank';

export const PAYMENT_METHODS: { value: PaymentMethod; label: string }[] = [
  { value: 'cash', label: 'كاش' },
  { value: 'instapay', label: 'إنستاباي' },
  { value: 'fawry', label: 'فوري' },
  { value: 'wallet', label: 'محفظة' },
  { value: 'card', label: 'كارت' },
  { value: 'bank', label: 'تحويل بنكي' },
];

/** Raw form state: numeric fields stay strings so partial typing never crashes. */
export interface SaleForm {
  customerId: string;
  productDesc: string;
  price: string;
  saleType: 'installment' | 'cash';
  down: string;
  rate: string;
  years: number;
  saleDate: string;
  invoiceNo: string;
  paymentMethod: PaymentMethod;
}

/** Arabic-Indic (٠-٩) and Persian (۰-۹) digits to Latin; Arabic decimal separator to '.'. */
export function normalizeDigits(s: string): string {
  return s
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0))
    .replace(/٫/g, '.');
}

/** NaN for empty / unparseable input. */
export function parseAmount(s: string): number {
  const t = normalizeDigits(s).replace(/,/g, '').trim();
  if (t === '' || !/^\d*\.?\d*$/.test(t) || t === '.') return NaN;
  return Number(t);
}

/** Digits and one dot, at most 2 decimals: the preview rounds the rate to 0.01%, so must the input. */
export function sanitizeRate(s: string): string {
  const cleaned = normalizeDigits(s).replace(/[^\d.]/g, '');
  const dot = cleaned.indexOf('.');
  if (dot === -1) return cleaned;
  return cleaned.slice(0, dot + 1) + cleaned.slice(dot + 1).replace(/\./g, '').slice(0, 2);
}

/** Money inputs follow the rate rule (max 2 decimals) so the preview and numeric(14,2) agree. */
export const sanitizeAmount = sanitizeRate;

/**
 * Idempotency id per save attempt. A pure retry (same form signature) re-sends the same id;
 * editing after an earlier attempt gets a fresh id, else the server would return the old sale.
 * `prev.sig` is null until the first attempt.
 */
export function idForAttempt(
  prev: { id: string; sig: string | null },
  sig: string,
  gen: () => string,
): { id: string; sig: string } {
  if (prev.sig === null || prev.sig === sig) return { id: prev.id, sig };
  return { id: gen(), sig };
}

const ISO_DATE =/^\d{4}-\d{2}-\d{2}$/;

export function isValidDate(s: string): boolean {
  if (!ISO_DATE.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

export function todayISO(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export const FUTURE_SALE_DATE_MSG = 'تاريخ البيع لا يمكن أن يكون في المستقبل';

/** Date-field error (format, then "not in the future", same rule as create_sale); undefined = ok. */
export function saleDateError(s: string, today: string = todayISO()): string | undefined {
  if (!isValidDate(s)) return 'التاريخ غير صحيح (YYYY-MM-DD)';
  if (s > today) return FUTURE_SALE_DATE_MSG;
  return undefined;
}

/** Validation errors for the form (empty object = valid). */
export function validateSaleForm(f: SaleForm) {
  return validateSale({
    productDesc: f.productDesc,
    totalPrice: parseAmount(f.price),
    saleType: f.saleType,
    down: f.down.trim() === '' ? 0 : parseAmount(f.down),
    ratePercent: parseAmount(f.rate),
    years: f.years,
  });
}

/** Live preview; null unless installment AND every input is valid (previewInstallments throws on count 0). */
export function derivePreview(f: SaleForm): InstallmentPreview | null {
  if (f.saleType !== 'installment') return null;
  if (!isValidDate(f.saleDate)) return null;
  if (Object.keys(validateSaleForm(f)).length > 0) return null;
  return previewInstallments({
    price: parseAmount(f.price),
    down: f.down.trim() === '' ? 0 : parseAmount(f.down),
    ratePercent: parseAmount(f.rate),
    years: f.years,
    saleDate: f.saleDate,
  });
}

export function toCreateSalePayload(f: SaleForm, id: string) {
  const base = {
    id,
    customer_id: f.customerId,
    product_desc: f.productDesc.trim(),
    sale_type: f.saleType,
    total_price: parseAmount(f.price),
    sale_date: f.saleDate,
    external_invoice_no: f.invoiceNo.trim() || null,
    payment_method: f.paymentMethod,
  };
  if (f.saleType === 'cash') return base;
  return {
    ...base,
    down_payment: f.down.trim() === '' ? 0 : parseAmount(f.down),
    rate_percent: parseAmount(f.rate),
    years: f.years,
  };
}

/** Idempotent on `id`: the caller keeps one id per form so a retry re-sends the same sale. */
export function useCreateSale() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (v: { form: SaleForm; id: string }): Promise<string> => {
      const { data, error } = await supabase.rpc('create_sale', { p: toCreateSalePayload(v.form, v.id) });
      if (error) throw error;
      return data;
    },
    onSuccess: (_id, v) => {
      qc.invalidateQueries({ queryKey: ['customers'] });
      qc.invalidateQueries({ queryKey: ['customer', v.form.customerId] });
      qc.invalidateQueries({ queryKey: ['contracts', v.form.customerId] });
      qc.invalidateQueries({ queryKey: ['invoices'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });
}
