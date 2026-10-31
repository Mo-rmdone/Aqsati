import { Stack } from 'expo-router';

export const unstable_settings = { initialRouteName: '(tabs)' };

// Tabs sit at the bottom of the stack; the form/detail screens are pushed above them and
// unmount when popped, so no attempt id or form state survives into the next visit.
export default function AppLayout() {
  return <Stack screenOptions={{ headerShown: false }} />;
}
