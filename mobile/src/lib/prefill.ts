import { PAYMENT_METHODS, type PaymentMethod, type SaleForm } from '../api/sales';

type Params = Record<string, string | string[] | undefined>;

const first = (p: Params, k: string): string | undefined => {
  const v = p[k];
  const s = Array.isArray(v) ? v[0] : v;
  return s === undefined || s.trim() === '' ? undefined : s.trim();
};

const num = (s: string | undefined): number | undefined => {
  if (s === undefined || !/^(\d+\.?\d*|\.\d+)$/.test(s)) return undefined;
  const n = Number(s);
  return Number.isFinite(n) ? n : undefined;
};

export function parsePaymentPrefill(params: Params): { amount?: number; method?: PaymentMethod; contractId?: string } {
  const out: { amount?: number; method?: PaymentMethod; contractId?: string } = {};
  const amount = num(first(params, 'amount'));
  if (amount !== undefined && amount > 0 && amount <= 10_000_000) out.amount = amount;
  const method = first(params, 'method');
  if (method && PAYMENT_METHODS.some((m) => m.value === method)) out.method = method as PaymentMethod;
  const contractId = first(params, 'contractId');
  if (contractId) out.contractId = contractId;
  return out;
}

export function parseSalePrefill(params: Params): Partial<SaleForm> & { newName?: string } {
  const out: Partial<SaleForm> & { newName?: string } = {};
  const product = first(params, 'product');
  if (product) out.productDesc = product;
  const price = num(first(params, 'price'));
  if (price !== undefined && price > 0) out.price = String(price);
  const type = first(params, 'type');
  if (type === 'cash' || type === 'installment') out.saleType = type;
  if (type !== 'cash') {
    const down = num(first(params, 'down'));
    if (down !== undefined && down > 0 && (price === undefined || down < price)) out.down = String(down);
    const rate = num(first(params, 'rate'));
    if (rate !== undefined && rate >= 0 && rate <= 200) out.rate = String(rate);
    const years = num(first(params, 'years'));
    if (years !== undefined && Number.isInteger(years) && years >= 1 && years <= 5) out.years = years;
  }
  const ext = first(params, 'ext');
  if (ext && ext.length <= 40) out.invoiceNo = ext;
  const newName = first(params, 'newName');
  if (newName && newName.length <= 80) out.newName = newName;
  return out;
}

/** Seeds the chosen invoice line when a voice prefill carries both amount and contractId. */
export function prefillAmounts(p: { amount?: number; contractId?: string }): Record<string, string> | undefined {
  return p.amount !== undefined && p.contractId ? { [p.contractId]: String(p.amount) } : undefined;
}
