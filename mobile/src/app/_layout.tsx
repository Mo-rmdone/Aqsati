import { Stack } from 'expo-router';
import { I18nManager } from 'react-native';

// Arabic-first app: force RTL on native (takes effect after a reload) and on web via +html.tsx.
I18nManager.allowRTL(true);
I18nManager.forceRTL(true);

export default function RootLayout() {
  return <Stack screenOptions={{ headerShown: false }} />;
}
