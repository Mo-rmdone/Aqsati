import { renderHook } from '@testing-library/react-native';

const mockNavSetParams = jest.fn();
const mockRouterSetParams = jest.fn();
let mockParams: Record<string, string> = {};
let mockCleanup: (() => void) | undefined;

jest.mock('expo-router', () => ({
  useLocalSearchParams: () => mockParams,
  useNavigation: () => ({ setParams: mockNavSetParams }),
  useRouter: () => ({ setParams: mockRouterSetParams }),
  // Run the effect once; keep its cleanup so the test can simulate a blur.
  useFocusEffect: (cb: () => (() => void) | void) => {
    mockCleanup = cb() as (() => void) | undefined;
  },
}));

import { useCustomersParams } from '../useCustomersParams';

beforeEach(() => {
  mockNavSetParams.mockClear();
  mockRouterSetParams.mockClear();
  mockCleanup = undefined;
});

test('reads params; a changed q is reflected', async () => {
  mockParams = { q: 'أحمد' };
  const r = await renderHook(() => useCustomersParams());
  expect(r.result.current.q).toBe('أحمد');
  mockParams = { q: 'محمد', pick: 'payment' };
  await r.rerender({});
  expect(r.result.current).toMatchObject({ q: 'محمد', picking: true });
});

test('blur clears pick and q on this screen only', async () => {
  mockParams = { pick: 'payment' };
  await renderHook(() => useCustomersParams());
  mockCleanup?.();
  expect(mockNavSetParams).toHaveBeenCalledWith({ pick: undefined, q: undefined });
  expect(mockRouterSetParams).not.toHaveBeenCalled();
});

test('clearPick uses screen-scoped setParams', async () => {
  mockParams = { pick: 'payment' };
  const r = await renderHook(() => useCustomersParams());
  r.result.current.clearPick();
  expect(mockNavSetParams).toHaveBeenCalledWith({ pick: undefined });
  expect(mockRouterSetParams).not.toHaveBeenCalled();
});
