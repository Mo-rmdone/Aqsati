import { customerStatusChip, invoiceStatusChip } from '../status';

test('customerStatusChip maps every status', () => {
  expect(customerStatusChip('late_many')).toEqual({ label: 'متأخر كتير', tone: 'overdue' });
  expect(customerStatusChip('late')).toEqual({ label: 'متأخر', tone: 'overdue' });
  expect(customerStatusChip('regular')).toEqual({ label: 'منتظم', tone: 'paid' });
  expect(customerStatusChip('done')).toEqual({ label: 'خلّص', tone: 'paid' });
  expect(customerStatusChip('unknown')).toEqual({ label: 'غير معروف', tone: 'unknown' });
  expect(customerStatusChip(null)).toEqual({ label: 'غير معروف', tone: 'unknown' });
});

test('invoiceStatusChip maps every status', () => {
  expect(invoiceStatusChip('late')).toEqual({ label: 'متأخر', tone: 'overdue' });
  expect(invoiceStatusChip('open')).toEqual({ label: 'جاري', tone: 'due' });
  expect(invoiceStatusChip('settled')).toEqual({ label: 'خلّص', tone: 'paid' });
  expect(invoiceStatusChip(null)).toEqual({ label: 'غير معروف', tone: 'unknown' });
});
