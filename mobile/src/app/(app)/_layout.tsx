import { Stack } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { Sidebar } from '../../ui/Sidebar';
import { useIsDesktop } from '../../ui/layout';

export const unstable_settings = { initialRouteName: '(tabs)' };

// Tabs sit at the bottom of the stack; the form/detail screens are pushed above them and
// unmount when popped, so no attempt id or form state survives into the next visit.
// Desktop: a persistent sidebar replaces the tab bar. The wrapper tree is identical on
// every width so the Stack never remounts (and wipes forms) when the window crosses 1024.
export default function AppLayout() {
  const desktop = useIsDesktop();
  return (
    <View style={styles.row}>
      {desktop ? <Sidebar /> : null}
      <View style={styles.main}>
        <Stack screenOptions={{ headerShown: false }} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flex: 1, flexDirection: 'row' },
  main: { flex: 1 },
});
