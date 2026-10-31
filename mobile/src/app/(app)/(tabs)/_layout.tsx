import { Tabs, useRouter } from 'expo-router';

import { colors } from '../../../ui/theme';

// Labels are Arabic; icons are added with the brand pass.
// "+ فاتورة" is a tab button only: it pushes /sale/new onto the stack above the tabs,
// so the form unmounts when popped and never carries state into the next sale.
export default function TabsLayout() {
  const router = useRouter();
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
      <Tabs.Screen name="customers" options={{ title: 'العملاء' }} />
      <Tabs.Screen
        name="sale"
        options={{ title: '+ فاتورة' }}
        listeners={{
          tabPress: (e) => {
            e.preventDefault();
            router.push('/sale/new');
          },
        }}
      />
      <Tabs.Screen name="settings" options={{ title: 'الإعدادات' }} />
    </Tabs>
  );
}
