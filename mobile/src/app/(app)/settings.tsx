import { StyleSheet, Text } from 'react-native';

import { useAuth } from '../../lib/auth';
import { Button } from '../../ui/Button';
import { Screen } from '../../ui/Screen';
import { colors, font } from '../../ui/theme';

export default function Settings() {
  const { shopName, profile, signOut } = useAuth();
  return (
    <Screen title="الإعدادات">
      <Text style={styles.label}>المتجر</Text>
      <Text style={styles.value}>{shopName ?? '—'}</Text>
      <Text style={styles.label}>المستخدم</Text>
      <Text style={styles.value}>{profile?.full_name ?? '—'}</Text>
      <Button title="تسجيل الخروج" variant="secondary" onPress={() => void signOut()} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  label: { color: colors.muted, fontSize: font.small, textAlign: 'right' },
  value: { color: colors.text, fontSize: font.heading, textAlign: 'right' },
});
