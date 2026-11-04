import { render, screen } from '@testing-library/react-native';

import { NumbersCard } from '../NumbersCard';

test('overdue leads when there is any', async () => {
  await render(<NumbersCard overdue={9191.66} dueWeek={0} collectedMonth={22600} />);
  expect(screen.getByText('متأخر على الناس')).toBeTruthy();
  expect(screen.getByText('9,191.66 ج.م')).toBeTruthy();
  expect(screen.getByText('22,600.00 ج.م')).toBeTruthy();
});

test('no overdue says so instead of a big zero', async () => {
  await render(<NumbersCard overdue={0} dueWeek={500} collectedMonth={0} />);
  expect(screen.getByText('مفيش متأخرات')).toBeTruthy();
  expect(screen.queryByText('متأخر على الناس')).toBeNull();
  expect(screen.getByText('500.00 ج.م')).toBeTruthy();
});
