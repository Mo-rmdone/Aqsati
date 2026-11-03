import { render, screen } from '@testing-library/react-native';
import { Text } from 'react-native';

import { SettingsSection } from '../SettingsSection';

test('renders the title and its children', async () => {
  await render(
    <SettingsSection title="بيانات المحل">
      <Text>جوه</Text>
    </SettingsSection>,
  );
  expect(screen.getByText('بيانات المحل')).toBeTruthy();
  expect(screen.getByText('جوه')).toBeTruthy();
});
