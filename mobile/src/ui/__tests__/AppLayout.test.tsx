import { render } from '@testing-library/react-native';

const mockMount = jest.fn();
const mockUnmount = jest.fn();
let mockDesktop = false;

jest.mock('expo-router', () => ({
  Stack: () => {
    require('react').useEffect(() => {
      mockMount();
      return () => mockUnmount();
    }, []);
    return null;
  },
  useRouter: () => ({ push: jest.fn(), navigate: jest.fn() }),
  usePathname: () => '/',
}));
jest.mock('../layout', () => ({ useIsDesktop: () => mockDesktop }));

import AppLayout from '../../app/(app)/_layout';

test('crossing the desktop breakpoint keeps the Stack mounted', async () => {
  mockDesktop = false;
  const r = await render(<AppLayout />);
  expect(mockMount).toHaveBeenCalledTimes(1);
  mockDesktop = true;
  await r.rerender(<AppLayout />);
  mockDesktop = false;
  await r.rerender(<AppLayout />);
  expect(mockMount).toHaveBeenCalledTimes(1);
  expect(mockUnmount).not.toHaveBeenCalled();
});
