import { Tabs } from 'expo-router';

import { colors } from '../../ui/theme';

// Labels are Arabic; icons are added with the brand pass.
export default function AppLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarLabelStyle: { fontSize: 13 },
        tabBarIcon: () => null,
      }}
    >
      <Tabs.Screen name="index" options={{ title: 'الرئيسية' }} />
      <Tabs.Screen name="customers/index" options={{ title: 'العملاء' }} />
      <Tabs.Screen name="sale/new" options={{ title: '+ فاتورة' }} />
      <Tabs.Screen name="settings" options={{ title: 'الإعدادات' }} />
    </Tabs>
  );
}
