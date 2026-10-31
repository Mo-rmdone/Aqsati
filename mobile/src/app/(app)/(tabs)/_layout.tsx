import { Tabs, useRouter } from 'expo-router';
import { House, Plus, Settings, Users } from 'lucide-react-native';
import { StyleSheet, View } from 'react-native';

import { colors, shadow, size, type } from '../../../ui/theme';

// "+ فاتورة" is a tab button only: it pushes /sale/new onto the stack above the tabs,
// so the form unmounts when popped and never carries state into the next sale.
// It is the one coin-colored action in the app (design system: coin = the + invoice action).
export default function TabsLayout() {
  const router = useRouter();
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        sceneStyle: { backgroundColor: colors.paper },
        tabBarActiveTintColor: colors.brand,
        tabBarInactiveTintColor: colors.inkMuted,
        tabBarLabelStyle: { ...type.chip },
        tabBarStyle: {
          backgroundColor: colors.surface,
          borderTopColor: colors.line,
          height: 68,
          paddingTop: 6,
          paddingBottom: 8,
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{ title: 'الرئيسية', tabBarIcon: ({ color }) => <House size={size.iconMd} color={color} /> }}
      />
      <Tabs.Screen
        name="customers"
        options={{ title: 'العملاء', tabBarIcon: ({ color }) => <Users size={size.iconMd} color={color} /> }}
      />
      <Tabs.Screen
        name="sale"
        options={{
          title: 'فاتورة',
          tabBarIcon: () => (
            <View style={styles.fab}>
              <Plus size={size.iconMd} color={colors.onCoin} strokeWidth={2.75} />
            </View>
          ),
        }}
        listeners={{
          tabPress: (e) => {
            e.preventDefault();
            router.push('/sale/new');
          },
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{ title: 'الإعدادات', tabBarIcon: ({ color }) => <Settings size={size.iconMd} color={color} /> }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  fab: {
    width: size.tapMin,
    height: size.tapMin,
    borderRadius: size.tapMin / 2,
    backgroundColor: colors.coin,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: -18,
    ...shadow.fab,
  },
});
