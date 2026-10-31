import { reminderMessage, whatsappLink } from '../whatsapp';

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
