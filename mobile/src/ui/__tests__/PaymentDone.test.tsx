import { fireEvent, render, screen } from '@testing-library/react-native';
import { Linking } from 'react-native';

import { PaymentDone } from '../PaymentDone';

const mockSummary = jest.fn();
const mockContracts = jest.fn();
const mockShop = jest.fn();
const mockLog = jest.fn<Promise<void>, [unknown]>();

jest.mock('../../api/customers', () => ({ useCustomerSummary: () => mockSummary() }));
jest.mock('../../api/contracts', () => ({ useCustomerContracts: () => mockContracts() }));
jest.mock('../../api/settings', () => ({ useShopSettings: () => mockShop() }));
jest.mock('../../api/followup', () => ({ useLogContact: () => ({ mutateAsync: mockLog }) }));
jest.mock('../../lib/ids', () => ({ newId: () => 'log-1' }));

const ready = (phone: string | null = '01012345678') => {
  mockSummary.mockReturnValue({
    data: { name: 'أحمد', phone, paid_total: 1500 },
    isSuccess: true,
    isFetching: false,
  });
  mockContracts.mockReturnValue({
    data: [
      { contract_id: 'a', contract_no: 3, product_desc: 'ثلاجة', remaining: 2500 },
      { contract_id: 'b', contract_no: 4, product_desc: null, remaining: 0 },
      { contract_id: 'c', contract_no: 5, product_desc: 'غسالة', remaining: null },
    ],
    isSuccess: true,
    isFetching: false,
  });
  mockShop.mockReturnValue({ data: { name: 'متجر النور' }, isSuccess: true });
};

const SEND = 'ابعت كشف حسابه على واتساب';

beforeEach(() => {
  jest.clearAllMocks();
  mockLog.mockResolvedValue(undefined);
  jest.spyOn(Linking, 'openURL').mockResolvedValue(undefined);
});

test('send is disabled while data is loading', async () => {
  ready();
  mockContracts.mockReturnValue({ data: undefined, isSuccess: false, isFetching: true });
  await render(<PaymentDone customerId="c1" paidNow={500} onDone={jest.fn()} />);
  expect(screen.getByText('اتسجلت الدفعة: 500.00 ج.م')).toBeTruthy();
  expect(screen.queryByText(SEND)).toBeNull();
  const busy = screen.getAllByRole('button', { busy: true });
  expect(busy).toHaveLength(1);
  await fireEvent.press(busy[0]);
  expect(Linking.openURL).not.toHaveBeenCalled();
});

test('send is disabled while the data is being refetched after the payment', async () => {
  ready();
  mockContracts.mockReturnValue({ ...mockContracts(), isFetching: true });
  await render(<PaymentDone customerId="c1" paidNow={500} onDone={jest.fn()} />);
  expect(screen.queryByText(SEND)).toBeNull();
  await fireEvent.press(screen.getAllByRole('button', { busy: true })[0]);
  expect(Linking.openURL).not.toHaveBeenCalled();
});

test('send is hidden for a non-Egyptian-mobile phone', async () => {
  ready('0123');
  await render(<PaymentDone customerId="c1" paidNow={500} onDone={jest.fn()} />);
  expect(screen.queryByText(SEND)).toBeNull();
  expect(screen.getByText('رقم العميل مش موبايل مصري')).toBeTruthy();
});

test('تمام calls onDone', async () => {
  ready();
  const onDone = jest.fn();
  await render(<PaymentDone customerId="c1" paidNow={500} onDone={onDone} />);
  await fireEvent.press(screen.getByRole('button', { name: 'تمام' }));
  expect(onDone).toHaveBeenCalledTimes(1);
});

test('send opens the wa.me link synchronously and logs the contact', async () => {
  ready();
  await render(<PaymentDone customerId="c1" paidNow={500} onDone={jest.fn()} />);
  await fireEvent.press(screen.getByRole('button', { name: SEND }));
  expect(Linking.openURL).toHaveBeenCalledTimes(1);
  const url = (Linking.openURL as jest.Mock).mock.calls[0][0] as string;
  expect(url.startsWith('https://wa.me/201012345678?text=')).toBe(true);
  const text = decodeURIComponent(url.split('text=')[1]);
  expect(text).toContain('أهلاً أحمد');
  expect(text).toContain('استلمنا منك النهارده 500.00 ج.م');
  expect(text).toContain('إجمالي اللي دفعته: 1,500.00 ج.م');
  expect(text).toContain('• ثلاجة: 2,500.00 ج.م');
  expect(text).not.toContain('غسالة');
  expect(text).not.toContain('فاتورة 4');
  expect(text).toContain('متجر النور');
  expect(mockLog).toHaveBeenCalledWith({ id: 'log-1', customerId: 'c1', kind: 'whatsapp' });
});

test('a null customer row is treated as failed: no spinner, error shown', async () => {
  ready();
  mockSummary.mockReturnValue({ data: null, isSuccess: true, isFetching: false });
  await render(<PaymentDone customerId="c1" paidNow={500} onDone={jest.fn()} />);
  expect(screen.getByText('مقدرتش أحمّل بيانات العميل')).toBeTruthy();
  expect(screen.queryAllByRole('button', { busy: true })).toHaveLength(0);
});
