import { fireEvent, render, screen } from '@testing-library/react-native';

import { PayerCard } from '../PayerCard';
import { PaymentForm, submitText } from '../PaymentForm';

const two = [
  { contractId: 'old', title: 'تلاجة · فاتورة رقم 2', remaining: 600 },
  { contractId: 'new', title: 'غسالة · فاتورة رقم 5', remaining: 900 },
];

test('submit label names the amount and the customer once valid', async () => {
  expect(submitText('سجّل الدفعة', 1000, true, 'سيد')).toBe('سجّل 1,000.00 ج.م من سيد');
  expect(submitText('سجّل الدفعة', 1000, false, 'سيد')).toBe('سجّل الدفعة');
  expect(submitText('حفظ التعديل', 1000, true)).toBe('حفظ التعديل');
});

test('several invoices: the amount fills the oldest first and can be saved without typing a split', async () => {
  const onSubmit = jest.fn().mockResolvedValue(undefined);
  await render(<PaymentForm contracts={two} submitLabel="سجّل الدفعة" payerName="سيد" loading={false} onSubmit={onSubmit} />);
  await fireEvent.changeText(screen.getByLabelText('المبلغ اللي دفعه'), '1000');
  expect(screen.getByText('هيتخصم منها 600.00 ج.م')).toBeTruthy();
  expect(screen.getByText('هيتخصم منها 400.00 ج.م')).toBeTruthy();
  await fireEvent.press(screen.getByText('سجّل 1,000.00 ج.م من سيد'));
  await Promise.resolve();
  expect(onSubmit.mock.calls[0][0].lines).toEqual([
    { contractId: 'old', amount: 600 },
    { contractId: 'new', amount: 400 },
  ]);
});

test('more than the customer owes is rejected with the owed total', async () => {
  await render(<PaymentForm contracts={two} submitLabel="سجّل الدفعة" loading={false} onSubmit={jest.fn()} />);
  await fireEvent.changeText(screen.getByLabelText('المبلغ اللي دفعه'), '2000');
  expect(screen.getByText('المبلغ أكبر من اللي عليه (1,500.00 ج.م)')).toBeTruthy();
});

test('"وزّع بنفسي" opens the fields seeded with the suggested split', async () => {
  await render(<PaymentForm contracts={two} submitLabel="سجّل الدفعة" loading={false} onSubmit={jest.fn()} />);
  await fireEvent.changeText(screen.getByLabelText('المبلغ اللي دفعه'), '700');
  await fireEvent.press(screen.getByText('وزّع بنفسي'));
  const fields = screen.getAllByLabelText('هيتخصم منها');
  expect(fields.map((f) => f.props.value)).toEqual(['600.00', '100.00']);
});

test('a given split (edited payment) opens in manual mode', async () => {
  await render(
    <PaymentForm
      contracts={two}
      initialAmounts={{ new: '300' }}
      submitLabel="حفظ التعديل"
      loading={false}
      onSubmit={jest.fn()}
    />,
  );
  expect(screen.getAllByLabelText('هيتخصم منها')).toHaveLength(2);
  expect(screen.queryByText('وزّع بنفسي')).toBeNull();
});

test('payer card shows who is paying and what they owe', async () => {
  await render(<PayerCard name="سيد" phone="01012345678" owed={1500} />);
  expect(screen.getByText('سيد')).toBeTruthy();
  expect(screen.getByText('عليه 1,500.00 ج.م')).toBeTruthy();
});
