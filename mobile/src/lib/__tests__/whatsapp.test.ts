import { followupReminder, reminderMessage, whatsappLink } from '../whatsapp';

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
