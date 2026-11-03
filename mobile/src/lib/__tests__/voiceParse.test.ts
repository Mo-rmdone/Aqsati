import { validateIntent } from '../../../../supabase/functions/voice-intent/logic';
import { parseAmount, parseCommand } from '../voice/parse';

describe('parseAmount', () => {
  test.each([
    ['ميتين', 200],
    ['تلتمية وخمسين', 350],
    ['الفين وخمسمية', 2500],
    ['ربع مليون', 250000],
    ['٢٥٠٠', 2500],
    ['2,000', 2000],
    ['2000.5', 2000.5],
    ['2 الف', 2000],
    ['ألفين', 2000],
    ['ألف', 1000],
    ['ألف ونص', 1500],
    ['ألفين ونص', 2500],
    ['ألف وربع', 1250],
    ['خمسة وعشرين ألف', 25000],
    ['خمسة آلاف', 5000],
    ['تلات الاف', 3000],
    ['مية', 100],
    ['تلات مية', 300],
    ['مية وخمسين', 150],
    ['خمستاشر ألف', 15000],
    ['مليون', 1000000],
    ['مليون ونص', 1500000],
    ['نص مليون', 500000],
    ['عشرة آلاف وخمسمية', 10500],
    ['500 جنيه', 500],
  ])('%s = %d', (words, n) => {
    expect(parseAmount(words)).toBe(n);
  });

  test('no number gives undefined', () => {
    expect(parseAmount('سيد')).toBeUndefined();
    expect(parseAmount('')).toBeUndefined();
  });
});

describe('record_payment', () => {
  test.each([
    ['سيد دفع ألفين كاش', { type: 'record_payment', customer: 'سيد', amount: 2000, method: 'cash' }],
    ['سجل دفعة لأحمد خمسة وعشرين ألف تحويل', { type: 'record_payment', customer: 'أحمد', amount: 25000, method: 'bank' }],
    ['سيد الشحات دفع 1500', { type: 'record_payment', customer: 'سيد الشحات', amount: 1500 }],
    ['سيد دفع ألف ونص على التلاجة', { type: 'record_payment', customer: 'سيد', amount: 1500, invoice_hint: 'التلاجة' }],
    ['سجل دفعة من منى ٣٠٠ انستاباي', { type: 'record_payment', customer: 'منى', amount: 300, method: 'instapay' }],
    ['سجل قسط لـ سيد ألف جنيه فوري', { type: 'record_payment', customer: 'سيد', amount: 1000, method: 'fawry' }],
    ['ألفين كاش من سيد', { type: 'record_payment', customer: 'سيد', amount: 2000, method: 'cash' }],
    ['500 من منى عبد الله', { type: 'record_payment', customer: 'منى عبد الله', amount: 500 }],
    ['يا سيد سدد 750 ج بفودافون كاش', { type: 'record_payment', customer: 'سيد', amount: 750, method: 'wallet' }],
    ['محمد جاب ميتين فيزا', { type: 'record_payment', customer: 'محمد', amount: 200, method: 'card' }],
    ['الحاج سيد دفعت تلتمية', { type: 'record_payment', customer: 'سيد', amount: 300 }],
    ['علي دفع 500 على كاش', { type: 'record_payment', customer: 'علي', amount: 500, method: 'cash' }],
    ['علي دفع ألفين على الغسالة', { type: 'record_payment', customer: 'علي', amount: 2000, invoice_hint: 'الغسالة' }],
    ['سجل دفعة ليلى 400', { type: 'record_payment', customer: 'ليلى', amount: 400 }],
    ['سيد دفع', { type: 'record_payment', customer: 'سيد' }],
  ])('%s', (text, expected) => {
    expect(parseCommand(text)).toEqual(expected);
  });

  test('no customer is unknown', () => {
    expect(parseCommand('دفعت 500')).toEqual({ type: 'unknown' });
  });
});

describe('ask_balance', () => {
  test.each([
    ['سيد عليه كام', 'سيد'],
    ['سيد عليه كام؟', 'سيد'],
    ['منى عليها كام', 'منى'],
    ['حساب منى عبد الله', 'منى عبد الله'],
    ['باقي على سيد كام', 'سيد'],
    ['فاضل على منى كام', 'منى'],
    ['سيد فاضل عليه كام', 'سيد'],
    ['كام على أحمد', 'أحمد'],
    ['علي عليه كام', 'علي'],
  ])('%s', (text, customer) => {
    expect(parseCommand(text)).toEqual({ type: 'ask_balance', customer });
  });
});

describe('ask_late and ask_totals', () => {
  test.each(['مين متأخر', 'مين المتأخرين', 'مين عليه متأخرات', 'المتأخرين'])('late: %s', (t) => {
    expect(parseCommand(t)).toEqual({ type: 'ask_late' });
  });
  test.each([
    ['حصلنا كام النهارده', 'today'],
    ['اتحصل كام النهاردة', 'today'],
    ['تحصيل النهارده', 'today'],
    ['إجمالي الشهر ده', 'month'],
    ['تحصيل الشهر', 'month'],
    ['حصلنا كام الشهر ده', 'month'],
  ])('totals: %s', (t, period) => {
    expect(parseCommand(t)).toEqual({ type: 'ask_totals', period });
  });
});

describe('create_invoice', () => {
  test('full installment sentence', () => {
    expect(parseCommand('فاتورة جديدة لمنى تلاجة بخمسة وعشرين ألف تقسيط سنتين مقدم خمسة آلاف')).toEqual({
      type: 'create_invoice',
      customer: 'منى',
      product: 'تلاجة',
      price: 25000,
      sale_type: 'installment',
      years: 2,
      down_payment: 5000,
    });
  });
  test('cash sale with digits', () => {
    expect(parseCommand('بيعة جديدة لـ سيد غسالة ب 12000 كاش')).toEqual({
      type: 'create_invoice',
      customer: 'سيد',
      product: 'غسالة',
      price: 12000,
      sale_type: 'cash',
    });
  });
  test('rate, years in digits, down payment', () => {
    expect(parseCommand('فاتورة جديدة لأحمد تلفزيون ب30000 قسط 3 سنين مقدم 5000 فايدة 10 في الميه')).toEqual({
      type: 'create_invoice',
      customer: 'أحمد',
      product: 'تلفزيون',
      price: 30000,
      sale_type: 'installment',
      years: 3,
      down_payment: 5000,
      rate_percent: 10,
    });
  });
  test('percent sign', () => {
    expect(parseCommand('فاتورة جديدة لمحمد بوتاجاز بعشرين ألف تقسيط سنة فايدة 5%')).toEqual({
      type: 'create_invoice',
      customer: 'محمد',
      product: 'بوتاجاز',
      price: 20000,
      sale_type: 'installment',
      years: 1,
      rate_percent: 5,
    });
  });
  test('missing parts are omitted, never guessed', () => {
    expect(parseCommand('فاتورة جديدة لمنى تلاجة')).toEqual({ type: 'create_invoice', customer: 'منى', product: 'تلاجة' });
  });
  test('two-word name before a known product', () => {
    expect(parseCommand('فاتورة جديدة لسيد الشحات تلاجة بـ ١٥٠٠٠')).toEqual({
      type: 'create_invoice',
      customer: 'سيد الشحات',
      product: 'تلاجة',
      price: 15000,
    });
  });
  test('no customer is unknown', () => {
    expect(parseCommand('فاتورة جديدة')).toEqual({ type: 'unknown' });
  });
});

describe('ask_invoice', () => {
  test.each([
    ['التلاجة بتاعة منى فاضل فيها كام', { customer: 'منى', invoice_hint: 'التلاجة' }],
    ['الغسالة بتاع سيد باقي فيها كام', { customer: 'سيد', invoice_hint: 'الغسالة' }],
    ['فاتورة منى التلاجة', { customer: 'منى', invoice_hint: 'التلاجة' }],
    ['فاتورة سيد', { customer: 'سيد' }],
    ['فاتورة سيد الشحات غسالة', { customer: 'سيد الشحات', invoice_hint: 'غسالة' }],
  ])('%s', (t, rest) => {
    expect(parseCommand(t)).toEqual({ type: 'ask_invoice', ...rest });
  });
});

describe('open', () => {
  test.each([
    ['افتح العملاء', { target: 'customers' }],
    ['افتح الفواتير', { target: 'invoices' }],
    ['افتح الرئيسية', { target: 'home' }],
    ['افتح سيد', { target: 'customer', customer: 'سيد' }],
    ['افتح ملف منى عبد الله', { target: 'customer', customer: 'منى عبد الله' }],
    ['افتح فاتورة منى تلاجة', { target: 'invoice', customer: 'منى', invoice_hint: 'تلاجة' }],
    ['افتح فاتورة منى', { target: 'invoice', customer: 'منى' }],
  ])('%s', (t, rest) => {
    expect(parseCommand(t)).toEqual({ type: 'open', ...rest });
  });
});

describe('unknown', () => {
  test.each(['الجو حلو النهارده', '', '   ', 'افتح', 'ازيك عامل ايه', '؟؟'])('"%s"', (t) => {
    expect(parseCommand(t)).toEqual({ type: 'unknown' });
  });
  test('never throws on odd input', () => {
    expect(parseCommand(undefined as unknown as string)).toEqual({ type: 'unknown' });
    expect(parseCommand('و و و ب ب 2,,,000 %%%')).toEqual({ type: 'unknown' });
  });
});

describe('output is already whitelist-valid', () => {
  test.each([
    'سيد دفع ألفين كاش',
    'سيد دفع ألف ونص على التلاجة',
    'فاتورة جديدة لمنى تلاجة بخمسة وعشرين ألف تقسيط سنتين مقدم خمسة آلاف',
    'التلاجة بتاعة منى فاضل فيها كام',
    'مين متأخر',
    'حصلنا كام النهارده',
    'افتح فاتورة منى تلاجة',
    'سيد عليه كام',
    'الجو حلو النهارده',
  ])('%s', (t) => {
    const out = parseCommand(t);
    expect(validateIntent(out)).toEqual(out);
  });
  test('out-of-range values are dropped', () => {
    expect(parseCommand('سيد دفع 99999999999')).toEqual({ type: 'record_payment', customer: 'سيد' });
  });
});
