import { Text } from 'react-native';

import { useAuth } from '../../lib/auth';
import { Screen } from '../../ui/Screen';

// Placeholder; the dashboard arrives in a later task.
export default function Home() {
  const { shopName } = useAuth();
  return (
    <Screen title="الرئيسية">
      <Text>{shopName ?? ''}</Text>
    </Screen>
  );
}
