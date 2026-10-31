// Pure Excel-import logic: sheet -> raw rows -> computed contracts + validation.
// Mirrors supabase import_contract rules so the preview catches what the server rejects.
import { normalizeDigits } from '../api/sales';
import { newId } from './ids';
import { addMonths } from './money';
import { validateCustomer } from './validation';

export type RawKey =
  | 'name' | 'phone' | 'nationalId' | 'address' | 'product' | 'total'
  | 'down' | 'monthly' | 'paidMonths' | 'firstMonth' | 'lastMonth' | 'invoiceNo';
export type RawRow = Record<RawKey, string>;

export const IMPORT_COLUMNS: readonly { key: RawKey; header: string; alias: string; required: boolean }[] = [
  { key: 'name', header: 'اسم العميل', alias: 'name', required: true },
  { key: 'phone', header: 'الموبايل', alias: 'phone', required: true },
  { key: 'nationalId', header: 'الرقم القومي', alias: 'national_id', required: false },
  { key: 'address', header: 'العنوان', alias: 'address', required: false },
  { key: 'product', header: 'السلعة', alias: 'product', required: true },
  { key: 'total', header: 'المبلغ الكلي', alias: 'total', required: true },
  { key: 'down', header: 'المقدم', alias: 'down', required: true },
  { key: 'monthly', header: 'القسط الشهري', alias: 'monthly', required: true },
  { key: 'paidMonths', header: 'عدد الشهور المدفوعة', alias: 'paid_months', required: true },
  { key: 'firstMonth', header: 'أول شهر اتدفع', alias: 'first_month', required: true },
  { key: 'lastMonth', header: 'آخر شهر اتدفع', alias: 'last_month', required: false },
  { key: 'invoiceNo', header: 'رقم الفاتورة', alias: 'invoice_no', required: false },
];

export type ComputedContract = {
  total: number; down: number; monthly: number; remaining: number; count: number; last: number;
  paidMonths: number; alreadyPaid: number; left: number; firstDue: string; lastDue: string; saleDate: string;
};

export type ImportRow = {
  id: string; customerId: string; raw: RawRow; errors: string[]; warnings: string[];
  computed: ComputedContract | null; duplicate: boolean; skip: boolean;
  status: 'pending' | 'saved' | 'failed'; failure?: string;
};

const MAX_ROWS = 500;
const MAX_COUNT = 600;
const norm = (s: string) => s.trim().replace(/\s+/g, ' ').toLowerCase();

function cellToString(v: unknown): string {
  if (v == null) return '';
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  return String(v).trim();
}

export function rowsFromSheet(matrix: unknown[][]): { rows: RawRow[]; error?: string } {
  const head = (matrix[0] ?? []).map((h) => norm(cellToString(h)));
  const idx = new Map<RawKey, number>();
  for (const c of IMPORT_COLUMNS) {
    const i = head.findIndex((h) => h === norm(c.header) || h === c.alias);
    if (i >= 0) idx.set(c.key, i);
  }
  const missing = IMPORT_COLUMNS.filter((c) => c.required && !idx.has(c.key));
  if (missing.length) return { rows: [], error: `الأعمدة دي ناقصة: ${missing.map((c) => c.header).join('، ')}` };

  const rows: RawRow[] = [];
  for (const line of matrix.slice(1)) {
    const raw = {} as RawRow;
    for (const c of IMPORT_COLUMNS) {
      const i = idx.get(c.key);
      raw[c.key] = i === undefined ? '' : cellToString(line[i]);
    }
    if (Object.values(raw).every((v) => v === '')) continue;
    rows.push(raw);
  }
  if (rows.length > MAX_ROWS) return { rows: [], error: 'الملف فيه أكتر من 500 عقد' };
  return { rows };
}

export function parseAmount(cell: string): number | null {
  const t = normalizeDigits(cell).replace(/ج\.?\s?م\.?/g, '').replace(/[,٬\s]/g, '');
  if (t === '' || !/^\d*\.?\d*$/.test(t) || t === '.') return null;
  return Number(t);
}

const pad = (x: number, w = 2) => String(x).padStart(w, '0');
function iso(y: number, m: number, d: number): string | null {
  if (m < 1 || m > 12 || d < 1 || y < 1900 || y > 2200) return null;
  if (d > new Date(Date.UTC(y, m, 0)).getUTCDate()) return null;
  return `${pad(y, 4)}-${pad(m)}-${pad(d)}`;
}

export function parseMonth(cell: string): string | null {
  const t = normalizeDigits(cell).trim();
  let m: RegExpMatchArray | null;
  if ((m = t.match(/^(\d{4})[-/](\d{1,2})(?:[-/](\d{1,2}))?$/))) return iso(+m[1], +m[2], m[3] ? +m[3] : 1);
  if ((m = t.match(/^(\d{1,2})[-/](\d{4})$/))) return iso(+m[2], +m[1], 1);
  if ((m = t.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/))) return iso(+m[3], +m[2], +m[1]);
  if (/^\d+(\.\d+)?$/.test(t)) {
    const n = Math.floor(Number(t));
    if (n >= 20000 && n <= 80000) {
      const d = new Date(Date.UTC(1899, 11, 30) + n * 86400000);
      return iso(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
    }
  }
  return null;
}

const toP = (egp: number) => Math.round(Number((egp * 100).toFixed(6)));

export function computeContract(r: {
  total: number; down: number; monthly: number; paidMonths: number; firstDue: string;
}): ComputedContract {
  const remP = toP(r.total) - toP(r.down);
  const monP = toP(r.monthly);
  const count = Math.ceil(remP / monP);
  const lastP = remP - monP * (count - 1);
  const paidP = Math.min(Math.min(r.paidMonths, count) * monP, remP);
  return {
    total: r.total, down: r.down, monthly: r.monthly, remaining: remP / 100, count, last: lastP / 100,
    paidMonths: r.paidMonths, alreadyPaid: paidP / 100, left: (remP - paidP) / 100,
    firstDue: r.firstDue, lastDue: addMonths(r.firstDue, count - 1), saleDate: addMonths(r.firstDue, -1),
  };
}

function localToday(): string {
  const d = new Date();
  return `${pad(d.getFullYear(), 4)}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function validateRow(
  raw: RawRow,
  today: string = localToday(),
): { errors: string[]; warnings: string[]; computed: ComputedContract | null } {
  const errors: string[] = [];
  const warnings: string[] = [];

  const ce = validateCustomer({
    name: raw.name,
    phone: normalizeDigits(raw.phone).replace(/\s/g, ''),
    nationalId: normalizeDigits(raw.nationalId).replace(/\s/g, ''),
  });
  if (ce.name) errors.push(ce.name);
  if (ce.phone) errors.push(ce.phone);
  if (ce.nationalId) errors.push(ce.nationalId);
  if (!raw.product.trim()) errors.push('السلعة مطلوبة');

  const total = parseAmount(raw.total);
  const down = parseAmount(raw.down);
  const monthly = parseAmount(raw.monthly);
  const paid = parseAmount(raw.paidMonths);
  const firstDue = parseMonth(raw.firstMonth);
  if (total === null || total <= 0) errors.push('المبلغ الكلي لازم يكون أكبر من صفر');
  if (down === null) errors.push('المقدم مطلوب (اكتب 0 لو مفيش)');
  if (monthly === null || monthly <= 0) errors.push('القسط الشهري لازم يكون أكبر من صفر');
  if (paid === null || !Number.isInteger(paid)) errors.push('عدد الشهور المدفوعة لازم يكون رقم صحيح (0 لو مفيش)');
  if (!firstDue) errors.push('أول شهر اتدفع غير صحيح');

  if (total === null || down === null || monthly === null || paid === null || !firstDue || total <= 0 || monthly <= 0)
    return { errors, warnings, computed: null };

  if (down >= total) {
    errors.push('المقدم لازم يكون أقل من المبلغ الكلي');
    return { errors, warnings, computed: null };
  }
  if (toP(monthly) > toP(total) - toP(down)) {
    errors.push('القسط الشهري لازم يكون أكبر من صفر ومش أكبر من الباقي');
    return { errors, warnings, computed: null };
  }
  const c = computeContract({ total, down, monthly, paidMonths: paid, firstDue });
  if (c.count > MAX_COUNT) errors.push('عدد الأقساط كبير جدًا، راجع القسط الشهري');
  if (paid > c.count) errors.push('عدد الشهور المدفوعة أكبر من عدد الأقساط');
  if (firstDue > addMonths(today, 1)) errors.push('أول شهر اتدفع بعيد في المستقبل');

  if (raw.lastMonth.trim() && paid > 0) {
    const last = parseMonth(raw.lastMonth);
    const expected = addMonths(firstDue, paid - 1).slice(0, 7);
    if (!last || last.slice(0, 7) !== expected) warnings.push('الشهور المدفوعة مش متطابقة مع أول وآخر شهر');
  }
  return { errors, warnings, computed: errors.length ? null : c };
}

export function toImportRows(raws: RawRow[]): ImportRow[] {
  const byPhone = new Map<string, string>();
  return raws.map((raw) => {
    const phone = normalizeDigits(raw.phone).replace(/\D/g, '');
    let customerId = phone ? byPhone.get(phone) : undefined;
    if (!customerId) {
      customerId = newId();
      if (phone) byPhone.set(phone, customerId);
    }
    return { id: newId(), customerId, raw, ...validateRow(raw), duplicate: false, skip: false, status: 'pending' };
  });
}

export function summarize(rows: ImportRow[]) {
  return {
    total: rows.length,
    customers: new Set(rows.map((r) => r.customerId)).size,
    needsReview: rows.filter((r) => !r.skip && (r.errors.length > 0 || r.warnings.length > 0)).length,
    duplicates: rows.filter((r) => r.duplicate).length,
    ready: rows.filter((r) => !r.skip && r.errors.length === 0).length,
  };
}
