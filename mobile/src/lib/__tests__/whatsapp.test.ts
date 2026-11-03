import { followupReminder, followupReminderLink, reminderMessage, whatsappLink } from '../whatsapp';

const fbase = {
  name: 'أحمد', overdue_amount: 0, overdue_count: 0, next_due_amount: 300, next_due_date: '2026-12-01',
} as Parameters<typeof followupReminder>[0];

test('followupReminder overdue wording uses the overdue total', () => {
  const m = followupReminder({ ...fbase, overdue_amount: 1250, overdue_count: 2 }, 'متجر النور');
  expect(m).toContain('أحمد');
  expect(m).toContain('متأخر عليك 1,250.00 ج.م');
  expect(m).toContain('متجر النور');
  expect(m).not.toContain('300.00');
});

test('followupReminder next-due wording', () => {
  const m = followupReminder(fbase, 'متجر النور');
  expect(m).toContain('300.00 ج.م');
  expect(m).toContain('1 ديسمبر 2026');
  expect(m).not.toContain('متأخر عليك');
});

describe('followupReminder default (no template) is unchanged', () => {
  const overdueRow = { ...fbase, overdue_amount: 1250, overdue_count: 2 };
  const exactOverdue =
    'أهلاً أحمد 👋\nمتأخر عليك 1,250.00 ج.م من أقساطك.\nبرجاء السداد في أقرب وقت. شكراً لتعاملك معنا — متجر النور';
  const exactNext =
    'أهلاً أحمد 👋\nتذكير بقسط بمبلغ 300.00 ج.م مستحق بتاريخ 1 ديسمبر 2026.\nبرجاء السداد في أقرب وقت. شكراً لتعاملك معنا — متجر النور';

  test.each([undefined, null, '', '  '])('template %p', (t) => {
    expect(followupReminder(overdueRow, 'متجر النور', t)).toBe(exactOverdue);
    expect(followupReminder(fbase, 'متجر النور', t)).toBe(exactNext);
  });
});

describe('followupReminder with a custom template', () => {
  afterEach(() => jest.useRealTimers());

  test('overdue: overdue total and Cairo today', () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-11-03T10:00:00Z'));
    const m = followupReminder(
      { ...fbase, overdue_amount: 1250, overdue_count: 2 },
      'متجر النور',
      '{العميل}: {المبلغ} في {التاريخ} - {المحل}',
    );
    expect(m).toBe('أحمد: 1,250.00 ج.م في 3 نوفمبر 2026 - متجر النور');
  });

  test('not overdue: next due amount and date', () => {
    const m = followupReminder(fbase, 'متجر النور', '{المبلغ} {التاريخ}');
    expect(m).toBe('300.00 ج.م 1 ديسمبر 2026');
  });
});

describe('followupReminderLink gating', () => {
  const row = { ...fbase, phone: '01012345678' };
  const decoded = (l: string | null) => decodeURIComponent((l ?? '').split('text=')[1] ?? '');

  test('null while settings are loading', () => {
    expect(followupReminderLink(row, 'م', { isSuccess: false, isError: false, template: null })).toBeNull();
  });
  test('uses the custom template once loaded', () => {
    const l = followupReminderLink(row, 'م', { isSuccess: true, isError: false, template: 'مرحباً {العميل}' });
    expect(decoded(l)).toBe('مرحباً أحمد');
  });
  test('falls back to the default message on error', () => {
    const l = followupReminderLink(row, 'م', { isSuccess: false, isError: true, template: null });
    expect(decoded(l)).toContain('تذكير بقسط');
  });
  test('null without a valid phone', () => {
    const s = { isSuccess: true, isError: false, template: null };
    expect(followupReminderLink({ ...row, phone: null }, 'م', s)).toBeNull();
    expect(followupReminderLink({ ...row, phone: '0123' }, 'م', s)).toBeNull();
  });
});

test('whatsappLink normalizes Egyptian mobile numbers', () => {
  expect(whatsappLink('01012345678', 'x')).toBe('https://wa.me/201012345678?text=x');
  expect(whatsappLink('0101 234 5678', 'a b')).toBe('https://wa.me/201012345678?text=a%20b');
});

test('whatsappLink returns null for invalid numbers', () => {
  expect(whatsappLink('0123', 'x')).toBeNull();
  expect(whatsappLink('02012345678', 'x')).toBeNull();
  expect(whatsappLink('', 'x')).toBeNull();
});

test('reminderMessage contains customer, amount, date, merchant', () => {
  const m = reminderMessage({ customer: 'أحمد', amount: 812.5, dueDate: '2026-12-01', merchant: 'متجر النور' });
  expect(m).toContain('أحمد');
  expect(m).toContain('812.50 ج.م');
  expect(m).toContain('2026-12-01');
  expect(m).toContain('متجر النور');
});
