import { DEFAULT_TEMPLATE, PLACEHOLDERS, renderTemplate } from '../template';

const vars = { customer: 'أحمد', amount: 1234.5, date: '2026-12-01', shop: 'متجر النور' };

test('replaces repeated placeholders everywhere', () => {
  const m = renderTemplate('{العميل} و{العميل} — {المحل} {المبلغ} {التاريخ}', vars);
  expect(m).toBe('أحمد وأحمد — متجر النور 1,234.50 ج.م 1 ديسمبر 2026');
});

test('leaves unknown placeholders untouched', () => {
  expect(renderTemplate('{شيء} {العميل}', vars)).toBe('{شيء} أحمد');
});

test('null, empty and whitespace fall back to the default template', () => {
  const d = renderTemplate(DEFAULT_TEMPLATE, vars);
  expect(renderTemplate(null, vars)).toBe(d);
  expect(renderTemplate('', vars)).toBe(d);
  expect(renderTemplate('   \n', vars)).toBe(d);
});

test('missing date renders a dash', () => {
  expect(renderTemplate('{التاريخ}', { ...vars, date: null })).toBe('—');
});

test('values containing placeholders or $ are not re-expanded', () => {
  expect(renderTemplate('{العميل}|{المبلغ}', { ...vars, customer: '{المحل} $&' })).toBe('{المحل} $&|1,234.50 ج.م');
});

test('exports the four placeholders', () => {
  expect(PLACEHOLDERS).toEqual(['{العميل}', '{المبلغ}', '{التاريخ}', '{المحل}']);
});
