import type { Intent } from '../../../../supabase/functions/voice-intent/logic';
import { filterNameRows, fuzzyNamePattern, namePattern, normalizeAr } from '../voice/normalize';
import {
  balanceText,
  invoiceText,
  lateText,
  paymentPath,
  resolveIntent,
  salePath,
  totalsText,
  type InvoiceOption,
  type VoiceData,
} from '../voice/resolve';

const sayed = { id: 'c1', name: 'سيد الشحات', phone: '010', remaining: 13075 };
const sayed2 = { id: 'c2', name: 'سيد محمود', phone: '011', remaining: 5 };
const inv = (id: string, product: string, ext: string | null = null): InvoiceOption => ({
  id,
  contract_no: 1,
  product_desc: product,
  external_invoice_no: ext,
  remaining: 100,
});

function fake(over: Partial<VoiceData> = {}): VoiceData {
  return {
    findCustomers: async () => [sayed],
    customerSummary: async () => ({
      name: 'سيد الشحات',
      paid_total: 16925,
      remaining_total: 13075,
      overdue_amount: 1625,
      next_due_date: '2026-12-01',
      next_due_amount: 812.5,
    }),
    lastPayment: async () => ({ amount: 2000, received_at: '2026-11-01T10:00:00Z' }),
    openInvoices: async () => [inv('k1', 'تلاجة', 'A-1')],
    lateSummary: async () => ({ count: 0, total: 0, top: [] }),
    totals: async () => ({ today: 8012.5, month: 42300 }),
    ...over,
  };
}

describe('normalizeAr', () => {
  it('unifies forms', () => {
    expect(normalizeAr('التلاجه')).toBe(normalizeAr('تلاجة'));
    expect(normalizeAr('أحمد')).toBe(normalizeAr('احمد'));
    expect(normalizeAr('مُحَمَّد')).toBe('محمد');
    expect(normalizeAr('مـحمد')).toBe('محمد');
    expect(normalizeAr('موسى')).toBe(normalizeAr('موسي'));
    expect(normalizeAr('ABC')).toBe('abc');
  });
});

describe('fix round 1', () => {
  it('fuzzyNamePattern matches spelling variants', () => {
    const pattern = fuzzyNamePattern('احمد فاطمه');
    expect(pattern).toBe('%_حمد ف_طم_%');
    const re = new RegExp('^' + pattern.slice(1, -1).replace(/_/g, '.') + '$');
    expect(re.test('أحمد فاطمة')).toBe(true);
  });
  it('namePattern: fuzzy only for 3+ normalized chars', () => {
    expect(namePattern('احمد', 'احمد')).toBe('%_حمد%');
    expect(namePattern('اح', 'اح')).toBe('%اح%');
  });
  it('filterNameRows post-filters by normalized contains before capping', () => {
    const rows = [
      { name: 'امد خالد' },
      ...Array.from({ length: 7 }, (_, i) => ({ name: `اخمد ${i}` })),
      { name: 'أحمد فاطمة' },
    ];
    const out = filterNameRows(rows, 'احمد', 6);
    expect(out).toEqual([{ name: 'أحمد فاطمة' }]);
    expect(filterNameRows(Array.from({ length: 9 }, () => ({ name: 'أحمد' })), 'احمد', 6)).toHaveLength(6);
  });
  it('leading ال stripped only when 3+ chars remain', () => {
    expect(normalizeAr('الله')).toBe('الله');
    expect(normalizeAr('الشحات')).toBe('شحات');
  });
  it('single invoice + hint that matches nothing -> chooseInvoice', async () => {
    const pay: Intent = { type: 'record_payment', customer: 'سيد', invoice_hint: 'غسالة' };
    const out = await resolveIntent(pay, fake());
    expect(out.kind).toBe('chooseInvoice');
  });
  it('single invoice + matching hint -> navigate', async () => {
    const pay: Intent = { type: 'record_payment', customer: 'سيد', invoice_hint: 'تلاجه' };
    expect((await resolveIntent(pay, fake())).kind).toBe('navigate');
  });
  it('missing customer summary -> message', async () => {
    const out = await resolveIntent({ type: 'ask_balance', customer: 'سيد' }, fake({ customerSummary: async () => null }));
    expect(out).toEqual({ kind: 'message', text: 'مش لاقي بيانات العميل ده' });
  });
});

describe('paths', () => {
  it('omits undefined and encodes', () => {
    expect(paymentPath({ customerId: 'c1', amount: 2000, method: 'cash' })).toBe('/payment/new?customerId=c1&amount=2000&method=cash');
    expect(paymentPath({ customerId: 'c1', contractId: 'k1' })).toBe('/payment/new?customerId=c1&contractId=k1');
    expect(salePath({ newName: 'محمد علي', price: 30000, type: 'installment', years: 5 })).toBe(
      `/sale/new?newName=${encodeURIComponent('محمد علي')}&price=30000&type=installment&years=5`,
    );
  });
});

describe('answer text', () => {
  it('balance', () => {
    const s = {
      name: 'سيد الشحات',
      paid_total: 16925,
      remaining_total: 13075,
      overdue_amount: 1625,
      next_due_date: '2026-12-01',
      next_due_amount: 812.5,
    };
    expect(balanceText(s, { amount: 2000, received_at: '2026-11-01T10:00:00Z' })).toBe(
      'سيد الشحات: دفع 16,925.00 ج.م، والباقي عليه 13,075.00 ج.م، منهم 1,625.00 ج.م متأخر. القسط الجاي 812.50 ج.م يوم 1 ديسمبر 2026. آخر دفعة 2,000.00 ج.م يوم 1 نوفمبر 2026.',
    );
  });
  it('late', () => {
    expect(lateText({ count: 0, total: 0, top: [] })).toBe('مفيش حد متأخر النهارده');
    expect(lateText({ count: 3, total: 9120, top: [{ name: 'سيد الشحات', days_late: 34 }, { name: 'علي', days_late: 5 }] })).toBe(
      'عندك 3 عملاء متأخرين بإجمالي 9,120.00 ج.م: سيد الشحات (34 يوم)، علي (5 يوم).',
    );
  });
  it('totals and invoice', () => {
    expect(totalsText({ today: 8012.5, month: 42300 })).toBe('النهارده حصّلت 8,012.50 ج.م، والشهر ده 42,300.00 ج.م.');
    expect(invoiceText(inv('k1', 'تلاجة', 'A-1'))).toBe('تلاجة (رقم A-1): الباقي 100.00 ج.م.');
  });
});

describe('resolveIntent', () => {
  const pay: Intent = { type: 'record_payment', customer: 'سيد', amount: 2000, method: 'cash' };

  it('record_payment one customer, one invoice -> navigate preselected', async () => {
    expect(await resolveIntent(pay, fake())).toEqual({
      kind: 'navigate',
      path: '/payment/new?customerId=c1&amount=2000&method=cash&contractId=k1',
    });
  });
  it('zero customers -> message', async () => {
    expect(await resolveIntent(pay, fake({ findCustomers: async () => [] }))).toEqual({
      kind: 'navigate',
      path: '/customers?q=%D8%B3%D9%8A%D8%AF',
      say: 'مش لاقي عميل اسمه سيد، دوّر عليه هنا',
    });
  });
  it('unknown intent -> hint message', async () => {
    const out: any = await resolveIntent({ type: 'unknown' } as any, fake());
    expect(out.kind).toBe('message');
    expect(out.text).toBe('مفهمتش، جرّب تقولها تاني. مثلاً: «سيد عليه كام؟» أو «سيد دفع ألفين كاش» أو «مين متأخر؟»');
  });
  it('payment asks for payable invoices only; ask_invoice sees all', async () => {
    const scopes: unknown[] = [];
    const d = fake({ openInvoices: async (_id: string, scope?: string) => (scopes.push(scope), [inv('k1', 'تلاجة')]) });
    await resolveIntent(pay, d);
    await resolveIntent({ type: 'ask_invoice', customer: 'سيد' } as Intent, d);
    expect(scopes).toEqual(['payable', undefined]);
  });
  it('two customers -> chooseCustomer; picked continues', async () => {
    const d = fake({ findCustomers: async () => [sayed, sayed2] });
    expect(await resolveIntent(pay, d)).toEqual({ kind: 'chooseCustomer', options: [sayed, sayed2], then: pay });
    expect((await resolveIntent(pay, d, { customerId: 'c2' })).kind).toBe('navigate');
  });
  it('no open invoices -> message', async () => {
    const out = await resolveIntent(pay, fake({ openInvoices: async () => [] }));
    expect(out).toEqual({ kind: 'message', text: 'سيد الشحات مالوش فواتير مفتوحة' });
  });
  it('invoice hint: one match preselects among many', async () => {
    const d = fake({ openInvoices: async () => [inv('k1', 'تلاجة'), inv('k2', 'غسالة')] });
    const out: any = await resolveIntent({ ...pay, invoice_hint: 'التلاجه' }, d);
    expect(out.kind).toBe('navigate');
    expect(out.path).toContain('contractId=k1');
  });
  it('invoice hint: exact external number', async () => {
    const d = fake({ openInvoices: async () => [inv('k1', 'تلاجة', '77'), inv('k2', 'تلاجة', '78')] });
    const out: any = await resolveIntent({ ...pay, invoice_hint: '78' }, d);
    expect(out.path).toContain('contractId=k2');
  });
  it('invoice hint: none matches, many invoices -> chooseInvoice with all', async () => {
    const list = [inv('k1', 'تلاجة'), inv('k2', 'غسالة')];
    const it2 = { ...pay, invoice_hint: 'تليفزيون' };
    const out = await resolveIntent(it2, fake({ openInvoices: async () => list }));
    expect(out).toEqual({ kind: 'chooseInvoice', options: list, customerId: 'c1', then: it2 });
  });
  it('invoice hint: two matches -> chooseInvoice of those two', async () => {
    const list = [inv('k1', 'تلاجة صغيرة'), inv('k2', 'تلاجة كبيرة'), inv('k3', 'غسالة')];
    const out: any = await resolveIntent({ ...pay, invoice_hint: 'تلاجه' }, fake({ openInvoices: async () => list }));
    expect(out.kind).toBe('chooseInvoice');
    expect(out.options.map((o: InvoiceOption) => o.id)).toEqual(['k1', 'k2']);
  });
  it('picked contractId null = unknown, omits contractId', async () => {
    const d = fake({ openInvoices: async () => [inv('k1', 'تلاجة'), inv('k2', 'غسالة')] });
    const out: any = await resolveIntent(pay, d, { customerId: 'c1', contractId: null });
    expect(out.path).toBe('/payment/new?customerId=c1&amount=2000&method=cash');
  });
  it('picked contractId used', async () => {
    const d = fake({ openInvoices: async () => [inv('k1', 'تلاجة'), inv('k2', 'غسالة')] });
    const out: any = await resolveIntent(pay, d, { customerId: 'c1', contractId: 'k2' });
    expect(out.path).toContain('contractId=k2');
  });

  it('create_invoice unknown customer -> newName', async () => {
    const out = await resolveIntent(
      { type: 'create_invoice', customer: 'محمد', product: 'تلاجة', price: 30000, sale_type: 'installment', years: 5 },
      fake({ findCustomers: async () => [] }),
    );
    expect(out).toEqual({
      kind: 'navigate',
      path: `/sale/new?newName=${encodeURIComponent('محمد')}&product=${encodeURIComponent('تلاجة')}&price=30000&type=installment&years=5`,
    });
  });
  it('create_invoice known customer / two customers', async () => {
    const i: Intent = { type: 'create_invoice', customer: 'سيد', price: 10 };
    expect(await resolveIntent(i, fake())).toEqual({ kind: 'navigate', path: '/sale/new?customerId=c1&price=10' });
    expect((await resolveIntent(i, fake({ findCustomers: async () => [sayed, sayed2] }))).kind).toBe('chooseCustomer');
  });

  it('ask_balance single answers directly; two chooses', async () => {
    const out: any = await resolveIntent({ type: 'ask_balance', customer: 'سيد' }, fake());
    expect(out.kind).toBe('answer');
    expect(out.text).toContain('سيد الشحات: دفع 16,925.00 ج.م');
    const two = await resolveIntent({ type: 'ask_balance', customer: 'سيد' }, fake({ findCustomers: async () => [sayed, sayed2] }));
    expect(two.kind).toBe('chooseCustomer');
  });
  it('ask_late and ask_totals', async () => {
    expect(await resolveIntent({ type: 'ask_late' }, fake())).toEqual({ kind: 'answer', text: 'مفيش حد متأخر النهارده' });
    expect(await resolveIntent({ type: 'ask_totals', period: 'today' }, fake())).toEqual({
      kind: 'answer',
      text: 'النهارده حصّلت 8,012.50 ج.م، والشهر ده 42,300.00 ج.م.',
    });
  });
  it('ask_invoice answers single, chooses among many', async () => {
    expect((await resolveIntent({ type: 'ask_invoice', customer: 'سيد' }, fake())).kind).toBe('answer');
    const d = fake({ openInvoices: async () => [inv('k1', 'تلاجة'), inv('k2', 'غسالة')] });
    expect((await resolveIntent({ type: 'ask_invoice', customer: 'سيد' }, d)).kind).toBe('chooseInvoice');
    const hinted: any = await resolveIntent({ type: 'ask_invoice', customer: 'سيد', invoice_hint: 'غسالة' }, d);
    expect(hinted.text).toContain('غسالة');
  });
  it('open targets', async () => {
    const d = fake();
    expect(await resolveIntent({ type: 'open', target: 'home' }, d)).toEqual({ kind: 'navigate', path: '/' });
    expect(await resolveIntent({ type: 'open', target: 'customers' }, d)).toEqual({ kind: 'navigate', path: '/customers' });
    expect(await resolveIntent({ type: 'open', target: 'invoices' }, d)).toEqual({ kind: 'navigate', path: '/invoices' });
    expect(await resolveIntent({ type: 'open', target: 'customer', customer: 'سيد' }, d)).toEqual({ kind: 'navigate', path: '/customers/c1' });
    expect(await resolveIntent({ type: 'open', target: 'invoice', customer: 'سيد' }, d)).toEqual({ kind: 'navigate', path: '/contract/k1' });
    const two = await resolveIntent({ type: 'open', target: 'customer', customer: 'سيد' }, fake({ findCustomers: async () => [sayed, sayed2] }));
    expect(two.kind).toBe('chooseCustomer');
  });
  it('unknown -> message', async () => {
    expect((await resolveIntent({ type: 'unknown' }, fake())).kind).toBe('message');
  });
});
