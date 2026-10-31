import { useRouter } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { useCustomers } from '../../../api/customers';
import { Button } from '../../../ui/Button';
import { Field } from '../../../ui/Field';
import { Screen } from '../../../ui/Screen';
import { colors, font, radius, spacing } from '../../../ui/theme';

export default function Customers() {
  const router = useRouter();
  const [search, setSearch] = useState('');
  const { data, isLoading, error, refetch } = useCustomers(search);

  return (
    <Screen title="العملاء">
      <Button title="عميل جديد" onPress={() => router.push('/customers/new')} />
      <Field label="بحث بالاسم أو الموبايل" value={search} onChangeText={setSearch} autoCorrect={false} />
      {isLoading ? <ActivityIndicator color={colors.primary} /> : null}
      {error ? (
        <View style={styles.center}>
          <Text style={styles.error}>تعذر تحميل العملاء</Text>
          <Button title="إعادة المحاولة" variant="secondary" onPress={() => refetch()} />
        </View>
      ) : null}
      {data && data.length === 0 ? (
        <Text style={styles.empty}>{search.trim() ? 'مفيش نتائج' : 'لسه مفيش عملاء'}</Text>
      ) : null}
      {data?.map((c) => (
        <Pressable
          key={c.id}
          accessibilityRole="button"
          onPress={() => router.push(`/customers/${c.id}`)}
          style={styles.row}
        >
          <Text style={styles.name}>{c.name}</Text>
          <Text style={styles.phone}>{c.phone}</Text>
        </Pressable>
      ))}
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: spacing.xs,
  },
  name: { fontSize: font.body, fontWeight: '600', color: colors.text, textAlign: 'right' },
  phone: { fontSize: font.small, color: colors.muted, textAlign: 'right', writingDirection: 'ltr' },
  empty: { color: colors.muted, textAlign: 'center', fontSize: font.body },
  error: { color: colors.danger, textAlign: 'center', fontSize: font.body },
  center: { gap: spacing.sm },
});
