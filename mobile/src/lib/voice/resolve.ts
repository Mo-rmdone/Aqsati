import type { Intent } from '../../../../supabase/functions/voice-intent/logic';
import { formatDateAr, localDateISO } from '../date';
import { formatEGP } from '../money';
import { containsAr, normalizeAr } from './normalize';

export interface CustomerOption {
  id: string;
  name: string;
  phone: string;
  remaining: number;
}

export interface InvoiceOption {
  id: string;
  contract_no: number | null;
  product_desc: string | null;
  external_invoice_no: string | null;
  remaining: number;
}

export interface CustomerSummary {
  name: string;
  paid_total: number;
  remaining_total: number;
  overdue_amount: number;
  next_due_date: string | null;
  next_due_amount: number | null;
}

export interface VoiceData {
  findCustomers(q: string): Promise<CustomerOption[]>;
  customerSummary(id: string): Promise<CustomerSummary | null>;
  lastPayment(id: string): Promise<{ amount: number; received_at: string } | null>;
  openInvoices(customerId: string): Promise<InvoiceOption[]>;
  lateSummary(): Promise<{ count: number; total: number; top: { name: string; days_late: number }[] }>;
  totals(): Promise<{ today: number; month: number }>;
}

export type VoiceOutcome =
  | { kind: 'navigate'; path: string; say?: string }
  | { kind: 'chooseCustomer'; options: CustomerOption[]; then: Intent }
  | { kind: 'chooseInvoice'; options: InvoiceOption[]; customerId: string; then: Intent }
  | { kind: 'answer'; text: string }
  | { kind: 'message'; text: string };

export type Picked = { customerId?: string; contractId?: string | null };

function build(base: string, params: [string, string | number | undefined][]): string {
  const q = params
    .filter(([, v]) => v !== undefined && v !== '')
    .map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`)
    .join('&');
  return q ? `${base}?${q}` : base;
}

export function paymentPath(p: { customerId?: string; amount?: number; method?: string; contractId?: string | null }): string {
  return build('/payment/new', [
    ['customerId', p.customerId],
    ['amount', p.amount],
    ['method', p.method],
    ['contractId', p.contractId ?? undefined],
  ]);
}

export function salePath(p: {
  customerId?: string;
  newName?: string;
  product?: string;
  price?: number;
  type?: string;
  down?: number;
  rate?: number;
  years?: number;
  ext?: string;
}): string {
  return build('/sale/new', [
    ['customerId', p.customerId],
    ['newName', p.newName],
    ['product', p.product],
    ['price', p.price],
    ['type', p.type],
    ['down', p.down],
    ['rate', p.rate],
    ['years', p.years],
    ['ext', p.ext],
  ]);
}

// ---- answer builders ----

export function balanceText(s: CustomerSummary, last: { amount: number; received_at: string } | null): string {
  let t = `${s.name}: دفع ${formatEGP(s.paid_total)}`;
  if (s.remaining_total > 0) {
    t += `، والباقي عليه ${formatEGP(s.remaining_total)}`;
    if (s.overdue_amount > 0) t += `، منهم ${formatEGP(s.overdue_amount)} متأخر`;
    t += '.';
  } else {
    t += '، ومفيش عليه باقي.';
  }
  if (s.next_due_date && s.next_due_amount != null && s.next_due_amount > 0) {
    t += ` القسط الجاي ${formatEGP(s.next_due_amount)} يوم ${formatDateAr(s.next_due_date)}.`;
  }
  if (last) {
    t += ` آخر دفعة ${formatEGP(last.amount)} يوم ${formatDateAr(localDateISO(last.received_at))}.`;
  }
  return t;
}

export function lateText(l: { count: number; total: number; top: { name: string; days_late: number }[] }): string {
  if (l.count <= 0) return 'مفيش حد متأخر النهارده';
  const who = l.count === 1 ? 'عميل واحد متأخر' : l.count === 2 ? 'عميلين متأخرين' : `${l.count} عملاء متأخرين`;
  const list = l.top.map((c) => `${c.name} (${c.days_late} يوم)`).join('، ');
  return `عندك ${who} بإجمالي ${formatEGP(l.total)}${list ? `: ${list}` : ''}.`;
}

export function totalsText(t: { today: number; month: number }): string {
  return `النهارده حصّلت ${formatEGP(t.today)}، والشهر ده ${formatEGP(t.month)}.`;
}

export function invoiceText(i: InvoiceOption): string {
  const name = i.product_desc || `فاتورة ${i.contract_no ?? ''}`.trim();
  const ext = i.external_invoice_no ? ` (رقم ${i.external_invoice_no})` : '';
  return `${name}${ext}: الباقي ${formatEGP(i.remaining)}.`;
}

// ---- resolution ----

function narrowByName(list: CustomerOption[], name: string): CustomerOption[] {
  const hit = list.filter((c) => containsAr(c.name, name));
  const pool = hit.length > 0 ? hit : list;
  const exact = pool.filter((c) => normalizeAr(c.name) === normalizeAr(name));
  return exact.length === 1 ? exact : pool;
}

function matchInvoices(list: InvoiceOption[], hint?: string): InvoiceOption[] {
  const h = hint?.trim();
  if (!h) return [];
  const ext = list.filter((i) => i.external_invoice_no && i.external_invoice_no.trim() === h);
  if (ext.length > 0) return ext;
  return list.filter((i) => i.product_desc && containsAr(i.product_desc, h));
}

type CustomerStep = { done: VoiceOutcome; notFound?: boolean } | { id: string; name: string | null };

async function stepCustomer(intent: Intent, name: string, data: VoiceData, picked?: Picked): Promise<CustomerStep> {
  if (picked?.customerId) return { id: picked.customerId, name: null };
  const found = narrowByName(await data.findCustomers(name), name);
  if (found.length === 0) return { done: { kind: 'message', text: `مش لاقي عميل اسمه ${name}` }, notFound: true };
  if (found.length > 1) return { done: { kind: 'chooseCustomer', options: found, then: intent } };
  return { id: found[0].id, name: found[0].name };
}

async function nameOf(step: { id: string; name: string | null }, data: VoiceData): Promise<string> {
  return step.name ?? (await data.customerSummary(step.id))?.name ?? 'العميل ده';
}

async function stepInvoice(
  intent: Intent,
  customerId: string,
  invoices: InvoiceOption[],
  hint: string | undefined,
  picked?: Picked,
): Promise<{ invoice: InvoiceOption } | { unknown: true } | { done: VoiceOutcome }> {
  if (picked && picked.contractId !== undefined) {
    if (picked.contractId === null) return { unknown: true };
    const inv = invoices.find((i) => i.id === picked.contractId);
    if (inv) return { invoice: inv };
  }
  const hits = matchInvoices(invoices, hint);
  if (hits.length === 1) return { invoice: hits[0] };
  if (invoices.length === 1 && !hint?.trim()) return { invoice: invoices[0] };
  const options = hits.length > 1 ? hits : invoices;
  return { done: { kind: 'chooseInvoice', options, customerId, then: intent } };
}

export async function resolveIntent(intent: Intent, data: VoiceData, picked?: Picked): Promise<VoiceOutcome> {
  switch (intent.type) {
    case 'record_payment': {
      const c = await stepCustomer(intent, intent.customer, data, picked);
      if ('done' in c) return c.done;
      const invoices = await data.openInvoices(c.id);
      if (invoices.length === 0) return { kind: 'message', text: `${await nameOf(c, data)} مالوش فواتير مفتوحة` };
      const r = await stepInvoice(intent, c.id, invoices, intent.invoice_hint, picked);
      if ('done' in r) return r.done;
      return {
        kind: 'navigate',
        path: paymentPath({
          customerId: c.id,
          amount: intent.amount,
          method: intent.method,
          contractId: 'invoice' in r ? r.invoice.id : undefined,
        }),
      };
    }
    case 'create_invoice': {
      const c = await stepCustomer(intent, intent.customer, data, picked);
      const rest = {
        product: intent.product,
        price: intent.price,
        type: intent.sale_type,
        down: intent.down_payment,
        rate: intent.rate_percent,
        years: intent.years,
        ext: intent.external_invoice_no,
      };
      if ('done' in c) {
        if (c.notFound) return { kind: 'navigate', path: salePath({ newName: intent.customer, ...rest }) };
        return c.done;
      }
      return { kind: 'navigate', path: salePath({ customerId: c.id, ...rest }) };
    }
    case 'ask_balance': {
      const c = await stepCustomer(intent, intent.customer, data, picked);
      if ('done' in c) return c.done;
      const [s, last] = await Promise.all([data.customerSummary(c.id), data.lastPayment(c.id)]);
      if (!s) return { kind: 'message', text: 'مش لاقي بيانات العميل ده' };
      return { kind: 'answer', text: balanceText(s, last) };
    }
    case 'ask_late':
      return { kind: 'answer', text: lateText(await data.lateSummary()) };
    case 'ask_totals':
      return { kind: 'answer', text: totalsText(await data.totals()) };
    case 'ask_invoice': {
      const c = await stepCustomer(intent, intent.customer, data, picked);
      if ('done' in c) return c.done;
      const invoices = await data.openInvoices(c.id);
      if (invoices.length === 0) return { kind: 'message', text: `${await nameOf(c, data)} مالوش فواتير مفتوحة` };
      const r = await stepInvoice(intent, c.id, invoices, intent.invoice_hint, picked);
      if ('done' in r) return r.done;
      if ('unknown' in r) return { kind: 'navigate', path: `/customers/${c.id}` };
      return { kind: 'answer', text: invoiceText(r.invoice) };
    }
    case 'open': {
      switch (intent.target) {
        case 'home':
          return { kind: 'navigate', path: '/' };
        case 'customers':
          return { kind: 'navigate', path: '/customers' };
        case 'invoices':
          return { kind: 'navigate', path: '/invoices' };
        case 'customer': {
          if (!intent.customer) return { kind: 'navigate', path: '/customers' };
          const c = await stepCustomer(intent, intent.customer, data, picked);
          if ('done' in c) return c.done;
          return { kind: 'navigate', path: `/customers/${c.id}` };
        }
        case 'invoice': {
          if (!intent.customer) return { kind: 'navigate', path: '/invoices' };
          const c = await stepCustomer(intent, intent.customer, data, picked);
          if ('done' in c) return c.done;
          const invoices = await data.openInvoices(c.id);
          if (invoices.length === 0) return { kind: 'navigate', path: `/customers/${c.id}` };
          const r = await stepInvoice(intent, c.id, invoices, intent.invoice_hint, picked);
          if ('done' in r) return r.done;
          if ('unknown' in r) return { kind: 'navigate', path: `/customers/${c.id}` };
          return { kind: 'navigate', path: `/contract/${r.invoice.id}` };
        }
      }
      return { kind: 'navigate', path: '/' };
    }
    default:
      return { kind: 'message', text: 'مفهمتش، قول تاني' };
  }
}
