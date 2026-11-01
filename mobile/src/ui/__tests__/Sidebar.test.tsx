import { fireEvent, render, screen } from '@testing-library/react-native';

const mockPush = jest.fn();
const mockNavigate = jest.fn();
let mockPath = '/customers/abc';
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, navigate: mockNavigate }),
  usePathname: () => mockPath,
}));

import { Sidebar } from '../Sidebar';

test('renders the logo, new-invoice button and nav labels', async () => {
  await render(<Sidebar />);
  for (const l of ['نوتة', 'فاتورة جديدة', 'الرئيسية', 'العملاء', 'الفواتير', 'التقارير', 'الإعدادات', 'قريب']) {
    expect(screen.getByText(new RegExp(l))).toBeTruthy();
  }
});

test('marks /customers active for a nested path', async () => {
  mockPath = '/customers/abc';
  await render(<Sidebar />);
  expect(screen.getByRole('link', { name: 'العملاء' }).props.accessibilityState).toMatchObject({ selected: true });
  expect(screen.getByRole('link', { name: 'الرئيسية' }).props.accessibilityState).toMatchObject({ selected: false });
});

test('+ فاتورة جديدة pushes /sale/new', async () => {
  await render(<Sidebar />);
  await fireEvent.press(screen.getByRole('button', { name: /فاتورة جديدة/ }));
  expect(mockPush).toHaveBeenCalledWith('/sale/new');
});

test('nav items use navigate, not push', async () => {
  mockPush.mockClear();
  await render(<Sidebar />);
  await fireEvent.press(screen.getByRole('link', { name: 'العملاء' }));
  expect(mockNavigate).toHaveBeenCalledWith('/customers');
  expect(mockPush).not.toHaveBeenCalled();
});
