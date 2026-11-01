// Excel import data layer: read the file, build the template, flag duplicates, save row by row.
import { useMutation, useQueryClient } from '@tanstack/react-query';
import * as XLSX from 'xlsx';

import { useAuth } from '../lib/auth';
import {
  IMPORT_COLUMNS,
  normalizePhone,
  regroupCustomers,
  validateRow,
  type ImportRow,
  type RawRow,
} from '../lib/importRows';
import { supabase } from '../lib/supabase';

export type ExistingImport = { phone: string; product: string; total: number; firstDue: string };

const GENERIC_FAILURE = 'تعذر حفظ العقد، حاول مرة تانية';
const NAME_CONFLICT = 'نفس الموبايل بأسماء مختلفة';

const MAX_FILE_BYTES = 5 * 1024 * 1024;
const FILE_TOO_BIG = 'الملف كبير جدًا (أقصى حجم 5 ميجا)';
const FILE_UNREADABLE = 'تعذر قراية الملف، اتأكد إنه xlsx أو csv';

/** First sheet as a matrix of raw values; dates stay Excel serials (never JS Dates). */
export async function readSpreadsheet(file: {
  arrayBuffer(): Promise<ArrayBuffer>;
}): Promise<unknown[][]> {
  const buf = await file.arrayBuffer();
  if (buf.byteLength > MAX_FILE_BYTES) throw new Error(FILE_TOO_BIG);
  try {
    // header + 500 data rows + 1 extra so rowsFromSheet can still report "more than 500".
    const wb = XLSX.read(buf, { type: 'array', cellDates: false, sheetRows: 502, sheets: 0, dense: true });
    const sheet = wb.Sheets[wb.SheetNames[0]];
    if (!sheet) return [];
    return XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, raw: true, defval: '' });
  } catch {
    throw new Error(FILE_UNREADABLE);
  }
}

const EXAMPLE = ['محمود عبد الحميد', '01012345678', '29001011234567', 'المنصورة', 'ثلاجة توشيبا 16 قدم',
  25000, 10000, 1000, 6, '2025-11', '2026-04', '1043'];

const NOTES: string[][] = [
  ['ملاحظات عن الملف'],
  ['كل صف = عقد تقسيط واحد. نفس الموبايل في أكتر من صف = نفس العميل.'],
  ['المبلغ الكلي بالفايدة: يعني كل اللي العميل هيدفعه (المقدم + كل الأقساط).'],
  ['القسط الشهري: قيمة القسط كل شهر.'],
  ['عدد الشهور المدفوعة: الأقساط اللي اتدفعت قبل ما تستخدم نوتة (اكتب 0 لو مفيش).'],
  ['أول شهر اتدفع = شهر أول قسط (حتى لو لسه ما اتدفعش حاجة). اكتبه بالشكل 2025-11 أو 2025-11-15.'],
  ['آخر شهر اتدفع: اختياري، بنستخدمه بس نراجع بيه الأرقام.'],
  ['رقم الفاتورة: اختياري.'],
  ['أقصى عدد عقود في الملف الواحد 500.'],
  [],
  ['الأسماء الإنجليزية المقبولة للأعمدة'],
  ...IMPORT_COLUMNS.map((c) => [c.header, c.alias, c.required ? 'مطلوب' : 'اختياري']),
];

export function buildTemplateWorkbook(): XLSX.WorkBook {
  const wb = XLSX.utils.book_new();
  const data = XLSX.utils.aoa_to_sheet([IMPORT_COLUMNS.map((c) => c.header), EXAMPLE]);
  data['!cols'] = IMPORT_COLUMNS.map(() => ({ wch: 20 }));
  XLSX.utils.book_append_sheet(wb, data, 'العقود');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(NOTES), 'تعليمات');
  wb.Workbook = { Views: [{ RTL: true }] };
  return wb;
}

/** Web only: downloads notah-import-template.xlsx. */
export function downloadTemplate(): void {
  if (typeof document === 'undefined' || typeof Blob === 'undefined') {
    console.warn('downloadTemplate is only available on web');
    return;
  }
  const out = XLSX.write(buildTemplateWorkbook(), { type: 'array', bookType: 'xlsx' });
  const blob = new Blob([out], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'notah-import-template.xlsx';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

const dupKey = (phone: string, product: string, total: number, firstDue: string) =>
  `${phone}|${product.trim()}|${total}|${firstDue.slice(0, 7)}`;

export function markDuplicates(rows: ImportRow[], existing: ExistingImport[]): ImportRow[] {
  const keys = new Set(existing.map((e) => dupKey(normalizePhone(e.phone), e.product, Number(e.total), e.firstDue)));
  return rows.map((r) => {
    if (!r.computed) return r;
    const hit = keys.has(dupKey(normalizePhone(r.raw.phone), r.raw.product, r.computed.total, r.computed.firstDue));
    return hit ? { ...r, duplicate: true, skip: true } : r;
  });
}

export async function fetchExistingImports(): Promise<ExistingImport[]> {
  const PAGE = 1000; // PostgREST's default row cap
  const out: ExistingImport[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from('contract')
      .select('product_desc, total_price, customer!inner(phone), installment!inner(due_date, seq_no)')
      .eq('interest_method', 'imported')
      .eq('installment.seq_no', 1)
      .order('id')
      .range(from, from + PAGE - 1);
    if (error) throw error;
    const page = (data ?? []) as unknown as {
      product_desc: string | null; total_price: number | string;
      customer: { phone: string } | { phone: string }[];
      installment: { due_date: string }[] | { due_date: string };
    }[];
    for (const c of page) {
      const cust = Array.isArray(c.customer) ? c.customer[0] : c.customer;
      const inst = Array.isArray(c.installment) ? c.installment[0] : c.installment;
      if (!cust || !inst) continue;
      out.push({ phone: cust.phone, product: c.product_desc ?? '', total: Number(c.total_price), firstDue: inst.due_date });
    }
    if (page.length < PAGE) return out;
  }
}

export function markNameConflicts(rows: ImportRow[]): ImportRow[] {
  const norm = (s: string) => s.trim().replace(/\s+/g, ' ').toLowerCase();
  const names = new Map<string, Set<string>>();
  for (const r of rows) {
    const p = normalizePhone(r.raw.phone);
    if (!p) continue;
    names.set(p, (names.get(p) ?? new Set()).add(norm(r.raw.name)));
  }
  return rows.map((r) => {
    const p = normalizePhone(r.raw.phone);
    if (!p || (names.get(p)?.size ?? 0) < 2 || r.warnings.includes(NAME_CONFLICT)) return r;
    return { ...r, warnings: [...r.warnings, NAME_CONFLICT] };
  });
}

/**
 * Inline edit: update raw, re-validate, refresh name-conflict warnings, re-check duplicate for the
 * edited row only (other rows keep their skip choice), then regroup customers. The row id never changes.
 */
export function applyRowEdit(
  rows: ImportRow[],
  id: string,
  patch: Partial<RawRow>,
  existing: ExistingImport[],
): ImportRow[] {
  const edited = rows.map((r) => {
    const raw = r.id === id ? { ...r.raw, ...patch } : r.raw;
    const v = validateRow(raw);
    const base = { ...r, raw, ...v, warnings: v.warnings };
    if (r.id !== id) return base;
    return markDuplicates([{ ...base, duplicate: false, skip: false }], existing)[0];
  });
  // Warnings of untouched rows were rebuilt above, so conflicts are recomputed from scratch.
  const withDup = edited.map((r, i) => (r.id === id ? r : { ...r, duplicate: rows[i].duplicate, skip: rows[i].skip }));
  return regroupCustomers(markNameConflicts(withDup));
}

const ARABIC = /[؀-ۿ]/;
function failureMessage(e: unknown): string {
  const m = (e as { message?: unknown } | null)?.message;
  return typeof m === 'string' && ARABIC.test(m) ? m : GENERIC_FAILURE;
}

/** Existing customers of this shop by (normalized) phone; the oldest wins when several share one. */
export async function findExistingCustomers(
  phones: string[],
  tenantId: string,
): Promise<Map<string, { id: string; name: string }>> {
  const out = new Map<string, { id: string; name: string }>();
  const unique = [...new Set(phones.filter(Boolean))];
  for (let i = 0; i < unique.length; i += 100) {
    const { data, error } = await supabase
      .from('customer')
      .select('id, name, phone')
      .eq('tenant_id', tenantId)
      .in('phone', unique.slice(i, i + 100))
      .order('created_at', { ascending: true });
    if (error) throw error;
    for (const c of data ?? []) if (!out.has(c.phone)) out.set(c.phone, { id: c.id, name: c.name });
  }
  return out;
}

/**
 * Saves row by row; never throws. Rows with errors, skip, or already saved are left alone,
 * so retrying re-sends only what is missing (ids are stable and the RPC is idempotent).
 */
export async function saveRows(
  rows: ImportRow[],
  onProgress: (done: number, total: number) => void,
  { tenantId }: { tenantId: string },
): Promise<ImportRow[]> {
  const todo = (r: ImportRow) => !r.skip && r.errors.length === 0 && r.status !== 'saved' && !!r.computed;
  const total = rows.filter(todo).length;
  const customerByPhone = new Map<string, string>();
  const result = [...rows];
  let done = 0;
  onProgress(0, total);

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    if (!todo(r)) continue;
    try {
      const phone = normalizePhone(r.raw.phone);
      let customerId = customerByPhone.get(phone);
      if (!customerId) {
        const found = (await findExistingCustomers([phone], tenantId)).get(phone);
        if (found) {
          customerId = found.id;
        } else {
          const first = rows.find((x) => normalizePhone(x.raw.phone) === phone) ?? r;
          const { error: upErr } = await supabase.from('customer').upsert(
            {
              id: first.customerId,
              tenant_id: tenantId,
              name: first.raw.name.trim(),
              phone,
              national_id: first.raw.nationalId.trim() || null,
              address: first.raw.address.trim() || null,
            },
            { onConflict: 'id', ignoreDuplicates: true },
          );
          if (upErr) throw upErr;
          customerId = first.customerId;
        }
        customerByPhone.set(phone, customerId);
      }
      const c = r.computed!;
      const { error } = await supabase.rpc('import_contract', {
        p: {
          id: r.id,
          customer_id: customerId,
          product_desc: r.raw.product.trim(),
          total_price: c.total,
          down_payment: c.down,
          monthly: c.monthly,
          first_due: c.firstDue,
          paid_months: c.paidMonths,
          external_invoice_no: r.raw.invoiceNo.trim() || null,
        },
      });
      if (error) throw error;
      result[i] = { ...r, status: 'saved', failure: undefined };
    } catch (e) {
      result[i] = { ...r, status: 'failed', failure: failureMessage(e) };
    }
    onProgress(++done, total);
  }
  return result;
}

export function useImportSave() {
  const { profile } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (v: { rows: ImportRow[]; onProgress: (done: number, total: number) => void }) => {
      if (!profile) throw new Error('not signed in');
      return saveRows(v.rows, v.onProgress, { tenantId: profile.tenant_id });
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ['customers'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });
}
