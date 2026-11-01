// Excel import data layer: read the file, build the template, flag duplicates, save row by row.
import { useMutation, useQueryClient } from '@tanstack/react-query';
import * as XLSX from 'xlsx';

import { useAuth } from '../lib/auth';
import { normalizeDigits } from './sales';
import {
  IMPORT_COLUMNS,
  normalizePhone,
  toP,
  regroupCustomers,
  validateRow,
  type ImportRow,
  type RawRow,
} from '../lib/importRows';
import { supabase } from '../lib/supabase';

export type ExistingImport = { phone: string; product: string; total: number; firstDue: string };

const GENERIC_FAILURE = 'تعذر حفظ العقد، حاول مرة تانية';
const NAME_CONFLICT = 'نفس الموبايل بأسماء مختلفة';
const FILE_DUP = 'الصف ده متكرر في الملف';

const MAX_FILE_BYTES = 5 * 1024 * 1024;
const FILE_TOO_BIG = 'الملف كبير جدًا (أقصى حجم 5 ميجا)';
const FILE_UNREADABLE = 'تعذر قراية الملف، اتأكد إنه xlsx أو csv';

const isBinaryWorkbook = (b: Uint8Array) =>
  (b[0] === 0x50 && b[1] === 0x4b) || (b[0] === 0xd0 && b[1] === 0xcf); // zip (xlsx) or OLE (xls)

/**
 * First sheet as a matrix of raw values; xlsx dates stay Excel serials (never JS Dates).
 * CSV is decoded as UTF-8 (BOM optional) and every cell stays a string, so phones keep their
 * leading 0, "1.250" stays text and dd/mm/yyyy is read by parseMonth (not guessed as m/d).
 */
export async function readSpreadsheet(file: {
  arrayBuffer(): Promise<ArrayBuffer>;
}): Promise<unknown[][]> {
  const buf = await file.arrayBuffer();
  if (buf.byteLength > MAX_FILE_BYTES) throw new Error(FILE_TOO_BIG);
  try {
    // header + 500 data rows + 1 extra so rowsFromSheet can still report "more than 500".
    const bytes = new Uint8Array(buf);
    const opts = { cellDates: false, sheetRows: 502, sheets: 0, dense: true } as const;
    let wb: XLSX.WorkBook;
    if (isBinaryWorkbook(bytes)) {
      wb = XLSX.read(buf, { type: 'array', ...opts });
    } else if (typeof TextDecoder !== 'undefined') {
      const text = new TextDecoder('utf-8').decode(bytes).replace(/^\uFEFF/, '');
      wb = XLSX.read(text, { type: 'string', raw: true, ...opts });
    } else {
      wb = XLSX.read(buf, { type: 'array', codepage: 65001, raw: true, ...opts });
    }
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
  `${phone}|${product.trim()}|${toP(total)}|${firstDue.slice(0, 7)}`;

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
    const want = !!p && (names.get(p)?.size ?? 0) >= 2;
    const has = r.warnings.includes(NAME_CONFLICT);
    if (want === has) return r;
    return { ...r, warnings: want ? [...r.warnings, NAME_CONFLICT] : r.warnings.filter((w) => w !== NAME_CONFLICT) };
  });
}

/** Warn on the 2nd+ row that repeats an earlier row of the same file (same key as the re-upload check). */
export function markFileDuplicates(rows: ImportRow[]): ImportRow[] {
  const seen = new Set<string>();
  return rows.map((r) => {
    let want = false;
    if (r.computed) {
      const k = dupKey(normalizePhone(r.raw.phone), r.raw.product, r.computed.total, r.computed.firstDue);
      want = seen.has(k);
      seen.add(k);
    }
    const has = r.warnings.includes(FILE_DUP);
    if (want === has) return r;
    return { ...r, warnings: want ? [...r.warnings, FILE_DUP] : r.warnings.filter((w) => w !== FILE_DUP) };
  });
}

/**
 * Inline edit: update raw and re-validate the edited row only, re-check its duplicate flag (a row that
 * stays a duplicate keeps the user's skip choice; a newly found duplicate is skipped), refresh name-conflict
 * warnings, then regroup customers. The row id never changes; untouched rows keep their identity.
 */
export function applyRowEdit(
  rows: ImportRow[],
  id: string,
  patch: Partial<RawRow>,
  existing: ExistingImport[],
): ImportRow[] {
  const edited = rows.map((r) => {
    if (r.id !== id) return r;
    const raw = { ...r.raw, ...patch };
    const base: ImportRow = {
      ...r, raw, ...validateRow(raw), duplicate: false, skip: false,
      status: r.status === 'failed' ? 'pending' : r.status,
      failure: r.status === 'failed' ? undefined : r.failure,
    };
    // validateRow rebuilds warnings, so the name-conflict one is re-added by markNameConflicts below.
    const next = markDuplicates([base], existing)[0];
    return next.duplicate && r.duplicate ? { ...next, skip: r.skip } : next;
  });
  return regroupCustomers(markFileDuplicates(markNameConflicts(edited)));
}

export function removeRowById(rows: ImportRow[], id: string): ImportRow[] {
  return regroupCustomers(markFileDuplicates(markNameConflicts(rows.filter((r) => r.id !== id))));
}

const ARABIC = /[؀-ۿ]/;
const PG_MESSAGES: Record<string, string> = {
  '23514': 'في بيانات مش صحيحة في الصف ده، راجعها', // check_violation
  '22003': 'المبلغ كبير جدًا', // numeric_value_out_of_range
  '42501': 'حسابك مش مسموح له يستورد', // insufficient_privilege / RLS
};
export function failureMessage(e: unknown): string {
  const err = e as { message?: unknown; code?: unknown } | null;
  if (typeof err?.message === 'string' && ARABIC.test(err.message)) return err.message;
  if (typeof err?.code === 'string' && PG_MESSAGES[err.code]) return PG_MESSAGES[err.code];
  return GENERIC_FAILURE;
}

const oneLine = (s: string) => s.trim().replace(/\s+/g, ' ');

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

  // One lookup for every phone up front; if it fails nothing is sent (a blind create could duplicate a customer).
  let existingByPhone: Map<string, { id: string; name: string }>;
  try {
    existingByPhone = await findExistingCustomers(
      rows.filter(todo).map((r) => normalizePhone(r.raw.phone)),
      tenantId,
    );
  } catch (e) {
    const failure = failureMessage(e);
    for (let i = 0; i < rows.length; i++) if (todo(rows[i])) result[i] = { ...rows[i], status: 'failed', failure };
    onProgress(total, total);
    return result;
  }

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    if (!todo(r)) continue;
    try {
      const phone = normalizePhone(r.raw.phone);
      let customerId = customerByPhone.get(phone);
      if (!customerId) {
        const found = existingByPhone.get(phone);
        if (found) {
          customerId = found.id;
        } else {
          const first = rows.find((x) => todo(x) && normalizePhone(x.raw.phone) === phone) ?? r;
          const { error: upErr } = await supabase.from('customer').upsert(
            {
              id: first.customerId,
              tenant_id: tenantId,
              name: oneLine(first.raw.name),
              phone,
              national_id: normalizeDigits(first.raw.nationalId).replace(/\s/g, '') || null,
              address: oneLine(first.raw.address) || null,
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
