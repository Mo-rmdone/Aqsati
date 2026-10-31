import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render } from '@testing-library/react-native';

let mockSession: { user: { id: string } } | null = null;
jest.mock('../auth', () => ({ useAuth: () => ({ session: mockSession }) }));

import { QueryCacheGuard } from '../QueryCacheGuard';

function setup() {
  const qc = new QueryClient();
  const ui = () => (
    <QueryClientProvider client={qc}>
      <QueryCacheGuard />
    </QueryClientProvider>
  );
  return { qc, ui };
}

test('clears the cache on sign-out and when the user changes, not otherwise', async () => {
  mockSession = { user: { id: 'u1' } };
  const { qc, ui } = setup();
  const r = await render(ui());
  qc.setQueryData(['customers'], [1]);
  await r.rerender(ui());
  expect(qc.getQueryData(['customers'])).toEqual([1]);

  mockSession = { user: { id: 'u2' } };
  await r.rerender(ui());
  expect(qc.getQueryData(['customers'])).toBeUndefined();

  qc.setQueryData(['customers'], [2]);
  mockSession = null;
  await r.rerender(ui());
  expect(qc.getQueryData(['customers'])).toBeUndefined();
});
